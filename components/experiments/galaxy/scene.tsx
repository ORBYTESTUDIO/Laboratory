'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import * as THREE from 'three';
import { ARM_COUNT, logSpinAngle, pickArm } from './arms';
import { Bulge } from './bulge';
import { Dust } from './dust';
import { DustLanes } from './dust-lanes';
import { Halo } from './halo';
import { HII } from './hii';
import { fragmentShader, vertexShader } from './shaders';
import { Starfield } from './starfield';

const PARAMS = {
  count: 100_000,
  radius: 5,
  spin: 1,
  randomness: 0.45,
  randomnessPower: 3,
  insideColor: '#ffd4a0',
  outsideColor: '#88a8ff',
  size: 30,
  rotationStrength: 0.15,
};

// Module-level so three.js keeps a stable reference and we can mutate `.value`
// each frame without re-uploading to the GPU. Single galaxy instance per page.
const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.rotationStrength },
  uSoftness: { value: 2.5 },
  uAlphaMultiplier: { value: 1.0 },
};

function buildGalaxyGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);
  const inside = new THREE.Color(PARAMS.insideColor);
  const outside = new THREE.Color(PARAMS.outsideColor);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;
    const radius = Math.random() * PARAMS.radius;
    const branchAngle = (pickArm() / ARM_COUNT) * Math.PI * 2;
    const spinAngle = logSpinAngle(radius, PARAMS.spin);

    const sign = () => (Math.random() < 0.5 ? 1 : -1);
    const jitter = (flatten = 1) =>
      Math.pow(Math.random(), PARAMS.randomnessPower) *
      sign() *
      PARAMS.randomness *
      radius *
      flatten;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + jitter();
    positions[i3 + 1] = jitter(0.5);
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + jitter();

    const mixed = inside.clone().lerp(outside, radius / PARAMS.radius);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    const radial = 1.0 - radius / PARAMS.radius;
    const base = 0.4 + radial * 1.2;
    const jitterScale = 0.6 + Math.random() * 0.8;
    const bright = Math.random() < 0.06 ? 2.2 : 1.0;
    scales[i] = base * jitterScale * bright;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export default function Scene() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildGalaxyGeometry);

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
    <>
      <Starfield />
      <Halo />
      <Dust />
      <Bulge />
      <HII />
      <DustLanes />
      <points ref={pointsRef} geometry={geometry}>
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
      <EffectComposer>
        <Bloom
          intensity={0.4}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.9}
          kernelSize={KernelSize.LARGE}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
