// Buffer4 — vertical gaussian blur of buffer3. Same 5-tap bilinear kernel,
// just rotated 90°. Together buffer3 + buffer4 = a separable 2D gaussian on
// the mipmap-tree texture, giving the final bloom mip chain that the
// composite samples from.

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
import { tBuffer3, uResolution } from './tsl-helpers';

const WEIGHTS = [0.19638062, 0.29675293, 0.09442139, 0.01037598, 0.00025940];
const OFFSETS = [0.0, 1.41176471, 3.29411765, 5.17647059, 7.05882353];

const buffer4Frag = /* @__PURE__ */ Fn(() => {
  const uv2 = uv();
  const color = vec3(0, 0, 0).toVar();
  const weightSum = float(0).toVar();

  If(uv2.x.lessThan(0.52), () => {
    color.assign(color.add(tBuffer3.sample(uv2).rgb.mul(WEIGHTS[0])));
    weightSum.assign(weightSum.add(WEIGHTS[0]));

    for (let i = 1; i < 5; i++) {
      const offset = float(OFFSETS[i]).div(uResolution.y);
      const dir = vec2(0, offset.mul(0.5));
      color.assign(color.add(tBuffer3.sample(uv2.add(dir)).rgb.mul(WEIGHTS[i])));
      color.assign(color.add(tBuffer3.sample(uv2.sub(dir)).rgb.mul(WEIGHTS[i])));
      weightSum.assign(weightSum.add(WEIGHTS[i] * 2));
    }

    color.assign(color.div(weightSum));
  });

  return vec4(color, 1.0);
});

export function createBuffer4Material(): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = buffer4Frag();
  m.depthTest = false;
  m.depthWrite = false;
  m.transparent = false;
  return m;
}
