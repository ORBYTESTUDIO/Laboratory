'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, type ReactNode } from 'react';
import { CameraDive } from './experiments/camera-dive';

type Props = {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  controls?: boolean;
  background?: string;
  dpr?: number | [number, number];
  enableZoom?: boolean;
  enablePan?: boolean;
  // Dive transition: while `diving` is true, fly the camera toward `divePoint`.
  diving?: boolean;
  divePoint?: [number, number, number] | null;
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
  diving = false,
  divePoint = null,
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
      <CameraDive active={diving} point={divePoint} />
    </Canvas>
  );
}
