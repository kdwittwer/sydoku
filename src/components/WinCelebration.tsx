import { useEffect, useRef } from 'react';

const SPRITE_COUNT = 22;
const GRAVITY = 0.6; // px per frame^2, at a normalized 60fps step
const RESTITUTION = 0.62; // fraction of vertical speed kept after a bounce
const MAX_BOUNCES = 7; // before a sprite is retired and relaunched fresh

interface Sprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVelocity: number;
  size: number;
  bounces: number;
}

function launch(sprite: Sprite | undefined, index: number): Sprite {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Staggered launch points across the width, from just above the puzzle's
  // usual position, like cards bursting out of a Solitaire tableau.
  const spread = SPRITE_COUNT > 1 ? index / (SPRITE_COUNT - 1) : 0.5;
  const size = 46 + Math.random() * 38;
  return {
    x: vw * (0.15 + spread * 0.7) + (Math.random() - 0.5) * 40,
    y: vh * 0.4 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 15,
    vy: -9 - Math.random() * 9,
    rotation: sprite?.rotation ?? Math.random() * 360,
    angularVelocity: (Math.random() - 0.5) * 10,
    size,
    bounces: 0,
  };
}

/**
 * Windows-Solitaire-style win celebration: a fixed-size pool of <img>
 * elements animated by directly mutating their transform in a
 * requestAnimationFrame loop, not through React state — at ~20 sprites and
 * 60fps, re-rendering React for every frame would be wasteful and jittery.
 * React's only job here is to mount the pool once; the loop owns the rest.
 */
export default function WinCelebration({ active, images }: { active: boolean; images: string[] }) {
  const spriteElsRef = useRef<(HTMLImageElement | null)[]>([]);
  const spritesRef = useRef<Sprite[]>([]);

  useEffect(() => {
    if (!active || images.length === 0) return;

    spritesRef.current = Array.from({ length: SPRITE_COUNT }, (_, i) => launch(undefined, i));

    const timers: number[] = [];
    spriteElsRef.current.forEach((el, i) => {
      if (!el) return;
      el.src = images[Math.floor(Math.random() * images.length)];
      // Stagger the initial appearance so they don't all pop in at once.
      el.style.opacity = '0';
      timers.push(
        window.setTimeout(() => {
          if (el) el.style.opacity = '1';
        }, i * 90)
      );
    });

    let lastTime = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / (1000 / 60), 3);
      lastTime = now;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      spritesRef.current.forEach((s, i) => {
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rotation += s.angularVelocity * dt;

        if (s.y + s.size > vh && s.vy > 0) {
          s.y = vh - s.size;
          s.vy = -s.vy * RESTITUTION;
          s.vx *= 0.92;
          s.bounces++;
        }

        const offScreenSideways = s.x < -s.size || s.x > vw + s.size;
        const settled = s.bounces > MAX_BOUNCES && Math.abs(s.vy) < 4;
        if (offScreenSideways || settled) {
          spritesRef.current[i] = launch(s, i);
          const el = spriteElsRef.current[i];
          if (el) el.src = images[Math.floor(Math.random() * images.length)];
        }

        const el = spriteElsRef.current[i];
        if (el) {
          el.style.width = `${s.size}px`;
          el.style.height = `${s.size}px`;
          el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.rotation}deg)`;
        }
      });

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [active, images]);

  if (!active || images.length === 0) return null;

  return (
    <div className="win-celebration" aria-hidden="true">
      {Array.from({ length: SPRITE_COUNT }, (_, i) => (
        <img
          key={i}
          ref={(el) => {
            spriteElsRef.current[i] = el;
          }}
          className="win-celebration__sprite"
          alt=""
        />
      ))}
    </div>
  );
}
