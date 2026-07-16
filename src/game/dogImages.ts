// Vite's import.meta.glob scans this pattern at build time, so any cutout
// dropped into src/assets/dogs/cutouts/ (including per-dog subfolders, e.g.
// cutouts/Penny/dog1.png) is picked up automatically on the next dev-server
// reload or build — no manual import list to maintain. (Run
// scripts/generate_dog_cutouts.py after adding new source photos to
// src/assets/dogs/ to produce the matching transparent-background cutouts.)
const modules = import.meta.glob('../assets/dogs/cutouts/**/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export const DOG_IMAGE_URLS: string[] = Object.values(modules);

export function pickRandomDogImage(): string | null {
  if (DOG_IMAGE_URLS.length === 0) return null;
  return DOG_IMAGE_URLS[Math.floor(Math.random() * DOG_IMAGE_URLS.length)];
}
