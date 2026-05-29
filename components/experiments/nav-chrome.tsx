'use client';

import { useEffect, useState } from 'react';
import { getNodePath, ROOT_SLUG } from './registry';
import { useDive } from './transition';
import RadialButton from '@/components/ui/RadialButton';

// Web principal del estudio. Los links STUDIO / CONTACT del header de Labs
// vuelven al sitio de Orbyte. Cambiar acá si el dominio difiere.
const STUDIO_URL = 'https://orbyte.studio';
const CONTACT_URL = `${STUDIO_URL}/contacto`;

// Header superpuesto sobre el canvas (no empuja el layout). Mantiene las
// clases del header del sitio principal de Orbyte:
//  - Izquierda: logo + idioma + sonido. Idioma y sonido son placeholders
//    visuales por ahora (se cablean más adelante).
//  - Derecha: STUDIO (link al estudio) y CONTACT (RadialButton).
// El contenedor no captura punteros (pointer-events-none) para no bloquear el
// OrbitControls del canvas; sólo los elementos interactivos lo recapturan.
// z-40 (no z-50) para quedar por debajo del fundido a negro de la transición.
export function LabHeader() {
  const dive = useDive();
  const [soundOn, setSoundOn] = useState(false);

  return (
    <header className="pointer-events-none fixed top-0 z-40 w-full h-8 md:h-13 my-5 md:my-10 px-5 md:px-10 gap-5 flex justify-between">
      {/* Izquierda: logo, idioma, sonido */}
      <div className="pointer-events-auto flex items-center text-xs md:text-base gap-4 md:gap-10">
        <img
          src="/logo/iso.svg"
          alt="Logo"
          className="h-full cursor-pointer opacity-100 hover:opacity-50 duration-200"
          id="logo"
          onClick={() => dive.start(ROOT_SLUG)}
        />

        {/* Idioma — placeholder visual, sin i18n por ahora (Lab solo en inglés). */}
        <button className="text-xs md:text-base nb cursor-pointer opacity-100 hover:opacity-50 duration-200">
          EN
        </button>

        {/* Sonido — placeholder visual: togglea estado pero aún no hay audio. */}
        <button
          className={`text-xs uppercase md:text-base h-full md:h-auto items-center -translate-x-1 nb flex sound ${
            soundOn ? 'sound-on' : 'sound-off'
          }`}
          onClick={() => setSoundOn((prev) => !prev)}
        >
          {soundOn ? 'Sound On' : 'Sound Off'}
        </button>
      </div>

      {/* Derecha: STUDIO + CONTACT */}
      <nav className="pointer-events-auto block uppercase">
        <ul className="flex items-center pl-2 justify-end gap-4 md:gap-10">
          <li className="text-xs md:text-base h-8 md:h-13 flex items-center">
            <a
              href={STUDIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer whitespace-nowrap opacity-100 h-full md:h-auto flex items-center hover:opacity-50 nb duration-200"
            >
              Studio
            </a>
          </li>
          <div className="h-8 md:h-13 text-xs md:text-base">
            <RadialButton
              width="100%"
              height="100%"
              onClick={() =>
                window.open(CONTACT_URL, '_blank', 'noopener,noreferrer')
              }
            >
              Contact
            </RadialButton>
          </div>
        </ul>
      </nav>
    </header>
  );
}

// Breadcrumb / back: la navegación real entre nodos de Labs, ahora superpuesta
// sobre el canvas (debajo del header). Sólo aparece cuando hay un padre al que
// volver; en el nodo raíz el logo ya cumple esa función. Navega vía dive fade.
export function NavBreadcrumb({ slug }: { slug: string }) {
  const dive = useDive();
  const trail = getNodePath(slug); // root → … → current
  const parent = trail.length > 1 ? trail[trail.length - 2] : null;

  if (!parent) return null;

  // Mismos márgenes laterales que el header (px-5 md:px-10) y misma tipografía
  // (text-xs md:text-base, uppercase, nb). Se ubica como segunda fila, debajo
  // del header (que mide h-8 md:h-13 + my-5 md:my-10).
  return (
    <div className="pointer-events-none absolute left-5 md:left-10 top-16 md:top-32 z-30 flex items-center text-xs md:text-base gap-4 md:gap-10">
      <button
        onClick={() => dive.start(parent.slug)}
        className="pointer-events-auto cursor-pointer uppercase nb text-neutral-400 hover:opacity-50 duration-200"
      >
        Back
      </button>

      <nav className="flex items-center gap-4 md:gap-10 text-neutral-400">
        {trail.map((n, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={n.slug} className="flex items-center gap-4 md:gap-10 uppercase nb">
              {i > 0 && <span className="text-neutral-600">›</span>}
              {isLast ? (
                <span className="text-neutral-100">{n.title}</span>
              ) : (
                <button
                  onClick={() => dive.start(n.slug)}
                  className="pointer-events-auto cursor-pointer hover:opacity-50 duration-200"
                >
                  {n.title}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

// Discoverability: a hint telling the user the glowing points are clickable.
// Subtle by default; more prominent the very first visit (once per browser).
export function HotspotHint({ hasHotspots }: { hasHotspots: boolean }) {
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    if (!hasHotspots) return;
    try {
      if (!localStorage.getItem('lab-onboarded')) {
        setFirstVisit(true);
        localStorage.setItem('lab-onboarded', '1');
      }
    } catch {
      // localStorage unavailable (private mode etc.) — just stay subtle.
    }
  }, [hasHotspots]);

  if (!hasHotspots) return null;

  // Mismo margen inferior y lateral que el header (my-5 md:my-10 / px-5 md:px-10)
  // y tipografía text-xs md:text-base uppercase.
  return (
    <div
      style={{ pointerEvents: 'none' }}
      className="absolute inset-x-0 bottom-5 md:bottom-10 flex justify-center px-5 md:px-10"
    >
      <div
        className={
          'rounded-full border px-4 py-2 font-sans text-xs md:text-base uppercase nb backdrop-blur-sm transition ' +
          (firstVisit
            ? 'border-amber-300/60 bg-black/60 text-amber-100 animate-pulse'
            : 'border-neutral-700/60 bg-black/40 text-neutral-300')
        }
      >
        Click the glowing nodes to explore
      </div>
    </div>
  );
}

// Descripción del nodo, flotando como texto sobre el canvas (esquina inferior
// izquierda) en lugar del viejo footer. No captura punteros.
export function SceneCaption({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  // Mismos márgenes que el header (left-5 md:left-10, bottom-5 md:bottom-10) y
  // título con la tipografía del header (text-xs md:text-base, uppercase, nb).
  return (
    <div className="pointer-events-none absolute bottom-5 md:bottom-10 left-5 md:left-10 z-10 max-w-md">
      <h1 className="mb-2 text-xs md:text-base uppercase nb text-neutral-100">
        {title}
      </h1>
      <p className="text-xs md:text-sm leading-relaxed text-neutral-400">
        {description}
      </p>
    </div>
  );
}
