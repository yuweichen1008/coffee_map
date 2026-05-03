# GCP Setup Guide — StorePulse

Migration from Supabase to Google Cloud Platform.
Estimated monthly cost: **~$10–12** (vs Supabase Pro $25).

---

## Prerequisites

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

Enable required APIs:
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com
```

---

## Step 1 — Local Docker Dev (no GCP account needed)

Copy and fill `.env.docker`:
```bash
cp .env.docker.example .env.docker
# Edit .env.docker — fill in Mapbox token, Google Maps key, admin email+secret
```

Start local PostgreSQL + app:
```bash
docker-compose up
# App: http://localhost:3000
# DB:  postgresql://storepulse:storepulse@localhost:5432/storepulse
```

Verify DB schema loaded:
```bash
docker exec -it coffee_map-db-1 psql -U storepulse -d storepulse -c "\dt"
# Should show: categories, districts, places, sg_hawker_centres, sg_bus_stops, ...
```

---

## Step 2 — Cloud SQL (PostgreSQL + PostGIS)

```bash
# Create Cloud SQL instance (db-f1-micro ≈ $7/month)
gcloud sql instances create storepulse-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-southeast1 \
  --storage-size=10GB \
  --storage-auto-increase

# Create database
gcloud sql databases create storepulse --instance=storepulse-db

# Create user
gcloud sql users create storepulse \
  --instance=storepulse-db \
  --password=CHANGE_ME

# Get connection string (for Cloud Run via Cloud SQL proxy)
# Format: postgres://storepulse:PASS@/storepulse?host=/cloudsql/PROJECT:asia-southeast1:storepulse-db
```

Connect and enable PostGIS + load schema:
```bash
# Connect via Cloud SQL proxy
cloud-sql-proxy PROJECT:asia-southeast1:storepulse-db &
psql postgres://storepulse:PASS@localhost/storepulse -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql postgres://storepulse:PASS@localhost/storepulse -f db/init_all.sql
psql postgres://storepulse:PASS@localhost/storepulse -f db/sg_enrichment.sql
```

---

## Step 3 — Secret Manager

Store sensitive env vars (never in code):
```bash
# Database URL (Cloud SQL socket format for Cloud Run)
echo -n "postgres://storepulse:PASS@/storepulse?host=/cloudsql/PROJECT:asia-southeast1:storepulse-db" \
  | gcloud secrets create storepulse-db-url --data-file=-

# Admin secret (generate: openssl rand -hex 32)
echo -n "YOUR_ADMIN_SECRET" \
  | gcloud secrets create storepulse-admin-secret --data-file=-

# Google Maps API key
echo -n "AIzaSy..." \
  | gcloud secrets create storepulse-gmaps-key --data-file=-

# Mapbox token (public, but keep consistent)
echo -n "pk.eyJ..." \
  | gcloud secrets create storepulse-mapbox-token --data-file=-
```

Grant Cloud Run access to secrets:
```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding storepulse-db-url \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
# Repeat for each secret
```

---

## Step 4 — Cloud Run Deployment

### Manual (first deploy)
```bash
# Build and push image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/storepulse

# Deploy
gcloud run deploy storepulse \
  --image gcr.io/YOUR_PROJECT_ID/storepulse \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --add-cloudsql-instances YOUR_PROJECT_ID:asia-southeast1:storepulse-db \
  --set-secrets="DATABASE_URL=storepulse-db-url:latest,ADMIN_SECRET=storepulse-admin-secret:latest,GOOGLE_MAPS_API_KEY=storepulse-gmaps-key:latest" \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_ADMIN_EMAIL=you@example.com,NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ..."
```

### CI/CD (subsequent deploys)
Connect Cloud Build to GitHub repo:
```bash
# In GCP Console → Cloud Build → Triggers → Connect repository
# Select your GitHub repo, use cloudbuild.yaml
```

Every push to `main` will build + deploy automatically.

---

## Step 5 — Singapore Public Data Ingestion

Run from local machine (or Cloud Run Job):
```bash
# 1. Hawker centres + NEA grades from data.gov.sg (no API key needed)
DATABASE_URL="postgres://..." python3 scripts/fetch/fetch_sg_govdata.py --dataset all

# 2. LTA bus stops (get free API key first)
LTA_API_KEY="..." DATABASE_URL="..." python3 scripts/fetch/fetch_lta_busstops.py

# 3. OneMap planning area boundaries
DATABASE_URL="..." python3 scripts/fetch/fetch_onemap_boundaries.py --update-districts

# 4. ACRA business data (download CSV from data.gov.sg first)
DATABASE_URL="..." python3 scripts/fetch/fetch_acra.py --csv sg_bizfile.csv
```

Verify:
```sql
SELECT COUNT(*) FROM sg_hawker_centres;          -- ~114
SELECT COUNT(*) FROM sg_bus_stops;               -- ~5,000
SELECT COUNT(*) FROM sg_planning_areas;          -- ~55
SELECT name, nea_grade FROM places
  WHERE category = 'hawker' AND nea_grade IS NOT NULL
  LIMIT 5;
```

---

## Cost Breakdown

| Service | Config | Monthly cost |
|---------|--------|-------------|
| Cloud SQL | db-f1-micro, 10GB SSD | ~$8.70 |
| Cloud Run | 0 min instances, <2M req/mo | ~$0–3 |
| Container Registry | ~500MB image | ~$0.05 |
| Secret Manager | 6 secrets, low access | ~$0.06 |
| **Total** | | **~$9–12** |

---

## Auth Setup

The app uses a simple admin secret (no Supabase Auth, no Firebase needed).

1. Set `ADMIN_SECRET=<random-string>` in Secret Manager
2. Set `NEXT_PUBLIC_ADMIN_EMAIL=you@example.com` in Cloud Run env vars
3. Login at `/login` with your admin email → receive the token
4. Token is stored in browser sessionStorage, sent as `Authorization: Bearer <token>`

To rotate the admin secret:
```bash
echo -n "NEW_SECRET" | gcloud secrets versions add storepulse-admin-secret --data-file=-
# Then redeploy Cloud Run (or it picks up automatically with :latest)
```

---

## Supabase Backup Export (before decommissioning)

Export all data from Supabase:
```bash
pg_dump "postgres://postgres:PASS@db.PROJECT.supabase.co:5432/postgres" \
  --data-only \
  --table=places \
  --table=categories \
  --table=districts \
  --table=social_signals \
  > supabase_export.sql

# Import into Cloud SQL
psql "postgres://storepulse:PASS@localhost/storepulse" < supabase_export.sql
```
