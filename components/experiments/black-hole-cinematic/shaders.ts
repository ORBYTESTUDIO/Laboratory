// GLSL raymarcher for a Gargantua-style black hole.
// Follows the cinematic-raymarching skill: camera-centered sphere shell,
// adaptive-step march, inverse-cube lensing, analytic horizon + thin-disk
// slab intersection, FBM in polar coords with Keplerian swirl, doppler
// beaming + redshift, procedural starfield background, ACES Filmic + gamma.

export const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uMass;
uniform vec2  uResolution;
uniform vec3  uCameraPos;
uniform float uDiskBrightness;
uniform float uDiskDensity;
uniform float uExposure;

varying vec2 vUv;
varying vec3 vWorldPosition;

const float G                  = 1.0;
const int   MAX_STEPS          = 320;
const float MIN_STEP           = 0.02;
const float MAX_STEP           = 1.20;
const float STEP_SAFETY_FACTOR = 0.18;
const float DISK_HALF_THICK    = 0.08;
const float DISK_INNER_MULT    = 3.0;   // Schwarzschild ISCO
const float DISK_OUTER_MULT    = 12.0;

// ---------------------------------------------------------------------------
// Hash + noise + FBM (Inigo Quilez style)
// ---------------------------------------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 0.0973));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float f = 0.0;
  float w = 0.5;
  for (int i = 0; i < 5; i++) {
    f += w * noise3(p);
    p *= 2.03;
    w *= 0.5;
  }
  return f;
}

// Domain-warped FBM for the "boiling plasma" feel of the disk
float fbmWarp(vec3 p) {
  float q = fbm(p);
  return fbm(p + vec3(q * 2.5));
}

