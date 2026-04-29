# API Reference — StorePulse

All routes are Next.js API routes in `pages/api/`. All return JSON.
Cache headers: `s-maxage=N, stale-while-revalidate` for public routes.

---

## `GET /api/places`

Spatial bounding box query for stores by category. Cache miss triggers Google Places fetch (admin only).

**Query params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `lat` | number | ✓ | — | Center latitude |
| `lng` | number | ✓ | — | Center longitude |
| `radius` | number | — | 2000 | Radius in meters (max 50000, min 200) |
| `query` | string | — | `cafe` | Category slug or search keyword |
| `force_refresh` | `true` | — | — | Admin only: bypass cache and hit Google |
| `start_date` | date | — | — | Filter by `founded_date >=` |
| `end_date` | date | — | — | Filter by `founded_date <=` |

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "name": "Starbucks Tanjong Pagar",
      "address": "1 Wallich St",
      "district": "Tanjong_Pagar",
      "lat": 1.2763,
      "lng": 103.8461,
      "category": "cafe",
      "status": "active",
      "rating": 4.1,
      "review_count": 892,
      "founded_date": "2018-03-01"
    }
  ],
  "source": "cache"
}
```

---

## `GET /api/hawker-rank`

Hawker centres ordered by vote count (review_count DESC).

**Query params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `district` | string | — | all | Filter by district slug (e.g. `Tanjong_Pagar`) |
| `limit` | number | — | 30 | Max results (max 100) |

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "name": "Maxwell Food Centre",
      "address": "1 Kadayanallam St",
      "district": "Tanjong_Pagar",
      "rating": 4.5,
      "review_count": 8200,
      "lat": 1.2801,
      "lng": 103.8451
    }
  ]
}
```

**Cache:** `s-maxage=300`

---

## `GET /api/mrt-malls`

Shopping malls near a given MRT station, sorted by distance then review count.

**Query params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `lat` | number | ✓ | — | MRT station latitude |
| `lng` | number | ✓ | — | MRT station longitude |
| `radius` | number | — | 1500 | Search radius in meters (max 5000) |

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "name": "Ion Orchard",
      "address": "2 Orchard Turn",
      "district": "Orchard",
      "rating": 4.6,
      "review_count": 12400,
      "lat": 1.3040,
      "lng": 103.8318,
      "distance_m": 250
    }
  ]
}
```

**Cache:** `s-maxage=120`

---

## `GET /api/pitch-stats`

Live counts for the investor deck page.

**No params.**

**Response:**
```json
{
  "active_stores": 4963,
  "closed_tracked": 2,
  "categories": 14,
  "districts": 31,
  "cities": 2
}
```

**Cache:** `s-maxage=300`

---

## `GET /api/categories`

All category slugs from the database.

**No params.**

**Response:**
```json
{
  "categories": [
    "cafe", "convenience_store", "hawker", "supermarket",
    "pharmacy", "gym", "coworking", "shopping_mall"
  ]
}
```

---

## `GET /api/stats`

District-level store counts. Used for analytics and consulting reports.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `district` | string | Filter by district slug |
| `category` | string | Filter by category |
| `city` | `taipei` \| `singapore` | Filter by city (derived from district names) |

---

## `GET /api/report`

Generate a consulting report snapshot for a district.

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `district` | string | ✓ | District slug |

---

## `POST /api/auth/login`

Supabase email/password login.

**Body:** `{ email: string, password: string }`

**Response:** `{ user: User, session: Session }`

---

## `POST /api/auth/register`

New user registration (admin approval required).

**Body:** `{ email: string, password: string }`

---

## `GET /api/debug/supabase-status`

Health check for Supabase connection. Returns table row counts.

---

## Error Format

All error responses:
```json
{ "error": "Human-readable error message" }
```

HTTP status codes:
- `400` — Missing required parameter
- `401` / `403` — Unauthorized / not admin
- `405` — Method not allowed
- `500` — Supabase or upstream error
