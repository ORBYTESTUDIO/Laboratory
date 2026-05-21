// Buffer2 — "mipmap tree": packs 8 progressively-downsampled copies of
// buffer1 into a single texture, placed at CalcOffset locations. Since the
// raymarch RT has no real mipmaps, we manually oversample each octave to
// avoid aliasing when downsampling — higher octaves use 16x16 grids, lower
// ones get away with smaller grids. Faithfully ported from buffer2_f.glsl.

import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  Loop,
  If,
  uv,
  pow,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import {
  tBuffer1,
  uResolution,
  calcOffset,
} from './tsl-helpers';

// See tsl-helpers for the rationale on using `any` for Fn parameter types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

// In-bounds check for a scaled coord — matches the reference's
// `if (coord.x < 0.0 || coord.x > 1.0 || ...)` early-return.
const inUnitSquare = /* @__PURE__ */ Fn(([c]: [N]) => {
  return c.x.greaterThanEqual(0).and(c.x.lessThanEqual(1))
    .and(c.y.greaterThanEqual(0)).and(c.y.lessThanEqual(1));
});

// Single-sample grab (octave 1). No oversampling needed since octave 1 is
// half-resolution and the source pixels aren't that aliased.
const grab1 = /* @__PURE__ */ Fn(([coord, octave, offset]: [N, N, N]) => {
  const scale = pow(float(2.0), octave);
  const c = coord.add(offset).mul(scale);
  const out = vec3(0, 0, 0).toVar();
  If(inUnitSquare(c), () => {
    out.assign(tBuffer1.sample(c).rgb);
  });
  return out;
});

// Box-filter oversampling factory: builds a Fn that averages a (side x side)
// grid of source pixels. `side` is a JS compile-time constant so TSL can
// emit the Loop with a fixed bound.
function makeGrab(side: number) {
  return Fn(([coord, octave, offset]: [N, N, N]) => {
    const scale = pow(float(2.0), octave);
    const c = coord.add(offset).mul(scale);
    const out = vec3(0, 0, 0).toVar();
    If(inUnitSquare(c), () => {
      const acc = vec3(0, 0, 0).toVar();
      const sideF = float(side);
      Loop(side, ({ i }: { i: N }) => {
        Loop(side, ({ i: j }: { i: N }) => {
          // Offset within one source pixel — divides scale by oversampling
          // so the (side x side) grid covers exactly one source texel.
          const off = vec2(i, j).div(uResolution).mul(scale).div(sideF);
          acc.assign(acc.add(tBuffer1.sample(c.add(off)).rgb));
        });
      });
      out.assign(acc.div(sideF.mul(sideF)));
    });
    return out;
  });
}

const grab4 = /* @__PURE__ */ makeGrab(4);
const grab8 = /* @__PURE__ */ makeGrab(8);
const grab16 = /* @__PURE__ */ makeGrab(16);

const buffer2Frag = /* @__PURE__ */ Fn(() => {
  const uv2 = uv();
  const color = vec3(0, 0, 0).toVar();

  // 8 octaves stacked into the packed texture. Each octave reads buffer1
  // at successively smaller scale; higher octaves get more aggressive
  // oversampling to suppress aliasing on the heavy downsample.
  color.assign(color.add(grab1(uv2, float(1.0), vec2(0, 0))));
  color.assign(color.add(grab4(uv2, float(2.0), calcOffset(float(1.0)))));
  color.assign(color.add(grab8(uv2, float(3.0), calcOffset(float(2.0)))));
  color.assign(color.add(grab16(uv2, float(4.0), calcOffset(float(3.0)))));
  color.assign(color.add(grab16(uv2, float(5.0), calcOffset(float(4.0)))));
  color.assign(color.add(grab16(uv2, float(6.0), calcOffset(float(5.0)))));
  color.assign(color.add(grab16(uv2, float(7.0), calcOffset(float(6.0)))));
  color.assign(color.add(grab16(uv2, float(8.0), calcOffset(float(7.0)))));

  return vec4(color, 1.0);
});

export function createBuffer2Material(): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = buffer2Frag();
  m.depthTest = false;
  m.depthWrite = false;
  m.transparent = false;
  return m;
}
