import { FC } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

const Navbar: FC<{ isAdmin?: boolean; userEmail?: string | null }> = ({ isAdmin, userEmail }) => {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold hover:text-gray-200">
          ☕ Coffee Map
        </Link>
        <div className="flex gap-6 items-center">
          <Link href="/" className="hover:text-gray-200 transition">
            Home
          </Link>
          <Link href="/about" className="hover:text-gray-200 transition">
            About Us
          </Link>
          <Link href="/time-machine" className="hover:text-gray-200 transition">
            Time Machine
          </Link>
          <Link href="/request" className="hover:text-gray-200 transition">
            Contribute
          </Link>
          {isAdmin && (
            <Link href="/admin" className="bg-red-600 px-3 py-1 rounded hover:bg-red-700 transition">
              Admin CMS
            </Link>
          )}
          {userEmail ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-300">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="text-sm bg-gray-600 px-3 py-1 rounded hover:bg-gray-500 transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 transition">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
