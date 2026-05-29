'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  controls?: boolean;
  background?: string;
  dpr?: number | [number, number];
  enableZoom?: boolean;
  enablePan?: boolean;
};

export function CanvasFrame({
  children,
  cameraPosition = [3, 3, 3],
  fov = 50,
  controls = true,
  background = '#0a0a0a',
  dpr = [1, 2],
  enableZoom = true,
  enablePan = true,
}: Props) {
  return (
    <Canvas
      camera={{ position: cameraPosition, fov }}
      style={{ background }}
      dpr={dpr}
    >
      <Suspense fallback={null}>{children}</Suspense>
      {controls && (
        <OrbitControls makeDefault enableZoom={enableZoom} enablePan={enablePan} />
      )}
    </Canvas>
  );
}
