#!/usr/bin/env python3
"""Generate transparent-background head cutouts for every photo in
src/assets/dogs/, writing results to src/assets/dogs/cutouts/.

Two source layouts are supported and can coexist:
  - Flat: src/assets/dogs/dogN.png -> src/assets/dogs/cutouts/dogN.png
  - Per-dog subfolders: src/assets/dogs/<Name>/*.png ->
    src/assets/dogs/cutouts/<Name>/dogN.png, numbered 1..N in filename order
    within that subfolder — independently of every other folder's numbering,
    so each dog's cutouts always start at dog1.png.

Re-run this whenever new photos are added — it only reprocesses a
destination whose source is newer, so it's safe to run repeatedly. Note
that within a subfolder, indices are assigned by sort order, so inserting
a new photo ahead of existing ones (rather than appending it) will shift
and reprocess everything after it.

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
PADDING_FRACTION = 0.02  # padding around the tight crop, as a fraction of the crop size
# Kept small: the app displays these with object-fit: cover, filling the
# cell edge to edge, so any padding baked into the source image just shows
# up as dead space around the dog's head instead of getting cropped away.


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


def process_group(sources: list[Path], dest_dir: Path, session) -> tuple[int, int]:
    """Cuts out each source in order into dest_dir/dog1.png, dog2.png, ....
    Returns (processed_count, total_count)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    processed = 0
    for i, src in enumerate(sources, start=1):
        dest = dest_dir / f"dog{i}.png"
        if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
            print(f"skip (up to date): {src.relative_to(DOGS_DIR)}")
            continue

        print(f"processing: {src.relative_to(DOGS_DIR)} -> {dest.relative_to(DOGS_DIR)}")
        with Image.open(src) as im:
            im = im.convert("RGBA")
            cutout = remove(im, session=session)
        cutout = tight_crop(cutout)
        cutout = downscale(cutout)
        cutout.save(dest)
        processed += 1
    return processed, len(sources)


def main() -> None:
    if not DOGS_DIR.exists():
        print(f"No such directory: {DOGS_DIR}", file=sys.stderr)
        sys.exit(1)

    CUTOUTS_DIR.mkdir(exist_ok=True)
    session = new_session("u2net")

    total_processed = 0
    total_sources = 0

    # Flat dogN.png files directly in DOGS_DIR (the original layout).
    flat_sources = sorted(
        DOGS_DIR.glob("dog*.png"),
        key=lambda p: int("".join(ch for ch in p.stem if ch.isdigit()) or 0),
    )
    if flat_sources:
        processed, total = process_group(flat_sources, CUTOUTS_DIR, session)
        total_processed += processed
        total_sources += total

    # Per-dog subfolders: every immediate subdirectory of DOGS_DIR other than
    # cutouts/ itself is one dog's photo set, numbered 1..N by filename
    # within that folder alone.
    for subdir in sorted(p for p in DOGS_DIR.iterdir() if p.is_dir() and p.name != "cutouts"):
        sources = sorted(subdir.glob("*.png"))
        if not sources:
            continue
        dest_dir = CUTOUTS_DIR / subdir.name
        processed, total = process_group(sources, dest_dir, session)
        total_processed += processed
        total_sources += total

    if total_sources == 0:
        print(f"No dog photos found in {DOGS_DIR}")
        return

    print(f"\nDone. {total_processed} cutout(s) generated, {total_sources - total_processed} already up to date.")


if __name__ == "__main__":
    main()
