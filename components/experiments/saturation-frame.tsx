'use client';

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

type SaturationContextValue = {
  color: boolean;
  setColor: Dispatch<SetStateAction<boolean>>;
};

const SaturationContext = createContext<SaturationContextValue | null>(null);

// Lives in the root layout so the RGB / B&W preference survives route changes
// (navigating between experiments) instead of resetting every time a page —
// and with it the SaturationFrame — remounts.
export function SaturationProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(true);
  return (
    <SaturationContext.Provider value={{ color, setColor }}>
      {children}
    </SaturationContext.Provider>
  );
}

function useSaturation(): SaturationContextValue {
  const ctx = useContext(SaturationContext);
  if (!ctx) {
    throw new Error('useSaturation must be used within <SaturationProvider>');
  }
  return ctx;
}

// Wraps the scene area in a CSS `saturate()` filter so every experiment renders
// black & white by default — works uniformly across the WebGL and WebGPU
// renderers without touching each scene's own post stack. A button toggles back
// to full colour, with a smooth transition between the two. The mode is read
// from the provider above so it persists across navigation.
export function SaturationFrame({ children }: { children: ReactNode }) {
  const { color, setColor } = useSaturation();

  return (
    <div className="relative h-full w-full">
      <div
        className="h-full w-full transition-[filter] duration-700 ease-out"
        style={{ filter: color ? 'saturate(1)' : 'saturate(0)' }}
      >
        {children}
      </div>

      {/* Solo texto, con la tipografía del header (text-xs md:text-base,
          uppercase, nb) y mismos márgenes de borde. */}
      <button
        onClick={() => setColor((c) => !c)}
        aria-pressed={color}
        title={color ? 'Back to black & white' : 'Show color'}
        className="absolute bottom-5 md:bottom-10 right-5 md:right-10 z-10 cursor-pointer uppercase nb text-xs md:text-base text-neutral-100 hover:opacity-50 duration-200"
      >
        {color ? 'RGB' : 'B/W'}
      </button>
    </div>
  );
}
