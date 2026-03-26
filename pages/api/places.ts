import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

// Check if user is admin by comparing email against NEXT_PUBLIC_ADMIN_EMAIL
const isAdmin = (user: User) => {
  return user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
}

const getPlacesFromCache = async (lat: number, lng: number, radius: number, keyword: string, startDate?: string, endDate?: string) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const metersToLat = (m: number) => m / 111320;
  const metersToLng = (m: number, lat: number) => m / (111320 * Math.cos(lat * Math.PI / 180));
  const latDelta = metersToLat(radius);
  const lngDelta = metersToLng(radius, lat);
  const latMin = lat - latDelta;
  const latMax = lat + latDelta;
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;

  let query = supabase
    .from('places')
    .select('*')
    .eq('category', keyword)
    .gte('lat', latMin)
    .lte('lat', latMax)
    .gte('lng', lngMin)
    .lte('lng', lngMax)
    .gt('created_at', sevenDaysAgo.toISOString());

  if (startDate) {
    query = query.gte('founded_date', startDate);
  }
  if (endDate) {
    query = query.lte('founded_date', endDate);
  }

  const { data: cachedPlaces, error } = await query;

  if (error) {
    console.error('Supabase cache query failed:', error);
    return null;
  }

  return cachedPlaces;
}

const getPlacesFromGoogle = async (lat: number, lng: number, radius: number, keyword: string, maxPages: number) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Missing server API key');

  const location = `${lat},${lng}`;
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const aggregated: any[] = [];
  let url: string | null = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${encodeURIComponent(
    location,
  )}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${key}`;

  for (let pageIndex = 0; url && pageIndex < maxPages; ) {
    const r = await fetch(url);
    const json = await r.json();

    if (json.status === 'INVALID_REQUEST' && url.includes('pagetoken')) {
      await delay(2500);
      continue;
    }
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      if (pageIndex === 0) {
        throw new Error(json.error_message || json.status);
      }
      console.warn('Places NearbySearch stopped', json.status, json.error_message);
      break;
    }
    if (json.results?.length) aggregated.push(...json.results);

    if (!json.next_page_token) break;
    await delay(2100);
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${encodeURIComponent(
      json.next_page_token,
    )}&key=${key}`;
    pageIndex += 1;
  }
  return aggregated;
}

const savePlacesToCache = async (places: any[], keyword: string) => {
  const placesToInsert = places.map((place: any) => ({
    name: place.name,
    address: place.vicinity,
    lat: place.geometry?.location?.lat || null,
    lng: place.geometry?.location?.lng || null,
    google_place_id: place.place_id,
    category: keyword,
    source: 'google',
  }));

  const upsertReport: { count: number; errors: any[] } = { count: 0, errors: [] };

  for (const p of placesToInsert) {
    if (!p.google_place_id) continue;
    const { data, error } = await supabase.from('places').upsert(p, { onConflict: 'google_place_id' });
    if (error) {
      upsertReport.errors.push({ place: p.name, error });
    } else {
      upsertReport.count++;
    }
  }

  return upsertReport;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.split(' ')[1]);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { query, lat, lng, radius: radiusQ, maxPages: maxPagesQ, force_refresh, start_date, end_date } = req.query as {
    query?: string
    lat?: string
    lng?: string
    radius?: string
    maxPages?: string
    force_refresh?: string
    start_date?: string
    end_date?: string
  }

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const keyword = (query as string) || 'cafe';
  let radiusMeters = parseInt(String(radiusQ || ''), 10);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 1) radiusMeters = 2000;
  radiusMeters = Math.min(50000, Math.max(200, radiusMeters));

  if (force_refresh !== 'true') {
    const cachedPlaces = await getPlacesFromCache(parsedLat, parsedLng, radiusMeters, keyword, start_date, end_date);
    if (cachedPlaces && cachedPlaces.length > 0) {
      return res.status(200).json({ results: cachedPlaces, source: 'cache' });
    }
  }

  if (!isAdmin(user)) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to perform this action.' });
  }

  try {
    let maxPages = parseInt(String(maxPagesQ || ''), 10);
    if (!Number.isFinite(maxPages) || maxPages < 1) maxPages = 3;
    maxPages = Math.min(3, Math.max(1, maxPages));

    const googlePlaces = await getPlacesFromGoogle(parsedLat, parsedLng, radiusMeters, keyword, maxPages);
    const upsertReport = await savePlacesToCache(googlePlaces, keyword);

    return res.status(200).json({
      results: googlePlaces,
      status: 'OK',
      source: 'google',
      supabase: {
        writable: true,
        upsert: upsertReport,
      },
    });
  } catch (error: any) {
    console.error('Google Maps API fetch failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch data from Google Maps' });
  }
}
