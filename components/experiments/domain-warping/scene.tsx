'use client';

import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WarpControls, WARP_DEFAULTS, type WarpParams } from './controls';
import { fragmentShader, vertexShader } from './shader';

// El quad que corre el shader. Lee `params` (números de React) y los escribe a
// los uniforms en cada frame — simple y sin efectos extra. Mutamos vía
// materialRef (el patrón de uniforms del proyecto).
function WarpQuad({ params }: { params: WarpParams }) {
  const matRef = useRef<THREE.RawShaderMaterial>(null);
  const elapsed = useRef(0);

  const [uniforms] = useState(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uWarp: { value: WARP_DEFAULTS.warp },
    uLayers: { value: WARP_DEFAULTS.layers },
    uScale: { value: WARP_DEFAULTS.scale },
    uColor: { value: WARP_DEFAULTS.color ? 1 : 0 },
  }));

  useFrame((state, delta) => {
    elapsed.current += delta * params.speed; // la velocidad escala el tiempo
    const m = matRef.current;
    if (!m) return;
    const u = m.uniforms;
    u.uTime.value = elapsed.current;
    u.uResolution.value.set(state.size.width, state.size.height);
    u.uWarp.value = params.warp;
    u.uLayers.value = params.layers;
    u.uScale.value = params.scale;
    u.uColor.value = params.color ? 1 : 0;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <rawShaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        glslVersion={THREE.GLSL3}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// Experimento interactivo: Canvas con el quad + panel HTML de controles. Como
// tiene UI propia, arma su propio layout (no usa ShaderCanvas, que mete todo
// dentro del Canvas). customCanvas en el registry.
export default function Scene() {
  const [params, setParams] = useState<WarpParams>(WARP_DEFAULTS);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <Canvas dpr={[1, 2]} gl={{ antialias: false }}>
        <WarpQuad params={params} />
      </Canvas>
      <WarpControls params={params} setParams={setParams} />
    </div>
  );
}
