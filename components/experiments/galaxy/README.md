# Galaxia

> Galaxia espiral construida como **8 capas** de sistemas de partículas (`THREE.Points`) con shaders custom + bloom postprocessing.

Referencia visual: estilo [atlab.io/galaxy-clouds](https://atlab.io/galaxy-clouds), galaxias tipo Andrómeda.

## Tabla de contenidos

- [Mapa de las 8 capas](#mapa-de-las-8-capas)
- [Conceptos clave](#conceptos-clave)
  - [Particle systems con `THREE.Points`](#particle-systems-con-threepoints)
  - [BufferGeometry y attributes paralelos](#buffergeometry-y-attributes-paralelos)
  - [Shaders custom (vertex + fragment)](#shaders-custom-vertex--fragment)
  - [Uniforms: cómo se pasan y cómo se actualizan](#uniforms-cómo-se-pasan-y-cómo-se-actualizan)
  - [Blending modes (Additive vs Subtractive)](#blending-modes-additive-vs-subtractive)
  - [Bloom postprocessing](#bloom-postprocessing)
  - [Rotación diferencial en GPU](#rotación-diferencial-en-gpu)
  - [Espiral logarítmica + brazos asimétricos](#espiral-logarítmica--brazos-asimétricos)
- [Cómo funciona cada capa](#cómo-funciona-cada-capa)
- [Patrones del repo y por qué](#patrones-del-repo-y-por-qué)
- [Knobs por capa (cheat sheet)](#knobs-por-capa-cheat-sheet)
- [Cómo agregar una capa nueva](#cómo-agregar-una-capa-nueva)

---

## Mapa de las 8 capas

Las capas se renderizan en orden y se combinan via blending. De fondo a frente:

| # | Capa | Archivo | Blending | Rotación | Qué aporta |
|---|---|---|---|---|---|
| 1 | **Starfield** | `starfield.tsx` | Additive | Estática | Estrellas de fondo en cáscara esférica — contexto cósmico |
| 2 | **Halo** | `halo.tsx` | Additive | Estática | Brillo difuso envolviendo el disco — "peso" visual |
| 3 | **Dust** | `dust.tsx` | Additive | Con disco | Nubes de polvo coloreadas en clusters sobre los brazos |
| 4 | **Bulge** | `bulge.tsx` | Additive | Estática | Núcleo central dorado denso, esfera oblata |
| 5 | **Galaxy stars** (disco) | `scene.tsx` | Additive | Diferencial | Las 100k estrellas del disco espiral |
| 6 | **HII regions** | `hii.tsx` | Additive | Con disco | Manchas azul-blancas brillantes (formación estelar) |
| 7 | **Dust lanes** | `dust-lanes.tsx` | **Subtractive** | Con disco | Franjas oscuras sobre los brazos (polvo absorbiendo luz) |
| 8 | **Bloom** | (postprocess) | — | — | Florece los pixels brillantes — halo dorado del núcleo |

Archivos compartidos:
- `shaders.ts` — un único par vertex + fragment shader que sirve a TODAS las capas. La variación se logra via uniforms (`uSize`, `uSoftness`, `uAlphaMultiplier`, `uRotationStrength`, `uTime`).
- `arms.ts` — helpers para la espiral logarítmica y muestreo ponderado de brazos. Usado por stars, dust, hii y dust-lanes.
- `scene.tsx` — orchestrator: importa todas las capas y las ensambla.

---

## Conceptos clave

### Particle systems con `THREE.Points`

Renderizar 100.000 estrellas como meshes individuales sería inviable (un draw call por mesh). En su lugar usamos **`THREE.Points`**: **un solo objeto** que contiene **una nube de puntos** dibujados con **un solo draw call**.

Cada punto es un cuadrado de píxeles (`gl_PointSize` decide su tamaño). El fragment shader pinta cada punto, y ahí podemos hacerle un soft circle para que parezcan estrellas/nubes y no cuadraditos.

En JSX:

```tsx
<points geometry={miGeometria}>
  <shaderMaterial ... />
</points>
```

### BufferGeometry y attributes paralelos

Un `BufferGeometry` es básicamente **varios `Float32Array` paralelos**, uno por cada propiedad por-vértice (o por-punto):

- `position` — `[x, y, z, x, y, z, ...]` (size 3 por vértice)
- `color` — `[r, g, b, r, g, b, ...]` (size 3)
- `aScale` — `[s, s, s, ...]` (size 1) — un attribute custom nuestro

El índice `i` de un punto vive en `positions[i*3]..[i*3+2]`, `colors[i*3]..[i*3+2]`, `scales[i]`. Todos sincronizados.

Construcción típica (cualquier `build*Geometry()` del experimento):

```ts
const positions = new Float32Array(count * 3);
const colors    = new Float32Array(count * 3);
const scales    = new Float32Array(count);

for (let i = 0; i < count; i++) {
  positions[i*3]     = ...;
  positions[i*3 + 1] = ...;
  positions[i*3 + 2] = ...;
  colors[i*3]        = ...;
  // ...
  scales[i]          = ...;
}

const geom = new THREE.BufferGeometry();
geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geom.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
geom.setAttribute('aScale',   new THREE.BufferAttribute(scales, 1));
```

`position` y `color` son built-in (three.js los reconoce con `vertexColors: true`). `aScale` es nuestro custom — lo declaramos manualmente en el vertex shader.

### Shaders custom (vertex + fragment)

Los shaders son **programas que corren en la GPU**. WebGL ejecuta:

1. **Vertex shader** — una vez **por vértice** (por punto en nuestro caso). Su trabajo: calcular dónde aparece ese punto en pantalla (`gl_Position`) y opcionalmente algunas variables que se pasan al fragment shader (`varying`).
2. **Fragment shader** — una vez **por píxel** que el vértice ocupa. Su trabajo: decidir el color del píxel (`gl_FragColor`).

Nuestros shaders viven en `shaders.ts`:

#### Vertex shader (resumido)

```glsl
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uRotationStrength;

attribute float aScale;
varying vec3 vColor;

void main() {
  vec3 pos = position;

  // Rotación diferencial (ver sección abajo)
  float distanceToCenter = length(pos.xz);
  float angle = atan(pos.z, pos.x);
  float angleOffset = uTime * uRotationStrength / (distanceToCenter + 0.1);
  angle += angleOffset;
  pos.x = cos(angle) * distanceToCenter;
  pos.z = sin(angle) * distanceToCenter;

  // Posición en pantalla
  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
  vec4 viewPosition  = viewMatrix * modelPosition;
  gl_Position        = projectionMatrix * viewPosition;

  // Tamaño en píxeles, con atenuación por distancia a cámara
  gl_PointSize  = uSize * aScale * uPixelRatio;
  gl_PointSize *= (1.0 / -viewPosition.z);

  vColor = color;  // pasa el color al fragment
}
```

Lo más importante:
- **`gl_PointSize`** es el tamaño del punto en píxeles. Se multiplica por `1/-viewPosition.z` para que **puntos lejanos sean más chicos** (perspectiva real).
- **`uPixelRatio`** compensa por displays retina (DPR 2) para que el tamaño visible sea consistente.
- **`varying vec3 vColor`** se interpola del vertex al fragment (solo hay un valor por punto, así que se mantiene constante dentro del punto).

#### Fragment shader

```glsl
uniform float uSoftness;
uniform float uAlphaMultiplier;
varying vec3 vColor;

void main() {
  // gl_PointCoord va de (0,0) a (1,1) dentro de cada punto
  float strength = distance(gl_PointCoord, vec2(0.5));
  strength = 1.0 - strength * 2.0;       // 1.0 en el centro, 0 en el borde
  strength = max(strength, 0.0);
  strength = pow(strength, uSoftness);   // más alto = punto más agudo

  gl_FragColor = vec4(vColor * strength, strength * uAlphaMultiplier);
}
```

**El truco del soft circle**: `gl_PointCoord` te da las coordenadas dentro del cuadrado del punto. Calculamos distancia al centro, la invertimos (1 al centro, 0 al borde), elevamos a un exponente para controlar el falloff. Multiplicamos `vColor` por esa "intensidad" → punto suave y redondeado en lugar de cuadrado.

- `uSoftness` alto (2.5+) → punto bien definido, tipo "estrella"
- `uSoftness` bajo (1.0-1.5) → punto difuso, tipo "nube"

### Uniforms: cómo se pasan y cómo se actualizan

Los **uniforms** son valores **constantes durante un draw call** (a diferencia de los attributes que varían por vértice). Le pasamos al shader cosas como tiempo, tamaño global, pixel ratio, etc.

En este repo los uniforms están **en module-level** y se mutan via **`materialRef.current`**:

```tsx
// Module-level: una sola referencia que three.js mantiene
const uniforms = {
  uSize:             { value: 30 },
  uPixelRatio:       { value: 1 },
  uTime:             { value: 0 },
  uRotationStrength: { value: 0.15 },
  uSoftness:         { value: 2.5 },
  uAlphaMultiplier:  { value: 1.0 },
};

export function Layer() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  // ...

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <points geometry={geom}>
      <shaderMaterial ref={materialRef} uniforms={uniforms} ... />
    </points>
  );
}
```

¿Por qué module-level y no `useState`/`useMemo`? Por las **reglas estrictas del React Compiler** que viene con Next 16 / React 19:
- `useState(() => ...)` con `Math.random()` → falla por `react-hooks/purity`
- Mutar un objeto `useState` → falla por `react-hooks/immutability`
- Module-level no es "state de React", así que mutarlo no dispara la regla.

¿Por qué `materialRef.current.uniforms.X` y no `uniforms.X` directo? Three.js puede clonar internamente el objeto uniforms al construir el material. Mutar el objeto module-level externo NO siempre se refleja en el material. Mutar via `materialRef.current.uniforms` mutamos el objeto interno real del material — garantizado que three.js lo lee al renderizar.

### Blending modes (Additive vs Subtractive)

El **blend mode** decide cómo se combina el color que el shader produce (`src`) con el color que ya está en el framebuffer (`dst`):

#### `AdditiveBlending` (7 de las 8 capas)

```
dst_new = dst + src * src.alpha
```

Suma luz al framebuffer. Donde se solapan dos partículas, los colores se acumulan. El centro de la galaxia (donde 100k partículas se solapan) llega a saturación blanco-amarilla — eso es lo que da el glow natural del núcleo.

Sobre fondo negro (`dst = (0,0,0)`), una partícula sola se ve como su propio color. Sobre fondo blanco se "satura" hacia blanco. Por eso usamos un fondo **negro/azul oscuro** — para que el additive tenga "espacio" para acumular brillo.

Configuración: `blending={THREE.AdditiveBlending}`, `depthWrite={false}`, `transparent`.

#### `SubtractiveBlending` (solo dust-lanes)

```
dst_new = dst * (1 - src.rgb)
```

**Resta luz** del framebuffer. Si `src` es blanco (1,1,1) → resultado es negro. Si `src` es gris medio (0.5, 0.5, 0.5) → resultado es la mitad del brillo previo. Si `src` es negro (0,0,0) → resultado igual al previo (no oscurece).

Esto es **exactamente** cómo el polvo real absorbe luz: oscurece donde había brillo, no hace nada donde ya estaba oscuro. Por eso las dust lanes solo aparecen sobre los brazos (donde hay luz que absorber), no en el fondo negro.

Configuración: `blending={THREE.SubtractiveBlending}`, `premultipliedAlpha` (three.js lo exige para que la fórmula dé resultados correctos), `renderOrder={10}` (para forzar que se dibuje después de las capas additivas y tenga luz que restar).

### Bloom postprocessing

Hasta acá estamos dibujando la scene en un framebuffer. **Postprocessing** es procesar ese framebuffer entero **después** de dibujarlo, antes de mostrarlo en pantalla.

**Bloom** detecta píxeles brillantes (más allá de un umbral), los blurea y los suma al original. Resultado: las cosas brillantes "florecen" con un halo natural.

```tsx
<EffectComposer>
  <Bloom
    intensity={0.4}              // qué tanto suma el halo
    luminanceThreshold={0.55}    // qué tan brillante (0-1) para florecer
    luminanceSmoothing={0.9}     // suavidad del cutoff
    kernelSize={KernelSize.LARGE}// tamaño del blur
    mipmapBlur                   // calidad mejor + más eficiente
  />
</EffectComposer>
```

`luminanceThreshold` es el más importante: con `0.55`, solo florece el núcleo (que es el más brillante post-acumulación). Si lo bajás a `0.2`, hasta las HII regions florecen, lo cual blow-outea la imagen.

### Rotación diferencial en GPU

En galaxias reales, **el centro rota más rápido que el borde** (porque la velocidad orbital cae con la distancia). Esto se llama rotación diferencial y crea el efecto característico de "brazo que se desenrolla" con el tiempo.

En lugar de mover cada partícula desde JS (CPU, lento con 100k puntos), lo hacemos en el **vertex shader** (GPU, súper rápido):

```glsl
float distanceToCenter = length(pos.xz);
float angle = atan(pos.z, pos.x);
float angleOffset = uTime * uRotationStrength / (distanceToCenter + 0.1);
angle += angleOffset;
pos.x = cos(angle) * distanceToCenter;
pos.z = sin(angle) * distanceToCenter;
```

- `length(pos.xz)` → distancia al eje Y (los brazos están en plano XZ)
- `atan(pos.z, pos.x)` → ángulo actual del punto, en radianes
- `angleOffset = uTime * strength / (radius + 0.1)` → la magia: velocidad angular **inversamente proporcional al radio**. Cerca del centro (radius ≈ 0.1) → 1.5 rad/s; en el borde (radius ≈ 5) → 0.03 rad/s. Diferencia ~50x.
- El `+ 0.1` es un epsilon para evitar división por cero en el centro mismo.
- Después se recalcula la posición rotada con `cos(angle)` y `sin(angle)`.

Esto pasa **cada frame, en paralelo, en GPU**. 100k cálculos por frame, ni se siente.

El `uTime` se incrementa desde JS:

```tsx
useFrame((_, delta) => {
  materialRef.current.uniforms.uTime.value += delta;
});
```

¿Por qué acumular `delta` y no usar `state.clock.elapsedTime`? **Three.js 0.184 deprecó `Clock`** — `elapsedTime` se queda en 0. `delta` sí funciona porque viene de `getDelta()` que se sigue llamando internamente.

### Espiral logarítmica + brazos asimétricos

Para que la espiral parezca real (más curvada al centro, más recta al borde), en lugar de:

```ts
spinAngle = radius * spin;  // lineal — toda la espiral con misma curvatura
```

usamos espiral logarítmica:

```ts
spinAngle = Math.log(1 + radius) * spin * 2.5;  // log spiral
```

`log(1+r)` crece rápido al principio y se aplana después → exactamente la forma de brazos reales.

Y para asimetría, en lugar de `i % branches` (uniforme):

```ts
const ARM_WEIGHTS = [1.0, 0.7, 1.3, 0.5, 0.9];  // pesos por brazo
// distribución acumulada → pickArm() samplea según pesos
```

Algunos brazos tienen más densidad que otros — más "personalidad" galáctica.

Estos dos helpers viven en `arms.ts` y se usan coherentemente desde stars, dust, hii y dust-lanes — así las cuatro capas se concentran en los mismos brazos.

---

## Cómo funciona cada capa

### 1. Starfield (`starfield.tsx`)

Cáscara esférica de 6k estrellas alrededor de toda la galaxia (radius 25-60). Distribución uniforme en superficie esférica via:

```ts
const r = innerR + Math.random() * (outerR - innerR);
const theta = Math.acos(2 * Math.random() - 1);  // truco para uniforme en esfera
const phi = Math.random() * 2 * Math.PI;
pos = [r*sin(theta)*cos(phi), r*sin(theta)*sin(phi), r*cos(theta)];
```

Paleta ponderada con distribución estelar realista: 55% blanco, 18% blanco-azul, 12% azul, 9% amarillo-blanco, 4% naranja, 2% rojo.

`uRotationStrength: 0` — quedan estáticas. Cuando hagas orbit con el mouse, la cámara rota y vos ves moverse la galaxia mientras el starfield queda fijo en el espacio. Da sensación de 3D real.

### 2. Halo (`halo.tsx`)

2.5k partículas grandes (`uSize: 320`) en esfera oblata (verticalFlatten 0.55) alrededor del disco. Muy translúcidas (`uAlphaMultiplier: 0.02`), muy suaves (`uSoftness: 1.0`). Color cálido al centro → frío al borde (mismo motivo que el disco).

Aporta el "glow envolvente" — la galaxia deja de verse recortada contra el fondo negro.

### 3. Dust (`dust.tsx`)

Polvo coloreado distribuido en **clusters** (parches). Algoritmo:

1. Elegir N **centros de cluster** sobre la espiral (usa `pickArm` + `logSpinAngle`)
2. Cada cluster toma un **color base** de una paleta (lavandas/rosas suaves)
3. Cada partícula se asigna a un cluster random, posicionada cerca con **falloff gaussiano** (Box-Muller)
4. Color del punto = color del cluster + leve variación HSL

Esto evita la "neblina uniforme" — algunas zonas tienen polvo, otras están limpias, distintos colores en distintas zonas.

`uAlphaMultiplier: 0.04` — muy sutil, **acompaña** los brazos, no compite con las estrellas.

### 4. Bulge (`bulge.tsx`)

Núcleo central denso: 5k partículas en **esfera oblata** (verticalFlatten 0.65) muy concentradas al centro (`pow(random, 3.5)` → la mayoría pegadas a r=0). Colores cálidos: blanco caliente → ámbar dorado.

**`uRotationStrength: 0`** — el bulge queda estático mientras el disco rota. Esto crea contraste visual y evita que los puntos del centro se "estiren" tangencialmente (a r ≈ 0 la rotación diferencial sería infinita sin epsilon).

8% de las partículas tienen un boost de tamaño (1.8×) para crear los "núcleos brillantes" del bulge.

### 5. Galaxy stars / disco (`scene.tsx`)

Las 100k estrellas del disco. Distribución:

```ts
const radius = Math.random() * 5;                   // radio uniforme
const branchAngle = (pickArm() / ARM_COUNT) * 2π;   // brazo asimétrico
const spinAngle = logSpinAngle(radius, spin);       // espiral log

// Posición base sobre el brazo + jitter perpendicular con sesgo a estar pegado al brazo
const jitter = pow(random, 3) * sign() * randomness * radius;
pos = [cos(branchAngle + spinAngle)*radius + jitter, jitter*0.5, sin(...)+jitter];
```

`pow(random, 3) * sign()` distribuye con bias fuerte hacia 0 (la mayoría pegadas al brazo, pocas dispersas) — eso es lo que define el contorno claro de los brazos.

Color: lerp de **dorado** al centro (`#ffd4a0`) a **azul claro** al borde (`#88a8ff`), correspondiendo a estrellas viejas (cálidas) en el centro y estrellas jóvenes (azules) en los brazos.

Tamaños variables por partícula: más grandes al centro, con jitter random, 6% son "estrellas brillantes" con boost 2.2×.

### 6. HII regions (`hii.tsx`)

Zonas de formación estelar — manchas de estrellas O/B muy calientes y brillantes esparcidas por los brazos.

Algoritmo: similar a dust clusters pero con muchas menos regions (18), distribución más compacta (`regionSpread: 0.22`), paleta blanco-azul muy saturada, sin tinte sutil — son las **más brillantes** de la escena después del bulge.

Pasan el `luminanceThreshold` del bloom y florecen → cada region aparece con un halo azul-blanco a su alrededor. Eso es lo que les da el look reconocible de "estrellas jóvenes" en fotos del Hubble.

`uRotationStrength: 0.15` — rotan con el disco, anclando las regions a los brazos.

### 7. Dust lanes (`dust-lanes.tsx`)

Franjas oscuras sobre los brazos — la capa más diferente técnicamente.

**Single trick: `SubtractiveBlending`**. La fórmula `dst = dst * (1 - src.rgb)` significa que donde la lane pisa estrellas brillantes, las oscurece; donde pisa fondo negro, no hace nada (no se puede oscurecer un 0).

Distribución: 30k partículas finas (`randomness: 0.15`, `randomnessPower: 4` → muy concentradas al brazo) con `verticalFlatten: 0.08` (casi planas en el disco) y un **offset angular** (`laneOffset: 0.14 rad`) que las desplaza adelante del brazo — así caen justo encima de las estrellas brillantes.

Color base `#3a3530` — gris cálido oscuro. Con SubtractiveBlending el "color" es **cuánto se resta por canal**, así que un poco más en rojo y menos en azul → la lane deja un tinte ligeramente más frío sobre el área que pisa.

**Tres detalles críticos** para que SubtractiveBlending funcione:
- `premultipliedAlpha={true}` en el material (three.js lo exige)
- `depthWrite={false}` y `transparent` (como las otras capas)
- `renderOrder={10}` para forzar que se renderice **después** de las capas additivas — sino estaríamos restando de un framebuffer aún negro

### 8. Bloom (en `scene.tsx`)

Post-processing al final de la pipeline:

```tsx
<EffectComposer>
  <Bloom intensity={0.4} luminanceThreshold={0.55} ... />
</EffectComposer>
```

Detecta píxeles con luminance > 0.55 (post-accumulación de las 7 capas) y los blurea con kernel grande. Resultado: el bulge dorado del centro tiene un halo natural, las HII regions tienen su glow azul-blanco, y todo lo demás queda contenido.

---

## Patrones del repo y por qué

### Un único par de shaders para todas las capas

`shaders.ts` tiene un solo vertex y un solo fragment. Las variaciones entre capas se logran via **uniforms**:

- `uSize` — tamaño base de los puntos (30 stars, 320 halo, 38 HII, etc.)
- `uSoftness` — exponente del falloff radial (alto = punto agudo, bajo = nube difusa)
- `uAlphaMultiplier` — opacidad global de la capa
- `uRotationStrength` — velocidad de rotación diferencial (0 para estáticas)

Esto evita duplicación y mantiene la arquitectura simple. Si quisiéramos efectos muy diferentes (e.g. partículas con textura), agregaríamos otra pareja de shaders.

### Helpers compartidos en `arms.ts`

Para que stars, dust, hii y dust-lanes compartan la misma estructura espiral (mismo número de brazos, mismos pesos asimétricos, misma fórmula log spiral), todo eso vive en `arms.ts`. Si cambiás `ARM_WEIGHTS` en ese archivo, **las cuatro capas se reconfiguran coherentemente**.

### Module-level uniforms + materialRef pattern

Documentado arriba en [Uniforms](#uniforms-cómo-se-pasan-y-cómo-se-actualizan). Es la combinación que pasa el React Compiler ESLint y garantiza que las mutaciones llegan al GPU.

### `useState(buildGeometry)` lazy init

```tsx
const [geometry] = useState(buildSomething);
useEffect(() => () => geometry.dispose(), [geometry]);
```

`useState` con función como argumento llama esa función **una sola vez** al mount, no en cada render. Como pasamos la referencia a la función (no la llamamos con `()`), el patrón aplica.

El `useEffect` con cleanup llama `geometry.dispose()` cuando el componente se desmonta — libera la memoria GPU (importante con 100k vértices).

---

## Knobs por capa (cheat sheet)

| Capa | Param notable | Default | Sube → | Baja → |
|---|---|---|---|---|
| Starfield | `count` | 6000 | Más estrellas de fondo | Cielo más vacío |
| Halo | `uAlphaMultiplier` | 0.02 | Halo más visible | Halo invisible |
| Halo | `size` | 320 | Puffs gigantes (poco recomendado) | Puffs sutiles |
| Dust | `clusterCount` | 15 | Más zonas con polvo | Polvo más localizado |
| Dust | `uAlphaMultiplier` | 0.04 | Polvo dominante | Polvo casi invisible |
| Bulge | `maxRadius` | 0.9 | Núcleo más grande | Núcleo punto compacto |
| Bulge | `concentration` | 3.5 | Más apretado al centro | Más esparcido |
| Stars | `count` | 100_000 | Disco más denso | Más perforado |
| Stars | `randomnessPower` | 3 | Brazos más definidos | Disco más uniforme |
| HII | `regionCount` | 18 | Más manchas azules | Menos manchas |
| HII | `size` | 38 | HII más grandes/brillantes | HII más sutiles |
| Dust lanes | `count` | 30_000 | Lanes más densas | Lanes apenas visibles |
| Dust lanes | `color` | `#3a3530` | (más claro → más oscurece) | (más oscuro → menos efecto) |
| Bloom | `intensity` | 0.4 | Más glow | Menos glow |
| Bloom | `luminanceThreshold` | 0.55 | Solo lo más brillante florece | Más cosas florecen |
| Arms (compartido) | `ARM_WEIGHTS` | `[1.0, 0.7, 1.3, 0.5, 0.9]` | (asimetría según pesos) | `[1,1,1,1,1]` = simétrica |
| Arms | `LOG_SPIN_FACTOR` | 2.5 | Espiral más enrollada | Brazos más sueltos |

---

## Cómo agregar una capa nueva

Si querés sumar, por ejemplo, una capa de "polvo intergaláctico" o "asteroides":

1. **Crear `components/experiments/galaxy/<nombre>.tsx`** copiando la estructura de `halo.tsx` (es la más sencilla):
   - `PARAMS` con sus knobs propios
   - `uniforms` module-level (con `uSize`, `uTime`, `uRotationStrength`, `uSoftness`, `uAlphaMultiplier`)
   - `build<Nombre>Geometry()` que arma las Float32Arrays
   - Componente que usa `useState(build...)`, `useFrame` para `uTime`, y `useEffect` para cleanup

2. **Decidir la distribución espacial** — esfera, disco, sobre brazos espirales (importá `pickArm` y `logSpinAngle` de `arms.ts`), clusters (mirá `dust.tsx`), etc.

3. **Decidir el blending**: Additive en el 99% de los casos. Subtractive solo si querés oscurecer (y entonces necesitás `premultipliedAlpha` + `renderOrder` alto).

4. **Importarla en `scene.tsx`** y agregarla en el JSX en el orden correcto (más al fondo primero).

5. **Tunear los knobs en vivo** — el dev server con HMR te muestra cambios al instante.

Reusá `shaders.ts` mientras puedas. Si necesitás un efecto que no se logra con los uniforms actuales, agregá un nuevo uniform (a los shaders + a TODOS los `uniforms` objects de las capas que lo usan).
