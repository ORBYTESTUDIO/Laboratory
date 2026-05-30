import { FULLSCREEN_VERT } from '../_shared/shadertoy';

export const vertexShader = FULLSCREEN_VERT;

// Shader DIDÁCTICO de domain warping (no es un port Shadertoy: tiene sus propios
// uniforms de control). La idea de domain warping en una línea:
//
//   en vez de evaluar  fbm(p),  evaluás  fbm(p + desplazamiento)
//   donde el desplazamiento TAMBIÉN sale de fbm. Anidás capas -> más caos orgánico.
//
//   capa 0:  f = fbm(p)
//   capa 1:  f = fbm(p + warp*q),        q = fbm(p)            (vectorial)
//   capa 2:  f = fbm(p + warp*r),        r = fbm(p + warp*q)
//
// Es la técnica base de tu tribulence.glsl. GLSL ES 3.00 (RawShaderMaterial).
export const fragmentShader = /* glsl */ `precision highp float;

uniform float uTime;        // segundos * velocidad
uniform vec2  uResolution;  // px
uniform float uWarp;        // intensidad del desplazamiento (0 = fbm puro)
uniform float uLayers;      // 0, 1 o 2 capas de warp anidadas
uniform float uScale;       // zoom del ruido base
uniform float uColor;       // 0 = grises (ver estructura), 1 = paleta

in  vec2 vUv;
out vec4 outColor;

// --- value noise 2D: hash en los nodos de la grilla + interpolación suave ---
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);              // smoothstep: bordes suaves
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// --- FBM: sumar 5 "octavas" (cada una al doble de frecuencia y mitad de amplitud) ---
float fbm(vec2 p) {
  float f = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    f += amp * noise(p);
    p *= 2.0;                                // doble de detalle
    amp *= 0.5;                              // mitad de peso
  }
  return f;
}

// --- paleta procedural (Inigo Quilez): un color entero a partir de un escalar ---
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  // coords centradas, con el aspecto corregido y un zoom (uScale)
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;
  p *= uScale;
  float t = uTime;

  // ================= DOMAIN WARPING =================
  vec2 q = vec2(0.0);
  vec2 r = vec2(0.0);

  if (uLayers >= 1.0) {
    q = vec2(fbm(p + vec2(0.0, 0.0) + 0.15 * t),
             fbm(p + vec2(5.2, 1.3) - 0.15 * t));
  }
  if (uLayers >= 2.0) {
    r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.12 * t),
             fbm(p + uWarp * q + vec2(8.3, 2.8) - 0.12 * t));
  }
  vec2 warp = (uLayers >= 2.0) ? r : q;     // qué desplazamiento usar
  float f = fbm(p + uWarp * warp);          // con uWarp = 0 esto es fbm(p) puro
  // ==================================================

  // grises para LEER la estructura, o paleta para que quede lindo
  vec3 col = mix(vec3(f), palette(f + 0.1 * uWarp * length(warp)), uColor);
  col = pow(col, vec3(1.3));                 // un toque de contraste
  outColor = vec4(col, 1.0);
}
`;
