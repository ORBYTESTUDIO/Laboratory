# Catálogo de patrones de shaders

Base de conocimiento destilada de los shaders de esta carpeta. La idea:
**técnica → shader donde está → cómo reusarla en otro proyecto**. Los `.glsl`
crudos son el material; este archivo es el índice navegable.

> Mantenimiento: cuando agregás un shader nuevo y copado a `shaders/`, sumá acá
> las técnicas que aporta (aunque sea una línea). Así no hay que re-leer 300
> líneas cada vez que queremos reusar algo.

## Biblioteca actual

| Shader | Qué es | Técnicas fuertes |
|---|---|---|
| `tribulence.glsl` | Turbulencia FM abstracta | domain warping, paletas, tonemapping |
| `galaxy.glsl` | Galaxia cinematográfica (F. Hugenroth) | FBM, capas 2.5D, cámara, estrellas por `pow(noise)` |
| `nebulaflight.glsl` | Vuelo por nebulosa (Orblivius) | raymarch volumétrico, spiral noise, túnel de partículas |
| `warp-tunnel.glsl` | Túnel warp con planetas | SDF + normales, Fresnel, intersección de esfera, equirect, audio-react |

Experimentos del lab que ya las aplican: `components/experiments/{tribulence,nebula-flight,warp-tunnel,domain-warping}`.

---

## 1. Ruido + FBM — la base de lo orgánico

**Qué:** value noise (hash en la grilla + interpolación con `smoothstep`) y, encima,
FBM = sumar octavas con frecuencia ×2 y amplitud ÷2.
**Dónde:** `galaxy.glsl` → `noise()` (2D/3D) y `fbm()`/`fbmslow()`; `warp-tunnel.glsl` → `Map3`/`Map5`; `nebulaflight.glsl` → `vn()`.
**Truco clave:** rotar/escalar las coords entre octavas (la `mat3 m` de galaxy) para que no se "alineen".
**Reusar en:** terreno, agua, fuego, nubes, texturas de roca, cualquier fondo procedural.

```glsl
float fbm(vec2 p){ float f=0.,a=.5; for(int i=0;i<5;i++){ f+=a*noise(p); p*=2.; a*=.5; } return f; }
```

## 2. Domain warping — deformar el espacio con sí mismo

**Qué:** en vez de `fbm(p)`, evaluás `fbm(p + warp·q)` donde `q` también sale de fbm. Anidás capas → más caos orgánico.
**Dónde:** `tribulence.glsl` → `tri`/`fm`/`tribulence()` (con rotación áurea entre pasos). Versión didáctica con sliders en `components/experiments/domain-warping/`.
**Reusar en:** humo, mármol, líquidos, distorsión animada de UVs/texturas.

```glsl
vec2 q = vec2(fbm(p), fbm(p+vec2(5.2,1.3)));
float f = fbm(p + 0.6*q);   // warp=0 → fbm(p) puro
```

## 3. Paletas procedurales

**Qué:** un color entero a partir de un escalar, con offset por canal. Reemplaza una textura de gradiente.
**Dónde:** `tribulence.glsl` → `cmap()` (`exp(cos(t + PI·x + vec3(1,2,3)))`).
**Reusar en:** colorear altura, densidad, velocidad, distancia… cualquier valor `0..1`.

```glsl
vec3 palette(float t){ return .5+.5*cos(6.28318*(t+vec3(0.,.33,.67))); } // Inigo Quilez
```

## 4. Raymarching volumétrico

**Qué:** marchás un rayo paso a paso acumulando `color·densidad` con alpha front-to-back; cortás temprano cuando se satura.
**Dónde:** `nebulaflight.glsl` → `renderIntergalacticClouds()`. Versión barata por **capas planas apiladas** en `galaxy.glsl` (bucles `for(q…)`): proyecta el rayo a planos en vez de marchar.
**Truco clave:** `if (sum.a > .99) break;` (early-exit) o no termina nunca.
**Reusar en:** nubes, niebla, fuego, god rays.

## 5. SDF + raymarch de superficie

**Qué:** definís la geometría como distancia (`length(pos.xy) - r` = tubo), marchás hasta tocarla, y sacás la normal por **gradiente del SDF**.
**Dónde:** `warp-tunnel.glsl` → `Map()`, `Normal()`, el bucle de 70 pasos.
**Bonus:** `IntersectPlanets()` resuelve rayo-esfera **analítico** (la cuadrática) — más rápido que marchar cuando la forma es simple.
**Reusar en:** geometría procedural sin mallas, blobs, metaballs.

```glsl
vec3 normal(vec3 p){ vec2 e=vec2(0,.05); return normalize(vec3(map(p+e.yxx),map(p+e.xyx),map(p+e.xxy))-map(p)); }
```

## 6. Iluminación "fake" (sin luces reales)

**Qué:** matemática barata que parece luz.
**Dónde (`warp-tunnel.glsl` salvo aclaración):**
- **Fresnel-Schlick** → `Fresnel()`: más reflejo en los bordes (look vidrio/agua).
- **Glow/halo** → `pow(dot(rayo, luz), N)` con N grande (también en `galaxy.glsl`, el centro).
- **Niebla exponencial** → `exp(-dist·k)`: profundidad instantánea.
- **Bump mapping** → `EarthHeight()` por gradiente.
**Reusar en:** materiales de cualquier escena, no solo fondos.

## 7. Trucos de "feel" que cambian todo

- **Estrellas / destellos:** `pow(noise, N_alto)` deja sólo los picos → puntos brillantes (`galaxy.glsl`).
- **Tonemapping:** `tanh(col)` (`nebulaflight.glsl`) o `1.-exp(-col)` (`tribulence.glsl`), + gamma `pow(col, 1./2.2)`.
- **Vignette:** oscurecer los bordes con `uv.x·uv.y·(1-uv.x)·(1-uv.y)` (los cuatro lo usan).
- **Fade cinematográfico:** animar con `min/max` sobre `iTime` (`galaxy.glsl`).
- **Audio-reactividad:** leer un FFT de textura (`warp-tunnel.glsl`, `iChannel3`); sin audio se puede sintetizar.

## 8. Cámara dentro del shader

**Qué:** generar los rayos sin matrices de three.
**Dónde:** `galaxy.glsl` → base ortonormal `cw/cu/cv` por `cross`; `warp-tunnel.glsl` → `LookAt()` armada a mano. Mapeo **equirectangular** (`acos`/`atan`) para texturar esferas/skybox.
**Reusar en:** fly-throughs, fondos full-screen, skyboxes procedurales.

---

## Cómo se portan a este proyecto (R3F)

Ver `components/experiments/_shared/`: `wrapShadertoy()` envuelve un cuerpo
Shadertoy en GLSL ES 3.00, y `FullscreenShader`/`ShaderCanvas` lo montan en un
quad full-screen. Detalle en la memoria `reference-shadertoy-port`.
