export type ExperimentMeta = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  cameraPosition?: [number, number, number];
  fov?: number;
  background?: string;
  // Device-pixel-ratio cap for the Canvas. Lower (e.g. [1, 1.5]) trades a bit
  // of sharpness for a big fragment-shader win on hiDPI screens.
  dpr?: number | [number, number];
  // Disable OrbitControls zoom (dolly) while keeping rotate/pan. Defaults to true.
  enableZoom?: boolean;
  // Disable OrbitControls pan (shift+drag) so the camera always orbits the
  // center instead of moving the look-at target. Defaults to true.
  enablePan?: boolean;
  // When true, the scene-loader skips its default CanvasFrame wrap so the
  // scene can render its own Canvas (e.g. with a WebGPU renderer).
  customCanvas?: boolean;
};

export const experiments: ExperimentMeta[] = [
  {
    slug: 'galaxy',
    title: 'Galaxia (paso 1)',
    description: 'Sistema de partículas con distribución en espiral. 100k puntos, additive blending, color lerp del núcleo al borde.',
    tags: ['particles', 'wip'],
    cameraPosition: [5, 7, 8],
    fov: 55,
    background: '#05050d',
    // Fragment-heavy (cloud FBM); cap dpr so hiDPI screens don't render 4× pixels.
    dpr: [1, 1.5],
    // No zoom: keeps the framing fixed and avoids the close-up overdraw cost.
    enableZoom: false,
    // No pan: the camera always orbits the galaxy's center.
    enablePan: false,
  },
  {
    slug: 'black-hole-singularity',
    title: 'Black Hole (Singularity TSL/WebGPU)',
    description: 'Black hole como scene-node bounded — Singularity path de la skill. WebGPURenderer + TSL: unit sphere DoubleSide, raymarch en object space con steering gravitacional, z-band quadratic shaping, Catmull-Rom B-spline 3-stop ramp, pseudo-normal edge sharpening, compositing front-to-back luminance-weighted, equirect starfield, pass()+bloom() en TSL.',
    tags: ['shaders', 'raymarching', 'tsl', 'webgpu', 'cinematic'],
    customCanvas: true,
  },
];

export function getExperiment(slug: string): ExperimentMeta | undefined {
  return experiments.find((e) => e.slug === slug);
}
