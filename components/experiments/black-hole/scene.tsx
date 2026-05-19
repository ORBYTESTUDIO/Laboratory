'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import { AccretionDisk } from './disk';
import { EventHorizon } from './horizon';
import { LensedDisk } from './lensed-disk';
import { PhotonRing } from './photon-ring';
import { Starfield } from './starfield';

// Rotates the camera's up vector so the horizon line in the rendered image
// tilts. OrbitControls respects camera.up, so the orbit stays consistent
// with the new "up" direction.
function CameraRoll({ angle }: { angle: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { update?: () => void } | null;

  useEffect(() => {
    const original = camera.up.clone();
    camera.up.set(Math.sin(angle), Math.cos(angle), 0);
    controls?.update?.();
    return () => {
      camera.up.copy(original);
      controls?.update?.();
    };
  }, [camera, controls, angle]);

  return null;
}

const ROLL_DEGREES = 12;
const ROLL_RAD = (ROLL_DEGREES * Math.PI) / 180;

export default function Scene() {
  return (
    <>
      <CameraRoll angle={ROLL_RAD} />
      <Starfield />
      <EventHorizon />
      <AccretionDisk />
      <LensedDisk />
      <PhotonRing />
      <EffectComposer>
        <Bloom
          intensity={0.12}
          luminanceThreshold={0.88}
          luminanceSmoothing={0.8}
          kernelSize={KernelSize.SMALL}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
