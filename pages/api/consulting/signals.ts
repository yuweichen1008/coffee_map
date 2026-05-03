import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

// GET /api/consulting/signals?district=Daan&category=cafe&min_score=0&platforms=instagram,tiktok
//
// Returns up to 200 places in the district that have at least one social signal
// matching the filters.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const sql = getDb()
  if (!sql) return res.status(200).json({ results: [] })

  const {
    district   = 'Daan',
    category   = 'all',
    min_score  = '0',
    platforms  = 'instagram,tiktok,facebook,threads,line',
  } = req.query as Record<string, string>

  const minScoreNum  = Math.max(0, Math.min(100, parseInt(min_score) || 0))
  const platformList = platforms.split(',').map(p => p.trim()).filter(Boolean)

  if (platformList.length === 0) return res.status(200).json({ results: [] })

  try {
    // Step 1: fetch matching signals
    const signalRows = await sql`
      SELECT place_id, platform, score
      FROM social_signals
      WHERE platform = ANY(${platformList}) AND score >= ${minScoreNum}
      ORDER BY score DESC
    `

    if (signalRows.length === 0) return res.status(200).json({ results: [] })

    // Aggregate per place (tiny dataset — in-memory)
    const placeMap = new Map<string, { top_score: number; top_platform: string; signals: { platform: string; score: number }[] }>()
    for (const row of signalRows) {
      const existing = placeMap.get(row.place_id)
      if (!existing) {
        placeMap.set(row.place_id, {
          top_score:    row.score,
          top_platform: row.platform,
          signals:      [{ platform: row.platform, score: row.score }],
        })
      } else {
        existing.signals.push({ platform: row.platform, score: row.score })
        if (row.score > existing.top_score) {
          existing.top_score    = row.score
          existing.top_platform = row.platform
        }
      }
    }

    const placeIds = Array.from(placeMap.keys())

    // Step 2: fetch place details for matched IDs, filtered by district + category
    const places = category !== 'all'
      ? await sql`
          SELECT id, name, address, lat, lng, category, district, rating, review_count
          FROM places
          WHERE id = ANY(${placeIds}::uuid[])
            AND district = ${district}
            AND category = ${category}
            AND status = 'active'
          LIMIT 200
        `
      : await sql`
          SELECT id, name, address, lat, lng, category, district, rating, review_count
          FROM places
          WHERE id = ANY(${placeIds}::uuid[])
            AND district = ${district}
            AND status = 'active'
          LIMIT 200
        `

    const results = places
      .map(p => ({
        ...p,
        signals:      placeMap.get(p.id)?.signals      ?? [],
        top_score:    placeMap.get(p.id)?.top_score    ?? 0,
        top_platform: placeMap.get(p.id)?.top_platform ?? 'instagram',
      }))
      .sort((a, b) => b.top_score - a.top_score)

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ results })
  } catch (e) {
    console.error('[consulting/signals]', e)
    return res.status(500).json({ error: String(e), results: [] })
  }
}
