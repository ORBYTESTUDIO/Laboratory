export const vertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uRotationStrength;

  attribute float aScale;

  varying vec3 vColor;

  void main() {
    vec3 pos = position;

    // Mostly solid-body rotation so the spiral keeps its shape over time, with
    // a gentle differential term (inner slightly faster) for a touch of life.
    // The 0.5 constant is the rigid part; the 0.5/(r+1) part is the shear.
    // Raise the +1.0 to wind less; for a perfectly rigid spin drop the second
    // term entirely (angleOffset = uTime * uRotationStrength).
    float distanceToCenter = length(pos.xz);
    float angle = atan(pos.z, pos.x);
    float angleOffset =
        uTime * uRotationStrength * (0.5 + 0.5 / (distanceToCenter + 1.0));
    // Subtract so the galaxy turns with the spiral trailing (the natural look
    // for this winding direction). Flip back to += to reverse the spin.
    angle -= angleOffset;
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
