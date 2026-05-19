'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARM_COUNT, logSpinAngle, pickArm } from './arms';
import { fragmentShader, vertexShader } from './shaders';

// Subtractive blending darkens wherever there's light underneath:
//   dst = dst * (1 - src.rgb)
// Black background stays black (no light to remove); bright arms get muted bands.
const PARAMS = {
  count: 30_000,
  radius: 5,
  // Lanes don't form inside the bulge — keep them in the disk.
  minRadius: 1.2,
  spin: 1,
  // Thinner perpendicular spread than the stars: lanes are narrow filaments.
  randomness: 0.15,
  randomnessPower: 4,
  // Angular shift relative to each arm. Positive = ahead of the arm in rotation.
  laneOffset: 0.14,
  // The "dust color" is the amount of brightness removed per channel. Warmer
  // tint (slightly more red removed) leaves a cooler bias in the framebuffer.
  color: '#3a3530',
  size: 28,
  rotationStrength: 0.15,
  // Dust lanes are squashed almost flat — they live right in the disk plane.
  verticalFlatten: 0.08,
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.rotationStrength },
  uSoftness: { value: 1.6 },
  uAlphaMultiplier: { value: 1.0 },
};

function buildDustLanesGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);
  const baseColor = new THREE.Color(PARAMS.color);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;
    const r =
      PARAMS.minRadius + Math.random() * (PARAMS.radius - PARAMS.minRadius);
    const branchAngle = (pickArm() / ARM_COUNT) * Math.PI * 2;
    const spinAngle = logSpinAngle(r, PARAMS.spin);
    const angle = branchAngle + spinAngle + PARAMS.laneOffset;

    const sign = () => (Math.random() < 0.5 ? 1 : -1);
    const jitter = (flatten = 1) =>
      Math.pow(Math.random(), PARAMS.randomnessPower) *
      sign() *
      PARAMS.randomness *
      r *
      flatten;

    positions[i3] = Math.cos(angle) * r + jitter();
    positions[i3 + 1] = jitter(PARAMS.verticalFlatten);
    positions[i3 + 2] = Math.sin(angle) * r + jitter();

    colors[i3] = baseColor.r;
    colors[i3 + 1] = baseColor.g;
    colors[i3 + 2] = baseColor.b;

    scales[i] = 0.4 + Math.random() * 1.0;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function DustLanes() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildDustLanesGeometry);

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

  // renderOrder pushes this after the additive layers so we subtract from
  // already-accumulated light. (Bloom runs after the whole scene anyway.)
  return (
    <points geometry={geometry} renderOrder={10}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        blending={THREE.SubtractiveBlending}
        vertexColors
        transparent
        premultipliedAlpha
      />
    </points>
  );
}
