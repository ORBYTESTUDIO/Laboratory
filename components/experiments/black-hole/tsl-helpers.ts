// TSL helpers ported from MisterPrada/black-hole's buffer1_f.glsl.
// All math matches the reference; only the syntax changes (TSL instead of GLSL).
//
// Texture nodes are module-level so the raymarch / composite Fns can close over
// them. On the JS side we mutate `.value` each frame to repoint at the right
// render-target (this is what makes the ping-pong of buffer1 work).
//
// We don't use TSL's built-in `rand`/`pcurve` because we want bit-identical
// behavior with the original shader — the reference's `rand` clamps to [0,1]
// via `saturate`, and its `pcurve` is the IQ formula exactly.

import {
  Fn,
  vec2,
  float,
  uniform,
  texture,
  mix,
  length,
  dot,
  pow,
  cos,
  sin,
  floor,
  fract,
  min,
  atan,
  mat3,
  saturate as tslSaturate,
} from 'three/tsl';
import { Texture, Vector2, Vector3, Vector4 } from 'three';

// TSL Fn parameters are shader-node objects whose concrete type depends on
// what's passed in at the call site. The strict `Node<"float">`/`Node<"vec3">`
// types are too narrow for helpers that work polymorphically (e.g. noise()
// takes a vec3 but TS can't infer `.xy` access). Using `any` matches how
// three.js's own TSL examples write helpers and keeps the GLSL emission
// correct — TSL only checks types at runtime when building the node graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

// -----------------------------------------------------------------------------
// Uniforms & texture nodes (module-level so all materials share them).
// -----------------------------------------------------------------------------
//
// `texture(new Texture())` builds a TextureNode bound to a placeholder. Each
// frame, before rendering, we mutate the placeholder's `.value` (the actual
// THREE.Texture pointer) so the next draw samples the right RT.

// `uniform()` is typed to take raw values, not node expressions — we wrap
// the JS-side numbers/vectors and mutate `.value` from the frame loop.
export const uTime = /* @__PURE__ */ uniform(0);
export const uResolution = /* @__PURE__ */ uniform(new Vector2(1, 1));
export const uMouse = /* @__PURE__ */ uniform(new Vector4(0, 0, 0, 0));
export const uCameraZoom = /* @__PURE__ */ uniform(10);
// Camera basis vectors driven by R3F's camera each frame, so OrbitControls
// works. We don't go through the reference's mouse-derived RotateCamera —
// instead we feed in the basis directly and the shader uses (right, up,
// forward) to build the eye ray.
export const uCameraRight = /* @__PURE__ */ uniform(new Vector3(1, 0, 0));
export const uCameraUp = /* @__PURE__ */ uniform(new Vector3(0, 1, 0));
export const uCameraForward = /* @__PURE__ */ uniform(new Vector3(0, 0, -1));
export const uCameraPos = /* @__PURE__ */ uniform(new Vector3(0, 0, 10));

// Texture nodes — `.value` reassigned each frame by the pipeline.
export const tNoise = /* @__PURE__ */ texture(new Texture());
export const tGas = /* @__PURE__ */ texture(new Texture());
export const tBuffer1 = /* @__PURE__ */ texture(new Texture()); // raymarch output (read by composite & buffer2)
export const tBuffer1Prev = /* @__PURE__ */ texture(new Texture()); // previous-frame raymarch (read by raymarch itself = uBuffer3)
export const tBuffer2 = /* @__PURE__ */ texture(new Texture()); // mipmap tree (read by hblur)
export const tBuffer3 = /* @__PURE__ */ texture(new Texture()); // horizontal-blurred (read by vblur)
export const tBuffer4 = /* @__PURE__ */ texture(new Texture()); // vertical-blurred (read by composite)

// -----------------------------------------------------------------------------
// Pure helper Fns.
// -----------------------------------------------------------------------------

// Re-export TSL's polymorphic saturate so callers don't import from two places.
// (Custom Fn wrappers fight TS's narrow return-type inference; the built-in
// has the polymorphic typing baked in.)
export const saturate = tslSaturate;

// rand(vec2): standard fract(sin(dot)) hash, identical to the reference.
export const rand = /* @__PURE__ */ Fn(([coord]: [N]) => {
  return saturate(fract(sin(dot(coord, vec2(12.9898, 78.223))).mul(43758.5453)));
});

