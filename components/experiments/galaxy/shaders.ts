export const vertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uRotationStrength;

  attribute float aScale;

  varying vec3 vColor;

  void main() {
    vec3 pos = position;

    // Differential rotation: inner particles spin faster than outer ones.
    // 1 / (r + epsilon) avoids div-by-zero and softens the spike at the core.
    float distanceToCenter = length(pos.xz);
    float angle = atan(pos.z, pos.x);
    float angleOffset = uTime * uRotationStrength / (distanceToCenter + 0.1);
    angle += angleOffset;
    pos.x = cos(angle) * distanceToCenter;
    pos.z = sin(angle) * distanceToCenter;

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    gl_PointSize = uSize * aScale * uPixelRatio;
    gl_PointSize *= (1.0 / -viewPosition.z);

    vColor = color;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uSoftness;        // pow exponent: higher = sharper, lower = softer
  uniform float uAlphaMultiplier; // overall opacity scale

  varying vec3 vColor;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength * 2.0;
    strength = max(strength, 0.0);
    strength = pow(strength, uSoftness);

    gl_FragColor = vec4(vColor * strength, strength * uAlphaMultiplier);
  }
`;
