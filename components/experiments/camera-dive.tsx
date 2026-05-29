'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Plays the START of a flight toward a hotspot, inside the origin scene's
// Canvas. We only ever see the beginning — the transition's fade-to-black hides
// the rest — so this just needs to launch convincingly (ease-in / accelerate).
//
// Must live INSIDE <Canvas>. Driven by props (not context) because R3F's
// reconciler doesn't bridge React context across the Canvas boundary.
export function CameraDive({
  active,
  point,
}: {
  active: boolean;
  point: [number, number, number] | null;
}) {
  const startPos = useRef<THREE.Vector3 | null>(null);
  const progress = useRef(0);
  const dest = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  // OrbitControls registers itself as the default controls (makeDefault).
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  useEffect(() => {
    if (active) {
      progress.current = 0;
      startPos.current = null; // captured on the first frame of the dive
      if (controls) controls.enabled = false;
    } else if (controls) {
      controls.enabled = true;
    }
  }, [active, controls]);

  useFrame((state, delta) => {
    if (!active || !point) return;
    const cam = state.camera;
    if (!startPos.current) startPos.current = cam.position.clone();

    // Accelerating progress → "launch" feel. Capped at 1.
    progress.current = Math.min(1, progress.current + delta * 1.1);
    const eased = progress.current * progress.current; // quadratic ease-in

    dest.current.set(point[0], point[1], point[2]);
    // Dolly partway toward the hotspot (we fade out long before arriving).
    cam.position.lerpVectors(startPos.current, dest.current, eased * 0.85);

    // Ease the look target from the galaxy center (the orbit pivot) toward the
    // hotspot so the orientation doesn't snap on the first frame.
    lookAt.current.set(0, 0, 0).lerp(dest.current, eased);
    cam.lookAt(lookAt.current);
  });

  return null;
}
