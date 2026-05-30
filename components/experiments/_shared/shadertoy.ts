import * as THREE from 'three';

// ── Adaptador Shadertoy -> three.js ───────────────────────────────────────────
//
// Los shaders de la carpeta `shaders/` están escritos en el dialecto de
// Shadertoy: definen `void mainImage(out vec4 fragColor, in vec2 fragCoord)` y
// asumen los uniforms globales `iTime`, `iResolution` (vec3), `iMouse` (vec4) y
// `iChannel0..N` (samplers). three.js no los provee, así que `wrapShadertoy`
// arma un fragment shader GLSL ES 3.00 completo: cabecera con esos uniforms +
// el cuerpo Shadertoy verbatim + un `main()` que llama a `mainImage`.
//
// Por qué GLSL ES 3.00 (THREE.GLSL3) y no el default 1.00:
//   - `round()` (tribulence) y `tanh()` (nebula-flight) sólo existen en 3.00.
//   - `texture()`/`textureLod()` (warp-tunnel) son la API de 3.00; en 1.00
//     serían `texture2D`/`texture2DLodEXT` (con extensión).
// Se renderiza con RawShaderMaterial, así que three NO inyecta nada salvo la
// directiva `#version 300 es`; el resto del preámbulo lo declaramos a mano.

// fragCoord se reconstruye como `vUv * iResolution.xy`. vUv viene del quad
// fullscreen, así que es autoconsistente con iResolution (ambos en px CSS) y no
// dependemos de gl_FragCoord (que estaría en px del drawing buffer, afectado por
// el devicePixelRatio).
export function wrapShadertoy(body: string, channels: string[] = []): string {
  const samplers = channels.map((c) => `uniform sampler2D ${c};`).join('\n');
  // La salida global se llama shadertoyFragColor y NO outColor: el cuerpo del
  // warp-tunnel declara una local `vec3 outColor`, así evitamos el shadowing.
  // (Y ojo: nada de backticks dentro del template — cerrarían el string JS.)
  return `precision highp float;
precision highp int;

uniform float iTime;
uniform vec3  iResolution;
uniform vec4  iMouse;
${samplers}

in  vec2 vUv;
out vec4 shadertoyFragColor;

${body}

void main() {
  vec4 shadertoyColor = vec4(0.0);
  mainImage(shadertoyColor, vUv * iResolution.xy);
  shadertoyFragColor = shadertoyColor;
}
`;
}

// Vertex shader pasa-todo para un quad de pantalla completa. La geometría es un
// PlaneGeometry(2,2): sus posiciones ya van de -1 a 1, así que escribimos
// gl_Position directo en clip-space e ignoramos por completo la cámara (estos
// shaders SON el fondo; orbitar no tiene sentido). Declaramos los atributos a
// mano porque RawShaderMaterial no los inyecta.
export const FULLSCREEN_VERT = `precision highp float;

in vec3 position;
in vec2 uv;
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Textura de ruido RGBA blanco para iChannel0 del warp-tunnel. Su `Noise()`
// interpola con smoothstep, así que ruido por píxel basta para reconstruir value
// noise suave. RepeatWrapping es obligatorio: el shader la samplea con UVs que
// crecen sin límite a lo largo del túnel.
export function makeNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// El warp-tunnel original lee iChannel3 como el FFT del audio (el radio y el
// color del túnel laten con la música). No hay audio acá, así que sintetizamos
// un "espectro" que pulsa: graves fuertes + medios que ondulan, animado cada
// frame vía `update(t)`. El shader sólo muestrea las columnas x≈0.2 y x≈0.5 de
// la fila inferior, pero llenamos la textura entera por prolijidad.
export function makeFFTTexture(width = 64): {
  texture: THREE.DataTexture;
  update: (t: number) => void;
} {
  const height = 2;
  const data = new Uint8Array(width * height * 4);
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const update = (t: number) => {
    for (let x = 0; x < width; x++) {
      const f = x / width; // 0 (graves) -> 1 (agudos)
      const bass = 0.5 + 0.5 * Math.sin(t * 2.0);
      const mid = 0.5 + 0.5 * Math.sin(t * 5.0 + f * 10.0);
      const amp = bass * Math.exp(-f * 4.0) + mid * 0.3 * Math.exp(-f * 1.5);
      const v = Math.max(0, Math.min(1, amp)) * 255;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    tex.needsUpdate = true;
  };

  return { texture: tex, update };
}
