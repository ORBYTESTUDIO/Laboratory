# Laboratorio

Lab para experimentar con three.js / React Three Fiber. Los componentes que viven acá están pensados para portarse después a la web principal (sección `/laboratorio`).

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- Tailwind CSS 4
- three.js + `@react-three/fiber` + `@react-three/drei`

## Cómo correr

```bash
pnpm install
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Estructura

```
app/
  page.tsx                       Galería con todos los experimentos
  experiments/[slug]/page.tsx    Página individual de cada experimento
components/
  canvas-frame.tsx               Wrapper de <Canvas> con controls + suspense
  experiments/
    registry.ts                  Metadata (slug, title, description, tags)
    scene-loader.tsx             Mapping slug → Scene (client, ssr:false)
    <slug>/scene.tsx             Componente R3F del experimento
```

## Agregar un experimento

1. Crear `components/experiments/<slug>/scene.tsx` con `'use client'` y `export default function Scene()` que retorna los elementos R3F (mesh, lights, etc.).
2. Sumar la entrada al array `experiments` en `components/experiments/registry.ts`.
3. Agregar el `dynamic import` en el record `scenes` de `components/experiments/scene-loader.tsx`.

Eso es todo: la galería y la ruta `/experiments/<slug>` se generan automáticamente.

## Portar a la web principal

Cada `scene.tsx` es un client component R3F autocontenido. Para usarlo en otra app React/Next:

- En React puro (Vite/CRA): borrar la directiva `'use client'`, envolver en `<Canvas>` del propio proyecto.
- En Next App Router: importar con `dynamic(() => import(...), { ssr: false })` desde un client component, igual que acá.
