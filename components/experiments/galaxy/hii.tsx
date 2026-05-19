'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARM_COUNT, logSpinAngle, pickArm } from './arms';
import { fragmentShader, vertexShader } from './shaders';

const PARAMS = {
  regionCount: 18,
  particlesPerRegion: 70,
  galaxyRadius: 5,
  spin: 1,
  // Regions sit on the arms, kept away from the bulge.
  minRadius: 1.2,
  regionSpread: 0.22,
  verticalFlatten: 0.25,
  // Hot, white-blue palette of young star-forming clusters.
  palette: [
    '#ffffff',
    '#dceeff',
    '#a8d0ff',
    '#80c0ff',
    '#c0e0ff',
  ],
  size: 38,
  // Rotate together with the disk stars.
  rotationStrength: 0.15,
};

const totalCount = PARAMS.regionCount * PARAMS.particlesPerRegion;

const uniforms = {
  uSize: { value: PARAMS.size },
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
  uRotationStrength: { value: PARAMS.rotationStrength },
  uSoftness: { value: 2.5 },
  uAlphaMultiplier: { value: 1.0 },
};

function gaussian(): number {
  const u = Math.max(Math.random(), 1e-6);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildHiiGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const scales = new Float32Array(totalCount);

  let p = 0;
  for (let r = 0; r < PARAMS.regionCount; r++) {
    // Place each region on a randomly-picked spiral arm at random radius.
    const radius =
      PARAMS.minRadius + Math.random() * (PARAMS.galaxyRadius - PARAMS.minRadius);
    const branchAngle = (pickArm() / ARM_COUNT) * Math.PI * 2;
    const spinAngle = logSpinAngle(radius, PARAMS.spin);
    const offsetAngle = (Math.random() - 0.5) * 0.25;
    const angle = branchAngle + spinAngle + offsetAngle;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const hex = PARAMS.palette[Math.floor(Math.random() * PARAMS.palette.length)];
    const color = new THREE.Color(hex);

    for (let i = 0; i < PARAMS.particlesPerRegion; i++) {
      const i3 = p * 3;

      positions[i3] = cx + gaussian() * PARAMS.regionSpread;
      positions[i3 + 1] =
        gaussian() * PARAMS.regionSpread * PARAMS.verticalFlatten;
      positions[i3 + 2] = cz + gaussian() * PARAMS.regionSpread;

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Few standout cores per region for extra punch.
      const bright = Math.random() < 0.1 ? 1.8 : 1.0;
      scales[p] = (0.4 + Math.random() * 1.0) * bright;
      p++;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function HII() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(buildHiiGeometry);

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
