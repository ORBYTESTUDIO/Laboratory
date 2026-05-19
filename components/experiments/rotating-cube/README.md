# Rotating Cube

> Hello world de React Three Fiber: un cubo rojo rotando con luces e `OrbitControls`.

## Qué se ve

Un cubo de lado 1.5 girando sobre sus ejes X e Y. Material gris-rojizo con leve metalness y rugosidad para que las luces se reflejen. Dos luces (una principal cálida y una secundaria fría) que le dan volumen. Se puede orbitar con el mouse.

## Para qué sirve

Es el experimento más simple posible. Existe para:
- Validar que el setup de R3F + Next funciona end-to-end
- Servir de referencia "mínima" para entender la arquitectura de un experimento
- Probar cambios infraestructurales (registry, scene-loader, layout del frame)

## Archivos

```
rotating-cube/
  scene.tsx     # Componente con todo el experimento
  README.md     # Este archivo
```

Un solo archivo. No hay shaders ni nada custom — todo usa los primitivos built-in de R3F.

## Cómo funciona — concepto

En three.js / R3F el mundo 3D es un **árbol de objetos** dentro de una **scene**, vistos por una **cámara**, dibujados por un **renderer** en cada frame. R3F envuelve eso en JSX:

- `<Canvas>` (en `CanvasFrame`) → crea la scene + cámara + renderer + render loop
- Adentro vivien **meshes** (`<mesh>`), que son **geometría + material**:
  - `<boxGeometry args={[1.5, 1.5, 1.5]} />` — la forma (8 vértices en cubo de 1.5)
  - `<meshStandardMaterial color="#ff6b6b" .../>` — cómo se pinta cada píxel del mesh, reaccionando a luces
- **Luces** (`<ambientLight>`, `<directionalLight>`) — sin luces, un material `Standard` se ve negro porque depende de iluminación física

Cada frame, R3F llama un render loop. Dentro de ese loop, **`useFrame(callback)`** te deja correr código (en este caso, mutar la rotación del mesh).

## Cómo funciona — código paso a paso

### 1) Referencia al mesh

```tsx
const meshRef = useRef<Mesh>(null);
```

`useRef` nos da una "manija" al objeto three.js subyacente, asignada cuando R3F monta el mesh.

### 2) Render loop: rotar el mesh

```tsx
useFrame((_, delta) => {
  if (!meshRef.current) return;
  meshRef.current.rotation.x += delta * 0.5;
  meshRef.current.rotation.y += delta * 0.8;
});
```

- `useFrame` se ejecuta **antes de cada frame** que R3F dibuja (típicamente 60 fps).
- El segundo argumento (`delta`) es **el tiempo en segundos desde el frame anterior**. Multiplicar por delta hace que la rotación sea independiente del framerate (a 30fps el delta es ~0.033, a 60fps es ~0.016 — la velocidad angular total queda igual).
- `0.5` y `0.8` son velocidades en radianes/segundo. Ejes distintos para que el cubo rote oblicuamente, no plano.

### 3) JSX de la escena

```tsx
return (
  <>
    <ambientLight intensity={0.4} />
    <directionalLight position={[5, 5, 5]} intensity={1.2} />
    <directionalLight position={[-5, -2, -3]} intensity={0.3} color="#88aaff" />
    <mesh ref={meshRef} castShadow>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#ff6b6b" metalness={0.2} roughness={0.4} />
    </mesh>
  </>
);
```

- **ambientLight** ilumina todo por igual (sin direccionalidad). `intensity 0.4` mantiene las sombras visibles pero no negras del todo.
- **directionalLight principal** desde arriba-derecha-frente (`[5,5,5]`), `intensity 1.2`. Color default = blanco.
- **directionalLight secundaria** desde abajo-izquierda-detrás, azulada (`#88aaff`), apenas presente (`0.3`). Se llama **fill light** y existe para que el lado oscuro no quede plano.
- **`<mesh>`** con `ref={meshRef}` para que useFrame lo pueda mutar.
- **`metalness: 0.2`** = casi dieléctrico (no es metal). **`roughness: 0.4`** = ni espejado ni mate.

El `<>...</>` (Fragment) agrupa todo porque el componente R3F devuelve uno solo. R3F los agrega como children directos del Canvas.

## Knobs

| Param | Default | Efecto |
|---|---|---|
| `delta * 0.5` (rotation.x) | 0.5 rad/s | Velocidad de tumbo. `2.0` = vértigo |
| `delta * 0.8` (rotation.y) | 0.8 rad/s | Velocidad horizontal |
| `boxGeometry args` | `[1.5, 1.5, 1.5]` | Dimensiones (x, y, z). `[3, 0.5, 1]` = una losa |
| `color` (material) | `#ff6b6b` | Color base |
| `metalness` | `0.2` | 0 = plástico, 1 = espejo |
| `roughness` | `0.4` | 0 = pulido, 1 = mate |

## De acá para adelante

- Cambiar `<boxGeometry>` por `<sphereGeometry>`, `<torusGeometry>`, `<icosahedronGeometry>` — same API, distinta forma.
- Reemplazar `<meshStandardMaterial>` por `<meshNormalMaterial>` (visualiza las normales, no necesita luces).
- Si querés un shader custom, ahí saltás a `<shaderMaterial>` — eso es el siguiente nivel y está documentado en el README del experimento `galaxy`.
