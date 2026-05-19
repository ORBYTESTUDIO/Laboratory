'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { CanvasFrame } from '@/components/canvas-frame';
import { getExperiment } from './registry';

const scenes: Record<string, ComponentType> = {
  'rotating-cube': dynamic(() => import('./rotating-cube/scene'), {
    ssr: false,
  }),
  galaxy: dynamic(() => import('./galaxy/scene'), {
    ssr: false,
  }),
  'black-hole': dynamic(() => import('./black-hole/scene'), {
    ssr: false,
  }),
};

export function SceneViewer({ slug }: { slug: string }) {
  const Scene = scenes[slug];
  const meta = getExperiment(slug);
  if (!Scene) return null;
  return (
    <CanvasFrame
      cameraPosition={meta?.cameraPosition}
      fov={meta?.fov}
      background={meta?.background}
    >
      <Scene />
    </CanvasFrame>
  );
}
