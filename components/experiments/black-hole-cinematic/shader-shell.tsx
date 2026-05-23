'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

type Props = {
  mass: number;
  diskBrightness: number;
  diskDensity: number;
  exposure: number;
  radius?: number;
  segments?: number;
};

// Camera-centered sphere shell that wraps the viewer with the raymarched
// fragment shader. The mesh follows the camera each frame so flying far from
// origin never clips the geometry.
export function ShaderShell({
  mass,
  diskBrightness,
  diskDensity,
  exposure,
  radius = 100,
  segments = 64,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width * dpr, size.height * dpr) },
      uCameraPos: { value: new THREE.Vector3() },
      uMass: { value: mass },
      uDiskBrightness: { value: diskBrightness },
      uDiskDensity: { value: diskDensity },
      uExposure: { value: exposure },
    }),
    // Build uniforms once; per-frame values are written through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    mesh.position.copy(state.camera.position);

    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uCameraPos.value.copy(state.camera.position);
    u.uResolution.value.set(state.size.width * state.viewport.dpr, state.size.height * state.viewport.dpr);

    // Smooth artistic scalars toward target values (avoid jolts)
    u.uMass.value = THREE.MathUtils.lerp(u.uMass.value, mass, 0.08);
    u.uDiskBrightness.value = THREE.MathUtils.lerp(u.uDiskBrightness.value, diskBrightness, 0.08);
    u.uDiskDensity.value = THREE.MathUtils.lerp(u.uDiskDensity.value, diskDensity, 0.08);
    u.uExposure.value = THREE.MathUtils.lerp(u.uExposure.value, exposure, 0.08);
  });

  return (
    <mesh ref={meshRef} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[radius, segments, segments]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
