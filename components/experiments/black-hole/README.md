# Black hole (raymarched, TSL)

> Port directo de [MisterPrada/black-hole](https://github.com/MisterPrada/black-hole) — black hole **raymarcheado** con **5 passes ping-pong de render targets**, escrito íntegramente en **TSL** (Three Shading Language) sobre la `NodeMaterial` de Three.js 0.184.
>
> Shader original: [Shadertoy `lstSRS`](https://www.shadertoy.com/view/lstSRS).

A diferencia de la versión previa (basada en capas de partículas con post-effect de lensing), esta es una solución de raymarching real: por cada pixel se traza un rayo, se dobla por una aproximación geodésica `1/r²` paso a paso, se acumula contribución de un disco de gas volumétrico (SDF torus + multi-octave noise + textura `gas.jpg`) y se temporalmente blendea con el frame anterior al 90% para suprimir el noise de muestreo.

## Tabla de contenidos

- [Arquitectura — 5 passes](#arquitectura--5-passes)
- [Estructura de archivos](#estructura-de-archivos)
- [Cómo funciona cada pass](#cómo-funciona-cada-pass)
- [TSL: cosas que necesitás saber](#tsl-cosas-que-necesits-saber)
- [Performance](#performance)
- [Knobs](#knobs)
- [Diferencias con el reference](#diferencias-con-el-reference)

---

## Arquitectura — 5 passes

Cada frame, el `BlackHolePipeline` ejecuta 5 renders fullscreen secuenciales y un swap de ping-pong:

```
                                 noise.png    gas.jpg
                                     │           │
                                     ▼           ▼
                              ┌─────────────────────────┐
                              │ Pass 1: RAYMARCH        │
buffer1_previous ───feedback──│  200 samples / pixel    │──► buffer1_current
                              │  WarpSpace + GasDisc    │
                              │  + Haze + temporal blend│
                              └─────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │ Pass 2: MIPMAP TREE     │
                              │  Packs 8 octaves into 1 │──► buffer2
                              │  texture via oversample │
                              │  grids (1, 4², 8², 16²) │
                              └─────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │ Pass 3: H-BLUR (5-tap)  │──► buffer3
                              └─────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │ Pass 4: V-BLUR (5-tap)  │──► buffer4 (bloom)
                              └─────────────────────────┘
                                            │
                              ┌─────────────┴───┐
                              │ Pass 5:         │
buffer1_current ─────────────►│ COMPOSITE       │──► SCREEN
                              │ • color+bloom×0.08 │
buffer4 (bloom) ─────────────►│ • Reinhard       │
                              │ • power grade    │
                              │ • Kali starfield │
                              │   en los bordes  │
                              └─────────────────┘

[ swap buffer1_current ↔ buffer1_previous para el próximo frame ]
```

El pass 1 lee del frame anterior (vía `tBuffer1Prev`) → mezcla 90/10 → el ruido por-pixel del raymarch se promedia a través del tiempo. Es la misma técnica que tienen muchos path-tracers.

Los passes 2-4 implementan **bloom manual via packed mipmap tree**: en vez de generar mipmaps reales, el pass 2 copia el raymarched image a 8 escalas distintas dentro de un mismo texture (con `CalcOffset` ubicando cada octava), y los passes 3+4 le aplican un blur gaussiano separable. El composite después samplea las 8 octavas con bicubic y las acumula con pesos `1.0 / 1.5 / 1.0 / 1.5 / 1.8 / 1.0 / 1.0 / 1.0`.

---

## Estructura de archivos

```
components/experiments/black-hole/
  tsl-helpers.ts       Uniforms + TextureNodes módulo-level, helpers TSL
                       (rand, noise, sdTorus, rotate, pcurve, calcOffset)
  mat-buffer1.ts       Pass 1: raymarch (200 samples)
  mat-buffer2.ts       Pass 2: mipmap tree con oversampling
  mat-buffer3.ts       Pass 3: H-gaussian blur (5-tap)
  mat-buffer4.ts       Pass 4: V-gaussian blur (5-tap)
  mat-composite.ts     Pass 5: composite + tonemap + grade + Kali starfield
  pipeline.tsx         Orchestrator: 5 RTs + frame loop con gl.render manual
  scene.tsx            Wrapper que monta el pipeline

public/textures/black-hole/
  noise.png            256x256 noise texture del reference
  gas.jpg              Textura de gas para modular el disco
```

---

## Cómo funciona cada pass

### Pass 1 — raymarch ([mat-buffer1.ts](mat-buffer1.ts))

```glsl
// Pseudocódigo del loop principal
ray = camera ray a través del pixel
for (200 steps):
  WarpSpace(ray)         // dobla el ray hacia el centro por 1/r²
  ray.pos += ray.dir * stepLen
  GasDisc(color, alpha, ray.pos)   // SDF torus + multi-octave noise + gas.jpg
  Haze(color, ray.pos, alpha)      // glow del torus interior
color = mix(color, previous, 0.9)   // temporal accumulation
```

- **WarpSpace** es el truco clave que hace todo lensear: cada step, el vector dirección se desvía hacia el origen por una cantidad proporcional a `1/r²`. La suma de 200 desviaciones pequeñas aproxima razonablemente bien la geodésica de Schwarzschild en weak field.
- **GasDisc** es lo más caro del shader: para cada pixel × cada step, evalúa un `pcurve` radial, una `sdTorus`, hasta 10 octavas de noise procedural (que samplean `noise.png`), y una lookup en `gas.jpg` con coords radiales rotantes.
- **Haze** es un toro fino emisivo justo en `r=1.0` que da el bloom-disc brillante que abraza el horizon.
- El **dither inicial** del rayo (160 los primeros 50 frames, decae a `rand(uv)*2`) decorrela los pixels del temporal blend — sin esto la imagen quedaría pegada al primer frame.

### Pass 2 — mipmap tree ([mat-buffer2.ts](mat-buffer2.ts))

Empaqueta 8 octavas downsampleadas de buffer1 en una sola textura. Cada octava se renderea en una región distinta de buffer2 según `CalcOffset(octave)`. Como buffer1 no tiene mipmaps reales, el downsample manual hace **oversampling**:
- Octava 1: 1 sample
- Octava 2: 4×4 = 16 samples
- Octava 3: 8×8 = 64 samples
- Octavas 4-8: 16×16 = 256 samples cada una

Suena costoso pero la mayoría de los pixels caen fuera de la región activa de su octava y retornan 0 inmediatamente. El cost total es ~50× el de un pixel shader normal.

### Passes 3 + 4 — gaussian blur separable ([mat-buffer3.ts](mat-buffer3.ts), [mat-buffer4.ts](mat-buffer4.ts))

Filtro 5-tap bilineal-leveraged (cada tap aprovecha el filtro hardware para cubrir 2 pixels):

```
weights = [0.196, 0.297, 0.094, 0.0104, 0.000259]
offsets = [0.0, 1.41, 3.29, 5.18, 7.06]
```

El `if (uv.x < 0.52)` evita procesar la mitad derecha de la textura (donde no hay mipmap data, solo padding).

### Pass 5 — composite ([mat-composite.ts](mat-composite.ts))

Junta todo:

```glsl
color = buffer1(uv) + 0.08 * sum(8 octavas de buffer4 con pesos)
color *= 150.0                         // re-amplifica a HDR
color = pow(c, 1.5); c = c/(1+c); c = pow(c, 1/1.5)   // Reinhard-tweaked
color = c*c*(3-2c)                     // smoothstep contrast bump
color = pow(c, vec3(1.3, 1.2, 1.0))    // warm bias
color = clamp(c*1.01, 0, 1)
color = pow(c, 0.7/2.2)                // gamma "exposed"

// Mezclar con Kali starfield procedural en los bordes
stars = volumetric raymarch (20 steps × 14 iter, magic-formula folds)
finalColor = mix(color, stars*0.005, smoothstep(0.3, 1.3, distFromCenter))
```

El **Kali starfield** es la "magic formula" de Kali (`p = abs(p)/dot(p,p) - formuparam`, iterada). Cada step del raymarch hace tile-fold y acumula brillo. Da la sensación de cosmos detrás del black hole sin necesitar geometría real.

---

## TSL: cosas que necesitás saber

TSL es el sistema de nodos de Three.js que compila a GLSL (WebGL) o WGSL (WebGPU) en runtime. Algunas particularidades que importaron al portar:

### `.toVar()` para mutables

En TSL los nodos son **expresiones inmutables** por default. Para variables locales mutables (necesarias en loops con `+=`):

```ts
const color = vec3(0, 0, 0).toVar();   // mutable
Loop(SAMPLES, () => {
  color.assign(color.add(contribution));  // OK
});
```

Sin `.toVar()`, `.assign()` falla silenciosamente.

### `Fn` con parámetros tipados como `any`

Los TSL `Fn` reciben nodos shader como argumentos. La inferencia TS de los tipos polimórficos (un mismo Fn puede recibir float o vec3) es muy estricta, así que typamos los parámetros como `any` y dejamos que TSL valide en runtime:

```ts
type N = any;
export const noise = Fn(([x]: [N]) => { /* ... */ });
```

### `vec3(scalar)` no broadcastea en los tipos

GLSL permite `vec3(0.5)` para broadcast. TSL en TypeScript no — hay que escribir `vec3(0.5, 0.5, 0.5)`. Para operaciones como `mix(vec3, vec3, scalar)` sí broadcastea automáticamente, así que el `vec3(...)` wrapper del original se eliminó.

### `pow(vec3, vec3)` → `.pow(vec3)`

La función libre `pow()` está tipada solo para float. Para vec, usar la forma método: `node.pow(otherNode)`.

### TextureNodes módulo-level + `.value` mutable

Los `texture(new Texture())` en [tsl-helpers.ts](tsl-helpers.ts) crean placeholders. El pipeline reasigna `.value` cada frame (ping-pong de buffer1) o una sola vez al cargar (noise.png / gas.jpg). Los Fns cierran sobre estos nodos por closure, así que los cambios se reflejan en el siguiente render.

### React Compiler

R3F + Three.js es inherentemente imperativo: mutamos `mesh.material`, `tex.wrapS`, `rt.texture`, etc. El React Compiler de React 19 marca esto como error vía la regla `react-hooks/immutability`. `pipeline.tsx` la desactiva con `/* eslint-disable react-hooks/immutability */` — un escape hatch común para componentes R3F que orquestan render manualmente.

---

## Performance

A 1080p con quality=2 (= renderea a 540p):
- Pass 1 raymarch: ~200k pixels × 200 samples × (warpSpace + gasDisc + haze) — el más caro.
- Pass 2: ~50× el costo de un pixel shader normal por el oversampling.
- Passes 3+4: 10 taps cada uno, baratísimos.
- Pass 5: ~280 iters del Kali + 32 bicubic samples para bloom.

En una GPU discreta moderna (RTX 3060 o equivalente) corre ~60 fps a 1080p con quality=2. En iGPU laptop o mobile esperá 30-45 fps y considerá subir quality a 3-4.

El parámetro `quality` (default 2) divide la resolución de los buffers (no del canvas) — `quality=1` rendea a full-res, `quality=4` a un cuarto.

---

## Knobs

| Param | Default | Archivo | Sube → | Baja → |
|---|---|---|---|---|
| `SAMPLES` | 200 | [mat-buffer1.ts](mat-buffer1.ts) | Menos noise, más lento | Más noise, más rápido |
| `FAR` | 20 | [mat-buffer1.ts](mat-buffer1.ts) | Ray viaja más lejos | Step más fino |
| `warpAmount` | 5/SAMPLES | [mat-buffer1.ts](mat-buffer1.ts) | Lensing más fuerte | Más lineal |
| `discRadius` / `discWidth` | 3.2 / 5.3 | [mat-buffer1.ts](mat-buffer1.ts) | Disco más grande / más ancho | |
| `discThickness` base | 0.1 | [mat-buffer1.ts](mat-buffer1.ts) | Disco más puffy | Más fino |
| `blendWeight` (temporal) | 0.9 | [mat-buffer1.ts](mat-buffer1.ts) | Más smoothing, más lag | Más responsive, más noise |
| Bloom weights | 1/1.5/1/1.5/1.8/1/1/1 | [mat-composite.ts](mat-composite.ts) | Glow más intenso | Más sobrio |
| Bloom multiplier | 0.08 | [mat-composite.ts](mat-composite.ts) | Total bloom mayor | Menor |
| HDR multiplier | 150.0 | [mat-composite.ts](mat-composite.ts) | Más exposure / bright | Más sutil |
| Power curve grade | (1.3, 1.20, 1.0) | [mat-composite.ts](mat-composite.ts) | Highlights más warm | Más neutral |
| Gamma final | 0.7/2.2 | [mat-composite.ts](mat-composite.ts) | Midtones más altos | Más oscuros |
| Kali `BRIGHTNESS` | 0.0015 | [mat-composite.ts](mat-composite.ts) | Stars más brillantes | Más tenues |
| Kali `SATURATION` | 0.35 | [mat-composite.ts](mat-composite.ts) | Más color en stars | Más grises |
| Starfield mask | smoothstep(0.3, 1.3, d) | [mat-composite.ts](mat-composite.ts) | Stars más cerca al centro | Más en los bordes |
| `quality` (RT divider) | 2 | [pipeline.tsx](pipeline.tsx) | Más performance, más blurry | Más sharp, más caro |

---

## Diferencias con el reference

| Aspecto | MisterPrada/black-hole | Acá |
|---|---|---|
| Shader language | GLSL via `vite-plugin-glsl` | TSL (compila a GLSL en runtime) |
| Build tool | Vite | Next.js |
| Renderer | Three.js `WebGLRenderer` con materiales custom | R3F + `NodeMaterial` (también WebGL) |
| Cámara | Mouse-driven `RotateCamera` | R3F `OrbitControls` → uniforms de basis (right/up/forward/pos) |
| Render loop | Manual via Experience.js | R3F `useFrame` priority=1 (deshabilita auto-render) |
| Texturas | `noise.png` + `gas.jpg` (mismas) | Idem |
| Postpro adicional | `MotionBlurPass` custom + `tweakpane` debug | Sin motion blur ni debug UI |
| HellPortal sub-effect | Sí (separate world) | Eliminado |

El motion blur del reference y el HellPortal no se portaron porque están fuera del scope del look core del black hole. Si querés agregar motion blur, lo más simple es un velocity-based effect via `@react-three/postprocessing`.

---

## Si tenés que tocar el shader

1. Empezá por [mat-buffer1.ts](mat-buffer1.ts) — es donde está toda la "física".
2. Para cambiar la sensación cinemática (color, contraste, exposure) tocá [mat-composite.ts](mat-composite.ts).
3. Para más/menos glow, ajustá los bloom weights o el `* 0.08` en composite.
4. Si querés ver el raymarch sin temporal blend (para debug), seteá `blendWeight` a 0 en mat-buffer1.
5. Si querés ver una octava específica del bloom, hardcodeá `getBloom()` para retornar solo esa octava.
6. Para visualizar buffer4 directamente (debug), cambiá el composite a `return vec4(tBuffer4.sample(uv2).rgb, 1.0);`.

Todos los cambios son hot-reload-able vía Next.js dev server.
