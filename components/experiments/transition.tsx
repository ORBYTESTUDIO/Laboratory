'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getNodeHref } from './registry';

// Duration of each half of the transition (fade-out and fade-in), in ms.
const FADE_MS = 650;

type DiveContext = {
  // Begin a transition toward `target` (a node slug). Pass `point` (the
  // hotspot's 3D position) to play the in-scene camera flight; omit it for a
  // plain fade (e.g. the back button / breadcrumb, which have no hotspot).
  start: (target: string, point?: [number, number, number]) => void;
  // True only during the fade-OUT while still in the origin scene AND a flight
  // point was given — this is when the camera flight plays.
  diving: boolean;
  point: [number, number, number] | null;
};

const Ctx = createContext<DiveContext | null>(null);

export function useDive(): DiveContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDive must be used within <TransitionProvider>');
  return ctx;
}

// Lives in the root layout so it survives route changes: that's what lets us
// fade to black, navigate, then fade the new scene in under the same overlay.
export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [opacity, setOpacity] = useState(0);
  const [point, setPoint] = useState<[number, number, number] | null>(null);
  const pendingHref = useRef<string | null>(null);

  const start = useCallback((target: string, p?: [number, number, number]) => {
    pendingHref.current = getNodeHref(target);
    setPoint(p ?? null);
    setPhase('out');
  }, []);

  // Fade-out: ramp the overlay to black, then navigate.
  useEffect(() => {
    if (phase !== 'out') return;
    setOpacity(1);
    const id = setTimeout(() => {
      if (pendingHref.current) router.push(pendingHref.current);
      setPhase('in');
    }, FADE_MS);
    return () => clearTimeout(id);
  }, [phase, router]);

  // Fade-in: once the new route has mounted under the black overlay, reveal it.
  useEffect(() => {
    if (phase !== 'in') return;
    // Small delay so the freshly-mounted scene has a frame to paint.
    const reveal = setTimeout(() => setOpacity(0), 100);
    const done = setTimeout(() => {
      setPhase('idle');
      setPoint(null);
    }, 100 + FADE_MS);
    return () => {
      clearTimeout(reveal);
      clearTimeout(done);
    };
    // Intentionally keyed on pathname: this fires when navigation completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Ctx.Provider value={{ start, diving: phase === 'out' && point !== null, point }}>
      {children}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          opacity,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
          pointerEvents: phase === 'idle' ? 'none' : 'auto',
          zIndex: 50,
        }}
      />
    </Ctx.Provider>
  );
}
