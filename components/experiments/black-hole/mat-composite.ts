// Composite — the final pass that builds the on-screen image.
//
// 1. Sample buffer1 (raymarched black hole) at the pixel.
// 2. Reconstruct 8-octave bloom from buffer4 using bicubic interpolation
//    of each packed octave (Grab/CalcOffset mirror buffer2's layout).
// 3. Multiply by 150 to lift back into HDR, then Reinhard tonemap +
//    cinematic power-curve grade + final gamma.
// 4. Mix in a Kali-formula volumetric starfield at the frame edges via
//    smoothstep — gives the cosmic surround without rendering geometry.
// Ported from render_f.glsl.

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
  dot,
  pow,
  cos,
  sin,
  abs,
  floor,
  fract,
  max,
  smoothstep,
  mod,
  clamp,
  mat2,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import {
  tBuffer1,
  tBuffer4,
  uTime,
  uResolution,
  calcOffset,
} from './tsl-helpers';

// See tsl-helpers for the rationale on using `any` for Fn parameter types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

// Kali starfield constants — identical to render_f.glsl. The "magic formula"
// is `p = abs(p) / dot(p, p) - formuparam`, iterated. Different parameter
// choices give wildly different fractal patterns; these are tuned for an
// Interstellar-y star field.
const ITERATIONS = 14;
const VOLSTEPS = 20;
const STEPSIZE = 0.2;
const FORMUPARAM = 0.53;
const ZOOM = 0.8;
const TILE = 0.85;
const STAR_SPEED = 0.0002;
const BRIGHTNESS = 0.0015;
const DARKMATTER = 0.6;
const DISTFADING = 0.73;
const SATURATION = 0.35;

// cubic(x): Mitchell cubic B-spline weights for one axis. Used by the
// bicubic upsample to smooth the packed mipmap tree.
const cubicWeights = /* @__PURE__ */ Fn(([x]: [N]) => {
  const x2 = x.mul(x);
  const x3 = x2.mul(x);
  const wx = x3.negate().add(x2.mul(3.0)).sub(x.mul(3.0)).add(1.0);
  const wy = x3.mul(3.0).sub(x2.mul(6.0)).add(4.0);
  const wz = x3.mul(-3.0).add(x2.mul(3.0)).add(x.mul(3.0)).add(1.0);
  const ww = x3;
  return vec4(wx, wy, wz, ww).div(6.0);
});

// BicubicTexture: bicubic upsample from the buffer4 (bloom mip chain).
// Four texture taps weighted by the cubic B-spline gives a smoother result
// than bilinear, which is important here because the bloom octaves are
// heavily downsampled.
const bicubicBloomFetch = /* @__PURE__ */ Fn(([coord]: [N]) => {
  const c = coord.mul(uResolution).toVar();

  const fx = fract(c.x).toVar();
  const fy = fract(c.y).toVar();
  c.assign(vec2(floor(c.x), floor(c.y)));

  fx.assign(fx.sub(0.5));
  fy.assign(fy.sub(0.5));

  const xcubic = cubicWeights(fx);
  const ycubic = cubicWeights(fy);

  const cc = vec4(c.x.sub(0.5), c.x.add(1.5), c.y.sub(0.5), c.y.add(1.5));
  const s = vec4(
    xcubic.x.add(xcubic.y),
    xcubic.z.add(xcubic.w),
    ycubic.x.add(ycubic.y),
    ycubic.z.add(ycubic.w),
  );
  const offset = cc.add(vec4(xcubic.y, xcubic.w, ycubic.y, ycubic.w).div(s));

  const sample0 = tBuffer4.sample(vec2(offset.x, offset.z).div(uResolution));
  const sample1 = tBuffer4.sample(vec2(offset.y, offset.z).div(uResolution));
  const sample2 = tBuffer4.sample(vec2(offset.x, offset.w).div(uResolution));
  const sample3 = tBuffer4.sample(vec2(offset.y, offset.w).div(uResolution));

  const sx = s.x.div(s.x.add(s.y));
  const sy = s.z.div(s.z.add(s.w));

  return mix(
    mix(sample3, sample2, sx),
    mix(sample1, sample0, sx),
    sy,
  ).rgb;
});

// Grab one octave of the packed mipmap tree at this uv, undoing the scale +
// offset applied in buffer2.
const grabBloomOctave = /* @__PURE__ */ Fn(([coord, octave, offset]: [N, N, N]) => {
  const scale = pow(float(2.0), octave);
  const c = coord.div(scale).sub(offset);
  return bicubicBloomFetch(c);
});

const getBloom = /* @__PURE__ */ Fn(([coord]: [N]) => {
  const bloom = vec3(0, 0, 0).toVar();
  // Reference weights — note octaves 4 & 5 are emphasized (1.5, 1.8) which
  // gives the bloom its characteristic "spread but not blown-out" feel.
  bloom.assign(bloom.add(grabBloomOctave(coord, float(1.0), calcOffset(float(0.0))).mul(1.0)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(2.0), calcOffset(float(1.0))).mul(1.5)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(3.0), calcOffset(float(2.0))).mul(1.0)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(4.0), calcOffset(float(3.0))).mul(1.5)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(5.0), calcOffset(float(4.0))).mul(1.8)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(6.0), calcOffset(float(5.0))).mul(1.0)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(7.0), calcOffset(float(6.0))).mul(1.0)));
  bloom.assign(bloom.add(grabBloomOctave(coord, float(8.0), calcOffset(float(7.0))).mul(1.0)));
  return bloom;
});

