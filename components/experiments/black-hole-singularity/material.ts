// Singularity BlackHole material — verbatim port of the shader from
// `src/Experience/Worlds/MainWorld/BlackHole.js` (mirrored in
// cinematic-raymarching skill templates/singularity-full).
//
// The colorNode body is copied 1:1 — DO NOT EDIT. The numbers are tuned
// together: touching one degrades the look (see
// reference/reproducing-singularity.md "what must not be changed").
//
// Only the plumbing differs: the source uses an Experience-class singleton
// pattern (this.uniforms / this.resources); we expose a pure factory so the
// material can be created from inside an R3F mesh component.

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn,
  Loop,
  abs,
  cameraPosition,
  color,
  equirectUV,
  faceDirection,
  float,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  positionGeometry,
  positionWorld,
  remapClamp,
  step,
  sub,
  texture,
  time,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import {
  ColorRamp3_BSpline,
  lengthSqrt,
  linearToSrgb,
  rotateAxis,
  smoothRange,
  srgbToLinear,
  vecToFac,
  whiteNoise2D,
} from './tsl-utils';

export type BlackHoleUniforms = ReturnType<typeof createBlackHoleUniforms>;

// Uniforms — verbatim defaults from BlackHole.js. The `backgroundIntensity`
// is split out (the source pulls it from state.uniforms.mainScene.environment)
// because we don't have the Experience singleton.
export function createBlackHoleUniforms() {
  return {
    iterations: uniform(float(128)),
    stepSize: uniform(float(0.0071)),
    noiseFactor: uniform(float(0.01)),
    power: uniform(float(0.3)),

    clamp1: uniform(float(0.5)),
    clamp2: uniform(float(1.0)),

    originRadius: uniform(float(0.13)),
    width: uniform(float(0.03)),
    uvMotion: uniform(float(0)),

    rampCol1: uniform(color(0.95, 0.71, 0.44)),
    rampPos1: uniform(float(0.05)),
    rampCol2: uniform(color(0.14, 0.05, 0.03)),
    rampPos2: uniform(float(0.425)),
    rampCol3: uniform(color(0, 0, 0)),
    rampPos3: uniform(float(1.0)),

    rampEmission: uniform(float(2.0)),
    emissionColor: uniform(color(0.14, 0.129, 0.09)),

    // From state.uniforms.mainScene.environment.backgroundIntensity in source.
    // Must match `scene.backgroundNode = texture(stars, equirectUV()).mul(X)`.
    backgroundIntensity: uniform(float(2.0)),
  };
}

