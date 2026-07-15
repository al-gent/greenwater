import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { VesselDoc } from '@/lib/vessel-utils'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const FETCH_TIMEOUT_MS = 20_000

// Admins may manage any vessel's docs; operators only their own.
async function authorize(vesselId: number) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') return user
  if (profile?.role === 'operator' && profile.vessel_id === vesselId) return user
  return null
}

function filenameFrom(url: URL, disposition: string | null): string {
  const fromHeader = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1]
  const raw = decodeURIComponent(fromHeader ?? url.pathname.split('/').pop() ?? 'document')
  const safe = raw.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/_{2,}/g, '_').slice(0, 80)
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`
}

// POST — attach a PDF to a vessel's doc_details. Two modes:
//   { vessel_id, url, description? }  — server fetches the link (may be
//     refused by bot-blocking sites), verifies it's a PDF, stores a copy
//   { vessel_id, path, description? } — file already uploaded to vessel-docs
//     by the browser (large files skip Vercel's body limit); the server
//     verifies the stored bytes before attaching, deleting them if invalid
// doc_details is deny-listed on the generic update route; this route is the
// only writer, so entries always point at verified PDFs we actually hold.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const vesselId = parseInt(body?.vessel_id, 10)
  const hasUrl = typeof body?.url === 'string'
  const hasPath = typeof body?.path === 'string'
  if (!body || isNaN(vesselId) || (!hasUrl && !hasPath)) {
    return NextResponse.json({ error: 'vessel_id and url or path are required' }, { status: 400 })
  }
  const user = await authorize(vesselId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let path: string
  let name: string
  let size: number

  if (hasPath) {
    // ── uploaded-file mode: verify what landed in our own bucket
    if (!body.path.startsWith(`${vesselId}/`) || body.path.includes('..')) {
      return NextResponse.json({ error: 'Bad file path.' }, { status: 400 })
    }
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from('vessel-docs').download(body.path)
    if (dlErr || !blob) return NextResponse.json({ error: 'Uploaded file not found.' }, { status: 404 })
    if (blob.size > MAX_BYTES) {
      await supabaseAdmin.storage.from('vessel-docs').remove([body.path])
      return NextResponse.json({ error: 'File is larger than the 25 MB limit.' }, { status: 422 })
    }
    const head = Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString('latin1')
    if (head !== '%PDF-') {
      await supabaseAdmin.storage.from('vessel-docs').remove([body.path])
      return NextResponse.json({ error: 'That file is not a PDF.' }, { status: 422 })
    }
    path = body.path
    name = path.split('/').pop() ?? 'document.pdf'
    size = blob.size
  } else {
    // ── link mode
    let srcUrl: URL
    try {
      srcUrl = new URL(body.url)
      if (!/^https?:$/.test(srcUrl.protocol)) throw new Error()
    } catch {
      return NextResponse.json({ error: 'That does not look like a valid http(s) link.' }, { status: 400 })
    }
    let res: Response
    try {
      res = await fetch(srcUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'VesselConnect document fetcher (contact@greenwater.org)' },
      })
    } catch {
      return NextResponse.json({ error: 'Could not reach that link — it may be down or very slow. Try downloading the PDF and uploading it here instead.' }, { status: 422 })
    }
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "That site won't let us download the file (it blocks automated access). Download the PDF yourself and upload it here instead." }, { status: 422 })
    }
    if (res.status === 404) {
      return NextResponse.json({ error: 'That link appears to be broken (page not found).' }, { status: 422 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Couldn't download from that link (site error). Try uploading the PDF directly instead.` }, { status: 422 })
    }
    const declared = parseInt(res.headers.get('content-length') ?? '', 10)
    if (!isNaN(declared) && declared > MAX_BYTES) {
      return NextResponse.json({ error: 'File is larger than the 25 MB limit.' }, { status: 422 })
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: 'File is larger than the 25 MB limit.' }, { status: 422 })
    }
    // Magic bytes are the truth — content-type headers lie
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: "That link doesn't point to a PDF (it may be a webpage that links to one — try the PDF's own address, or upload the file directly)." }, { status: 422 })
    }
    name = filenameFrom(srcUrl, res.headers.get('content-disposition'))
    path = `${vesselId}/${Date.now()}-${name}`
    size = buf.length
    const { error: upErr } = await supabaseAdmin.storage
      .from('vessel-docs')
      .upload(path, buf, { contentType: 'application/pdf' })
    if (upErr) {
      console.error('doc upload error:', upErr)
      return NextResponse.json({ error: 'Failed to store the PDF.' }, { status: 500 })
    }
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('vessel-docs').getPublicUrl(path)
  const { data: vessel } = await supabaseAdmin.from('vessels').select('doc_details').eq('id', vesselId).single()
  const doc: VesselDoc = {
    url: publicUrl,
    name,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
    contentLength: size,
  }
  const docs = [...(vessel?.doc_details ?? []), doc]
  const { error: dbErr } = await supabaseAdmin
    .from('vessels')
    .update({ doc_details: docs, last_updated: new Date().toISOString() })
    .eq('id', vesselId)
  if (dbErr) {
    await supabaseAdmin.storage.from('vessel-docs').remove([path])
    return NextResponse.json({ error: 'Failed to attach the PDF.' }, { status: 500 })
  }
  return NextResponse.json({ doc, docs })
}

// DELETE { vessel_id, url } — detach a document; also removes the stored file
// when it lives in our vessel-docs bucket (external legacy URLs are left alone).
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null)
  const vesselId = parseInt(body?.vessel_id, 10)
  if (!body || isNaN(vesselId) || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'vessel_id and url are required' }, { status: 400 })
  }
  const user = await authorize(vesselId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: vessel } = await supabaseAdmin.from('vessels').select('doc_details').eq('id', vesselId).single()
  const docs = (vessel?.doc_details ?? []) as VesselDoc[]
  const remaining = docs.filter((d) => d.url !== body.url)
  if (remaining.length === docs.length) {
    return NextResponse.json({ error: 'Document not found on this vessel.' }, { status: 404 })
  }
  const { error: dbErr } = await supabaseAdmin
    .from('vessels')
    .update({ doc_details: remaining.length ? remaining : null, last_updated: new Date().toISOString() })
    .eq('id', vesselId)
  if (dbErr) return NextResponse.json({ error: 'Failed to update.' }, { status: 500 })

  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vessel-docs/`
  if (body.url.startsWith(prefix)) {
    await supabaseAdmin.storage.from('vessel-docs').remove([body.url.slice(prefix.length)])
  }
  return NextResponse.json({ docs: remaining })
}
