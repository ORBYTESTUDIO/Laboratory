'use client';

// Pure black opaque sphere. Its depth buffer write is what occludes the back
// half of the accretion disk's particles, giving the visual a real "shadow".
export function EventHorizon() {
  return (
    <mesh>
      <sphereGeometry args={[0.95, 64, 64]} />
      <meshBasicMaterial color="#000000" />
    </mesh>
  );
}
