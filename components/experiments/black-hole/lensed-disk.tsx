'use client';

import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Fake gravitational lensing of the disk's far side. In reality light from
// the back of the disk gets bent over (and under) the horizon, so from the
// camera you see a second "wrapped" image of the disk hugging the shadow.
// We approximate that with a billboarded annulus colored like the disk,
// brighter at the top/bottom where lensing dominates (at the sides the
// front disk already covers that region). Not physically correct — just
// visually convincing enough for the Gargantua look.
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
    // Plane is size 4.0 → local coords are -2..2
    vec2 c = (vUv - 0.5) * 4.0;
    float d = length(c);

    // Two-band annulus: a hot inner core hugging the horizon + a cooler
    // halo extending out. Together they read as the disk being lensed
    // over and under the shadow.
    float coreInner = smoothstep(0.96, 1.01, d);
    float coreOuter = smoothstep(1.18, 1.05, d);
    float core = coreInner * coreOuter;

    float haloInner = smoothstep(1.00, 1.10, d);
    float haloOuter = smoothstep(1.55, 1.20, d);
    float halo = haloInner * haloOuter * 0.55;

    float annulus = core + halo;

    // Angular bias: ring is present all around the perimeter, with extra
    // boost at top/bottom where the lensed image is not occluded by the
    // foreground disk.
    float vertical = abs(c.y) / max(d, 0.001);
    float angularBias = 0.5 + 0.6 * vertical;
    float intensity = annulus * angularBias * 1.0;

    // Color: hotter near the rim, cooler outward, matching the disk.
    float t = clamp((d - 1.0) / 0.55, 0.0, 1.0);
    vec3 inside = vec3(1.0, 0.92, 0.66);
    vec3 outside = vec3(0.78, 0.46, 0.22);
    vec3 color = mix(inside, outside, t);

    gl_FragColor = vec4(color * intensity, intensity);
  }
`;

export function LensedDisk() {
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[4, 4]} />
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
