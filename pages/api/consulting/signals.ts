import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

// GET /api/consulting/signals?district=Daan&category=cafe&min_score=0&platforms=instagram,tiktok
//
// Returns up to 200 places in the district that have at least one social signal
// matching the filters.  All filtering is done SQL-side — no client-side post-processing.
// Response is cached for 5 minutes (CDN + browser).

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!supabase) return res.status(200).json({ results: [] })

  const {
    district   = 'Daan',
    category   = 'all',
    min_score  = '0',
    platforms  = 'instagram,tiktok,facebook,threads,line',
  } = req.query as Record<string, string>

  const minScoreNum   = Math.max(0, Math.min(100, parseInt(min_score) || 0))
  const platformList  = platforms.split(',').map(p => p.trim()).filter(Boolean)

  if (platformList.length === 0) {
    return res.status(200).json({ results: [] })
  }

  try {
    // ── Base places query with social signal JOIN ──────────────────────────────
    // Supabase JS client doesn't support GROUP BY / json_agg natively,
    // so we use a raw RPC call via the REST API through two queries:
    //   1. Get matching place IDs + top_score via social_signals
    //   2. Get place details + all signals for those IDs
    //
    // This keeps us within the Supabase JS client's capabilities while
    // still doing all heavy filtering on the DB side.

    // Step 1: Get place_ids with their top_score (SQL-side platform + score filter)
    const { data: signalRows, error: sigErr } = await supabase
      .from('social_signals')
      .select('place_id, platform, score')
      .in('platform', platformList)
      .gte('score', minScoreNum)
      .order('score', { ascending: false })

    if (sigErr) throw sigErr
    if (!signalRows || signalRows.length === 0) {
      return res.status(200).json({ results: [] })
    }

    // Aggregate: best score + all signals per place (client-side, in-memory — tiny dataset)
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

    // Step 2: Fetch place details, filtered by district + category
    let placeQuery = supabase
      .from('places')
      .select('id, name, address, lat, lng, category, district, rating, review_count')
      .in('id', placeIds)
      .eq('district', district)
      .eq('status', 'active')

    if (category !== 'all') {
      placeQuery = placeQuery.eq('category', category)
    }

    const { data: places, error: placeErr } = await placeQuery
    if (placeErr) throw placeErr

    // Merge signals into place results, sort by top_score desc, cap at 200
    const results = (places || [])
      .map(p => ({
        ...p,
        signals:      placeMap.get(p.id)?.signals      ?? [],
        top_score:    placeMap.get(p.id)?.top_score    ?? 0,
        top_platform: placeMap.get(p.id)?.top_platform ?? 'instagram',
      }))
      .sort((a, b) => b.top_score - a.top_score)
      .slice(0, 200)

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ results })
  } catch (e) {
    console.error('[consulting/signals]', e)
    return res.status(500).json({ error: String(e), results: [] })
  }
}
