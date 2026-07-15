#!/usr/bin/env python3
"""
One-shot: generate ~400px wide thumbnails for every photo in the
`vessel-photos` Supabase Storage bucket and upload them under a
`thumbs/` prefix in the same bucket.

After running, point getPhotoUrl() at the thumbs prefix so cards and
maps download the smaller versions instead of the originals.

Usage:
    pip install --user pillow requests
    python3 scripts/generate_thumbnails.py

Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
Idempotent: thumbs that already exist are skipped.
"""

import os
import sys
import io
import time
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "vessel-photos"
THUMB_PREFIX = "thumbs"
TARGET_WIDTH = 400
JPEG_QUALITY = 75


def load_env() -> dict:
    """Read .env.local when present (local runs); real environment variables
    take precedence so CI (GitHub Actions secrets) works without the file."""
    env = {}
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return {k: v for k, v in os.environ.items()}
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k] = v
    env.update({k: v for k, v in os.environ.items() if k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")})
    return env


def list_bucket(url: str, key: str, bucket: str, prefix: str = "") -> list[dict]:
    """List all files under `prefix` in the bucket (paginated)."""
    out = []
    offset = 0
    limit = 1000
    while True:
        r = requests.post(
            f"{url}/storage/v1/object/list/{bucket}",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"prefix": prefix, "limit": limit, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return out


def walk_bucket(url: str, key: str, bucket: str, prefix: str = "") -> list[dict]:
    """Recursively list every file in the bucket (Supabase list is per-folder).
    Skips the thumbs/ tree — those are outputs, not sources."""
    out = []
    for entry in list_bucket(url, key, bucket, prefix):
        name = f"{prefix}/{entry['name']}" if prefix else entry["name"]
        if entry.get("id") is None:  # folder placeholder
            if name == THUMB_PREFIX:
                continue
            out.extend(walk_bucket(url, key, bucket, name))
        else:
            out.append({**entry, "name": name})
    return out


def thumb_exists(url: str, key: str, bucket: str, name: str) -> bool:
    """HEAD-style check via the list API (cheap, no body)."""
    r = requests.post(
        f"{url}/storage/v1/object/list/{bucket}",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"prefix": THUMB_PREFIX, "limit": 1, "offset": 0, "search": name},
        timeout=30,
    )
    r.raise_for_status()
    return any(item.get("name") == name for item in r.json())


def download(url: str, key: str, bucket: str, name: str) -> bytes:
    """Download the original via the public URL."""
    public_url = f"{url}/storage/v1/object/public/{bucket}/{quote(name)}"
    r = requests.get(public_url, timeout=60)
    r.raise_for_status()
    return r.content


def resize(data: bytes) -> bytes:
    """Resize to TARGET_WIDTH preserving aspect, re-encode as JPEG."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # respect rotation metadata
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")
    w, h = img.size
    if w > TARGET_WIDTH:
        new_h = round(h * (TARGET_WIDTH / w))
        img = img.resize((TARGET_WIDTH, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return buf.getvalue()


def upload(url: str, key: str, bucket: str, path: str, data: bytes) -> None:
    r = requests.post(
        f"{url}/storage/v1/object/{bucket}/{quote(path)}",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
        data=data,
        timeout=60,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"upload failed {r.status_code}: {r.text}")


def main() -> int:
    env = load_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    print(f"Listing {BUCKET}/ (recursive) …")
    all_files = walk_bucket(url, key, BUCKET, prefix="")
    images = [f for f in all_files if f["name"].lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))]
    print(f"  {len(images)} image files (out of {len(all_files)} total entries)")

    # walk under thumbs/ too and compare source-relative names
    existing_thumbs = {
        f["name"][len(THUMB_PREFIX) + 1:]
        for f in walk_bucket(url, key, BUCKET, prefix=THUMB_PREFIX)
    }
    print(f"  {len(existing_thumbs)} thumbs already exist")

    done = 0
    skipped = 0
    failed: list[tuple[str, str]] = []
    bytes_in = 0
    bytes_out = 0
    t0 = time.time()

    for i, f in enumerate(images, 1):
        name = f["name"]
        if name in existing_thumbs:
            skipped += 1
            continue
        try:
            raw = download(url, key, BUCKET, name)
            thumb = resize(raw)
            upload(url, key, BUCKET, f"{THUMB_PREFIX}/{name}", thumb)
            bytes_in += len(raw)
            bytes_out += len(thumb)
            done += 1
            print(f"  [{i:>3}/{len(images)}] {name}  {len(raw)//1024}KB -> {len(thumb)//1024}KB")
        except Exception as e:
            failed.append((name, str(e)))
            print(f"  [{i:>3}/{len(images)}] {name}  FAILED: {e}")

    elapsed = time.time() - t0
    print()
    print(f"Done in {elapsed:.1f}s")
    print(f"  generated: {done}")
    print(f"  skipped:   {skipped} (already existed)")
    print(f"  failed:    {len(failed)}")
    if done:
        print(f"  total IN:  {bytes_in/1024/1024:.1f} MB")
        print(f"  total OUT: {bytes_out/1024/1024:.1f} MB ({100*bytes_out/bytes_in:.0f}%)")
    if failed:
        print()
        print("Failures:")
        for name, err in failed:
            print(f"  {name}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
