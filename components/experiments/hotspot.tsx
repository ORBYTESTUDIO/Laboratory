'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Hotspot as HotspotData } from './registry';

// A clickable marker placed in 3D space inside a scene. The visual language is
// shared across every depth (galaxy, planet, …) so once the user learns that a
// glowing, pulsing point is clickable, it transfers everywhere:
//   - a bright core that gently breathes
//   - an expanding ring pulse that draws the eye
//   - on hover: the marker grows, the cursor becomes a pointer, a label appears
// Routing is intentionally NOT done here — the parent passes `onActivate`.
export function Hotspot({
  data,
  onActivate,
}: {
  data: HotspotData;
  onActivate: (target: string, point: [number, number, number]) => void;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = data.color ?? '#9fd0ff';

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Ring expands from the core and fades out, then repeats (period ~2s).
    const pulse = (t % 2) / 2; // 0 → 1
    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.6 + pulse * 1.6);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - pulse) * (hovered ? 0.9 : 0.5);
    }

    // Core breathes, and grows a bit while hovered.
    if (coreRef.current) {
      const breathe = 1 + Math.sin(t * 3) * 0.08;
      coreRef.current.scale.setScalar((hovered ? 1.6 : 1) * breathe);
    }
  });

  return (
    <group position={data.position}>
      <Billboard>
        {/* Expanding pulse ring (decorative — not raycast). */}
        <mesh ref={ringRef} raycast={() => null}>
          <ringGeometry args={[0.16, 0.2, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Glowing core (decorative — not raycast). */}
        <mesh ref={coreRef} raycast={() => null}>
          <circleGeometry args={[0.11, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Invisible, comfortably-sized hit target carries the interactions. */}
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            document.body.style.cursor = 'auto';
          }}
          onClick={(e) => {
            e.stopPropagation();
            onActivate(data.target, data.position);
          }}
        >
          <circleGeometry args={[0.28, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Billboard>

      {hovered && (
        <Html center position={[0, 0.42, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              fontSize: 12,
              fontFamily: 'var(--font-geist-mono, monospace)',
              whiteSpace: 'nowrap',
              color: '#f5f5f5',
              background: 'rgba(10,10,16,0.72)',
              border: `1px solid ${color}`,
              boxShadow: `0 0 12px ${color}66`,
              backdropFilter: 'blur(2px)',
            }}
          >
            {data.label}
          </div>
        </Html>
      )}
    </group>
  );
}
