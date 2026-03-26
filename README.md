# Coffee Map

A web application to help business owners find the best location for their next coffee shop. It provides a map-based interface to visualize store locations, a heatmap to identify booming and saturated areas, and a "Time Machine" feature to analyze historical data.

## Project Goals

-   Provide data-driven insights to business owners.
-   Visualize coffee shop distribution in a given area.
-   Analyze historical trends to predict future opportunities.

## Features

-   **Map View:** An interactive map showing the locations of coffee shops.
-   **Heatmap:** A visual representation of the density of coffee shops.
-   **Time Machine:** A feature to view store data from different points in time.
-   **User Authentication:** Users can register and log in to access the application.
-   **Admin Features:** Admins can refresh the data from external sources.
-   **Request Analysis:** Users can request an analysis of a potential new store location.

## Technology Stack

-   **Framework:** [Next.js](https://nextjs.org/)
-   **Database:** [Supabase](https://supabase.io/)
-   **Map:** [Mapbox](https://www.mapbox.com/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/)

## Database

The database is hosted on Supabase. It consists of the following tables:

-   `places`: Stores the information about the coffee shops.
-   `users`: Stores user data.
-   `profiles`: Stores user profiles, including their roles.

### Schema

**`places` table:**

| Column          | Type    | Description                           |
| --------------- | ------- | ------------------------------------- |
| `id`            | `uuid`  | Primary key.                          |
| `name`          | `text`  | The name of the coffee shop.          |
| `address`       | `text`  | The address of the coffee shop.       |
| `lat`           | `float` | The latitude of the coffee shop.      |
| `lng`           | `float` | The longitude of the coffee shop.     |
| `google_place_id`| `text`  | The Google Place ID of the coffee shop. |
| `category`      | `text`  | The category of the store (e.g., "cafe"). |
-   `founded_date` | `date` | The date the store was founded. |
| `created_at`    | `timestamp` | The timestamp when the record was created. |

### Setup

1.  **Create a Supabase project.**
2.  **Create the tables:**
    -   You can use the Supabase dashboard to create the tables manually.
    -   Alternatively, you can run the `scripts/create_tables.js` script to create the tables programmatically.
3.  **Seed the data:**
    -   Run the `npm run db:seed` command to seed the database with some sample data.

## Roadmap

-   [x] Setup project environment.
-   [x] Implement user authentication.
-   [x] Develop backend API for places.
-   [x] Integrate Mapbox for map display.
-   [x] Build frontend UI for login, account, and about me sections.
-   [x] Implement heatmap and time machine feature.
-   [ ] Write unit tests for Supabase and Mapbox.
-   [ ] Improve the "Request Analysis" feature with real data analysis.
-   [ ] Add more data sources for the "Time Machine" feature.

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm
-   A Supabase project.
-   A Mapbox account.

### Environment Variables

Create a `.env.local` file in the root of the project and add the following environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key-here
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token-here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Installation

1.  Install the dependencies:

    ```bash
    npm install
    ```

2.  Run the development server:

    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:3000`.
### Quick start — full Supabase setup (what every new developer should do first)

Follow these steps exactly to set up a Supabase-backed development environment (init DB → seed → run):

1) Create a Supabase project

- Go to https://app.supabase.com and create a new project.
- After the project is created, open Project Settings → API and copy the **Project URL** (this is `SUPABASE_URL`) and the **Service Role** key (this is `SUPABASE_SERVICE_ROLE_KEY`). Keep the service role key secret.

2) Prepare `.env.local` in the project root

Create a `.env.local` file (gitignored) and add the following keys. Replace values with those from your Supabase project and your Map/Places provider keys:

```text
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_google_maps_key
GOOGLE_MAPS_API_KEY=your_server_google_maps_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# Optional: publishable (anon) key for client reads
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
# Optional: direct DB URL if you have DB admin access (for scripts/init_db.js)
DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db>
```

Notes:
- Use the browser key for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and the server key for `GOOGLE_MAPS_API_KEY` if possible.
- If you do not have `DATABASE_URL`, you can still initialize the DB using Supabase's SQL Editor (next step).

3) Initialize the database (choose one)

a) Recommended (Supabase SQL Editor — no DB admin connection required)

- Open Supabase → SQL Editor, paste the contents of `db/init_all.sql`, and run it. This creates extensions (pgcrypto, postgis), tables, a spatial index, and inserts minimal sample rows.

b) From your machine (requires `DATABASE_URL` with admin rights)

- Install `pg` if not installed:

```bash
npm install pg
```

- Run the init script which executes `db/init_all.sql`:

```bash
npm run db:init
```

This runs `scripts/init_db.js` and requires `DATABASE_URL` (or `SUPABASE_DB_URL`) in `.env.local` and a connection that can create extensions.

4) Seed data (optional)

If you want additional sample rows used by the app, run the seed script which uses the Supabase client and the service role key:

```bash
npm run db:seed
```

This requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to be set in `.env.local`.

5) Run the app locally

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000

6) Run integration connectivity test (optional, CI)

- A safe, read-only integration test lives under `integration/supabase-connection.test.ts`. It is designed to be skipped locally when credentials are not present.
- To run it locally or in CI, ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present in environment or `.env.local`, then run:

```bash
npm run test:integration
```

CI recommendation
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your CI provider secrets (only for staging tests). In Github Actions, add them to repository secrets and run `npm ci` then `npm run test:integration` in a workflow step.

Troubleshooting
- If a SQL command fails because you cannot create extensions (permission error), use Supabase SQL Editor where the project role has permission, or ask the project owner to run the init SQL.
- If seeded writes fail locally or in tests because Row-Level Security (RLS) is enabled, use the **Service Role** key for server-side writes (never commit this key). The integration test reads only and is safe when RLS blocks writes.

Security and best practices
- Never commit `.env.local` or service role keys to source control.
- Use project-level secrets in CI rather than placing secrets in plain text in workflows.

If you'd like I can add a GitHub Actions template that runs unit tests on PRs and runs `test:integration` against a staging Supabase project when secrets are provided.
