import { FC } from 'react'
import Link from 'next/link'

const Navbar: FC<{ isAdmin?: boolean; userEmail?: string | null }> = ({ isAdmin, userEmail }) => {
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
          <Link href="/request" className="hover:text-gray-200 transition">
            Contribute to this project
          </Link>
          {isAdmin && (
            <Link href="/admin" className="bg-red-600 px-3 py-1 rounded hover:bg-red-700 transition">
              Admin CMS
            </Link>
          )}
          {userEmail ? (
            <span className="text-sm text-gray-300">{userEmail}</span>
          ) : (
            <Link href="/" className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 transition">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