// ---------------------------------------------------------------------------
// ACES Filmic tone mapping (Narkowicz)
// ---------------------------------------------------------------------------
vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Procedural starfield — sampled from ray direction so stars stay fixed
// relative to the celestial sphere as camera moves.
// ---------------------------------------------------------------------------
vec3 starfield(vec3 rd) {
  // Use spherical coordinates to avoid pole pinching from naive xy hash
  float phi   = atan(rd.z, rd.x);
  float theta = acos(clamp(rd.y, -1.0, 1.0));
  vec2 uv = vec2(phi * 1.591549, theta * 1.591549); // / pi

  vec3 col = vec3(0.0);

  // Three octaves of star "grids" for varying densities/sizes
  for (int oct = 0; oct < 3; oct++) {
    float scale = 180.0 * pow(1.7, float(oct));
    vec2 g = uv * scale;
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    float h = hash21(gi + float(oct) * 17.0);
    float threshold = 0.992 - float(oct) * 0.002;
    if (h > threshold) {
      // Sub-pixel jitter so stars aren't grid-aligned
      vec2 jitter = vec2(hash21(gi + 3.1), hash21(gi + 7.7));
      float d = length(gf - jitter);
      float s = exp(-d * 22.0);
      float bright = pow((h - threshold) / (1.0 - threshold), 3.0);
      // Color temperature: bluer for the brightest, redder for the dimmest
      vec3 starColor = mix(vec3(1.0, 0.7, 0.5), vec3(0.7, 0.85, 1.2), bright);
      col += starColor * s * bright * 2.6;
    }
  }

  // Subtle galactic plane band along x-axis-ish equator
  float band = exp(-pow((rd.y) * 4.0, 2.0));
  float dust = fbm(rd * 6.0 + vec3(uTime * 0.005));
  col += vec3(0.15, 0.12, 0.22) * band * dust * 0.35;

  return col;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
void main() {
  vec3 ro = uCameraPos;
  vec3 rd = normalize(vWorldPosition - ro);

  float maxTraceRadius = max(140.0, length(ro) + 90.0);

  vec3  pos = ro;
  vec3  col = vec3(0.0);
  float dt  = MIN_STEP;
  bool  hitSurface = false;
  bool  captured   = false;

  float Rs    = 2.0 * G * uMass;
  float R_in  = Rs * DISK_INNER_MULT;
  float R_out = Rs * DISK_OUTER_MULT;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(pos);

    if (r < Rs)                 { captured = true; break; }
    if (r > maxTraceRadius)     break;

    // ---- Gravitational lensing: inverse-cube directional pull ------------
    vec3 gravity = -normalize(pos) * (1.5 * Rs * Rs) / (r * r * r);
    rd = normalize(rd + gravity * dt);

    // ---- Analytic hit: horizon sphere ------------------------------------
    float tHorizon = 1e20;
    {
      float b = dot(pos, rd);
      float c = dot(pos, pos) - Rs * Rs;
      float h = b * b - c;
      if (h >= 0.0) {
        float sqrtH = sqrt(h);
        float tNear = -b - sqrtH;
        float tFar  = -b + sqrtH;
        if      (tNear >= 0.0) tHorizon = tNear;
        else if (tFar  >= 0.0) tHorizon = tFar;
      }
    }

    // ---- Analytic hit: thin disk slab ------------------------------------
    float tDisk             = 1e20;
    vec3  diskHitPos        = vec3(0.0);
    float diskEdgeFade      = 0.0;
    float diskThicknessFade = 0.0;
    float diskFacing        = 0.0;
    float tEnter            = 0.0;
    float tExit             = 0.0;

    if (abs(rd.y) > 0.0001) {
      float tTop    = ( DISK_HALF_THICK - pos.y) / rd.y;
      float tBottom = (-DISK_HALF_THICK - pos.y) / rd.y;
      tEnter = min(tTop, tBottom);
      tExit  = max(tTop, tBottom);
      float tSurface = tEnter < 0.0 ? tExit : tEnter;
      if (tSurface >= 0.0) {
        vec3 candidate = pos + rd * tSurface;
        float hitR = length(candidate.xz);
        if (hitR > R_in * 0.85 && hitR < R_out * 1.05) {
          diskFacing = abs(dot(rd, vec3(0.0, 1.0, 0.0)));

          float edgeIn  = smoothstep(R_in - 0.4, R_in + 0.8, hitR);
          float edgeOut = 1.0 - smoothstep(R_out - 2.5, R_out, hitR);
          diskEdgeFade  = max(0.0, edgeIn * edgeOut);

          float insideTravel = max(0.0, tExit - max(tEnter, 0.0));
          diskThicknessFade  = max(0.4, smoothstep(0.0, DISK_HALF_THICK * 2.5, insideTravel));

          tDisk      = tSurface;
          diskHitPos = candidate;
        }
      }
    }

    // ---- Resolve nearest hit ---------------------------------------------
    float tClosest = min(tHorizon, tDisk);
    if (tClosest <= dt) {
      if (tHorizon <= tDisk) {
        // horizon absorbs — nothing behind contributes
        captured = true;
        break;
      }

      // ---- Disk shading -------------------------------------------------
      float hitR    = length(diskHitPos.xz);
      float angle   = atan(diskHitPos.z, diskHitPos.x);
      float velocity = 2.4 / sqrt(max(hitR, 0.001));
      float tOff     = uTime * velocity;

      // Polar-coord FBM with domain warp: feels like swirling plasma
      vec3 polarPos = vec3(
        (angle - tOff) * 4.0,
        diskHitPos.y * 6.0,
        hitR * 0.35
      );
      float dWarp = fbmWarp(polarPos);
      float dFine = fbm(polarPos * 3.2 + vec3(tOff * 0.5, 0.0, 0.0));
      float density = clamp(dWarp * 0.65 + dFine * 0.35, 0.0, 1.0);
      density = pow(density, 1.4) * uDiskDensity;

      // Doppler: orbital velocity tangent (counter-clockwise when y up)
      vec3 flowDir = normalize(vec3(-diskHitPos.z, 0.0, diskHitPos.x));
      float dopplerFactor = dot(rd, flowDir) * velocity;

      // Warm radial gradient: white-hot interior -> deep orange outside
      float radialT = clamp((hitR - R_in) / (R_out - R_in), 0.0, 1.0);
      vec3 warmColor = mix(
        vec3(1.30, 1.10, 0.80),  // inner: near-white
        vec3(1.20, 0.45, 0.10),  // outer: deep orange
        pow(radialT, 0.7)
      );

      // Doppler shift: approaching side bluer & brighter
      vec3 shiftColor = mix(
        vec3(1.10, 0.30, 0.10),  // red-shift
        vec3(0.75, 0.95, 1.30),  // blue-shift
        clamp(-dopplerFactor * 0.7 + 0.5, 0.0, 1.0)
      );

      // Brightness composition
      float facingWeight = mix(0.55, 1.35, pow(clamp(diskFacing, 0.0, 1.0), 0.45));
      float baseEmission     = 0.30 * diskEdgeFade;
      float texturedEmission = density * 1.10 * diskEdgeFade * diskThicknessFade;
      float brightness = (baseEmission + texturedEmission) * facingWeight;

      // Relativistic beaming: pow(D, 3-alpha) approx
      float beaming = pow(clamp(1.0 - dopplerFactor * 0.85, 0.18, 2.8), 1.8);
      brightness *= beaming;

      // Inner-edge superheating: rim near R_in glows white-hot
      float innerBoost = smoothstep(R_in + 1.2, R_in, hitR);
      vec3 innerHot = vec3(1.6, 1.5, 1.3) * innerBoost * 0.7 * diskEdgeFade;

      col = warmColor * shiftColor * brightness * uDiskBrightness + innerHot;
      hitSurface = true;
      break;
    }

    // ---- Adaptive step size ---------------------------------------------
    float distToDiskPlane = max(0.0, abs(pos.y) - DISK_HALF_THICK);
    float distToHorizon   = max(0.0, r - Rs * 1.4);
    float safeDist        = min(distToHorizon, distToDiskPlane);
    dt = clamp(safeDist * STEP_SAFETY_FACTOR, MIN_STEP, MAX_STEP);

    pos += rd * dt;
  }

  // -------------------------------------------------------------------------
  // Background: starfield only where the ray escaped to infinity.
  // The captured silhouette stays pure black, which is critical for the look.
  // -------------------------------------------------------------------------
  if (!hitSurface && !captured) {
    col = starfield(rd);
  }

  // Pre-exposure, ACES, gamma. Tone mapping must happen here, not in R3F.
  col *= uExposure;
  col  = acesFilm(col);
  col  = pow(col, vec3(1.0 / 2.2));

  gl_FragColor = vec4(col, 1.0);
}
`;
