'use client';

import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Billboarded glow ring that always faces the camera, so as the user orbits
// it keeps wrapping the horizon like a halo (this is the stylized stand-in
// for the photon ring; real lensing comes in Fase 3).
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    // Plane has size 3.0, so local coords are -1.5..1.5
    vec2 c = (vUv - 0.5) * 3.0;
    float d = length(c);

    // Very faint rim just kissing the horizon. The LensedDisk now provides
    // the main brightness around the shadow, so this only adds a hint of
    // hot light right at the edge.
    float rim = exp(-pow((d - 1.0) / 0.028, 2.0)) * 0.35;
    vec3 hot = vec3(1.0, 0.94, 0.78);
    gl_FragColor = vec4(hot * rim, rim);
  }
`;

export function PhotonRing() {
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[3, 3]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}
