'use client';

import { useState, type ReactNode } from 'react';

// Wraps the scene area in a CSS `saturate()` filter so every experiment renders
// black & white by default — works uniformly across the WebGL and WebGPU
// renderers without touching each scene's own post stack. A button toggles back
// to full colour, with a smooth transition between the two.
export function SaturationFrame({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(true);

  return (
    <div className="relative h-full w-full">
      <div
        className="h-full w-full transition-[filter] duration-700 ease-out"
        style={{ filter: color ? 'saturate(1)' : 'saturate(0)' }}
      >
        {children}
      </div>

      <button
        onClick={() => setColor((c) => !c)}
        aria-pressed={color}
        title={color ? 'Volver a blanco y negro' : 'Mostrar color'}
        className={
          'absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border px-4 py-2 ' +
          'font-sans text-xs backdrop-blur-sm transition ' +
          (color
            ? 'border-amber-300/60 bg-black/50 text-amber-100'
            : 'border-neutral-700/60 bg-black/40 text-neutral-300 hover:text-neutral-100')
        }
      >
        <span
          aria-hidden
          className={
            'inline-block h-3 w-3 rounded-full transition ' +
            (color
              ? 'bg-linear-to-br from-fuchsia-400 via-amber-300 to-cyan-400'
              : 'bg-neutral-400')
          }
        />
        {color ? 'Color' : 'B/N'}
      </button>
    </div>
  );
}
