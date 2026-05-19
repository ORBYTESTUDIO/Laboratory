'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

const tmpCameraDir = new THREE.Vector3();

const PARAMS = {
  count: 180_000,
  innerRadius: 1.15,
  outerRadius: 3.1,
  thickness: 0.022,
  spin: 1.0,
  size: 38,
  insideColor: '#fff0c8',
  outsideColor: '#9a4e18',
};

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.spin },
  uSoftness: { value: 2.8 },
  uAlphaMultiplier: { value: 0.32 },
  uCameraDir: { value: new THREE.Vector3(0, 0, 1) },
  uDopplerStrength: { value: 0.7 },
};

// Box-Muller: gaussian sample with mean 0, sigma 1. Used for vertical scatter
// so the disk has a soft falloff instead of a hard flat slab.
function gaussian(): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function buildDiskGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARAMS.count * 3);
  const colors = new Float32Array(PARAMS.count * 3);
  const scales = new Float32Array(PARAMS.count);
  const inside = new THREE.Color(PARAMS.insideColor);
  const outside = new THREE.Color(PARAMS.outsideColor);

  for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;
    // Bias toward inner edge: more density (and heat) near the horizon.
    const t = Math.pow(Math.random(), 1.6);
    const radius = PARAMS.innerRadius + t * (PARAMS.outerRadius - PARAMS.innerRadius);
    const theta = Math.random() * Math.PI * 2;
    const y = gaussian() * PARAMS.thickness;

    positions[i3] = Math.cos(theta) * radius;
    positions[i3 + 1] = y;
    positions[i3 + 2] = Math.sin(theta) * radius;

    const ratio = (radius - PARAMS.innerRadius) / (PARAMS.outerRadius - PARAMS.innerRadius);
    const mixed = inside.clone().lerp(outside, ratio);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    const base = 0.5 + (1 - ratio) * 1.5;
    const jitter = 0.6 + Math.random() * 0.8;
    const bright = Math.random() < 0.05 ? 2.4 : 1.0;
    scales[i] = base * jitter * bright;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function AccretionDisk() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildDiskGeometry);
  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uPixelRatio.value = pixelRatio;
    }
  }, [pixelRatio]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      // Camera direction in XZ plane (disk is horizontal) drives doppler.
      tmpCameraDir.copy(state.camera.position).normalize();
      materialRef.current.uniforms.uCameraDir.value.copy(tmpCameraDir);
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
