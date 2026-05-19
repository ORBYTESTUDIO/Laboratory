'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  count: 2_500,
  radius: 6,
  // 1.0 = sphere, 0 = perfectly flat disk. Halo is oblate but not as flat as the disk.
  verticalFlatten: 0.55,
  // Bias toward center: power > 1 concentrates particles near r=0.
  radialBias: 1.5,
  // Warm at the core fading to cool at the rim — same physical motif as the disk.
  innerColor: '#ffd4a8',
  outerColor: '#a0b0ff',
  size: 320,
  rotationStrength: 0,
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.rotationStrength },
  uSoftness: { value: 1.0 },
  uAlphaMultiplier: { value: 0.02 },
};

function buildHaloGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);
  const inner = new THREE.Color(PARAMS.innerColor);
  const outer = new THREE.Color(PARAMS.outerColor);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;
    const rNorm = Math.pow(Math.random(), PARAMS.radialBias);
    const r = rNorm * PARAMS.radius;
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;

    positions[i3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i3 + 1] = r * Math.cos(theta) * PARAMS.verticalFlatten;
    positions[i3 + 2] = r * Math.sin(theta) * Math.sin(phi);

    const mixed = inner.clone().lerp(outer, rNorm);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    scales[i] = 0.5 + Math.random() * 1.5;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function Halo() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildHaloGeometry);

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
