'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

// A diffuse ellipsoidal cloud of large, faint points. Split into two layers so
// the bright concentrated core glow and the wide faint outer halo can be tuned
// independently (see InnerHalo / OuterHalo below).
export type HaloConfig = {
  count: number;
  // Ellipsoid extent per axis. Equal values give a sphere; a smaller Y keeps
  // the halo oblate like the disk.
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  // Bias toward center: power > 1 concentrates particles near r=0.
  radialBias: number;
  innerColor: string;
  outerColor: string;
  size: number;
  rotationStrength: number;
  softness: number;
  alphaMultiplier: number;
  scaleMin: number;
  scaleRange: number;
};

// Tight, warm, brighter glow packed around the very center.
export const INNER_HALO: HaloConfig = {
  count: 50,
  radiusX: 2.5,
  radiusY: 0.8,
  radiusZ: 2.5,
  radialBias: 2.2,
  innerColor: '#ffd4a8',
  outerColor: '#ffb890',
  size: 1500,
  rotationStrength: 0.02,
  softness: 1.0,
  alphaMultiplier: 0.02,
  scaleMin: 0.5,
  scaleRange: 1.5,
};

// Wide, cool, faint halo spread out to the rim.
export const OUTER_HALO: HaloConfig = {
  count: 800,
  radiusX: 6,
  radiusY: 1,
  radiusZ: 6,
  radialBias: 1.2,
  innerColor: '#bcc8ff',
  outerColor: '#a0b0ff',
  size: 2000,
  rotationStrength: 0.02,
  softness: 1.0,
  alphaMultiplier: 0.005,
  scaleMin: 0.5,
  scaleRange: 1.5,
};

function buildHaloGeometry(cfg: HaloConfig): THREE.BufferGeometry {
  const positions = new Float32Array(cfg.count * 3);
  const colors = new Float32Array(cfg.count * 3);
  const scales = new Float32Array(cfg.count);
  const inner = new THREE.Color(cfg.innerColor);
  const outer = new THREE.Color(cfg.outerColor);

  for (let i = 0; i < cfg.count; i++) {
    const i3 = i * 3;
    const rNorm = Math.pow(Math.random(), cfg.radialBias);
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;

    // Unit direction on the sphere, then scaled per axis to form an ellipsoid.
    positions[i3] = rNorm * cfg.radiusX * Math.sin(theta) * Math.cos(phi);
    positions[i3 + 1] = rNorm * cfg.radiusY * Math.cos(theta);
    positions[i3 + 2] = rNorm * cfg.radiusZ * Math.sin(theta) * Math.sin(phi);

    const mixed = inner.clone().lerp(outer, rNorm);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    scales[i] = cfg.scaleMin + Math.random() * cfg.scaleRange;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geom;
}

export function HaloShell({ config }: { config: HaloConfig }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(() => buildHaloGeometry(config));

  // Per-instance uniforms so the two halo layers don't share state.
  const uniforms = useMemo(
    () => ({
      uSize: { value: config.size },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uRotationStrength: { value: config.rotationStrength },
      uSoftness: { value: config.softness },
      uAlphaMultiplier: { value: config.alphaMultiplier },
    }),
    [config],
  );

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

export function InnerHalo() {
  return <HaloShell config={INNER_HALO} />;
}

export function OuterHalo() {
  return <HaloShell config={OUTER_HALO} />;
}
