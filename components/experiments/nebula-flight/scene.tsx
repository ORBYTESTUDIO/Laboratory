'use client';

import { FullscreenShader, ShaderCanvas } from '../_shared/fullscreen-shader';
import { fragmentShader } from './shader';

// Nebula Flight — túnel de estrellas + ray-marching de nubes (100 iteraciones),
// pesado en fill-rate: capamos dpr a 1.5. Arrastrar el mouse orienta la vista
// (iMouse); al soltar, vuelve al cabeceo automático.
export default function Scene() {
  return (
    <ShaderCanvas dpr={[1, 1.5]}>
      <FullscreenShader fragmentShader={fragmentShader} />
    </ShaderCanvas>
  );
}