export function createBlackHoleMaterial({
  uniforms,
  noiseDeepTexture,
  starsTexture,
}: {
  uniforms: BlackHoleUniforms;
  noiseDeepTexture: THREE.Texture;
  starsTexture: THREE.Texture;
}) {
  // Source requires DoubleSide — backfaces drive the inside-the-sphere
  // ray-start case. Non-negotiable.
  const material = new MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
  });

  // Source also sets wrap modes here (idempotent on top of the texture
  // configuration done at load time).
  noiseDeepTexture.wrapS = THREE.RepeatWrapping;
  noiseDeepTexture.wrapT = THREE.RepeatWrapping;
  noiseDeepTexture.needsUpdate = true;

  // ===========================================================================
  // colorNode — verbatim from BlackHole.js setModel(). DO NOT edit.
  // ===========================================================================
  const colorFn: any = Fn(() => {
    // ==== Uniforms and constants ====
    const _step = uniforms.stepSize as any;
    const noiseAmp = uniforms.noiseFactor as any;
    const power = uniforms.power as any;
    const originRadius = uniforms.originRadius as any;
    const bandWidth = uniforms.width as any;
    const iterCount = uniforms.iterations as any;

    // ==== Geometry- and view-dependent bases ====
    const objCoords = (positionGeometry as any).mul(vec3(1, 1, -1)).xzy;
    const isBackface = step(0.0, (faceDirection as any).negate());

    const camPointObj = (cameraPosition as any)
      .mul(modelWorldMatrix)
      .mul(vec3(1, 1, -1)).xzy;

    const startCoords = mix(objCoords, camPointObj.xyz, isBackface) as any;

    const viewInWorld = normalize(sub(cameraPosition, positionWorld) as any)
      .mul(vec3(1, 1, -1)).xzy;
    const rayDir: any = (viewInWorld as any).negate();

    const noiseWhite = (whiteNoise2D(objCoords.xy) as any).mul(noiseAmp);
    const jitter = rayDir.mul(noiseWhite);

    const rayPos: any = startCoords.sub(jitter);

    const colorAcc: any = vec3(0);
    const alphaAcc: any = float(0.0);

    // ==== Main loop ====
    Loop(iterCount, () => {
      const rNorm = normalize(rayPos);
      const rLen = lengthSqrt(rayPos);
      const steerMag = _step.mul(power).div(rLen.mul(rLen));
      const range = remapClamp(rLen as any, 1.0, 0.5, 0.0, 1.0);
      const steer = rNorm.mul(steerMag.mul(range));
      const steeredDir = rayDir.sub(steer).normalize();

      const advance = rayDir.mul(_step);
      rayPos.addAssign(advance);

      const xyLen = lengthSqrt(rayPos.mul(vec3(1, 1, 0)));
      const rotPhase = xyLen.mul(4.270).sub(time.mul(0.1));
      const uvAxis = vec3(0, 0, 1);
      const uvRot = rayPos.mul(rotateAxis(uvAxis as any, rotPhase as any));
      const uv = uvRot.mul(2);

      const noiseDeep = texture(noiseDeepTexture, uv as any);

      const bandMin = bandWidth.negate();
      const bandEnds = vec3(bandMin, 0.0, bandWidth);
      const dz = sub(bandEnds as any, vec3(rayPos.z));
      const zQuad = (dz as any).mul(dz).div(bandWidth);
      const zBand = max(bandWidth.sub(zQuad).div(bandWidth), 0.0);

      const noiseAmp3 = (noiseDeep as any).mul(zBand);
      const noiseAmpLen = lengthSqrt(noiseAmp3);

      const uvForNormal = uv.mul(1.002);
      const noiseNormal = (texture(noiseDeepTexture, uvForNormal as any) as any).mul(zBand);
      const noiseNormalLen = lengthSqrt(noiseNormal);

      const rampInput = xyLen
        .add(noiseAmpLen.sub(0.780).mul(1.5))
        .add(noiseAmpLen.sub(noiseNormalLen).mul(19.750));

      const rampA = vec4(uniforms.rampCol1 as any, uniforms.rampPos1 as any);
      const rampB = vec4(uniforms.rampCol2 as any, uniforms.rampPos2 as any);
      const rampC = vec4(uniforms.rampCol3 as any, uniforms.rampPos3 as any);

      const baseCol = ColorRamp3_BSpline(rampInput.x, rampA, rampB, rampC);
      const emissiveCol = (baseCol as any)
        .mul(uniforms.rampEmission)
        .add(uniforms.emissionColor);

      const rLenNow = lengthSqrt(rayPos);
      const insideCore = (rLenNow as any).lessThan(originRadius);
      const shadedCol = mix(emissiveCol, vec3(0), insideCore);

      const zAbs = abs(rayPos.z);
      const aNoise = noiseAmpLen.sub(0.750).mul(-0.60);
      const aPre = zAbs.add(aNoise);
      const aRadial = smoothRange(xyLen as any, 1.0, 0.0, 0.0, 1.0);
      const aBand = smoothRange(aPre as any, bandWidth, 0, 0, aRadial as any);
      const alphaLocal = mix(aBand, 1.0, insideCore as any);

      const oneMinusA = (alphaAcc as any).oneMinus();
      const weight = oneMinusA.mul(vecToFac(alphaLocal as any));
      const newColor = mix(colorAcc, shadedCol, weight);
      const newAlpha = mix(alphaAcc, 1.0, vecToFac(alphaLocal as any));

      // CRITICAL: the second addAssign + steering update is intentional and
      // must not be removed (see reproducing-singularity.md #1). Removing one
      // of the two advance steps turns the spiral into a smear.
      rayPos.addAssign(advance);
      rayDir.assign(steeredDir);
      colorAcc.assign(newColor);
      alphaAcc.assign(newAlpha);
    });

    // ==== Environment blend on remaining transparency ====
    const dirForEnv = rayDir.mul(vec3(1, -1, 1)).xzy;
    const env = linearToSrgb(
      (texture(starsTexture, equirectUV(dirForEnv) as any) as any).mul(
        uniforms.backgroundIntensity,
      ),
    );

    const trans = float(1.0).sub(alphaAcc as any);
    const finalRGB = mix(colorAcc, env, trans.mul(1.0));

    // The shader ends in srgbToLinear so the renderer's output transform
    // (which expects linear) doesn't double-tone-map. Non-negotiable.
    return srgbToLinear(finalRGB as any);
  });

  const colorNode = colorFn();
  material.colorNode = colorNode;

  // Non-negotiable #13: bloom reads the emissive MRT target.
  material.emissiveNode = colorNode;

  return material;
}
