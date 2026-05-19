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
};

export function CanvasFrame({
  children,
  cameraPosition = [3, 3, 3],
  fov = 50,
  controls = true,
  background = '#0a0a0a',
}: Props) {
  return (
    <Canvas
      camera={{ position: cameraPosition, fov }}
      style={{ background }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>{children}</Suspense>
      {controls && <OrbitControls makeDefault />}
    </Canvas>
  );
}
