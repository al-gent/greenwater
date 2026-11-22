import { geoEqualEarth, geoPath } from 'd3-geo'
import landCoordinates from '@/lib/world-land-110m.json'

// Natural Earth's public-domain 1:110m land polygons. D3 clips the coastlines
// at the new map edge when the Pacific is brought into the center.
const projection = geoEqualEarth().rotate([160, 0]).fitExtent([[4, 4], [636, 312]], { type: 'Sphere' })
const coastline = geoPath(projection)({ type: 'MultiPolygon', coordinates: landCoordinates })

export default function HomePortOverview({ ports }: { ports: [number, number][] }) {
  return (
    <svg viewBox="0 0 640 316" aria-hidden="true" className="mx-auto block h-auto w-full">
      <path d={coastline ?? undefined} fill="rgb(var(--seaLine, 179 208 202))" />
      <g fill="rgb(var(--accent, 18 93 84))" stroke="rgb(var(--sea, 232 244 242))" strokeWidth="0.9">
        {ports.map(([lat, lon]) => {
          const point = projection([lon, lat])
          return point && <circle key={`${lat},${lon}`} cx={point[0].toFixed(2)} cy={point[1].toFixed(2)} r="2.8" />
        })}
      </g>
    </svg>
  )
}
