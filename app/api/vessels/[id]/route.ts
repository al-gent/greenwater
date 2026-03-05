import { NextResponse } from 'next/server'
import { getVesselById } from '@/lib/vessels'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const vessel = getVesselById(id)
  if (!vessel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(vessel)
}
