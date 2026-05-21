// Buffer1 — the raymarched black hole. Ported from buffer1_f.glsl in
// MisterPrada/black-hole, line-by-line.
//
// For each pixel we shoot a ray from the camera and march it forward in
// fixed-size steps. At each step we (1) bend the ray toward the singularity
// (WarpSpace — geodesic approximation), (2) advance the ray, (3) accumulate
// gas-disc + haze contributions front-to-back. After SAMPLES steps we blend
// 90% with the previous frame's render — temporal accumulation that knocks
// the per-pixel noise down dramatically.
//
// Output writes to a float-format RT; gamma + tonemapping happen later in
// the composite pass.

import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  Loop,
  If,
  uv,
  mix,
  length,
  normalize,
  dot,
  pow,
  max,
  abs,
  clamp,
  sin,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import {
  saturate,
  rand,
  pcurveFn,
  atan2Fn,
  noise,
  sdTorus,
  tGas,
  tBuffer1Prev,
  uTime,
  uResolution,
  uCameraRight,
  uCameraUp,
  uCameraForward,
  uCameraPos,
} from './tsl-helpers';

const SAMPLES = 200;
const FAR = 20.0;

const buffer1Frag = /* @__PURE__ */ Fn(() => {
  const uv2 = uv();
  const aspect = uResolution.x.div(uResolution.y);

  // Sub-pixel jitter (matches reference). Decorrelates per-pixel noise from
  // the temporal blend so the moving sample pattern averages out.
  const uveye = uv2.add(vec2(
    rand(uv2.add(sin(uTime))).div(uResolution.x),
    rand(uv2.add(1.0).add(sin(uTime))).div(uResolution.y),
  )).toVar();

  // Build the eye ray using the camera basis (right, up, forward). The
  // reference's RotateCamera/uMouse path is replaced here by a direct R3F
  // camera-derived basis so OrbitControls "just works".
  //   forward * 6 — matches the reference's `vec3(uv, 6.0)`. The 6.0 is the
  //   focal-length-ish constant that sets the FOV of the raymarched view.
  const ndc = uveye.mul(2.0).sub(1.0);
  const eyevec = normalize(
    uCameraRight.mul(ndc.x.mul(aspect))
      .add(uCameraUp.mul(ndc.y))
      .add(uCameraForward.mul(6.0)),
  ).toVar();
  const eyepos = uCameraPos.toVar();

  const color = vec3(0, 0, 0).toVar();
  const alpha = float(0).toVar();

  // First-frame dither: cranked way up (160) then ramps to ~rand for steady
  // state. Hides the temporal-blend "fade in" when the BH first appears.
  const dither = rand(uv2.add(sin(uTime))).mul(2.0)
    .add(clamp(float(160).sub(uTime.mul(3.0)), 0.0, 1000.0));

  const raypos = eyepos.add(eyevec.mul(dither).mul(FAR).div(SAMPLES)).toVar();

  const stepLen = float(FAR).div(SAMPLES);
  const warpAmount = float(5.0).div(SAMPLES);

  Loop(SAMPLES, () => {
    // ---------- WarpSpace ------------------------------------------------
    // Bend the ray toward the origin by 1/r² each step. This is the
    // discrete geodesic approximation — over 200 steps it sums up to a
    // visually correct gravitational lensing.
    const singDist = length(raypos);
    const warpFactor = float(1).div(pow(singDist, 2.0).add(0.000001));
    const singVec = normalize(raypos.negate());
    eyevec.assign(normalize(eyevec.add(singVec.mul(warpFactor).mul(warpAmount))));

    // ---------- Step the ray --------------------------------------------
    raypos.assign(raypos.add(eyevec.mul(stepLen)));

    // ---------- GasDisc -------------------------------------------------
    // Reference uses `inout color, inout alpha`; we mutate the toVar() nodes
    // directly. Early-out (coverage < 0.01) becomes an If wrapping the
    // expensive noise + texture lookups.
    const discRadius = float(3.2);
    const discWidth = float(5.3);
    const discInner = discRadius.sub(discWidth.mul(0.5));
    const discNormal = vec3(0, 1, 0);

    const distFromCenter = length(raypos);
    const distFromDisc = dot(discNormal, raypos);

    const radialGradient = saturate(
      float(1).sub(distFromCenter.sub(discInner).div(discWidth).mul(0.5)),
    );

    const coverage = pcurveFn(radialGradient, float(4.0), float(0.9)).toVar();

    const discThickness = float(0.1).mul(radialGradient);
    coverage.assign(coverage.mul(saturate(
      float(1).sub(abs(distFromDisc).div(discThickness)),
    )));

    const dustGlow = float(1).div(pow(float(1).sub(radialGradient), 2.0).mul(290.0).add(0.002));
    const dustColor = vec3(1, 1, 1).mul(dustGlow).mul(8.2).toVar();

    coverage.assign(saturate(coverage.mul(0.7)));

    const fade = pow(abs(distFromCenter.sub(discInner)).add(0.4), 4.0).mul(0.04);
    const bloomFactor = float(1).div(pow(distFromDisc, 2.0).mul(40.0).add(fade).add(0.00002));
    const b = vec3(1, 1, 1).mul(pow(bloomFactor, 1.5)).toVar();

    // Two-stop color: warm yellow inner → cool blue outer
    // TSL's mix(vec, vec, float) broadcasts the scalar — no need to wrap in
    // vec3() like the GLSL reference did.
    b.assign(b.mul(mix(
      vec3(1.7, 1.1, 1.0),
      vec3(0.5, 0.6, 1.0),
      pow(radialGradient, 2.0),
    )));
    // Red-ish boost on the hot side, fades to white outward
    b.assign(b.mul(mix(
      vec3(1.7, 0.5, 0.1),
      vec3(1.0, 1.0, 1.0),
      pow(radialGradient, 0.5),
    )));

    dustColor.assign(mix(dustColor, b.mul(150.0), saturate(float(1).sub(coverage))));
    coverage.assign(saturate(coverage.add(bloomFactor.mul(bloomFactor).mul(0.1))));

    // Skip the expensive noise + gas-texture lookups when coverage is
    // negligible. Equivalent to the reference's `if (coverage < 0.01) return;`
    // before Haze (which still runs).
    If(coverage.greaterThanEqual(0.01), () => {
      const radialCoords = vec3(
        distFromCenter.mul(1.5).add(0.55),
        atan2Fn(raypos.x.negate(), raypos.z.negate()).mul(1.5),
        distFromDisc.mul(1.5),
      ).mul(0.95).toVar();

      const speed = float(0.06);

      // ---- noise1: 4 octaves modulating dust brightness ----
      const noise1 = float(1.0).toVar();
      const rc1 = radialCoords.toVar();
      rc1.assign(rc1.add(vec3(0, uTime.mul(speed), 0)));
      noise1.assign(noise1.mul(noise(rc1.mul(3.0)).mul(0.5).add(0.5)));
      rc1.assign(rc1.add(vec3(0, uTime.mul(speed).negate(), 0)));
      noise1.assign(noise1.mul(noise(rc1.mul(6.0)).mul(0.5).add(0.5)));
      rc1.assign(rc1.add(vec3(0, uTime.mul(speed), 0)));
      noise1.assign(noise1.mul(noise(rc1.mul(12.0)).mul(0.5).add(0.5)));
      rc1.assign(rc1.add(vec3(0, uTime.mul(speed).negate(), 0)));
      noise1.assign(noise1.mul(noise(rc1.mul(24.0)).mul(0.5).add(0.5)));

      // ---- noise2: 6 octaves modulating coverage (filament density) ----
      const noise2 = float(2.0).toVar();
      const rc2 = radialCoords.add(vec3(30.0, 30.0, 30.0)).toVar();
      noise2.assign(noise2.mul(noise(rc2.mul(3.0)).mul(0.5).add(0.5)));
      rc2.assign(rc2.add(vec3(0, uTime.mul(speed), 0)));
      noise2.assign(noise2.mul(noise(rc2.mul(6.0)).mul(0.5).add(0.5)));
      rc2.assign(rc2.add(vec3(0, uTime.mul(speed).negate(), 0)));
      noise2.assign(noise2.mul(noise(rc2.mul(12.0)).mul(0.5).add(0.5)));
      rc2.assign(rc2.add(vec3(0, uTime.mul(speed), 0)));
      noise2.assign(noise2.mul(noise(rc2.mul(24.0)).mul(0.5).add(0.5)));
      rc2.assign(rc2.add(vec3(0, uTime.mul(speed).negate(), 0)));
      noise2.assign(noise2.mul(noise(rc2.mul(48.0)).mul(0.5).add(0.5)));
      rc2.assign(rc2.add(vec3(0, uTime.mul(speed), 0)));
      noise2.assign(noise2.mul(noise(rc2.mul(92.0)).mul(0.5).add(0.5)));

      dustColor.assign(dustColor.mul(noise1.mul(0.998).add(0.002)));
      coverage.assign(coverage.mul(noise2));

      // Sample gas.jpg in the disk's rotating frame (the +uTime*0.5 makes
      // the texture orbit slowly). pow(.., 2) gives a punchier contrast.
      const gasUV = vec2(
        radialCoords.y.add(uTime.mul(speed).mul(0.5)).mul(0.15),
        radialCoords.x.mul(0.27),
      );
      const gasSample = tGas.sample(gasUV).rgb;
      // pow(vec3, vec3) — use the method form; TSL's free `pow()` is typed
      // to float-only, but `.pow()` on a vec node is polymorphic.
      dustColor.assign(dustColor.mul(gasSample.pow(vec3(2.0, 2.0, 2.0)).mul(4.0)));

      coverage.assign(saturate(coverage.mul(1200.0 / SAMPLES)));
      dustColor.assign(max(vec3(0, 0, 0), dustColor));
      coverage.assign(coverage.mul(pcurveFn(radialGradient, float(4.0), float(0.9))));

      // Front-to-back accumulation
      color.assign(float(1).sub(alpha).mul(dustColor).mul(coverage).add(color));
      alpha.assign(float(1).sub(alpha).mul(coverage).add(alpha));
    });

    // ---------- Haze ----------------------------------------------------
    // Thin glowing torus at y=-0.05 — gives the bright bloom-disc you see
    // hugging the horizon. Killed inside r<0.5 so it doesn't paint the
    // shadow itself.
    const torusDist = length(sdTorus(
      raypos.add(vec3(0, -0.05, 0)),
      vec2(1.0, 0.01),
    ));
    const bloomDisc = float(1).div(pow(torusDist, 2.0).add(0.001));
    // The reference uses `length(pos) < 0.5 ? 0 : 1`; ternary-free version:
    const insideHorizon = clamp(length(raypos).sub(0.5).mul(1000.0), 0.0, 1.0);
    color.assign(color.add(
      vec3(1, 1, 1).mul(bloomDisc).mul(insideHorizon).mul(2.9 / SAMPLES).mul(float(1).sub(alpha)),
    ));
  });

  // Reference scales by 0.0001 to bring the HDR range down before temporal
  // blend. Composite re-multiplies by 150.
  color.assign(color.mul(0.0001));

  // ---------- Temporal blend ----------------------------------------------
  // The reference uses `p = 1.0` (linear blend). Could be set to 2.0 for a
  // gamma-aware blend; leaving at 1.0 to match.
  const previous = tBuffer1Prev.sample(uv2).rgb;
  // blendWeight = 0.9 (turn off the 0 branch since we don't track uMouse.z>1).
  // TSL's strict mix(vec, vec, float) signature requires wrapping the JS
  // number in float() so it's a node, not a raw scalar.
  const blendWeight = float(0.9);
  color.assign(mix(color, previous, blendWeight));

  return vec4(saturate(color), 1.0);
});

export function createBuffer1Material(): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = buffer1Frag();
  // Fullscreen quad uses the orthographic camera we set up in the pipeline;
  // standard vertex pipeline gives us correct screen coverage with
  // planeGeometry(2, 2) at z=0.
  m.depthTest = false;
  m.depthWrite = false;
  m.transparent = false;
  return m;
}
