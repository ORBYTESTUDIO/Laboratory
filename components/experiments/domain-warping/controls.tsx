'use client';

// Panel de controles HTML superpuesto al canvas (no usa ninguna lib de UI 3D).
// Mantiene el estado en React; el scene lo lee y lo escribe a los uniforms cada
// frame. Estética del lab: negro translúcido, borde sutil, tipografía uppercase.

export type WarpParams = {
  warp: number; // 0 = fbm puro
  layers: number; // 0, 1, 2
  scale: number; // zoom
  speed: number; // velocidad de animación
  color: boolean; // grises vs paleta
};

export const WARP_DEFAULTS: WarpParams = {
  warp: 0.6,
  layers: 2,
  scale: 3,
  speed: 0.2,
  color: true,
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[10px] md:text-xs uppercase nb text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-200">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-300 cursor-pointer"
      />
    </label>
  );
}

export function WarpControls({
  params,
  setParams,
}: {
  params: WarpParams;
  setParams: (p: WarpParams) => void;
}) {
  const set = <K extends keyof WarpParams>(key: K, v: WarpParams[K]) =>
    setParams({ ...params, [key]: v });

  return (
    <div className="pointer-events-auto absolute right-5 md:right-10 top-1/2 z-30 flex w-52 -translate-y-1/2 flex-col gap-4 rounded-xl border border-neutral-700/60 bg-black/50 p-4 backdrop-blur-sm">
      <div className="text-xs uppercase nb text-neutral-300">Domain warping</div>

      <Slider label="Warp" value={params.warp} min={0} max={1.5} step={0.01} onChange={(v) => set('warp', v)} />
      <Slider label="Capas" value={params.layers} min={0} max={2} step={1} onChange={(v) => set('layers', v)} />
      <Slider label="Escala" value={params.scale} min={1} max={6} step={0.1} onChange={(v) => set('scale', v)} />
      <Slider label="Velocidad" value={params.speed} min={0} max={1} step={0.01} onChange={(v) => set('speed', v)} />

      <button
        onClick={() => set('color', !params.color)}
        className="cursor-pointer rounded-md border border-neutral-700/60 px-3 py-1.5 text-[10px] md:text-xs uppercase nb text-neutral-300 hover:bg-white/5 duration-200"
      >
        {params.color ? 'Color: paleta' : 'Color: grises'}
      </button>

      <p className="text-[10px] leading-relaxed text-neutral-500">
        Bajá Warp a 0 → FBM puro. Subilo y cambiá las capas para ver cómo se
        deforma el espacio.
      </p>
    </div>
  );
}