const compositeFrag = /* @__PURE__ */ Fn(() => {
  const uv2 = uv();
  const fragCoord = uv2.mul(uResolution);

  // --- Black hole color + bloom -----------------------------------------
  const color = tBuffer1.sample(uv2).rgb.toVar();
  color.assign(color.add(getBloom(uv2).mul(0.08)));
  color.assign(color.mul(150.0));

  // Tonemap + grade (the cinematic curve from render_f.glsl). vec3(x) doesn't
  // broadcast in TSL's strict TS types — we spell out each component. Free
  // `pow()` is typed float-only, so we use the polymorphic method form.
  color.assign(color.pow(vec3(1.5, 1.5, 1.5)));
  color.assign(color.div(vec3(1.0, 1.0, 1.0).add(color)));
  const invG1 = 1.0 / 1.5;
  color.assign(color.pow(vec3(invG1, invG1, invG1)));
  // smoothstep-style contrast bump: c² (3 - 2c)
  color.assign(color.mul(color).mul(vec3(3.0, 3.0, 3.0).sub(color.mul(2.0))));
  // Per-channel warm bias + gamma
  color.assign(color.pow(vec3(1.3, 1.20, 1.0)));
  color.assign(clamp(color.mul(1.01), 0.0, 1.0));
  const g = 0.7 / 2.2;
  color.assign(color.pow(vec3(g, g, g)));

  // --- Kali "magic formula" volumetric starfield ------------------------
  // Cheap-ish fractal in 3D, raymarched (20 steps, 14 iter folding per step).
  // Two small rotations (a1, a2) build a 2-axis tilt; the formula
  // p = abs(p)/dot(p,p) - formuparam iteratively folds the volume.
  const starUV = fragCoord.div(uResolution).sub(0.5).toVar();
  starUV.assign(vec2(starUV.x, starUV.y.mul(uResolution.y.div(uResolution.x))));

  const dir = vec3(starUV.x.mul(ZOOM), starUV.y.mul(ZOOM), 1.0).toVar();
  const t = uTime.mul(STAR_SPEED).add(0.25);

  const a1 = float(0.5).div(uResolution.x).mul(2.0);
  const a2 = float(0.8).div(uResolution.y).mul(2.0);
  const rot1 = mat2(cos(a1), sin(a1), sin(a1).negate(), cos(a1));
  const rot2 = mat2(cos(a2), sin(a2), sin(a2).negate(), cos(a2));

  // dir.xz *= rot1; dir.xy *= rot2;
  const dirXZ = rot1.mul(vec2(dir.x, dir.z));
  dir.assign(vec3(dirXZ.x, dir.y, dirXZ.y));
  const dirXY = rot2.mul(vec2(dir.x, dir.y));
  dir.assign(vec3(dirXY.x, dirXY.y, dir.z));

  const from = vec3(1.0, 0.5, 0.5).add(vec3(t.mul(2.0), t, -2.0)).toVar();
  const fromXZ = rot1.mul(vec2(from.x, from.z));
  from.assign(vec3(fromXZ.x, from.y, fromXZ.y));
  const fromXY = rot2.mul(vec2(from.x, from.y));
  from.assign(vec3(fromXY.x, fromXY.y, from.z));

  const s = float(0.1).toVar();
  const fade = float(1.0).toVar();
  const v = vec3(0, 0, 0).toVar();

  Loop(VOLSTEPS, ({ i: r }: { i: N }) => {
    const p = from.add(dir.mul(s).mul(0.5)).toVar();
    // Fold: p = abs(tile - mod(p, 2*tile))
    p.assign(abs(vec3(TILE, TILE, TILE).sub(mod(p, vec3(TILE * 2.0, TILE * 2.0, TILE * 2.0)))));

    const pa = float(0).toVar();
    const a = float(0).toVar();
    Loop(ITERATIONS, () => {
      p.assign(abs(p).div(dot(p, p)).sub(FORMUPARAM));
      a.assign(a.add(abs(length(p).sub(pa))));
      pa.assign(length(p));
    });

    const dm = max(0.0, float(DARKMATTER).sub(a.mul(a).mul(0.001)));
    a.assign(a.mul(a).mul(a));
    If(r.greaterThan(6), () => {
      fade.assign(fade.mul(float(1.0).sub(dm)));
    });
    v.assign(v.add(fade));
    v.assign(v.add(vec3(s, s.mul(s), s.mul(s).mul(s).mul(s)).mul(a).mul(BRIGHTNESS).mul(fade)));
    fade.assign(fade.mul(DISTFADING));
    s.assign(s.add(STEPSIZE));
  });

  // Desaturate slightly toward grayscale (the reference's saturation=0.35
  // mixes the per-channel result with its luminance norm).
  // mix(grayscale_vec3, v, saturation) — the reference desaturates a bit so
  // the magic-formula field doesn't read as fully RGB.
  const lenV = length(v);
  const vSat = mix(vec3(lenV, lenV, lenV), v, float(SATURATION)).mul(0.005);

  // --- Mask the starfield in at frame edges ----------------------------
  // The black hole occupies the inner ~30% disc; outside that we let stars
  // fade in. smoothstep ramps from innerRadius to outerRadius.
  const edgeUV = fragCoord.div(uResolution).sub(0.5).toVar();
  edgeUV.assign(vec2(
    edgeUV.x.mul(uResolution.x.div(uResolution.y).sub(0.03)).sub(0.03),
    edgeUV.y,
  ));
  const distance = length(edgeUV);
  const mixFactor = smoothstep(0.3, 1.3, distance);

  const finalColor = mix(color, vSat, mixFactor);
  return vec4(finalColor, 1.0);
});

export function createCompositeMaterial(): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = compositeFrag();
  m.depthTest = false;
  m.depthWrite = false;
  m.transparent = false;
  return m;
}
