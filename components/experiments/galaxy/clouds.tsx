'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARM_COUNT, logSpinAngle } from './arms';

// Smoke-like clouds that trace the spiral arms. Two things make this read as
// "humo" rather than the soft dots of Dust/HII:
//   1. Particles are walked ALONG each arm's logarithmic-spiral path (not
//      scattered randomly) and offset perpendicular to the local tangent, so
//      each cloud follows the curve of the arm.
//   2. Each point sprite is rendered with domain-warped FBM noise (turbulent
//      billows), stretched along the arm tangent and animated over time.
//
// The same machinery drives several looks via CloudConfig — outer wispy arms,
// a dense glowing core, etc. — so add a new layer by passing a new config.
export type CloudConfig = {
  // Particle budget = armCount * stepsPerArm * particlesPerStep.
  stepsPerArm: number;
  particlesPerStep: number;
  radius: number;
  minRadius: number;
  spin: number;
  // Walk bias along the arm: > 1 packs more steps toward the inner radius.
  radialPower: number;
  // Perpendicular (across-arm) and vertical thickness of the smoke band.
  bandSpread: number;
  verticalFlatten: number;
  // Per-arm base hues, blended toward rimColor by normalized radius (rimMix).
  palette: string[];
  rimColor: string;
  rimMix: number;
  // Point sprite size range.
  scaleMin: number;
  scaleRange: number;
  size: number;
  // Hard cap on a puff's on-screen size (px, before pixelRatio). Bounds the
  // FBM fillrate when the camera gets close to the core (sprites would
  // otherwise grow to fill the screen). No effect at normal viewing distance.
  maxSize: number;
  rotationStrength: number;
  // Shader look:
  //   contrast: higher = sharper/wispier, lower = denser/foggier (fuses light).
  //   turbulence: speed of the internal boil.
  //   alphaMultiplier: overall opacity/intensity.
  //   stretch: how far each puff smears along the arm tangent (1 = round).
  contrast: number;
  turbulence: number;
  alphaMultiplier: number;
  stretch: number;
  // Smoke texture: noiseScale = frequency (higher = finer, more visible wisps);
  // warp = how much the billows are twisted (higher = more turbulent smoke).
  noiseScale: number;
  warp: number;
};

// Inner spiral: denser, warmer, clearly visible smoke covering the inner arms.
export const INNER_CLOUDS: CloudConfig = {
  stepsPerArm: 90,
  particlesPerStep: 6,
  radius: 3.2,
  minRadius: 0.5,
  spin: 1,
  radialPower: 1.2,
  bandSpread: 0.35,
  verticalFlatten: 0.18,
  palette: ['#ffb890', '#e0a0c0', '#b09cd8', '#a89cd8', '#c8a8e0'],
  rimColor: '#8a90e0',
  rimMix: 0.5,
  scaleMin: 0.6,
  scaleRange: 1.6,
  size: 500,
  maxSize: 320,
  rotationStrength: 0.05,
  contrast: 1.6,
  turbulence: 0.12,
  alphaMultiplier: 0.32,
  stretch: 2.0,
  noiseScale: 3.2,
  warp: 1.5,
};

// Core: the innermost, most concentrated smoke — packed tighter to the center
// than INNER_CLOUDS (r 0 → ~1.6) with a warm, dense palette.
export const CORE_CLOUDS: CloudConfig = {
  stepsPerArm: 80,
  particlesPerStep: 6,
  radius: 1.6,
  minRadius: 0.0,
  spin: 1,
  // > 1 crowds the puffs toward r=0 so the smoke piles up in the very center.
  radialPower: 1.7,
  bandSpread: 0.3,
  verticalFlatten: 0.22,
  palette: ['#ffd0a0', '#ffc090', '#f0b0b8', '#ffd8b0', '#e8b0c8'],
  rimColor: '#c8a0d8',
  rimMix: 0.4,
  scaleMin: 0.6,
  scaleRange: 1.6,
  size: 440,
  // Lower cap than the others: this layer is dead-center, so it's the most
  // likely to blow up on screen when the camera is close.
  maxSize: 280,
  rotationStrength: 0.05,
  contrast: 1.6,
  turbulence: 0.12,
  alphaMultiplier: 0.3,
  stretch: 2.0,
  noiseScale: 3.4,
  warp: 1.6,
};

