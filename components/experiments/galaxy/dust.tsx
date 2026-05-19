'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARM_COUNT, logSpinAngle, pickArm } from './arms';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  count: 8_000,
  radius: 5.5,
  spin: 1,
  clusterCount: 15,
  clusterSpread: 0.4,
  verticalFlatten: 0.25,
  // Desaturated, cohesive palette — should tint the arms, not paint over them.
  palette: [
    '#d8a8d0',
    '#b094c8',
    '#c89cc0',
    '#a890c8',
    '#cca8b8',
    '#9890c0',
  ],
  size: 300,
  rotationStrength: 0.15,
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.rotationStrength },
  uSoftness: { value: 1.2 },
  uAlphaMultiplier: { value: 0.04 },
};

// Box-Muller: turns two uniform randoms into one ~N(0,1) sample.
function gaussian(): number {
  const u = Math.max(Math.random(), 1e-6);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildDustGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);

  // 1) Pick cluster centers along the spiral arms, each with a base color from the palette.
  const clusters: { x: number; z: number; color: THREE.Color }[] = [];
  for (let i = 0; i < PARAMS.clusterCount; i++) {
    const radius = Math.pow(Math.random(), 0.7) * PARAMS.radius;
    const branchAngle = (pickArm() / ARM_COUNT) * Math.PI * 2;
    const spinAngle = logSpinAngle(radius, PARAMS.spin);
    // Slight perpendicular offset so clusters aren't perfectly on the arm centerline.
    const offsetAngle = (Math.random() - 0.5) * 0.4;
    const angle = branchAngle + spinAngle + offsetAngle;
    const hex = PARAMS.palette[Math.floor(Math.random() * PARAMS.palette.length)];
    clusters.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      color: new THREE.Color(hex),
    });
  }

  // 2) Scatter points around their cluster center with gaussian falloff.
  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;
    const cluster = clusters[Math.floor(Math.random() * clusters.length)];

    positions[i3] = cluster.x + gaussian() * PARAMS.clusterSpread;
    positions[i3 + 1] = gaussian() * PARAMS.clusterSpread * PARAMS.verticalFlatten;
    positions[i3 + 2] = cluster.z + gaussian() * PARAMS.clusterSpread;

    // Vary hue/lightness slightly around the cluster's base color for organic feel.
    const c = cluster.color.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(
      hsl.h + (Math.random() - 0.5) * 0.04,
      hsl.s,
      Math.max(0, Math.min(1, hsl.l + (Math.random() - 0.5) * 0.15)),
    );
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;

    scales[i] = 0.4 + Math.random() * 2.5;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function Dust() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildDustGeometry);

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
