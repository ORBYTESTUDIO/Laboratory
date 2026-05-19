export type ExperimentMeta = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
};

export const experiments: ExperimentMeta[] = [
  {
    slug: 'rotating-cube',
    title: 'Rotating Cube',
    description: 'Hello world de React Three Fiber: un cubo que rota sobre sus ejes.',
    tags: ['intro', 'animation'],
  },
];

export function getExperiment(slug: string): ExperimentMeta | undefined {
  return experiments.find((e) => e.slug === slug);
}
