'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  count: 5_000,
  maxRadius: 0.9,
  // pow exponent on radius — higher = more squashed toward the very center
  concentration: 3.5,
  // Vertical squash factor; bulges are slightly oblate (flatter than a sphere).
  verticalSquash: 0.65,
  // Hot inner color → warmer outer color (still warm — no blue at the core).
  innerColor: '#fff4d8',
  outerColor: '#ffc878',
  size: 20,
  // Rate of bright "core stars" with a scale boost.
  brightRate: 0.04,
  brightBoost: 1.8,
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: 0 }, // bulge is static — contrasts with rotating disk
  uSoftness: { value: 2.2 },
  uAlphaMultiplier: { value: 1.0 },
};

function buildBulgeGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);
  const inner = new THREE.Color(PARAMS.innerColor);
  const outer = new THREE.Color(PARAMS.outerColor);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;

    // Radius biased strongly toward the center.
    const radiusNorm = Math.pow(Math.random(), PARAMS.concentration);
    const r = radiusNorm * PARAMS.maxRadius;

    // Uniform direction on unit sphere; squash Y to make it oblate.
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;

    positions[i3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i3 + 1] = r * Math.cos(theta) * PARAMS.verticalSquash;
    positions[i3 + 2] = r * Math.sin(theta) * Math.sin(phi);

    // Color lerp: hottest at the core, warmer-amber at the edge of the bulge.
    const mixed = inner.clone().lerp(outer, radiusNorm);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    const base = 0.5 + (1 - radiusNorm) * 0.8;
    const bright = Math.random() < PARAMS.brightRate ? PARAMS.brightBoost : 1.0;
    scales[i] = base * bright;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function Bulge() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildBulgeGeometry);

  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uPixelRatio.value = pixelRatio;
    }
  }, [pixelRatio]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
        transparent
      />
    </points>
  );
}
