'use client';

import { useEffect, useState } from 'react';
import { getNodePath } from './registry';
import { useDive } from './transition';

// Top bar: a "back" action plus a breadcrumb trail, so the user always knows
// where they are and how to get out. Navigation goes through the dive fade
// (no camera flight — there's no hotspot involved) for a consistent feel.
export function NavBar({ slug }: { slug: string }) {
  const dive = useDive();
  const trail = getNodePath(slug); // root → … → current
  const parent = trail.length > 1 ? trail[trail.length - 2] : null;

  return (
    <div className="flex items-center gap-4">
      {parent ? (
        <button
          onClick={() => dive.start(parent.slug)}
          className="text-sm text-neutral-400 hover:text-neutral-100 transition"
        >
          ← Volver
        </button>
      ) : (
        <span className="w-16" />
      )}

      <nav className="flex items-center gap-2 text-sm text-neutral-400">
        {trail.map((n, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={n.slug} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-600">›</span>}
              {isLast ? (
                <span className="text-neutral-100">{n.title}</span>
              ) : (
                <button
                  onClick={() => dive.start(n.slug)}
                  className="hover:text-neutral-100 transition"
                >
                  {n.title}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

// Discoverability: a hint telling the user the glowing points are clickable.
// Subtle by default; more prominent the very first visit (once per browser).
export function HotspotHint({ hasHotspots }: { hasHotspots: boolean }) {
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    if (!hasHotspots) return;
    try {
      if (!localStorage.getItem('lab-onboarded')) {
        setFirstVisit(true);
        localStorage.setItem('lab-onboarded', '1');
      }
    } catch {
      // localStorage unavailable (private mode etc.) — just stay subtle.
    }
  }, [hasHotspots]);

  if (!hasHotspots) return null;

  return (
    <div
      style={{ pointerEvents: 'none' }}
      className="absolute inset-x-0 bottom-6 flex justify-center px-4"
    >
      <div
        className={
          'rounded-full border px-4 py-2 font-mono text-xs backdrop-blur-sm transition ' +
          (firstVisit
            ? 'border-amber-300/60 bg-black/60 text-amber-100 animate-pulse'
            : 'border-neutral-700/60 bg-black/40 text-neutral-300')
        }
      >
        Hacé click en los nodos luminosos para explorar
      </div>
    </div>
  );
}
