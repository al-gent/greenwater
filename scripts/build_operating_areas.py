#!/usr/bin/env python3
"""
Build per-vessel operating-area GeoJSON from the gazetteer matches.

Input:  notebooks/gazetteer_results.pkl  (vessel_id, phrase, matched_name, mrgid, bbox)
        — produced by notebooks/operating_area_review.ipynb

For each unique matched region (MRGID):
  - fetch the Marine Regions polygon, declutter it (drop holes + tiny island
    parts, keep the outer water boundary, simplify) — gets every region under ~30KB.
  - if the region has no polygon (~11 small bays/straits), fall back to its bbox
    rectangle from the gazetteer lookup.

Output: data/operating_areas_apply.json   { vessel_id: {name, operating_area, geojson} }
        data/operating_areas_review.html   a Leaflet map to eyeball the result
        data/region_geometry_cache.json    fetched/decluttered geometry, so re-runs are fast

Run:  python scripts/build_operating_areas.py
"""

import json
import re
import time
from pathlib import Path

import pandas as pd
import requests
from shapely import wkt
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping

ROOT = Path(__file__).resolve().parent.parent
PKL = ROOT / "notebooks" / "gazetteer_results.pkl"
CACHE = ROOT / "data" / "region_geometry_cache.json"
OUT = ROOT / "data" / "operating_areas_apply.json"
REVIEW = ROOT / "data" / "operating_areas_review.html"

DECLUTTER_TOL = 0.2  # simplification tolerance in degrees
AREA_FRAC = 0.01     # drop disjoint parts smaller than 1% of the largest part


def polys_of(geom):
    """Flatten any geometry to a list of Polygons."""
    out = []
    for g in (geom.geoms if hasattr(geom, "geoms") else [geom]):
        if isinstance(g, Polygon):
            out.append(g)
        elif isinstance(g, (MultiPolygon, GeometryCollection)):
            out.extend(polys_of(g))
    return out


def declutter(geom):
    """Drop holes + tiny parts, keep outer boundaries, simplify. Returns GeoJSON geometry or None."""
    polys = polys_of(geom)
    if not polys:
        return None
    biggest = max(p.area for p in polys)
    kept = [Polygon(p.exterior) for p in polys if p.area >= biggest * AREA_FRAC]
    g = MultiPolygon(kept) if len(kept) > 1 else kept[0]
    g = g.simplify(DECLUTTER_TOL, preserve_topology=False)
    return mapping(g)


def fetch_region_geom(mrgid):
    """Fetch + declutter a region polygon. Returns GeoJSON geometry dict or None."""
    try:
        d = requests.get(
            f"https://marineregions.org/rest/getGazetteerGeometries.jsonld/{int(mrgid)}/",
            headers={"Accept": "application/json"}, timeout=60,
        ).json()
        geoms = d["mr:hasGeometry"]
        geoms = [geoms] if isinstance(geoms, dict) else geoms
        parts = []
        for x in geoms:
            w = x["gsp:asWKT"]
            w = w["@value"] if isinstance(w, dict) else w
            parts.append(wkt.loads(re.sub(r"^\s*<[^>]+>\s*", "", w)))
        from shapely.ops import unary_union
        return declutter(unary_union(parts))
    except Exception as e:
        print(f"  ! no polygon for MRGID {mrgid}: {e}")
        return None


def bbox_polygon(bbox):
    """bbox [min_lon, min_lat, max_lon, max_lat] -> GeoJSON Polygon geometry."""
    if not bbox or any(v is None for v in bbox):
        return None
    w, s, e, n = bbox
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


def main():
    df = pd.read_pickle(PKL)
    matched = df[df["mrgid"].notna()].copy()
    matched["mrgid"] = matched["mrgid"].astype(int)
    print(f"matched rows: {len(matched)} | vessels: {matched['vessel_id'].nunique()} | regions: {matched['mrgid'].nunique()}")

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    # 1. resolve geometry for every unique region (polygon, with bbox fallback)
    regions = matched.drop_duplicates("mrgid")
    bbox_fallback = 0
    for _, r in regions.iterrows():
        key = str(r["mrgid"])
        if key in cache:
            continue
        geom = fetch_region_geom(r["mrgid"])
        source = "gazetteer"
        if geom is None:
            geom = bbox_polygon(r["bbox"])
            source = "gazetteer-bbox"
            if geom:
                bbox_fallback += 1
        cache[key] = {"name": r["matched_name"], "geom": geom, "source": source} if geom else None
        time.sleep(0.1)
    CACHE.write_text(json.dumps(cache))
    resolved = sum(1 for v in cache.values() if v)
    print(f"regions resolved: {resolved} (bbox fallback: {bbox_fallback})")

    # 2. assemble one FeatureCollection per vessel
    out = {}
    for vid, g in matched.groupby("vessel_id"):
        feats, seen = [], set()
        for _, r in g.iterrows():
            key = str(int(r["mrgid"]))
            if key in seen:
                continue
            seen.add(key)
            c = cache.get(key)
            if not c:
                continue
            feats.append({
                "type": "Feature",
                "geometry": c["geom"],
                "properties": {"name": c["name"], "mrgid": int(r["mrgid"]), "source": c["source"]},
            })
        if not feats:
            continue
        out[int(vid)] = {
            "name": g.iloc[0]["vessel"],
            "operating_area": g.iloc[0]["operating_area"],
            "geojson": {"type": "FeatureCollection", "features": feats},
        }
    OUT.write_text(json.dumps(out))
    print(f"wrote {len(out)} vessels -> {OUT.relative_to(ROOT)}")

    write_review(out)


def write_review(out):
    """A standalone Leaflet page to eyeball all the polygons + which vessel owns them."""
    fcs = []
    for vid, v in out.items():
        fc = dict(v["geojson"])
        for f in fc["features"]:
            f["properties"] = {**f["properties"], "vessel": v["name"], "vid": vid,
                               "operating_area": v["operating_area"]}
        fcs.append(fc)
    html = """<!doctype html><html><head><meta charset="utf-8">
<title>Operating areas review</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map').setView([20,0],2);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
const data = __DATA__;
data.forEach(fc => L.geoJSON(fc,{
  style:{color:'#2A7B6F',weight:1,fillOpacity:0.08},
  onEachFeature:(f,l)=>l.bindPopup(
    '<b>'+f.properties.vessel+'</b> (#'+f.properties.vid+')<br>'+
    'region: '+f.properties.name+' ['+f.properties.source+']<br>'+
    '<i>'+(f.properties.operating_area||'')+'</i>')
}).addTo(map));
</script></body></html>"""
    REVIEW.write_text(html.replace("__DATA__", json.dumps(fcs)))
    print(f"wrote review map -> {REVIEW.relative_to(ROOT)} (open in a browser)")


if __name__ == "__main__":
    main()
