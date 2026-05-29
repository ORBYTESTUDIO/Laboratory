import { notFound } from 'next/navigation';
import { allNodePaths, resolvePath } from '@/components/experiments/registry';
import { SceneViewer } from '@/components/experiments/scene-loader';
import {
  HotspotHint,
  LabHeader,
  NavBreadcrumb,
  SceneCaption,
} from '@/components/experiments/nav-chrome';
import { SaturationFrame } from '@/components/experiments/saturation-frame';

// Pre-render the root (`/`) plus every valid path through the node graph.
export function generateStaticParams() {
  return [
    { path: [] as string[] },
    ...allNodePaths().map((p) => ({ path: p })),
  ];
}

type Props = { params: Promise<{ path?: string[] }> };

export default async function NodePage({ params }: Props) {
  const { path } = await params;
  const node = resolvePath(path);

  if (!node) notFound();

  const hasHotspots = (node.hotspots?.length ?? 0) > 0;

  // El canvas ocupa toda la pantalla; la navegación (header + breadcrumb) y la
  // descripción se superponen como overlays sobre él.
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-50">
      <SaturationFrame>
        <SceneViewer slug={node.slug} />
      </SaturationFrame>

      <LabHeader />
      <NavBreadcrumb slug={node.slug} />
      <SceneCaption title={node.title} description={node.description} />
      <HotspotHint hasHotspots={hasHotspots} />
    </main>
  );
}
