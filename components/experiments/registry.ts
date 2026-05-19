export type ExperimentMeta = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  cameraPosition?: [number, number, number];
  fov?: number;
  background?: string;
};

export const experiments: ExperimentMeta[] = [
  {
    slug: 'rotating-cube',
    title: 'Rotating Cube',
    description: 'Hello world de React Three Fiber: un cubo que rota sobre sus ejes.',
    tags: ['intro', 'animation'],
  },
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
    slug: 'black-hole',
    title: 'Black hole (Gargantua, paso 1)',
    description: 'Horizonte de eventos + disco de acreción de partículas con rotación diferencial + photon ring billboarded + bloom. Sin lensing aún.',
    tags: ['shaders', 'particles', 'wip'],
    cameraPosition: [0, 0.6, 5.8],
    fov: 50,
    background: '#000000',
  },
];

export function getExperiment(slug: string): ExperimentMeta | undefined {
  return experiments.find((e) => e.slug === slug);
}