// pcurve(x, a, b): the Inigo Quilez "power curve". Used by GasDisc to shape
// the disk's radial falloff into a hard inner edge + soft outer trail.
//   k = (a+b)^(a+b) / (a^a * b^b)
//   pcurve = k * x^a * (1-x)^b
export const pcurveFn = /* @__PURE__ */ Fn(([x, a, b]: [N, N, N]) => {
  const ab = a.add(b);
  const k = pow(ab, ab).div(pow(a, a).mul(pow(b, b)));
  return k.mul(pow(x, a)).mul(pow(float(1).sub(x), b));
});

// atan2 with the four-quadrant handling. TSL's `atan(y, x)` already does the
// right thing — we keep an explicit alias for parity with the reference.
export const atan2Fn = /* @__PURE__ */ Fn(([y, x]: [N, N]) => {
  return atan(y, x);
});

// noise(vec3): trilinear value noise that reads from the 256x256 noise.png
// the same way the reference's buffer1 does — sample one texel, take .yx as
// the two random values, interpolate by f.z. tNoise is the module-level
// texture node bound to noise.png.
export const noise = /* @__PURE__ */ Fn(([x]: [N]) => {
  // TSL's `floor`/`fract` are typed to return `Node<"float">` regardless of
  // input arity; declaring the locals as `N` (=any) lets us still call .xy /
  // .z on them. At runtime the type is vec3 because `x` is vec3 — TSL emits
  // the correct GLSL.
  const p: N = floor(x);
  const f: N = fract(x).toVar();
  // Cubic smoothing: f = f*f*(3-2f)
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  // Pack (x,y) coord with z-offset (so different z values pick different texels)
  const uvCoord = p.xy.add(vec2(37.0, 17.0).mul(p.z)).add(f.xy);
  // Sample texture and take .yx — matches `textureLod(uBuffer1, ..., 0.0).yx`
  // in the reference. The texture is 256x256, the +0.5 puts us at pixel centers.
  const sampled = tNoise.sample(uvCoord.add(0.5).div(256.0));
  const rg = vec2(sampled.y, sampled.x);
  return float(-1).add(mix(rg.x, rg.y, f.z).mul(2));
});

// sdTorus(p, t): signed distance to a torus on the XZ plane.
// t.x = major radius (center of the ring), t.y = minor radius (tube thickness).
export const sdTorus = /* @__PURE__ */ Fn(([p, t]: [N, N]) => {
  const q = vec2(length(p.xz).sub(t.x), p.y);
  return length(q).sub(t.y);
});

// rotate(p, x, y, z): three Euler-style rotations applied X, Z, Y (matches
// the reference's order: matx * matz * maty * p).
export const rotate = /* @__PURE__ */ Fn(([p, ax, ay, az]: [N, N, N, N]) => {
  const cx = cos(ax);
  const sx = sin(ax);
  const matx = mat3(
    1, 0, 0,
    0, cx, sx.negate(),
    0, sx, cx,
  );
  const cy = cos(ay);
  const sy = sin(ay);
  const maty = mat3(
    cy, 0, sy,
    0, 1, 0,
    sy.negate(), 0, cy,
  );
  const cz = cos(az);
  const sz = sin(az);
  const matz = mat3(
    cz, sz.negate(), 0,
    sz, cz, 0,
    0, 0, 1,
  );
  return matx.mul(matz).mul(maty).mul(p);
});

// CalcOffset(octave): produces the (offset.x, offset.y) where the given
// bloom octave is stored within the packed mipmap-tree texture. Used by both
// buffer2 (writing) and the composite (reading).
export const calcOffset = /* @__PURE__ */ Fn(([octave]: [N]) => {
  // Mirrors CalcOffset() from buffer2_f.glsl. Each math step is annotated as
  // `N` so TS doesn't try to narrow the result of `.mul()`/`.add()` between
  // Node<"float"> and Node<"vec3"> (which it sometimes does when one operand
  // is the wide `any` type).
  const padding: N = vec2(10.0, 10.0).div(uResolution);
  const stepFlag: N = min(float(1.0), floor(octave.div(3.0)));
  const offX: N = stepFlag.mul(padding.x.add(0.25)).negate();
  const offY: N = float(1.0).sub(float(1.0).div(pow(float(2.0), octave))).negate()
    .sub(padding.y.mul(octave))
    .add(stepFlag.mul(0.35));
  return vec2(offX, offY);
});
