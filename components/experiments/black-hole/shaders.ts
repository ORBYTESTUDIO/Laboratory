export const vertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uRotationStrength;
  uniform vec3 uCameraDir;        // unit vector from world origin toward camera
  uniform float uDopplerStrength; // 0 disables beaming (used by starfield)

  attribute float aScale;

  varying vec3 vColor;

  void main() {
    vec3 pos = position;

    // Differential keplerian-like rotation: inner ring spins faster than outer.
    // 1 / (r + epsilon) avoids div-by-zero at the core.
    float distanceToCenter = length(pos.xz);
    float angle = atan(pos.z, pos.x);
    float angleOffset = uTime * uRotationStrength / (distanceToCenter + 0.1);
    angle += angleOffset;
    pos.x = cos(angle) * distanceToCenter;
    pos.z = sin(angle) * distanceToCenter;

    // Doppler beaming: tangential velocity is perpendicular to radial in XZ.
    // Material moving toward the camera (positive dot with uCameraDir) is
    // brighter; material moving away dims. Wrapped in uDopplerStrength so
    // non-rotating layers (starfield) get a no-op.
    vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x));
    float dopplerFactor = dot(tangent, uCameraDir);
    float beaming = 1.0 + dopplerFactor * uDopplerStrength;

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    gl_PointSize = uSize * aScale * uPixelRatio;
    gl_PointSize *= (1.0 / -viewPosition.z);

    vColor = color * max(beaming, 0.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uSoftness;
  uniform float uAlphaMultiplier;

  varying vec3 vColor;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength * 2.0;
    strength = max(strength, 0.0);
    strength = pow(strength, uSoftness);

    gl_FragColor = vec4(vColor * strength, strength * uAlphaMultiplier);
  }
`;
