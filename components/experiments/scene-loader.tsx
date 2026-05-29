'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { CanvasFrame } from '@/components/canvas-frame';
import { getExperiment } from './registry';

const scenes: Record<string, ComponentType> = {
  galaxy: dynamic(() => import('./galaxy/scene'), {
    ssr: false,
  }),
  'black-hole-singularity': dynamic(() => import('./black-hole-singularity/scene'), {
    ssr: false,
  }),
};

export function SceneViewer({ slug }: { slug: string }) {
  const Scene = scenes[slug];
  const meta = getExperiment(slug);
  if (!Scene) return null;

  // Experiments that need a non-default renderer (e.g. WebGPU for TSL) own
  // their Canvas. Skip the CanvasFrame wrap so they can mount their own.
  if (meta?.customCanvas) {
    return <Scene />;
  }

  return (
    <CanvasFrame
      cameraPosition={meta?.cameraPosition}
      fov={meta?.fov}
      background={meta?.background}
      dpr={meta?.dpr}
      enableZoom={meta?.enableZoom}
      enablePan={meta?.enablePan}
    >
      <Scene />
    </CanvasFrame>
  );
}
