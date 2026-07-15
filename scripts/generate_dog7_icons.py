"""One-off: regenerate app icons from the dog7 cutout instead of the paw print."""

from PIL import Image

TRANSPARENT = (0, 0, 0, 0)
SRC = "src/assets/dogs/cutouts/dog7.png"
OUT_DIR = "public/icons"

REGULAR_SIZES = [16, 32, 180, 192, 512]
MASKABLE_SIZE = 512


def build_square(src: Image.Image, canvas_size: int, content_fraction: float) -> Image.Image:
    bbox = src.getbbox()
    trimmed = src.crop(bbox) if bbox else src
    content_size = int(canvas_size * content_fraction)
    w, h = trimmed.size
    scale = content_size / max(w, h)
    resized = trimmed.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), TRANSPARENT)
    rw, rh = resized.size
    offset = ((canvas_size - rw) // 2, (canvas_size - rh) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def main():
    src = Image.open(SRC).convert("RGBA")

    # Regular icons: dog fills most of the square.
    base = build_square(src, 1024, content_fraction=0.92)
    for size in REGULAR_SIZES:
        resized = base.resize((size, size), Image.LANCZOS)
        resized.save(f"{OUT_DIR}/icon-{size}.png")

    apple = base.resize((180, 180), Image.LANCZOS)
    apple.save(f"{OUT_DIR}/apple-touch-icon.png")

    # Maskable: extra margin so the OS's circular/rounded crop doesn't clip the dog.
    maskable = build_square(src, MASKABLE_SIZE, content_fraction=0.7)
    maskable.save(f"{OUT_DIR}/icon-512-maskable.png")

    print("done")


if __name__ == "__main__":
    main()
