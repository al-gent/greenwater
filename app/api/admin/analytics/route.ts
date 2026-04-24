import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryCodeToName(code: string): string {
  try { return regionNames.of(code) ?? code } catch { return code }
}

export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('get_analytics_summary', { days_back: 30 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.countries) {
    data.countries = data.countries.map((c: { label: string; views: number }) => ({
      label: c.label === 'Unknown' ? 'Unknown' : countryCodeToName(c.label),
      views: c.views,
    }))
  }

  return NextResponse.json(data)
}
