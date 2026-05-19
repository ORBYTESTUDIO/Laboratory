import Link from 'next/link';
import { notFound } from 'next/navigation';
import { experiments, getExperiment } from '@/components/experiments/registry';
import { SceneViewer } from '@/components/experiments/scene-loader';

export function generateStaticParams() {
  return experiments.map((e) => ({ slug: e.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export default async function ExperimentPage({ params }: Props) {
  const { slug } = await params;
  const meta = getExperiment(slug);

  if (!meta) notFound();

  return (
    <main className="h-screen overflow-hidden bg-neutral-950 text-neutral-50 flex flex-col">
      <header className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
        <Link
          href="/"
          className="text-sm text-neutral-400 hover:text-neutral-100 transition"
        >
          ← Laboratorio
        </Link>
        <h1 className="text-sm font-medium">{meta.title}</h1>
        <span className="w-24" />
      </header>
      <div className="flex-1 min-h-0 relative">
        <SceneViewer slug={slug} />
      </div>
      <footer className="px-6 py-3 border-t border-neutral-800 text-xs text-neutral-500 shrink-0">
        {meta.description}
      </footer>
    </main>
  );
}
