import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { stripHtml, getPhotoUrl } from '@/lib/vessel-utils'
import type { Vessel } from '@/lib/vessel-utils'
import InquiryThread from '@/components/InquiryThread'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/dashboard')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'operator' || !profile.vessel_id) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">No vessel linked</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your account isn&apos;t linked to a vessel yet. Submit a claim on a vessel listing or apply to list a new vessel.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/" className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors">
              Browse Vessels
            </Link>
            <Link href="/list" className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-full text-sm font-medium hover:border-gray-300 transition-colors">
              List a Vessel
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('*')
    .eq('id', profile.vessel_id)
    .single()

  if (!vessel) redirect('/')

  // Fetch all messages for this vessel and split into roots + replies
  const { data: allMessages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('vessel_id', profile.vessel_id)
    .order('created_at', { ascending: true })
    .limit(200)

  const roots = (allMessages ?? []).filter((m) => m.thread_id === m.id)
  const replies = (allMessages ?? []).filter((m) => m.thread_id !== m.id)

  // Sort roots newest first
  roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Fetch scientist profiles for display
  const authorIds = [...new Set(roots.map((r) => r.author_id))]
  const { data: scientistProfiles } = authorIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, institution, title')
        .in('id', authorIds)
    : { data: [] }

  const v = vessel as Vessel
  const photoUrl = getPhotoUrl(v)
  const activity = stripHtml(v.Main_Activity ?? '')
  const newCount = roots.filter((m) => m.status === 'new').length

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy">Operator Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
          </div>
          <Link
            href="/dashboard/edit"
            className="flex items-center gap-2 bg-navy text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit vessel info
          </Link>
        </div>

        {/* Vessel card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="relative" style={{ minHeight: '180px' }}>
              <img src={photoUrl} alt={v.name} loading="lazy" className="w-full h-full object-cover absolute inset-0" />
            </div>
            <div className="sm:col-span-2 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy">{v.name}</h2>
                  {v.homeport && <p className="text-gray-500 text-sm mt-0.5">{v.homeport}</p>}
                </div>
                <Link
                  href={`/vessels/${v.id}`}
                  target="_blank"
                  className="text-xs text-teal font-medium hover:underline flex items-center gap-1"
                >
                  View listing
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Length', value: v.length ? `${v.length} m` : null },
                  { label: 'Cruise Speed', value: v.Speed_Cruise ? `${v.Speed_Cruise} kn` : null },
                  { label: 'Research Bunks', value: v.scientists },
                  { label: 'Year Built', value: v.Year_Built },
                ].filter(s => s.value !== null && s.value !== undefined).map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{s.label}</p>
                    <p className="text-sm font-semibold text-navy">{s.value}</p>
                  </div>
                ))}
              </div>
              {activity && (
                <p className="text-sm text-gray-500 mt-3 line-clamp-2">{activity}</p>
              )}
            </div>
          </div>
        </div>

        {/* Inquiries */}
        <div id="inquiries">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-navy">
              Inquiries
              {newCount > 0 && (
                <span className="ml-2 bg-gold text-navy text-xs font-bold px-2 py-0.5 rounded-full">
                  {newCount} new
                </span>
              )}
            </h2>
          </div>

          <InquiryThread
            roots={roots}
            replies={replies}
            profiles={scientistProfiles ?? []}
          />
        </div>
      </div>
    </div>
  )
}
