"""
Fetch full vessel detail from https://oceans.quakefire.com/api/ship/[id]
for every vessel in data/vessels.json.

Saves:
  data/vessel_details/{id}.json   — full JSON (fileData stripped)
  public/images/vessels/{name}    — decoded image file

Run from the project root:
  python3 scripts/fetch_vessels.py
"""

import asyncio
import base64
import json
import os
import sys
from pathlib import Path

import aiohttp

TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL29jZWFucy5xdWFrZWZpcmUuY29tL2FwaS9hdXRoL2xvZ2luIiwiaWF0IjoxNzQwNDM2MjY5LCJleHAiOjE3NDA1MjI2NjksIm5iZiI6MTc0MDQzNjI2OSwianRpIjoiSjNNbWhqWTB4eGJYUnBNRTU2YjJRbGl3aWMzVmlqb2lPRFlpTENKd2NuWWlPaUpvTVRNd04yVmlOV1l5T1dNM01tRTVNR1JpWVdGbFpqQkllREZqWlVoRlpHZEhSMTlxZEhSbmNHOVJNVEpoWW5OMk1qbDNiMFZqUVhwa09YSlBTa1puY21Wc1pWVktVa1ZZU2xOeWFEaHZZemMzTUhCblBUMCIsInN1YiI6IjEyIiwidHlwIjoiYWNjZXNzIn0.nXZB62ZkfKpC_5USyt8-2icOe7ORJMrNbl4ArNM2i9o"
BASE_URL = "https://oceans.quakefire.com/api/ship"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Origin": "https://vessels.greenwaterfoundation.org",
}

ROOT = Path(__file__).parent.parent
VESSELS_JSON = ROOT / "data" / "vessels.json"
DETAILS_DIR = ROOT / "data" / "vessel_details"
IMAGES_DIR = ROOT / "public" / "images" / "vessels"

CONCURRENCY = 3   # simultaneous requests
RETRY_LIMIT = 5
RETRY_DELAY = 3.0


def load_ids() -> list[int]:
    with open(VESSELS_JSON) as f:
        vessels = json.load(f)
    return [v["id"] for v in vessels if v.get("id")]


def already_done(vessel_id: int) -> bool:
    return (DETAILS_DIR / f"{vessel_id}.json").exists()


def save_detail(vessel_id: int, data: dict) -> None:
    """Save JSON with fileData stripped (images saved separately)."""
    clean = dict(data)
    if "files" in clean:
        cleaned_files = []
        for f in clean["files"]:
            cf = {k: v for k, v in f.items() if k != "fileData"}
            cleaned_files.append(cf)
        clean["files"] = cleaned_files
    path = DETAILS_DIR / f"{vessel_id}.json"
    path.write_text(json.dumps(clean, ensure_ascii=False, indent=2))


def save_images(data: dict) -> list[str]:
    """Decode base64 fileData and save image files. Returns saved filenames."""
    saved = []
    for f in data.get("files", []):
        file_data = f.get("fileData")
        file_name = f.get("name", "")
        file_type = f.get("fileType", "")
        if not file_data or file_type != "image" or not file_name:
            continue
        # Sanitize filename (keep extension, replace problematic chars)
        safe_name = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in file_name
        )
        dest = IMAGES_DIR / safe_name
        if dest.exists():
            saved.append(safe_name)
            continue
        try:
            # fileData is base64 — decode to raw bytes
            img_bytes = base64.b64decode(file_data)
            dest.write_bytes(img_bytes)
            saved.append(safe_name)
        except Exception as e:
            print(f"  ⚠ Could not decode image {file_name}: {e}")
    return saved


async def fetch_vessel(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    vessel_id: int,
    progress: dict,
) -> None:
    if already_done(vessel_id):
        progress["skipped"] += 1
        return

    async with sem:
        for attempt in range(1, RETRY_LIMIT + 1):
            try:
                url = f"{BASE_URL}/{vessel_id}"
                async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 404:
                        progress["not_found"] += 1
                        return
                    if resp.status == 429:
                        wait = RETRY_DELAY * attempt
                        print(f"  Rate limited on {vessel_id}, waiting {wait}s…")
                        await asyncio.sleep(wait)
                        continue
                    if resp.status != 200:
                        print(f"  ✗ {vessel_id} → HTTP {resp.status}")
                        progress["errors"] += 1
                        return
                    data = await resp.json(content_type=None)
                    save_detail(vessel_id, data)
                    imgs = save_images(data)
                    progress["done"] += 1
                    if imgs:
                        progress["images"] += len(imgs)
                    return
            except asyncio.TimeoutError:
                print(f"  Timeout {vessel_id} (attempt {attempt})")
            except Exception as e:
                print(f"  Error {vessel_id} (attempt {attempt}): {e}")
            if attempt < RETRY_LIMIT:
                await asyncio.sleep(RETRY_DELAY)
        progress["errors"] += 1


async def main() -> None:
    DETAILS_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    ids = load_ids()
    total = len(ids)
    print(f"Loaded {total} vessel IDs from vessels.json")
    print(f"Output: {DETAILS_DIR}")
    print(f"Images: {IMAGES_DIR}")
    print(f"Concurrency: {CONCURRENCY}\n")

    progress = {"done": 0, "skipped": 0, "errors": 0, "not_found": 0, "images": 0}
    sem = asyncio.Semaphore(CONCURRENCY)

    async with aiohttp.ClientSession() as session:
        tasks = [fetch_vessel(session, sem, vid, progress) for vid in ids]

        # Process with live progress reporting
        completed = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            completed += 1
            if completed % 20 == 0 or completed == total:
                pct = completed / total * 100
                print(
                    f"  [{completed:>3}/{total}] {pct:.0f}%  "
                    f"✓ {progress['done']}  "
                    f"⏭ {progress['skipped']} skipped  "
                    f"🖼 {progress['images']} images  "
                    f"✗ {progress['errors']} errors",
                    flush=True,
                )

    print(f"\nDone!")
    print(f"  Fetched:   {progress['done']}")
    print(f"  Skipped:   {progress['skipped']} (already cached)")
    print(f"  Not found: {progress['not_found']}")
    print(f"  Images:    {progress['images']}")
    print(f"  Errors:    {progress['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
