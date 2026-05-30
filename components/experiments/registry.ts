// A clickable point inside a scene that navigates to a child node. Rendered as
// a glowing marker; `position` is in the scene's own 3D space.
export type Hotspot = {
  id: string;
  position: [number, number, number];
  label: string;
  // Slug of the node this hotspot navigates to (must be a child of this node).
  target: string;
  color?: string;
};

export type ExperimentMeta = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  // Navigation graph: `parent` is the slug of the containing node (root nodes
  // omit it); `hotspots` are the clickable points leading to child nodes.
  parent?: string;
  hotspots?: Hotspot[];
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
    title: 'ORBYTE Labs: Galaxy',
    description: 'Particle system with a spiral distribution. 10k points, additive blending, color lerp from core to edge.',
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
    hotspots: [
      {
        id: 'to-black-hole',
        // On a spiral arm, lifted slightly above the disk plane.
        position: [2.6, 0.35, 1.2],
        label: 'Black hole',
        target: 'black-hole-singularity',
        color: '#ffd0a0',
      },
      {
        // Opposite arm — the nebula-flight shader experiment.
        id: 'to-nebula-flight',
        position: [-2.8, 0.3, 1.6],
        label: 'Nebula flight',
        target: 'nebula-flight',
        color: '#b39dff',
      },
      {
        // Far arm, below center — the warp-tunnel shader experiment.
        id: 'to-warp-tunnel',
        position: [1.4, 0.5, -2.8],
        label: 'Warp tunnel',
        target: 'warp-tunnel',
        color: '#7fe9ff',
      },
      {
        // Near-far arm — the tribulence shader experiment.
        id: 'to-tribulence',
        position: [-1.7, 0.45, -2.3],
        label: 'Tribulence',
        target: 'tribulence',
        color: '#ff9ec4',
      },
    ],
  },
  {
    slug: 'black-hole-singularity',
    title: 'Black Hole: Singularity',
    description: 'Black hole as a bounded scene-node — the skill\'s Singularity path. WebGPURenderer + TSL: unit sphere DoubleSide, object-space raymarch with gravitational steering, z-band quadratic shaping, Catmull-Rom B-spline 3-stop ramp, pseudo-normal edge sharpening, front-to-back luminance-weighted compositing, equirect starfield, pass()+bloom() in TSL.',
    tags: ['shaders', 'raymarching', 'tsl', 'webgpu', 'cinematic'],
    customCanvas: true,
    parent: 'galaxy',
  },
  {
    slug: 'nebula-flight',
    title: 'Nebula Flight',
    description:
      'Vuelo infinito por una nebulosa — shader de Orblivius portado a un quad fullscreen (GLSL ES 3.00). Túnel de estrellas procedural sobre ray-marching de nubes intergalácticas, con color HSV por densidad. Arrastrá para orientar la vista.',
    tags: ['shaders', 'raymarching', 'shadertoy', 'fullscreen'],
    parent: 'galaxy',
    // Fragment fullscreen estilo Shadertoy: monta su propio Canvas sin OrbitControls.
    customCanvas: true,
  },
  {
    slug: 'warp-tunnel',
    title: 'Warp Tunnel',
    description:
      'Túnel warp por ray-marching: un tubo deformado con FBM, planetas con intersección analítica, nebulosa de fondo, sol y lens-flare. El radio y el color laten con un espectro de audio sintético (iChannel3). Ruido y FFT generados por código; fondo y planetas desde texturas del lab.',
    tags: ['shaders', 'raymarching', 'shadertoy', 'fullscreen'],
    parent: 'galaxy',
    customCanvas: true,
  },
  {
    slug: 'tribulence',
    title: 'Tribulence',
    description:
      'Turbulencia por modulación de frecuencia: ondas triangulares plegadas e iteradas con rotación del ángulo áureo, coloreadas con un kernel 1/(x²+k). Puramente matemático, sin texturas.',
    tags: ['shaders', 'fullscreen', 'shadertoy'],
    parent: 'galaxy',
    customCanvas: true,
  },
];

// The root of the navigation graph: the node shown at `/`. Everything else is
// reached by walking parent → child from here.
export const ROOT_SLUG = 'galaxy';

export function getExperiment(slug: string): ExperimentMeta | undefined {
  return experiments.find((e) => e.slug === slug);
}

// Walk parent links from a node up to the root, returning the chain ordered
// root → … → node. Used for breadcrumbs and to derive a node's URL.
export function getNodePath(slug: string): ExperimentMeta[] {
  const chain: ExperimentMeta[] = [];
  let current = getExperiment(slug);
  const seen = new Set<string>();
  while (current && !seen.has(current.slug)) {
    seen.add(current.slug);
    chain.unshift(current);
    current = current.parent ? getExperiment(current.parent) : undefined;
  }
  return chain;
}

// The URL segments for a node (everything below the implicit root at `/`).
// Root → [] (i.e. `/`); a child of root → [childSlug]; and so on.
export function getNodeHref(slug: string): string {
  const segments = getNodePath(slug)
    .filter((n) => n.slug !== ROOT_SLUG)
    .map((n) => n.slug);
  return '/' + segments.join('/');
}

// Resolve URL path segments to a leaf node, validating that each segment is a
// real node whose parent is the previous segment (root for the first). Returns
// the leaf node, or undefined if the path doesn't describe a valid chain.
export function resolvePath(segments: string[] | undefined): ExperimentMeta | undefined {
  if (!segments || segments.length === 0) return getExperiment(ROOT_SLUG);

  let expectedParent = ROOT_SLUG;
  let node: ExperimentMeta | undefined;
  for (const slug of segments) {
    node = getExperiment(slug);
    if (!node || node.parent !== expectedParent) return undefined;
    expectedParent = slug;
  }
  return node;
}

// Direct children of a node (used to render hotspots / list sub-nodes).
export function getChildren(slug: string): ExperimentMeta[] {
  return experiments.filter((e) => e.parent === slug);
}

// Every valid URL path through the graph, for generateStaticParams. The root
// (`/`, empty path) is represented separately by the optional catch-all.
export function allNodePaths(): string[][] {
  return experiments
    .filter((e) => e.slug !== ROOT_SLUG)
    .map((e) => getNodePath(e.slug).filter((n) => n.slug !== ROOT_SLUG).map((n) => n.slug));
}
