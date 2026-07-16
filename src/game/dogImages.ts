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

const CUTOUTS_PREFIX = '../assets/dogs/cutouts/';

export interface DogPack {
  name: string;
  images: string[];
}

// Cutouts directly in cutouts/ (e.g. dog1.png) are the baseline set, always
// included in every game. Anything one level deeper (cutouts/<Name>/dogN.png)
// is an optional "pack" named after its folder, toggleable in the dog pack
// menu — the pack list is derived from whatever folders actually exist, so
// adding or removing a cutouts/ subfolder needs no code change.
const rootImages: string[] = [];
const packsByName = new Map<string, string[]>();

for (const [path, url] of Object.entries(modules)) {
  const rest = path.slice(CUTOUTS_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash === -1) {
    rootImages.push(url);
  } else {
    const packName = rest.slice(0, slash);
    const list = packsByName.get(packName);
    if (list) list.push(url);
    else packsByName.set(packName, [url]);
  }
}

export const ROOT_DOG_IMAGES: string[] = rootImages;

export const DOG_PACKS: DogPack[] = Array.from(packsByName.entries())
  .map(([name, images]) => ({ name, images }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The root set plus every pack not present in `disabledPacks`. */
export function getActiveDogImages(disabledPacks: ReadonlySet<string>): string[] {
  const images = [...rootImages];
  for (const pack of DOG_PACKS) {
    if (!disabledPacks.has(pack.name)) images.push(...pack.images);
  }
  return images;
}

export function pickRandomDogImage(pool: string[]): string | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
