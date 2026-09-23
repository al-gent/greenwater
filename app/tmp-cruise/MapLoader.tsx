'use client'
// TEMPORARY — Leaflet must not SSR, and dynamic({ssr:false}) has to live in a client component.
import dynamic from 'next/dynamic'

const CruiseMap = dynamic(() => import('./CruiseMap'), { ssr: false, loading: () => <div style={{ height: 420 }} className="bg-lightblue-100" /> })

export default function MapLoader(props: { fc: any; ports: { name: string; lat: number; lon: number }[] }) {
  return <CruiseMap {...props} />
}
