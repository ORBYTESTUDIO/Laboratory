// Port of `src/Experience/Utils/TSL-utils.js` from the Singularity project.
//
// Trimmed to the functions actually called by BlackHole.js's shader body:
//   whiteNoise2D, lengthSqrt, smoothRange, rotateAxis, ColorRamp3_BSpline
//   (+ CatmulRom dependency), vecToFac, srgbToLinear, linearToSrgb.
//
// The implementations are verbatim. The other helpers in the source file
// (Rot, rotateX/Y/Z, emission, murmurHash21, hash21, _hash, noise21, hash12,
// fbm, brickTexture, ColorRamp4_BSpline, etc.) are imported but unused by the
// shader; omitted here to avoid TS friction with TSL bit-ops typing in 0.184.

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Fn,
  If,
  add,
  clamp,
  cos,
  dot,
  float,
  fract,
  mat3,
  mix,
  mul,
  pow,
  sin,
  step,
  sub,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

const rotateAxis = Fn(([axis_immutable, angle_immutable]: any[]) => {
  const angle = float(angle_immutable).toVar();
  const axis = vec3(axis_immutable).toVar();
  const s = float(sin(angle)).toVar();
  const c = float(cos(angle)).toVar();
  const oc = float(sub(1.0, c)).toVar();
  return mat3(
    oc.mul(axis.x).mul(axis.x).add(c),
    oc.mul(axis.x).mul(axis.y).sub(axis.z.mul(s)),
    oc.mul(axis.z).mul(axis.x).add(axis.y.mul(s)),
    oc.mul(axis.x).mul(axis.y).add(axis.z.mul(s)),
    oc.mul(axis.y).mul(axis.y).add(c),
    oc.mul(axis.y).mul(axis.z).sub(axis.x.mul(s)),
    oc.mul(axis.z).mul(axis.x).sub(axis.y.mul(s)),
    oc.mul(axis.y).mul(axis.z).add(axis.x.mul(s)),
    oc.mul(axis.z).mul(axis.z).add(c),
  );
}).setLayout({
  name: 'rotateAxis',
  type: 'mat3',
  inputs: [
    { name: 'axis', type: 'vec3' },
    { name: 'angle', type: 'float' },
  ],
} as any);

const srgbToLinear = Fn(([rgb]: any[]) =>
  mix(
    rgb.div(12.92),
    (pow as any)(add(rgb, 0.055).div(1.055), vec3(2.4)),
    step(0.04045 as any, rgb as any),
  ),
);

const linearToSrgb = Fn(([lin]: any[]) => {
  const low = lin.mul(12.92);
  const high = (pow as any)(lin, vec3(1.0 / 2.4)).mul(1.055).sub(0.055);
  return mix(low, high, step(0.0031308 as any, lin as any));
});

const vecToFac = Fn(([vector]: any[]) =>
  vector.r.mul(0.2126).add(vector.g.mul(0.7152)).add(vector.b.mul(0.0722)).toVar(),
);

const CatmulRom = Fn(([T, D, C, B, A]: any[]) =>
  mul(
    0.5,
    mul(2.0, B)
      .add(A.negate().add(C).mul(T))
      .add(
        mul(2.0, A)
          .sub(mul(5.0, B))
          .add(mul(4.0, C))
          .sub(D)
          .mul(T)
          .mul(T),
      )
      .add(
        A.negate()
          .add(mul(3.0, B))
          .sub(mul(3.0, C))
          .add(D)
          .mul(T)
          .mul(T)
          .mul(T),
      ),
  ),
{ T: 'float', D: 'vec3', C: 'vec3', B: 'vec3', A: 'vec3', return: 'vec3' } as any);

const ColorRamp3_BSpline = Fn(([T, A, B, C]: any[]) => {
  const AB = B.w.sub(A.w);
  const BC = C.w.sub(B.w);

  const iAB = T.sub(A.w).div(AB).saturate();
  const iBC = T.sub(B.w).div(BC).saturate();

  const p = vec3(sub(1.0, iAB), iAB.sub(iBC), iBC);

  const cA = CatmulRom(p.x, A.xyz, A.xyz, B.xyz, C.xyz);
  const cB = CatmulRom(p.y, A.xyz, B.xyz, C.xyz, C.xyz);
  const cC = C.xyz;

  If(T.lessThan(B.w), () => cA.xyz);
  If(T.lessThan(C.w), () => cB.xyz);
  return cC.xyz;
}, { T: 'float', A: 'vec4', B: 'vec4', C: 'vec4', return: 'vec3' } as any);

const whiteNoise2D = (coord: any) =>
  fract(sin(dot(coord, vec2(12.9898, 78.233))).mul(43758.5453));

const lengthSqrt = Fn(([v]: any[]) =>
  v.x.mul(v.x).add(v.y.mul(v.y)).add(v.z.mul(v.z)).sqrt(),
);

const smoothRange = Fn(([value, inMin, inMax, outMin, outMax]: any[]) => {
  const t = clamp(value.sub(inMin).div(inMax.sub(inMin)), 0.0, 1.0);
  const smoothT = t.mul(t).mul(float(3.0).sub(t.mul(2.0)));
  return mix(outMin, outMax, smoothT);
}, {
  value: 'float', inMin: 'float', inMax: 'float',
  outMin: 'float', outMax: 'float', return: 'float',
} as any);

// Re-export vec4 so callers (material.ts) can use the same instance if needed.
export { vec4 };

export {
  rotateAxis,
  srgbToLinear,
  linearToSrgb,
  vecToFac,
  CatmulRom,
  ColorRamp3_BSpline,
  whiteNoise2D,
  lengthSqrt,
  smoothRange,
};
