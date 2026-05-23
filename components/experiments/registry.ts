export type ExperimentMeta = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  cameraPosition?: [number, number, number];
  fov?: number;
  background?: string;
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
  },
  {
    slug: 'black-hole-cinematic',
    title: 'Black Hole (cinematic GLSL)',
    description: 'Black hole raymarcheado en GLSL puro siguiendo la skill cinematic-raymarching. Shell sphere centrada en cámara (BackSide), 320 pasos adaptativos, lensing inverso-cubo, disco de acreción con FBM polar + Keplerian swirl, Doppler beaming + red/blueshift, starfield procedural, ACES Filmic + gamma in-shader, Bloom + Vignette.',
    tags: ['shaders', 'raymarching', 'glsl', 'postfx', 'cinematic'],
    cameraPosition: [0, 4, 22],
    fov: 45,
    background: '#000000',
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
