'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { equirectUV, texture } from 'three/tsl';
import { TSLComposer } from './composer';
import { createBlackHoleMaterial, createBlackHoleUniforms } from './material';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Configures the loaded textures per Singularity requirements:
//   - noise_deep.png: RepeatWrapping on both axes (sampled inside the disk loop)
//   - nebula.png: EquirectangularReflectionMapping + SRGBColorSpace, mipmaps
function useSingularityTextures() {
  const [noiseDeepTexture, starsTexture] = useLoader(THREE.TextureLoader, [
    '/textures/black-hole-singularity/noise_deep.png',
    '/textures/black-hole-singularity/nebula.png',
  ]);

  useEffect(() => {
    /* eslint-disable react-hooks/immutability */
    noiseDeepTexture.wrapS = THREE.RepeatWrapping;
    noiseDeepTexture.wrapT = THREE.RepeatWrapping;
    noiseDeepTexture.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  }, [noiseDeepTexture]);

  useEffect(() => {
    /* eslint-disable react-hooks/immutability */
    starsTexture.mapping = THREE.EquirectangularReflectionMapping;
    starsTexture.colorSpace = THREE.SRGBColorSpace;
    starsTexture.minFilter = THREE.LinearMipMapLinearFilter;
    starsTexture.magFilter = THREE.LinearFilter;
    starsTexture.generateMipmaps = true;
    starsTexture.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  }, [starsTexture]);

  return { noiseDeepTexture, starsTexture };
}

// Sets scene.backgroundNode to the same equirect texture multiplied by 2.0,
// matching the in-shader env composite. Non-negotiable #5 in
// reproducing-singularity.md: the two multipliers MUST match or the disk
// edges discontinuously bleed into the background.
function BackgroundBinding({ starsTexture }: { starsTexture: THREE.Texture }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const sceneAny = scene as any;
    const prev = sceneAny.backgroundNode;
    /* eslint-disable react-hooks/immutability */
    sceneAny.backgroundNode = texture(starsTexture, equirectUV() as any).mul(2.0);
    return () => {
      sceneAny.backgroundNode = prev;
    };
    /* eslint-enable react-hooks/immutability */
  }, [scene, starsTexture]);

  return null;
}

function BlackHoleMesh({
  noiseDeepTexture,
  starsTexture,
}: {
  noiseDeepTexture: THREE.Texture;
  starsTexture: THREE.Texture;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const uniforms = createBlackHoleUniforms();
    return createBlackHoleMaterial({ uniforms, noiseDeepTexture, starsTexture });
  }, [noiseDeepTexture, starsTexture]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.02;
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1, 16, 16]} />
    </mesh>
  );
}

function BlackHoleStage() {
  const { noiseDeepTexture, starsTexture } = useSingularityTextures();
  return (
    <>
      <BackgroundBinding starsTexture={starsTexture} />
      <BlackHoleMesh noiseDeepTexture={noiseDeepTexture} starsTexture={starsTexture} />
    </>
  );
}

export default function Scene() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <Canvas
        // Async gl factory — R3F 9 awaits this before mounting children.
        // WebGPURenderer + ACES + exposure 1.2 + SRGB output is the Singularity
        // baseline. None of those numbers are arbitrary — see
        // reproducing-singularity.md #7 ("rampEmission tuned for ACES at 1.2").
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            antialias: true,
            ...(props as object),
          } as ConstructorParameters<typeof WebGPURenderer>[0]);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.2;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          await renderer.init();
          return renderer as unknown as THREE.WebGLRenderer;
        }}
        camera={{ position: [0, 0.3, 2.2], fov: 45, near: 0.01, far: 100 }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <BlackHoleStage />
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minDistance={1.5}
          maxDistance={5}
          target={[0, 0, 0]}
        />

        <TSLComposer />
      </Canvas>
    </div>
  );
}
