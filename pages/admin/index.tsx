import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

type Place = {
  id: string
  name: string
  address: string | null
  category: string | null
  founded_date: string | null
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [places,  setPlaces]      = useState<Place[]>([])
  const [editing, setEditing]     = useState<string | null>(null)
  const [editData, setEditData]   = useState<Partial<Place>>({})
  const [message,  setMessage]    = useState('')

  const getToken = () => typeof window !== 'undefined' ? sessionStorage.getItem('storepulse_token') : null

  useEffect(() => {
    const token = getToken()
    const admin = !!token && token === process.env.NEXT_PUBLIC_ADMIN_SECRET
    setIsAdmin(admin)
    if (admin) fetchPlaces(token!)
    setLoading(false)
  }, [])

  const fetchPlaces = async (token: string) => {
    const res = await fetch('/api/supabase/places?limit=100&offset=0', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    setPlaces((json.results ?? []) as Place[])
  }

  const handleSave = async () => {
    if (!editing) return
    const token = getToken()
    const res = await fetch(`/api/admin/place?id=${editing}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editData),
    })
    if (res.ok) {
      setMessage('Updated successfully!')
      setEditing(null)
      fetchPlaces(token!)
    } else {
      setMessage('Update failed.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this place?')) return
    const token = getToken()
    const res = await fetch(`/api/admin/place?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setMessage('Deleted.')
      fetchPlaces(token!)
    } else {
      setMessage('Delete failed.')
    }
  }

  const handleSyncFromGoogle = async () => {
    const token = getToken()
    setMessage('Syncing…')
    const res = await fetch(
      `/api/places?query=cafe&lat=25.0667&lng=121.5833&radius=5000&maxPages=2&force_refresh=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (res.ok) {
      setMessage(`Synced ${data.db?.upsert?.count ?? 0} places from Google!`)
      fetchPlaces(token!)
    } else {
      setMessage('Sync failed: ' + data.error)
    }
  }

  if (loading) return <div className="p-4 text-white">Loading…</div>
  if (!isAdmin) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold text-red-500">Access Denied</h2>
        <p className="text-gray-400">Admin access required.</p>
        <Link href="/login" className="text-orange-400 hover:underline">Login</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar isAdmin={true} userEmail={process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? null} />
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Admin — Manage Places</h1>

        {message && <div className="mb-4 p-3 bg-orange-900/50 text-orange-300 rounded">{message}</div>}

        <button
          onClick={handleSyncFromGoogle}
          className="mb-4 bg-green-700 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          🔄 Sync from Google Places
        </button>

        <div className="overflow-x-auto bg-gray-900 rounded border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-800 border-b border-white/10">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Founded</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {places.map((place) => (
                <tr key={place.id} className="border-b border-white/5 hover:bg-white/5">
                  {editing === place.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })}
                          className="w-full p-1 bg-gray-800 border border-white/20 rounded text-white" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editData.address ?? ''} onChange={e => setEditData({ ...editData, address: e.target.value })}
                          className="w-full p-1 bg-gray-800 border border-white/20 rounded text-white text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editData.category ?? ''} onChange={e => setEditData({ ...editData, category: e.target.value })}
                          className="w-full p-1 bg-gray-800 border border-white/20 rounded text-white text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="date" value={editData.founded_date ?? ''} onChange={e => setEditData({ ...editData, founded_date: e.target.value })}
                          className="w-full p-1 bg-gray-800 border border-white/20 rounded text-white text-xs" />
                      </td>
                      <td className="px-4 py-2 space-x-2">
                        <button onClick={handleSave} className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-500">Save</button>
                        <button onClick={() => setEditing(null)} className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-500">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-semibold">{place.name}</td>
                      <td className="px-4 py-2 text-gray-400">{place.address || '—'}</td>
                      <td className="px-4 py-2">{place.category || '—'}</td>
                      <td className="px-4 py-2 text-gray-400">{place.founded_date || '—'}</td>
                      <td className="px-4 py-2 space-x-2">
                        <button onClick={() => { setEditing(place.id); setEditData(place) }}
                          className="bg-yellow-700 text-white px-2 py-1 rounded text-xs hover:bg-yellow-600">Edit</button>
                        <button onClick={() => handleDelete(place.id)}
                          className="bg-red-700 text-white px-2 py-1 rounded text-xs hover:bg-red-600">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {places.length === 0 && <p className="text-center text-gray-500 mt-6">No places. Sync from Google to get started.</p>}
      </div>
    </div>
  )
}
