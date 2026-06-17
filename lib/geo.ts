/**
 * Pure geo helpers — point-in-polygon (containment) and great-circle distance.
 * No dependencies; safe on server or client. GeoJSON positions are [lon, lat].
 */

type Pos = [number, number] // [lon, lat]

/** Great-circle distance in nautical miles. */
export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // earth radius, nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Ray-casting point-in-ring test. */
function ringContains(p: Pos, ring: Pos[]): boolean {
  const [x, y] = p
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Polygon = [outerRing, ...holes]. Inside outer and not inside any hole. */
function polygonContains(p: Pos, rings: Pos[][]): boolean {
  if (!rings.length || !ringContains(p, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(p, rings[i])) return false
  }
  return true
}

function geometryContains(p: Pos, geom: any): boolean {
  if (!geom) return false
  if (geom.type === 'Polygon') return polygonContains(p, geom.coordinates)
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poly: Pos[][]) => polygonContains(p, poly))
  return false
}

/** True if (lon,lat) falls inside any feature of the FeatureCollection. */
export function pointInFeatureCollection(lon: number, lat: number, fc: any): boolean {
  if (!fc?.features?.length) return false
  const p: Pos = [lon, lat]
  return fc.features.some((f: any) => geometryContains(p, f?.geometry))
}

/**
 * True if (lon,lat) is inside the FeatureCollection OR within `radiusNm` of its
 * boundary — i.e. a circle of that radius around the point overlaps the area.
 * Uses a local planar projection (nm) around the point; accurate for the few-
 * hundred-nm ranges we search. Early-exits on the first hit.
 */
export function withinDistanceOfFeatureCollection(lon: number, lat: number, fc: any, radiusNm: number): boolean {
  if (!fc?.features?.length) return false
  if (pointInFeatureCollection(lon, lat, fc)) return true

  const kx = 60 * Math.cos((lat * Math.PI) / 180) // nm per degree of longitude at this latitude
  const ky = 60 // nm per degree of latitude
  const r2 = radiusNm * radiusNm

  // squared distance (nm²) from the query point to segment a–b, both [lon,lat]
  const segDist2 = (a: Pos, b: Pos): number => {
    const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky
    const bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    return cx * cx + cy * cy
  }

  for (const f of fc.features) {
    const g = f?.geometry
    if (!g) continue
    const polys: Pos[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const rings of polys) {
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          if (segDist2(ring[i - 1], ring[i]) <= r2) return true
        }
      }
    }
  }
  return false
}
