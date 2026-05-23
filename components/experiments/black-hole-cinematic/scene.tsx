'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import * as THREE from 'three';
import { ShaderShell } from './shader-shell';

export default function Scene() {
  const gl = useThree((s) => s.gl);

  // The shader does its own ACES + gamma. Disable R3F's tone mapping so it
  // doesn't double-process, and keep linear output so Bloom reads HDR-ish.
  useEffect(() => {
    const prev = { tm: gl.toneMapping, cs: gl.outputColorSpace };
    /* eslint-disable react-hooks/immutability */
    gl.toneMapping = THREE.NoToneMapping;
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    return () => {
      gl.toneMapping = prev.tm;
      gl.outputColorSpace = prev.cs;
    };
    /* eslint-enable react-hooks/immutability */
  }, [gl]);

  return (
    <>
      <color attach="background" args={['#000000']} />

      <ShaderShell mass={1.4} diskBrightness={1.15} diskDensity={1.0} exposure={1.15} />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.15}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.82}
          mipmapBlur
          kernelSize={KernelSize.LARGE}
          blendFunction={BlendFunction.SCREEN}
        />
        <Vignette eskil={false} offset={0.18} darkness={0.85} />
      </EffectComposer>
    </>
  );
}
