import { useState } from 'react'
import { useRouter } from 'next/router'
import Navbar from '@/components/Navbar'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.token) {
        sessionStorage.setItem('storepulse_token', data.token)
        router.replace('/map')
      } else {
        setMessage(data.message || 'Access denied.')
      }
    } catch {
      setMessage('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-950">
        <div className="bg-gray-900 border border-white/10 rounded-xl shadow-md p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-1 text-white">Admin Login</h1>
          <p className="text-sm text-gray-400 mb-6">Enter your admin email to access StorePulse.</p>

          <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="block w-full p-2 bg-gray-800 border border-white/10 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />

          <button
            onClick={handleLogin}
            disabled={loading || !email}
            className="mt-4 w-full bg-orange-500 text-white py-2 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Checking…' : 'Login'}
          </button>

          {message && (
            <p className="mt-4 text-sm text-center text-gray-400">{message}</p>
          )}
        </div>
      </div>
    </>
  )
}
