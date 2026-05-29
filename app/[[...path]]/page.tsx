import { notFound } from 'next/navigation';
import { allNodePaths, resolvePath } from '@/components/experiments/registry';
import { SceneViewer } from '@/components/experiments/scene-loader';
import { HotspotHint, NavBar } from '@/components/experiments/nav-chrome';
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

  return (
    <main className="h-screen overflow-hidden bg-neutral-950 text-neutral-50 flex flex-col">
      <header className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <NavBar slug={node.slug} />
      </header>
      <div className="flex-1 min-h-0 relative">
        <SaturationFrame>
          <SceneViewer slug={node.slug} />
        </SaturationFrame>
        <HotspotHint hasHotspots={hasHotspots} />
      </div>
      <footer className="px-6 py-3 border-t border-neutral-800 text-xs text-neutral-500 shrink-0">
        {node.description}
      </footer>
    </main>
  );
}
