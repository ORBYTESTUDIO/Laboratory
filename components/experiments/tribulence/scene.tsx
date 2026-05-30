'use client';

import { FullscreenShader, ShaderCanvas } from '../_shared/fullscreen-shader';
import { fragmentShader } from './shader';

// Tribulence — campo de turbulencia puramente matemático (sin texturas), así que
// toleramos dpr alto sin penalización de fill-rate.
export default function Scene() {
  return (
    <ShaderCanvas dpr={[1, 2]}>
      <FullscreenShader fragmentShader={fragmentShader} />
    </ShaderCanvas>
  );
}
