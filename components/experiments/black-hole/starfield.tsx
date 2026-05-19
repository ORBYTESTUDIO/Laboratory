'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  count: 4_500,
  innerRadius: 30,
  outerRadius: 80,
  size: 60,
  palette: [
    { hex: '#ffffff', weight: 60 },
    { hex: '#d8e4ff', weight: 18 },
    { hex: '#a8c0ff', weight: 10 },
    { hex: '#fff0d4', weight: 8 },
    { hex: '#ffc8a0', weight: 4 },
  ],
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: 0 },
  uSoftness: { value: 2.5 },
  uAlphaMultiplier: { value: 1.0 },
  uCameraDir: { value: new THREE.Vector3(0, 0, 1) },
  uDopplerStrength: { value: 0 },
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

    scales[i] = 0.2 + Math.pow(Math.random(), 4) * 1.6;
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
