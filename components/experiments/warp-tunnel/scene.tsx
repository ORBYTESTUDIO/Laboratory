'use client';

import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FullscreenShader, ShaderCanvas } from '../_shared/fullscreen-shader';
import { makeFFTTexture, makeNoiseTexture } from '../_shared/shadertoy';
import { fragmentShader } from './shader';

// Mapea los 4 canales Shadertoy del warp-tunnel:
//   iChannel0 → ruido RGBA generado por código (el shader hace FBM sobre él)
//   iChannel1 → nebulosa de fondo (textura del lab)
//   iChannel2 → superficie de planetas (textura del lab)
//   iChannel3 → "FFT" de audio sintético, animado cada frame
function WarpTunnel() {
  const [nebula, planet] = useLoader(THREE.TextureLoader, [
    '/textures/black-hole-singularity/nebula.png',
    '/textures/black-hole/gas.jpg',
  ]);

  const noise = useMemo(() => makeNoiseTexture(256), []);
  const fft = useMemo(() => makeFFTTexture(64), []);

  // El túnel samplea estas texturas con UVs que crecen sin límite → repeat.
  useEffect(() => {
    for (const t of [nebula, planet]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
  }, [nebula, planet]);

  // Liberar sólo lo que creamos nosotros (useLoader cachea/gestiona sus texturas).
  useEffect(
    () => () => {
      noise.dispose();
      fft.texture.dispose();
    },
    [noise, fft],
  );

  const uniforms = useMemo(
    () => ({
      iChannel0: { value: noise },
      iChannel1: { value: nebula },
      iChannel2: { value: planet },
      iChannel3: { value: fft.texture },
    }),
    [noise, nebula, planet, fft],
  );

  return (
    <FullscreenShader
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      onFrame={(t) => fft.update(t)}
    />
  );
}

// Warp Tunnel — ray-marching de 70 pasos + planetas + reflejos: pesado, cap dpr.
export default function Scene() {
  return (
    <ShaderCanvas dpr={[1, 1.5]}>
      <WarpTunnel />
    </ShaderCanvas>
  );
}
