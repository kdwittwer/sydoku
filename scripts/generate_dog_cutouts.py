#!/usr/bin/env python3
"""Generate transparent-background head cutouts for every photo in
src/assets/dogs/, writing results to src/assets/dogs/cutouts/.

Re-run this whenever new photos are added to src/assets/dogs/ (named
dogN.png) — it only processes files that don't already have a cutout, so
it's safe to run repeatedly.

Setup (one-time):
    python3 -m venv .venv
    source .venv/bin/activate
    pip install pillow rembg onnxruntime

Usage:
    source .venv/bin/activate
    python3 scripts/generate_dog_cutouts.py
"""

import sys
from pathlib import Path

from PIL import Image
from rembg import remove, new_session

SCRIPT_DIR = Path(__file__).resolve().parent
DOGS_DIR = SCRIPT_DIR.parent / "src" / "assets" / "dogs"
CUTOUTS_DIR = DOGS_DIR / "cutouts"
MAX_DIMENSION = 500  # cap output size; these are just small in-cell markers
PADDING_FRACTION = 0.06  # padding around the tight crop, as a fraction of the crop size


def tight_crop(image: Image.Image) -> Image.Image:
    """Crop to the bounding box of non-transparent pixels, with a little padding."""
    bbox = image.getbbox()
    if bbox is None:
        return image
    left, top, right, bottom = bbox
    width, height = right - left, bottom - top
    pad_x = int(width * PADDING_FRACTION)
    pad_y = int(height * PADDING_FRACTION)
    left = max(0, left - pad_x)
    top = max(0, top - pad_y)
    right = min(image.width, right + pad_x)
    bottom = min(image.height, bottom + pad_y)
    return image.crop((left, top, right, bottom))


def downscale(image: Image.Image) -> Image.Image:
    if max(image.size) <= MAX_DIMENSION:
        return image
    scale = MAX_DIMENSION / max(image.size)
    new_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(new_size, Image.LANCZOS)


def main() -> None:
    if not DOGS_DIR.exists():
        print(f"No such directory: {DOGS_DIR}", file=sys.stderr)
        sys.exit(1)

    CUTOUTS_DIR.mkdir(exist_ok=True)
    session = new_session("u2net")

    sources = sorted(
        DOGS_DIR.glob("dog*.png"),
        key=lambda p: int("".join(ch for ch in p.stem if ch.isdigit()) or 0),
    )
    if not sources:
        print(f"No dogN.png files found in {DOGS_DIR}")
        return

    processed = 0
    for src in sources:
        dest = CUTOUTS_DIR / src.name
        if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
            print(f"skip (up to date): {src.name}")
            continue

        print(f"processing: {src.name}")
        with Image.open(src) as im:
            im = im.convert("RGBA")
            cutout = remove(im, session=session)
        cutout = tight_crop(cutout)
        cutout = downscale(cutout)
        cutout.save(dest)
        processed += 1
        print(f"  -> {dest.relative_to(SCRIPT_DIR.parent)} ({cutout.width}x{cutout.height})")

    print(f"\nDone. {processed} cutout(s) generated, {len(sources) - processed} already up to date.")


if __name__ == "__main__":
    main()
