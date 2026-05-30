'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { CanvasFrame } from '@/components/canvas-frame';
import { HotspotsLayer } from './hotspots-layer';
import { getExperiment } from './registry';
import { useDive } from './transition';

const scenes: Record<string, ComponentType> = {
  galaxy: dynamic(() => import('./galaxy/scene'), {
    ssr: false,
  }),
  'black-hole-singularity': dynamic(() => import('./black-hole-singularity/scene'), {
    ssr: false,
  }),
  'nebula-flight': dynamic(() => import('./nebula-flight/scene'), {
    ssr: false,
  }),
  'warp-tunnel': dynamic(() => import('./warp-tunnel/scene'), {
    ssr: false,
  }),
  tribulence: dynamic(() => import('./tribulence/scene'), {
    ssr: false,
  }),
  'domain-warping': dynamic(() => import('./domain-warping/scene'), {
    ssr: false,
  }),
};

export function SceneViewer({ slug }: { slug: string }) {
  const dive = useDive();
  const Scene = scenes[slug];
  const meta = getExperiment(slug);
  if (!Scene) return null;

  // Defined OUTSIDE the Canvas so it closes over a valid dive context (R3F's
  // reconciler doesn't propagate React context across the Canvas boundary).
  const activate = (target: string, point: [number, number, number]) =>
    dive.start(target, point);

  // Experiments that need a non-default renderer (e.g. WebGPU for TSL) own
  // their Canvas. Skip the CanvasFrame wrap so they can mount their own.
  if (meta?.customCanvas) {
    return <Scene />;
  }

  const hotspots = meta?.hotspots ?? [];

  return (
    <CanvasFrame
      cameraPosition={meta?.cameraPosition}
      fov={meta?.fov}
      background={meta?.background}
      dpr={meta?.dpr}
      enableZoom={meta?.enableZoom}
      enablePan={meta?.enablePan}
      diving={dive.diving}
      divePoint={dive.point}
    >
      <Scene />
      {hotspots.length > 0 && (
        <HotspotsLayer hotspots={hotspots} onActivate={activate} />
      )}
    </CanvasFrame>
  );
}
