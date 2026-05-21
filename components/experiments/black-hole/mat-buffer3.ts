// Buffer3 — horizontal gaussian blur of the mipmap tree (buffer2). 5-tap
// bilinear-optimized kernel with the same weights/offsets as the reference.
// We only blur the left 52% of the texture (where the mipmap tree lives) —
// outside that region buffer4 will mask anyway and the extra work is wasted.

import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  If,
  uv,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { tBuffer2, uResolution } from './tsl-helpers';

// Bilinear-leveraged 5-tap kernel (covers 13 effective pixels per pass).
// These exact weights/offsets are from the reference shader.
const WEIGHTS = [0.19638062, 0.29675293, 0.09442139, 0.01037598, 0.00025940];
const OFFSETS = [0.0, 1.41176471, 3.29411765, 5.17647059, 7.05882353];

const buffer3Frag = /* @__PURE__ */ Fn(() => {
  const uv2 = uv();
  const color = vec3(0, 0, 0).toVar();
  const weightSum = float(0).toVar();

  If(uv2.x.lessThan(0.52), () => {
    // Center tap
    color.assign(color.add(tBuffer2.sample(uv2).rgb.mul(WEIGHTS[0])));
    weightSum.assign(weightSum.add(WEIGHTS[0]));

    // Symmetric pairs at offsets 1..4 (4 pairs = 8 extra samples).
    // The 0.5 scale on x matches the reference (it samples at half-step
    // intervals so adjacent octaves don't bleed across the mipmap padding).
    for (let i = 1; i < 5; i++) {
      const offset = float(OFFSETS[i]).div(uResolution.x);
      const dir = vec2(offset.mul(0.5), 0);
      color.assign(color.add(tBuffer2.sample(uv2.add(dir)).rgb.mul(WEIGHTS[i])));
      color.assign(color.add(tBuffer2.sample(uv2.sub(dir)).rgb.mul(WEIGHTS[i])));
      weightSum.assign(weightSum.add(WEIGHTS[i] * 2));
    }

    color.assign(color.div(weightSum));
  });

  return vec4(color, 1.0);
});

export function createBuffer3Material(): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = buffer3Frag();
  m.depthTest = false;
  m.depthWrite = false;
  m.transparent = false;
  return m;
}
