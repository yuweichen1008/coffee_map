import postgres from 'postgres'

// Module-level singleton — reused across hot-reloads in dev and across
// requests in production (Cloud Run keeps instances warm).
let _sql: ReturnType<typeof postgres> | null = null

export function getDb(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql

  const url = process.env.DATABASE_URL
  if (!url) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[db] DATABASE_URL not set — all DB queries will return empty')
    }
    return null
  }

  _sql = postgres(url, {
    max:             10,
    idle_timeout:    20,
    connect_timeout: 10,
  })
  return _sql
}

export default getDb
