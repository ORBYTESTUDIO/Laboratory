# Black hole (Gargantua)

> Black hole estilo *Interstellar* construido como **5 capas** de geometría y shaders + camera roll + bloom postprocessing. Aproxima el look icónico de Gargantua **sin lensing real** — el "anillo doblado" arriba y abajo del shadow es un billboard fakeado.

Referencia visual: el black hole de Gargantua (*Interstellar*, 2014). Los efectos físicos que se simulan son: disco de acreción rotando con velocidad keplerian-like, doppler beaming (asimetría brillante por velocidad orbital), photon ring delgado, y "wrap-around" del disco visto a través de la lente gravitacional.

## Tabla de contenidos

- [Mapa de las 5 capas](#mapa-de-las-5-capas)
- [Conceptos clave](#conceptos-clave)
  - [Sphere opaca + additive points: cómo se "talla" el shadow](#sphere-opaca--additive-points-cómo-se-talla-el-shadow)
  - [Lensing fake con `<Billboard>` de drei](#lensing-fake-con-billboard-de-drei)
  - [Doppler beaming en el vertex shader](#doppler-beaming-en-el-vertex-shader)
  - [Camera roll via `camera.up` (no rotar la escena)](#camera-roll-via-cameraup-no-rotar-la-escena)
  - [Reuso del par de shaders de partículas](#reuso-del-par-de-shaders-de-partículas)
  - [Bloom postprocessing](#bloom-postprocessing)
- [Cómo funciona cada capa](#cómo-funciona-cada-capa)
- [Patrones del repo y por qué](#patrones-del-repo-y-por-qué)
- [Knobs por capa (cheat sheet)](#knobs-por-capa-cheat-sheet)
- [Qué falta / Fase 4+](#qué-falta--fase-4)

---

## Mapa de las 5 capas

Orden de render (importante por depth + blending). De fondo a frente:

| # | Capa | Archivo | Tipo | Qué aporta |
|---|---|---|---|---|
| 1 | **Starfield** | `starfield.tsx` | Additive points | Estrellas envolventes en cáscara esférica (radio 30-80) — contexto cósmico |
| 2 | **EventHorizon** | `horizon.tsx` | Opaque mesh | Esfera negra que ocluye el medio disco trasero — define el "shadow" |
| 3 | **AccretionDisk** | `disk.tsx` | Additive points (con doppler) | 180k partículas del disco caliente en plano XZ, rotación diferencial + brillo asimétrico |
| 4 | **LensedDisk** | `lensed-disk.tsx` | Billboard shader plane | Annulus que abraza el shadow — fake del "wrap-around" del disco trasero por lensing |
| 5 | **PhotonRing** | `photon-ring.tsx` | Billboard shader plane | Rim brillante muy fino pegado al horizon — el photon ring estilizado |
| — | **Bloom** | `scene.tsx` | Postprocess | Florece los hot spots — el "calor" alrededor de los puntos brillantes |
| — | **CameraRoll** | `scene.tsx` | Camera tweak | Rota `camera.up` para inclinar el horizonte de la imagen ~12° |

Archivos compartidos:
- `shaders.ts` — un único par vertex + fragment shader que sirve a las dos capas de **partículas** (starfield y disk). Las variaciones se logran via uniforms (`uSize`, `uSoftness`, `uAlphaMultiplier`, `uRotationStrength`, `uDopplerStrength`, `uCameraDir`).
- `scene.tsx` — orchestrator: importa las 5 capas + CameraRoll + EffectComposer y los ensambla.

Las dos capas billboard (`lensed-disk.tsx`, `photon-ring.tsx`) usan **shaders inline propios** porque su geometría es un plane (no points) y sus efectos no se mapean bien al shader compartido.

---

## Conceptos clave

### Sphere opaca + additive points: cómo se "talla" el shadow

Esta es la mecánica fundamental que define la silueta del black hole. **No es magia ni un mask** — emerge del orden natural de three.js entre objetos opacos y transparentes.

1. El **EventHorizon** es una `<sphereGeometry>` con `<meshBasicMaterial color="#000000">` — opaca, default `depthWrite: true`, `depthTest: true`.
2. La **AccretionDisk** son `<points>` con `blending={THREE.AdditiveBlending}`, `depthWrite={false}`, `transparent`, `depthTest: true` (implícito).

Three.js rendea primero los objetos opacos (la esfera), escribiendo color **y** depth. Después rendea los transparentes (las partículas). Cuando una partícula intenta pintar un píxel:

- Si su Z está **delante** de la esfera → pasa el depth test → se pinta normal.
- Si su Z está **detrás** de la esfera → falla el depth test → no se pinta.

Resultado: las partículas del medio disco trasero quedan ocluidas, las del medio disco delantero pasan por delante del shadow. **Eso es lo que crea la separación visual entre el disco horizontal "cortado" y la silueta negra del agujero.**

Las dos capas billboard (`LensedDisk`, `PhotonRing`) usan el mismo mecanismo: en píxeles que caen dentro de la proyección 2D del horizon, su Z (centro del billboard ≈ origin) está más lejos que la front face de la esfera, así que ahí no se pintan. Por eso ambos anillos "abrazan" el horizon sin pisar la silueta negra.

### Lensing fake con `<Billboard>` de drei

Gargantua muestra el lado **trasero** del disco curvado por arriba y por debajo del shadow (la luz se dobla cerca del horizon). Hacerlo de verdad requiere un fragment shader que samplea coordenadas distorsionadas según deflection angle — matemática real de relatividad general.

Acá lo fakeamos con **un plane billboardeado** + un shader de annulus:

```tsx
<Billboard>
  <mesh>
    <planeGeometry args={[4, 4]} />
    <shaderMaterial vertexShader={...} fragmentShader={...} ... />
  </mesh>
</Billboard>
```

`<Billboard>` de drei rota el contenido cada frame para que su forward axis apunte a la cámara. Así, sin importar desde dónde orbitás, **el plane siempre te encara**.

El fragment shader dibuja un annulus (anillo) centrado en el plane, con dos bandas:
- **Core**: anillo brillante delgado pegadito al horizon (r ≈ 1.0 → 1.18)
- **Halo**: banda más amplia y suave por afuera (r ≈ 1.10 → 1.55)

Más un **angular bias vertical** — más fuerte arriba/abajo del shadow, más suave a los lados. Eso emula la física real: el lensing del lado trasero es más visible donde no hay disco delantero tapándolo (arriba/abajo del plano del disco), y "se conecta" visualmente con el disco horizontal en los extremos laterales.

```glsl
vec2 c = (vUv - 0.5) * 4.0;        // local coords -2..2
float d = length(c);
float core = smoothstep(0.96, 1.01, d) * smoothstep(1.18, 1.05, d);
float halo = smoothstep(1.00, 1.10, d) * smoothstep(1.55, 1.20, d) * 0.55;
float annulus = core + halo;

float vertical = abs(c.y) / max(d, 0.001);
float angularBias = 0.5 + 0.6 * vertical;
float intensity = annulus * angularBias;
```

**No es físicamente correcto**, pero visualmente convincente. La diferencia clave con el lensing real: el wrap-around fake no se modula por la posición de las partículas detrás del horizon — es una capa estática que parece ahí siempre. En lensing real, el "anillo" se mueve y rota con el material del disco real.

### Doppler beaming en el vertex shader

En un disco de acreción real, el material orbita a velocidades relativistas. El lado que se mueve **hacia la cámara** aparece dramáticamente más brillante (blueshift + boost de fotones); el lado que se aleja, más oscuro (redshift). Se llama **doppler beaming relativista**.

Se calcula por partícula en el **vertex shader** porque depende de la posición rotada:

```glsl
uniform vec3 uCameraDir;        // versor desde origen hacia cámara
uniform float uDopplerStrength; // 0 desactiva (starfield)

// ... después de aplicar la rotación a pos.x, pos.z:
vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x));  // perpendicular al radio
float dopplerFactor = dot(tangent, uCameraDir);      // -1..1
float beaming = 1.0 + dopplerFactor * uDopplerStrength;
vColor = color * max(beaming, 0.0);
```

**Por qué funciona**:
- Una partícula en posición `(cos α, 0, sin α) * r` orbitando con `dα/dt > 0` tiene velocidad tangencial `(-sin α, 0, cos α) * r * dα/dt`. Eso es exactamente `(-pos.z, 0, pos.x)` normalizado.
- El dot product con la dirección a la cámara da un escalar: `+1` cuando la partícula viene derecho hacia vos, `-1` cuando se aleja, `0` cuando va de costado.
- Modulamos el color por `1 + factor * strength`. Con strength 0.7, las partículas que vienen brillan 70% más, las que se alejan se atenúan ~70% (clamped a 0).

El `uniform vec3 uCameraDir` se actualiza cada frame desde JS leyendo `state.camera.position`:

```tsx
useFrame((state) => {
  tmpCameraDir.copy(state.camera.position).normalize();
  materialRef.current.uniforms.uCameraDir.value.copy(tmpCameraDir);
});
```

El uniform `uDopplerStrength` lo hace **opcional**: el starfield comparte el mismo par de shaders pero pasa `uDopplerStrength: 0`, así el `beaming = 1.0` y no afecta.

### Camera roll via `camera.up` (no rotar la escena)

Gargantua se ve con el "horizonte" inclinado ~10-15° en la pantalla. Hay dos formas de lograrlo:

1. **Rotar la escena entera** alrededor del eje Z. ❌ Problema: los `<Billboard>` se cancelan a sí mismos para mirar a cámara, lo que **descongela** la rotación del parent. El LensedDisk quedaría desalineado.
2. **Rotar el `up` vector de la cámara**. ✅ La cámara mira al origen, pero su "arriba" ya no es world Y sino un vector inclinado. Los Billboards heredan eso (porque usan `lookAt` que consulta `camera.up`), así que su `c.y` interno queda alineado con el plano inclinado.

```tsx
function CameraRoll({ angle }: { angle: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    const original = camera.up.clone();
    camera.up.set(Math.sin(angle), Math.cos(angle), 0);
    controls?.update?.();
    return () => { camera.up.copy(original); controls?.update?.(); };
  }, [camera, controls, angle]);

  return null;
}
```

`OrbitControls` (de drei) respeta `camera.up` — el orbit se hace consistentemente con ese up, y el horizonte de la pantalla queda rotado.

**Importante**: como el LensedDisk usa `c.y` para el angular bias vertical, ese "arriba" se inclina con la cámara, lo cual es exactamente lo que queremos — el bias sigue alineado con la dirección perpendicular al disco.

### Reuso del par de shaders de partículas

`shaders.ts` exporta un vertex + fragment compartido entre `starfield.tsx` y `disk.tsx`. Las variaciones por capa se logran solo con uniforms:

| Uniform | Starfield | Disk |
|---|---|---|
| `uSize` | 60 | 38 |
| `uSoftness` | 2.5 | 2.8 |
| `uAlphaMultiplier` | 1.0 | 0.32 |
| `uRotationStrength` | 0 | 1.0 |
| `uDopplerStrength` | 0 | 0.7 |
| `uCameraDir` | (vector estático, ignorado) | actualizado cada frame |

El shader implementa la **rotación diferencial keplerian-like** igual que en galaxy:

```glsl
float angleOffset = uTime * uRotationStrength / (distanceToCenter + 0.1);
```

`1 / r` significa que el material cerca del horizon orbita mucho más rápido que el material del borde — corresponde a `v ∝ 1/r` en órbitas planas (no es exactamente keplerian `v ∝ 1/√r`, pero el efecto visual de rotación diferencial es lo importante).

### Bloom postprocessing

Mismo bloom que galaxy, pero **tuneado mucho más conservador**:

```tsx
<Bloom
  intensity={0.12}            // muy bajo
  luminanceThreshold={0.88}   // muy alto: solo los hottest pixels
  luminanceSmoothing={0.8}
  kernelSize={KernelSize.SMALL}
  mipmapBlur
/>
```

¿Por qué tan bajo? El disco con 180k partículas additive blendeadas + el LensedDisk + el PhotonRing acumulan **mucha luminancia** en el centro. Si el bloom es agresivo, se "comen" los detalles y queda un halo blanco enorme. Con el threshold a 0.88, solo los hot spots realmente brillantes florecen, manteniendo el contraste del shadow contra el wrap-around.

---

## Cómo funciona cada capa

### 1. Starfield (`starfield.tsx`)

Cáscara esférica de 4.5k estrellas alrededor del black hole (radio 30-80). Mismo truco de distribución uniforme en superficie esférica que galaxy:

```ts
const r = innerR + Math.random() * (outerR - innerR);
const theta = Math.acos(2 * Math.random() - 1);
const phi = Math.random() * 2 * Math.PI;
```

Paleta ponderada realista (60% blanco, 18% blanco-azul, 12% azul, 8% amarillo-blanco, 4% naranja). `uRotationStrength: 0` y `uDopplerStrength: 0` — quedan estáticas en world space (mientras la cámara orbita, vos ves moverse el cosmos).

**Diferencia con el starfield de galaxy**: cuenta de partículas más baja (4.5k vs 6k) y radio más amplio (30-80 vs 25-60) — el black hole es más chico que la galaxia y queremos contexto más "espacial" que "denso".

### 2. EventHorizon (`horizon.tsx`)

```tsx
<mesh>
  <sphereGeometry args={[0.95, 64, 64]} />
  <meshBasicMaterial color="#000000" />
</mesh>
```

Una esfera radio 0.95, color negro puro, material `MeshBasicMaterial` (no necesita luz). Su **depth write** es lo que talla el shadow en las capas additivas (ver [Sphere opaca + additive points](#sphere-opaca--additive-points-cómo-se-talla-el-shadow)).

64 segmentos en cada eje porque la silueta es muy visible y queremos un contorno suave (no facetado).

### 3. AccretionDisk (`disk.tsx`)

180k partículas en un anillo plano en XZ:

```ts
const t = Math.pow(Math.random(), 1.6);  // bias hacia el inner edge
const radius = innerRadius + t * (outerRadius - innerRadius);
const theta = Math.random() * Math.PI * 2;
const y = gaussian() * thickness;  // Box-Muller para soft falloff vertical

positions[i3]     = Math.cos(theta) * radius;
positions[i3 + 1] = y;
positions[i3 + 2] = Math.sin(theta) * radius;
```

Por qué los detalles:
- **`pow(random, 1.6)`** sesga la distribución hacia el inner edge → más densidad cerca del horizon (donde está el material más caliente). Es lo que da el "core brillante" del disco.
- **`gaussian() * thickness`** (Box-Muller) da un perfil vertical **suave** en vez de un slab plano. El disco tiene un poco de "puff" en Y, no es una lámina infinitamente fina.
- **Color lerp del centro al borde**: `#fff0c8` (amarillo cálido) → `#9a4e18` (cobre oscuro). Emula el gradiente de temperatura del disco real (más caliente cerca del horizon).
- **6% de partículas tienen boost 2.4×** en `aScale` — son los "brillos" estocásticos del gas.

El uniforme `uDopplerStrength: 0.7` activa el beaming. El `uCameraDir` se actualiza cada frame:

```tsx
useFrame((state, delta) => {
  materialRef.current.uniforms.uTime.value += delta;
  tmpCameraDir.copy(state.camera.position).normalize();
  materialRef.current.uniforms.uCameraDir.value.copy(tmpCameraDir);
});
```

### 4. LensedDisk (`lensed-disk.tsx`)

El plane billboardeado con el annulus shader de dos bandas (core + halo) y angular bias vertical. Documentado en [Lensing fake](#lensing-fake-con-billboard-de-drei).

Notas:
- El plane es de `4×4` en world units — suficientemente grande para que el annulus entero (que llega a `d ≈ 1.55`) entre.
- `blending={THREE.AdditiveBlending}` + `depthWrite={false}` para que combine con el rest de la escena y no escriba depth.
- No tiene rotación propia ni animación — su orientación viene del `<Billboard>`. El "movimiento visual" del wrap-around es ilusión del orbit de cámara.

### 5. PhotonRing (`photon-ring.tsx`)

El rim delgadito brillante justo pegado al horizon. Mismo patrón que LensedDisk (billboard + shader plane) pero shader mucho más simple:

```glsl
float rim = exp(-pow((d - 1.0) / 0.028, 2.0)) * 0.35;
vec3 hot = vec3(1.0, 0.94, 0.78);
gl_FragColor = vec4(hot * rim, rim);
```

Un único gaussiano peak en `d = 1.0` con sigma `0.028`, intensidad muy baja (0.35). En Gargantua el "anillo blanco" alrededor del shadow es principalmente el wrap-around del LensedDisk; este rim solo agrega un "hint" de luz hot justo en el borde para reforzar la lectura del horizon.

### Bloom + CameraRoll (en `scene.tsx`)

- **Bloom** ya documentado arriba — bajo y selectivo para no over-glow.
- **CameraRoll** rota el up de cámara 12° — documentado en [Camera roll](#camera-roll-via-cameraup-no-rotar-la-escena).

---

## Patrones del repo y por qué

### Mismo par de shaders para partículas, shaders inline para billboards

`shaders.ts` (vertex + fragment compartido) sirve a las dos capas que son particle systems (starfield, disk). Las dos capas billboard (`lensed-disk.tsx`, `photon-ring.tsx`) tienen sus shaders **inline en el mismo archivo**, porque:

1. Su geometría es un plane (no points), así que la mitad del vertex shader compartido (`gl_PointSize`, `gl_PointCoord`) no aplica.
2. Sus shaders son cortos (10-25 líneas), no vale la pena un archivo aparte.
3. Tienen lógica muy específica (annulus, gaussiano, angular bias) que no se reusa entre billboards.

Si en Fase 4 agregamos más billboards (e.g. doppler ring secundario), evaluar si compartirles un base.

### Module-level uniforms + `materialRef.current`

Mismo patrón que galaxy (ver el README de galaxy para detalle completo). Resumido:

```tsx
const uniforms = { uSize: { value: 38 }, uTime: { value: 0 }, /* ... */ };

useFrame((_, delta) => {
  if (materialRef.current) {
    materialRef.current.uniforms.uTime.value += delta;
  }
});
```

Module-level evita problemas con el React Compiler de Next 16 / React 19. Mutar via `materialRef.current.uniforms` garantiza que three.js lee el valor actualizado.

### `useState(buildGeometry)` + cleanup

Igual que galaxy:

```tsx
const [geometry] = useState(buildDiskGeometry);
useEffect(() => () => geometry.dispose(), [geometry]);
```

Lazy init (se ejecuta una sola vez al mount), cleanup libera la memoria GPU al unmount.

### CameraRoll dentro del Scene, no en CanvasFrame

`CanvasFrame` es genérico para todos los experimentos. El roll es **específico** del look del black hole. Vive como componente local dentro de `scene.tsx` y limpia el up vector cuando se desmonta — así otros experimentos no heredan la rotación.

---

## Knobs por capa (cheat sheet)

| Capa | Param notable | Default | Sube → | Baja → |
|---|---|---|---|---|
| Starfield | `count` | 4500 | Más estrellas de fondo | Cielo más vacío |
| Starfield | `outerRadius` | 80 | Estrellas más lejos | Más concentradas alrededor |
| EventHorizon | `radius` (en `sphereGeometry args`) | 0.95 | Shadow más grande | Shadow más chico |
| Disk | `count` | 180_000 | Disco más denso/fluido | Más granuloso |
| Disk | `innerRadius` | 1.15 | Hueco más grande entre disco y horizon | Disco "casi tocando" |
| Disk | `outerRadius` | 3.1 | Disco más extendido | Más compacto |
| Disk | `thickness` | 0.022 | Disco más "puffy" | Más fino/plano |
| Disk | `size` | 38 | Partículas más grandes (fluido) | Más puntiformes |
| Disk | `uSoftness` | 2.8 | Puntos más sharp | Puntos más difusos |
| Disk | `uAlphaMultiplier` | 0.32 | Disco más brillante | Más sutil |
| Disk | `uDopplerStrength` | 0.7 | Asimetría dramática (un lado quemado) | Asimetría sutil |
| Disk | `insideColor` / `outsideColor` | `#fff0c8` / `#9a4e18` | (paleta) | (paleta) |
| LensedDisk | `intensity * 1.0` (mult final) | 1.0 | Wrap-around dominante | Más sutil |
| LensedDisk | inner edge (`smoothstep(0.96, 1.01, d)`) | 0.96-1.01 | (mueve el borde interno) | |
| LensedDisk | outer edge (`smoothstep(1.55, 1.20, d)` del halo) | 1.55 | Halo más amplio | Anillo más ceñido |
| LensedDisk | `angularBias = 0.5 + 0.6 * vertical` | 0.5 / 0.6 | (más uniforme / más boost vertical) | |
| PhotonRing | `rim ... * 0.35` | 0.35 | Rim más visible | Casi invisible |
| PhotonRing | sigma del gaussiano | 0.028 | Rim más grueso | Hairline puro |
| Bloom | `intensity` | 0.12 | Más glow | Más sobrio |
| Bloom | `luminanceThreshold` | 0.88 | Solo lo más caliente florece | Más cosas florecen |
| CameraRoll | `ROLL_DEGREES` | 12 | Más inclinado | Más horizontal |
| Camera | `cameraPosition` (en registry.ts) | `[0, 0.6, 5.8]` | (subir Y = más desde arriba; subir Z = más lejos) | |

---

## Qué falta / Fase 4+

El experimento está en una versión "estilizada", no fotorrealista. Para llevarlo más lejos:

### Lensing real (no fake)

Reemplazar el `LensedDisk` billboard por un **fragment shader fullscreen post-effect** que samplea coordenadas del framebuffer distorsionadas según deflection angle Schwarzschild:

```
deflection ≈ 4 * G * M / (c² * b)
```

donde `b` es el impact parameter (distancia mínima del ray al centro). El shader rebote cada pixel cerca del centro hacia su "imagen lensed". Esto da un wrap-around físicamente correcto que se mueve con las partículas detrás.

Costo: un pass adicional con muestreo no trivial. No es performance-prohibitive en GPUs modernas.

### Distorsión del background

Las estrellas del starfield detrás del horizon también deberían distorsionarse. Mismo shader de deflection, pero aplicado al sampling del starfield (no solo a las partículas del disco).

### Doppler beaming relativista

La fórmula actual es lineal (`color * (1 + factor * strength)`). Relativistically:

```
brightness_obs / brightness_rest = D⁴
D = 1 / (γ * (1 - β * cos θ))
```

Eso daría la asimetría mucho más dramática y físicamente correcta. Vale la pena solo si vas hacia "fotorealista".

### Acretion turbulence

El disco actual es liso. Agregar **noise 3D** (curl noise + simplex) que perturbe ligeramente las posiciones y agregue "filamentos" de gas. Pasa al vertex shader como una sumatoria de octavas de noise. Costo: barato en GPU.

### Movimiento del background con orbit

Si activáramos `uRotationStrength` en starfield o un slight spin, las estrellas se moverían — pero perdemos la sensación de "espacio fijo". Generalmente no se hace, salvo para shots cinematic.

---

## Cómo agregar una capa nueva

1. **Decidir el tipo**:
   - Si es nube de puntos (estrellas, polvo, gas) → particle system con `<points>` y los shaders compartidos en `shaders.ts`.
   - Si es un efecto envolvente que mira a cámara (halo, ring, glow) → `<Billboard>` + plane + shader inline propio.
   - Si es geometría sólida que ocluye (jet, anillo material) → mesh con material standard.

2. **Crear el archivo** en `components/experiments/black-hole/<nombre>.tsx` siguiendo el patrón de la capa más parecida:
   - Particle system → copiar `starfield.tsx` o `disk.tsx`
   - Billboard → copiar `lensed-disk.tsx` o `photon-ring.tsx`

3. **Si usa shaders compartidos**, agregar los uniforms necesarios (incluyendo `uCameraDir` y `uDopplerStrength` — con valor 0 si no aplica doppler).

4. **Importar en `scene.tsx`** y agregar en el JSX. Cuidado con el **orden** si depende de depth (objetos opacos antes de transparentes).

5. **Tunear en vivo** con HMR.

Si el efecto requiere un shader fullscreen post-process (e.g. lensing real), agregar como `<EffectComposer>` child junto al Bloom — `@react-three/postprocessing` ya está instalado y soporta custom effects.

