import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [places, setPlaces] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)

      if (session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        setIsAdmin(true)
        await fetchPlaces()
      } else {
        setIsAdmin(false)
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  const fetchPlaces = async () => {
    const { data, error } = await supabase.from('places').select('*').limit(100)
    if (error) {
      setMessage('Failed to fetch places: ' + error.message)
    } else {
      setPlaces(data || [])
    }
  }

  const handleEdit = (place: any) => {
    setEditingId(place.id)
    setEditData({
      name: place.name,
      founded_date: place.founded_date || '',
      address: place.address || '',
      category: place.category || '',
    })
  }

  const handleSave = async () => {
    if (!editingId) return
    const { error } = await supabase
      .from('places')
      .update(editData)
      .eq('id', editingId)
    if (error) {
      setMessage('Failed to update: ' + error.message)
    } else {
      setMessage('Updated successfully!')
      setEditingId(null)
      await fetchPlaces()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return
    const { error } = await supabase.from('places').delete().eq('id', id)
    if (error) {
      setMessage('Failed to delete: ' + error.message)
    } else {
      setMessage('Deleted successfully!')
      await fetchPlaces()
    }
  }

  const handleSyncFromGoogle = async () => {
    setMessage('Syncing from Google Places...')
    try {
      // Example: sync Neihu cafes
      const res = await fetch('/api/places?query=cafe&lat=25.0667&lng=121.5833&radius=5000&maxPages=2&force_refresh=true', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`Synced ${data.supabase?.upsert?.count || 0} places from Google!`)
        await fetchPlaces()
      } else {
        setMessage('Sync failed: ' + data.error)
      }
    } catch (e: any) {
      setMessage('Sync error: ' + String(e.message))
    }
  }

  if (loading) return <div className="p-4">Loading...</div>
  if (!isAdmin) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
        <p>Only admins can access this page. Please use your admin email to login.</p>
        <Link href="/" className="text-blue-600 hover:underline">Back to home</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin={true} userEmail={session?.user?.email} />
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Admin CMS - Manage Places</h1>

        {message && <div className="mb-4 p-3 bg-blue-100 text-blue-800 rounded">{message}</div>}

        <button
          onClick={handleSyncFromGoogle}
          className="mb-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          🔄 Sync from Google Places (Neihu)
        </button>

        <div className="overflow-x-auto bg-white rounded shadow">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Founded Date</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {places.map((place) => (
                <tr key={place.id} className="border-b hover:bg-gray-50">
                  {editingId === place.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editData.address}
                          onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                          className="w-full p-1 border rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editData.category}
                          onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                          className="w-full p-1 border rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={editData.founded_date}
                          onChange={(e) => setEditData({ ...editData, founded_date: e.target.value })}
                          className="w-full p-1 border rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-2 space-x-2">
                        <button onClick={handleSave} className="bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700">
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-400 text-white px-2 py-1 rounded text-sm hover:bg-gray-500">
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-semibold">{place.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{place.address || '—'}</td>
                      <td className="px-4 py-2 text-sm">{place.category || '—'}</td>
                      <td className="px-4 py-2 text-sm">{place.founded_date || '—'}</td>
                      <td className="px-4 py-2 space-x-2">
                        <button
                          onClick={() => handleEdit(place)}
                          className="bg-yellow-600 text-white px-2 py-1 rounded text-sm hover:bg-yellow-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(place.id)}
                          className="bg-red-600 text-white px-2 py-1 rounded text-sm hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {places.length === 0 && <p className="text-center text-gray-500 mt-6">No places yet. Sync from Google to get started!</p>}
      </div>
    </div>
  )
}
