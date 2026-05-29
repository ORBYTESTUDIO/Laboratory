'use client';

import { Hotspot } from './hotspot';
import type { Hotspot as HotspotData } from './registry';

// Renders a node's clickable points inside its Canvas. Lives next to the scene
// (see scene-loader) so any node with `hotspots` gets them without each scene
// having to know about navigation.
export function HotspotsLayer({
  hotspots,
  onActivate,
}: {
  hotspots: HotspotData[];
  onActivate: (target: string, point: [number, number, number]) => void;
}) {
  return (
    <>
      {hotspots.map((h) => (
        <Hotspot key={h.id} data={h} onActivate={onActivate} />
      ))}
    </>
  );
}
