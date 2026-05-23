'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PostProcessing, WebGPURenderer } from 'three/webgpu';
import {
  emissive,
  mrt,
  output,
  pass,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// TSL post-stack: scene pass with MRT(output, emissive) -> bloom.
// Drives the render loop via useFrame(priority=1), which disables R3F's
// default render so the composer is the sole writer to the canvas.
//
// Non-negotiable #14 from the skill: TSL bloom is hotter than GLSL at the
// same numbers. We start at strength=0.22, threshold=0.
export function TSLComposer() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const composerRef = useRef<PostProcessing | null>(null);

  useEffect(() => {
    // The renderer must be a WebGPURenderer for TSL post-processing to work
    if (!(gl instanceof WebGPURenderer)) {
      console.warn('[TSLComposer] Renderer is not WebGPU; skipping post stack');
      return;
    }

    const composer = new PostProcessing(gl);
    const scenePass = pass(scene, camera as any, {});
    (scenePass as any).setMRT(mrt({ output, emissive }));

    const colorTex = (scenePass as any).getTextureNode('output');
    // Canonical Singularity values: strength=0.217, radius=0, threshold=0.
    // See reproducing-singularity.md — must not change.
    const bloomPass = bloom(colorTex, 0.217, 0.0, 0.0);

    (composer as any).outputNode = colorTex.add(bloomPass);
    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      // PostProcessing's dispose method handles its own GPU resources
      try {
        (composer as unknown as { dispose?: () => void }).dispose?.();
      } catch {
        /* noop */
      }
    };
  }, [gl, scene, camera]);

  // priority=1 disables R3F's default render — composer becomes the sole
  // sink. We swallow the Promise; the next frame is requested via R3F.
  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    void (composer as unknown as { renderAsync: () => Promise<void> }).renderAsync();
  }, 1);

  // Ensure renderer size matches viewport on resize
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => {
    if (!(gl instanceof WebGPURenderer)) return;
    gl.setSize(size.width, size.height, false);
    gl.setPixelRatio(Math.min(dpr, 1.5));
    /* eslint-disable react-hooks/immutability */
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = size.width / Math.max(size.height, 1);
      camera.updateProjectionMatrix();
    }
    /* eslint-enable react-hooks/immutability */
  }, [gl, size, dpr, camera]);

  return null;
}
