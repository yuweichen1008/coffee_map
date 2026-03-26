import { supabase } from '@/lib/supabaseClient';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
  });

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(200).json({ message: 'Check your email for the login link' });
}
