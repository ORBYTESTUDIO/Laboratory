// Shared arm structure for stars, dust and HII regions so they stay coherent.

// Per-arm density weight. Real spiral galaxies are rarely symmetric — some arms
// carry more stars/gas than others. Length of this array sets the branch count.
export const ARM_WEIGHTS = [1.0, 0.7, 1.3, 0.5, 0.9];

// Tunes how tightly the spiral curls. Higher = more wrapping around the center.
export const LOG_SPIN_FACTOR = 4;

export const ARM_COUNT = ARM_WEIGHTS.length;

const totalWeight = ARM_WEIGHTS.reduce((s, w) => s + w, 0);

const cumulative: number[] = (() => {
  const acc: number[] = [];
  let running = 0;
  for (const w of ARM_WEIGHTS) {
    running += w / totalWeight;
    acc.push(running);
  }
  return acc;
})();

// Sample an arm index biased by ARM_WEIGHTS (denser arms get more particles).
export function pickArm(): number {
  const roll = Math.random();
  for (let i = 0; i < cumulative.length; i++) {
    if (roll < cumulative[i]) return i;
  }
  return cumulative.length - 1;
}

// Logarithmic spiral: tightly curled near the center, opens up at the rim.
// Closer to how real spiral arms look than a linear `angle = r * spin`.
export function logSpinAngle(radius: number, spin: number): number {
  return Math.log(1 + radius) * spin * LOG_SPIN_FACTOR;
}
