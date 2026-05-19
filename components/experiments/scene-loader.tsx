'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { CanvasFrame } from '@/components/canvas-frame';

const scenes: Record<string, ComponentType> = {
  'rotating-cube': dynamic(() => import('./rotating-cube/scene'), {
    ssr: false,
  }),
};

export function SceneViewer({ slug }: { slug: string }) {
  const Scene = scenes[slug];
  if (!Scene) return null;
  return (
    <CanvasFrame>
      <Scene />
    </CanvasFrame>
  );
}
