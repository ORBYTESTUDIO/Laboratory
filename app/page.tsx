import Link from 'next/link';
import { experiments } from '@/components/experiments/registry';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-semibold tracking-tight">Laboratorio</h1>
          <p className="text-neutral-400 mt-2 max-w-xl">
            Experimentos con three.js y React Three Fiber. Bocetos, ideas y
            componentes que después viven en la web principal.
          </p>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {experiments.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/experiments/${e.slug}`}
                className="block h-full rounded-xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600 hover:bg-neutral-900/70 transition"
              >
                <h2 className="text-lg font-medium">{e.title}</h2>
                <p className="text-sm text-neutral-400 mt-1">{e.description}</p>
                {e.tags && e.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {e.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
