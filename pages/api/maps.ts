import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing server API key' });

  const script = await fetch(`https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,visualization`)
    .then(res => res.text());

  res.status(200).send(script);
}
