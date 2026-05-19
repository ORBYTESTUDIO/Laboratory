'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  count: 6_000,
  innerRadius: 25,
  outerRadius: 60,
  size: 70,
  // Realistic stellar color distribution: mostly white, then blue-white, then yellow, etc.
  palette: [
    { hex: '#ffffff', weight: 55 },
    { hex: '#d8e4ff', weight: 18 },
    { hex: '#a8c0ff', weight: 12 },
    { hex: '#fff0d4', weight: 9 },
    { hex: '#ffc8a0', weight: 4 },
    { hex: '#ffa890', weight: 2 },
  ],
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: 0 }, // background stars stay still
  uSoftness: { value: 2.5 },
  uAlphaMultiplier: { value: 1.0 },
};

function pickWeighted(): string {
  const total = PARAMS.palette.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of PARAMS.palette) {
    roll -= p.weight;
    if (roll <= 0) return p.hex;
  }
  return PARAMS.palette[0].hex;
}

function buildStarfieldGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;

    // Uniform distribution on a spherical shell around the galaxy.
    const r = PARAMS.innerRadius + Math.random() * (PARAMS.outerRadius - PARAMS.innerRadius);
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;

    positions[i3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    positions[i3 + 2] = r * Math.cos(theta);

    const c = new THREE.Color(pickWeighted());
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;

    // Bias heavily toward small stars, occasional bright ones.
    scales[i] = 0.2 + Math.pow(Math.random(), 4) * 1.8;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function Starfield() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildStarfieldGeometry);

  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uPixelRatio.value = pixelRatio;
    }
  }, [pixelRatio]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // uTime advances even though uRotationStrength is 0, keeps API uniform across layers.
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
