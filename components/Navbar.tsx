import { FC } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

const Navbar: FC<{ isAdmin?: boolean; userEmail?: string | null }> = ({ isAdmin, userEmail }) => {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="bg-black/90 backdrop-blur-md text-white border-b border-white/8">
      <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight">StorePulse</span>
        </Link>

        <div className="flex gap-5 items-center">
          <Link href="/map" className="text-gray-400 hover:text-white text-sm transition">Map</Link>
          <Link href="/time-machine" className="text-gray-400 hover:text-white text-sm transition">Time Machine</Link>
          <Link href="/discover" className="text-gray-400 hover:text-white text-sm transition">Discover</Link>
          <Link href="/intro" className="text-gray-400 hover:text-white text-sm transition">How It Works</Link>
          <Link href="/pitch"
            className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 text-sm font-semibold transition">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Investor Deck
          </Link>

          {isAdmin && (
            <Link href="/admin"
              className="bg-red-600/80 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 transition font-semibold">
              Admin
            </Link>
          )}

          {userEmail ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="text-xs bg-white/8 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/12 transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login"
              className="bg-orange-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-orange-600 transition">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