// Outer arms: wider, cooler and much fainter/softer — a subtle haze on the rim.
// Faint enough (alpha 0.03) that far fewer puffs look identical, so it carries
// a much smaller particle budget than the inner layer.
export const OUTER_CLOUDS: CloudConfig = {
  stepsPerArm: 60,
  particlesPerStep: 4,
  radius: 4,
  minRadius: 3.0,
  spin: 1,
  radialPower: 1.0,
  // Wider band + softer falloff so it reads as a gentle haze, not defined arms.
  bandSpread: 0.5,
  verticalFlatten: 0.22,
  palette: ['#b0a8d8', '#a0a8e0', '#88a8ff', '#9cb0e8', '#c0b0e0'],
  rimColor: '#7090ff',
  rimMix: 0.7,
  scaleMin: 0.7,
  scaleRange: 1.8,
  size: 620,
  maxSize: 380,
  rotationStrength: 0.05,
  // Lower contrast = softer; low alpha = sees less.
  contrast: 1.1,
  turbulence: 0.1,
  alphaMultiplier: 0.03,
  stretch: 2.4,
  noiseScale: 3.0,
  warp: 1.4,
};

// Box-Muller gaussian for soft band falloff.
function gaussian(): number {
  const u = Math.max(Math.random(), 1e-6);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Position on an arm's spiral at radius r (xz plane).
function spiralPoint(branchAngle: number, r: number, spin: number): [number, number] {
  const angle = branchAngle + logSpinAngle(r, spin);
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

function buildCloudsGeometry(cfg: CloudConfig): THREE.BufferGeometry {
  const totalCount = ARM_COUNT * cfg.stepsPerArm * cfg.particlesPerStep;
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const scales = new Float32Array(totalCount);
  const seeds = new Float32Array(totalCount); // per-puff noise offset
  const tangents = new Float32Array(totalCount * 2); // world XZ arm direction
  const rotJitter = new Float32Array(totalCount); // small per-puff angle offset
  const rim = new THREE.Color(cfg.rimColor);

  let p = 0;
  for (let arm = 0; arm < ARM_COUNT; arm++) {
    const branchAngle = (arm / ARM_COUNT) * Math.PI * 2;
    // Each arm gets a base hue from the palette for cohesion along its length.
    const baseHex = cfg.palette[arm % cfg.palette.length];

    for (let s = 0; s < cfg.stepsPerArm; s++) {
      // Walk the arm from inner to outer radius. radialPower biases density
      // toward the core (denser arms near the center, like real galaxies).
      const t = s / (cfg.stepsPerArm - 1);
      const r = cfg.minRadius + Math.pow(t, cfg.radialPower) * (cfg.radius - cfg.minRadius);

      const [cx, cz] = spiralPoint(branchAngle, r, cfg.spin);
      // Numerical tangent of the spiral at this radius.
      const eps = 0.02;
      const [nx, nz] = spiralPoint(branchAngle, r + eps, cfg.spin);
      const tx = nx - cx;
      const tz = nz - cz;
      const tLen = Math.hypot(tx, tz) || 1;
      // Perpendicular (across-arm) unit vector.
      const px = -tz / tLen;
      const pz = tx / tLen;

      // Color: blend the arm's base hue toward the rim color by radius.
      const col = new THREE.Color(baseHex).lerp(rim, t * cfg.rimMix);

      for (let k = 0; k < cfg.particlesPerStep; k++) {
        const i3 = p * 3;
        // Spread mostly perpendicular to the arm (thin band), a touch along it.
        const perp = gaussian() * cfg.bandSpread;
        const along = gaussian() * cfg.bandSpread * 0.4;
        positions[i3] = cx + px * perp + (tx / tLen) * along;
        positions[i3 + 1] = gaussian() * cfg.bandSpread * cfg.verticalFlatten;
        positions[i3 + 2] = cz + pz * perp + (tz / tLen) * along;

        // Slight per-puff lightness variation for organic feel.
        const c = col.clone();
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + (Math.random() - 0.5) * 0.12));
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;

        scales[p] = cfg.scaleMin + Math.random() * cfg.scaleRange;
        seeds[p] = Math.random() * 100;
        // Store the normalized world-space arm tangent + a small angular jitter.
        // The vertex shader projects this tangent to screen space every frame so
        // the smoke streak follows the spiral from any camera angle.
        tangents[p * 2] = tx / tLen;
        tangents[p * 2 + 1] = tz / tLen;
        rotJitter[p] = (Math.random() - 0.5) * 0.5;
        p++;
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geom.setAttribute('aTangent', new THREE.BufferAttribute(tangents, 2));
  geom.setAttribute('aRotJitter', new THREE.BufferAttribute(rotJitter, 1));
  return geom;
}

const cloudVertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uRotationStrength;
  uniform float uMaxSize;

  attribute float aScale;
  attribute float aSeed;
  attribute vec2 aTangent;   // normalized world XZ arm direction (before rotation)
  attribute float aRotJitter;

  varying vec3 vColor;
  varying float vSeed;
  varying float vRot;

  void main() {
    vec3 pos = position;

    // Mostly solid-body rotation (matches shaders.ts) so the arms keep their
    // shape over time instead of winding up. 0.5 rigid + 0.5/(r+1) shear.
    float distanceToCenter = length(pos.xz);
    float baseAngle = atan(pos.z, pos.x);
    // Subtract to match shaders.ts (spiral trails as it turns).
    float rot = uTime * uRotationStrength * (0.5 + 0.5 / (distanceToCenter + 1.0));
    float angle = baseAngle - rot;
    pos.x = cos(angle) * distanceToCenter;
    pos.z = sin(angle) * distanceToCenter;

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    gl_PointSize = uSize * aScale * uPixelRatio;
    gl_PointSize *= (1.0 / -viewPosition.z);
    // Cap on-screen size so close-ups don't blow each FBM puff up to fill the
    // screen (the main cause of the FPS drop near the core).
    gl_PointSize = min(gl_PointSize, uMaxSize * uPixelRatio);

    // --- Orient the sprite's stretch axis along the arm tangent AS IT PROJECTS
    // on screen, so the smoke follows the spiral from any camera angle. ---
    // Rotate the stored tangent by the same -rot we applied to the position.
    float cR = cos(-rot);
    float sR = sin(-rot);
    vec3 tWorld = vec3(
      aTangent.x * cR - aTangent.y * sR,
      0.0,
      aTangent.x * sR + aTangent.y * cR
    );
    // Project this point and a nearby point along the tangent into clip space,
    // then take the on-screen direction between them.
    vec4 clipTip = projectionMatrix * viewMatrix * modelMatrix * vec4(pos + tWorld * 0.1, 1.0);
    vec2 ndcDelta = clipTip.xy / clipTip.w - gl_Position.xy / gl_Position.w;
    // projectionMatrix[1][1] / [0][0] = aspect ratio (width / height).
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    // NDC y is up, gl_PointCoord y is down, so flip y here.
    float screenAngle = atan(-ndcDelta.y, ndcDelta.x * aspect);

    vColor = color;
    vSeed = aSeed;
    vRot = screenAngle + aRotJitter;
  }
`;

const cloudFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uContrast;
  uniform float uTurbulence;
  uniform float uAlphaMultiplier;
  uniform float uStretch;
  uniform float uNoiseScale;
  uniform float uWarp;

  varying vec3 vColor;
  varying float vSeed;
  varying float vRot;

  // --- noise / fbm (3D value noise) ---
  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 0.0973));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }
  // 2-octave FBM: cheap low-frequency field — enough to DRIVE the domain warp.
  float fbm3lo(vec3 p) {
    float f = 0.5 * noise3(p);
    p *= 2.02;
    f += 0.25 * noise3(p);
    return f;
  }
  // 3-octave FBM for the visible detail. (Dropping the 4th octave, weight
  // ~1/16, is invisible on soft bloomed smoke but saves a noise eval per pixel.)
  float fbm3(vec3 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 3; i++) {
      f += w * noise3(p);
      p *= 2.02;
      w *= 0.5;
    }
    return f;
  }

  void main() {
    // Center UV in [-0.5, 0.5], rotate to align with the arm tangent, then
    // stretch along that axis so each puff smears into a streak of smoke.
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    uv = mat2(c, -s, s, c) * uv;
    uv.x /= uStretch;

    // Elliptical radial falloff confines the smoke to the (stretched) puff.
    float r = length(uv) * 2.0;
    float radial = 1.0 - smoothstep(0.0, 1.0, r);
    if (radial <= 0.001) discard;

    // Domain-warped turbulence, seeded per-puff and drifting over time.
    vec3 np = vec3(uv * uNoiseScale, vSeed + uTime * uTurbulence);
    float q = fbm3lo(np);
    float d = fbm3(np + vec3(q * uWarp, q * uWarp, 0.0));

    d *= radial;                 // keep the billows inside the puff
    d = pow(max(d, 0.0), uContrast);

    float alpha = d * uAlphaMultiplier;
    gl_FragColor = vec4(vColor * d, alpha);
  }
`;

export function SpiralClouds({ config }: { config: CloudConfig }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [geometry] = useState(() => buildCloudsGeometry(config));

  // Per-instance uniforms so multiple cloud layers don't share state.
  const uniforms = useMemo(
    () => ({
      uSize: { value: config.size },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uRotationStrength: { value: config.rotationStrength },
      uContrast: { value: config.contrast },
      uTurbulence: { value: config.turbulence },
      uAlphaMultiplier: { value: config.alphaMultiplier },
      uStretch: { value: config.stretch },
      uNoiseScale: { value: config.noiseScale },
      uWarp: { value: config.warp },
      uMaxSize: { value: config.maxSize },
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
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
        transparent
      />
    </points>
  );
}

export function CoreClouds() {
  return <SpiralClouds config={CORE_CLOUDS} />;
}

export function InnerClouds() {
  return <SpiralClouds config={INNER_CLOUDS} />;
}

export function OuterClouds() {
  return <SpiralClouds config={OUTER_CLOUDS} />;
}
