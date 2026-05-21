'use client';

/* eslint-disable react-hooks/immutability -- R3F + imperative three.js pipeline:
 * we deliberately mutate Three.js scene graph nodes (mesh.material, texture
 * properties, render-target contents) every frame. The React Compiler's
 * immutability rule is incompatible with this pattern; the imperative model
 * is canonical for r3f offscreen rendering. */

// Pipeline orchestrator — owns the 5 render targets, the 5 materials, and
// the per-frame loop that walks the data through them.
//
// Each frame:
//   1. Raymarch → buffer1_current   (samples buffer1_previous for temporal blend)
//   2. Mipmap tree → buffer2        (samples buffer1_current)
//   3. H-blur → buffer3             (samples buffer2)
//   4. V-blur → buffer4             (samples buffer3)
//   5. Composite → screen           (samples buffer1_current + buffer4)
//   6. Swap buffer1_current ↔ buffer1_previous for the next frame.
//
// Renders happen via `gl.render(offscreenScene, orthoCamera)` with the
// fullscreen quad's material swapped each pass. The R3F scene tree itself is
// empty (this component returns `null`); the useFrame priority of 1 disables
// R3F's auto-render so we have exclusive control of what hits the screen.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  type Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  TextureLoader,
  Vector3,
  WebGLRenderTarget,
  HalfFloatType,
  FloatType,
  NearestFilter,
  LinearFilter,
} from 'three';
// `WebGLNodesHandler` teaches the legacy WebGLRenderer how to compile and bind
// NodeMaterial / TSL programs. Without it, `gl.render()` blows up reading an
// undefined shader name (the renderer falls back to its non-node program path
// and the node uniforms it tries to resolve don't exist).
import { WebGLNodesHandler } from 'three/addons/tsl/WebGLNodesHandler.js';
import { createBuffer1Material } from './mat-buffer1';
import { createBuffer2Material } from './mat-buffer2';
import { createBuffer3Material } from './mat-buffer3';
import { createBuffer4Material } from './mat-buffer4';
import { createCompositeMaterial } from './mat-composite';
import {
  uTime,
  uResolution,
  uCameraZoom,
  uCameraRight,
  uCameraUp,
  uCameraForward,
  uCameraPos,
  tNoise,
  tGas,
  tBuffer1,
  tBuffer1Prev,
  tBuffer2,
  tBuffer3,
  tBuffer4,
} from './tsl-helpers';

// Reused vector scratch — avoids GC pressure inside useFrame.
const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _target = new Vector3(0, 0, 0);

type Props = {
  /** Resolution divider — 1 = native, 2 = half, 4 = quarter. The reference
   *  defaults to 2; lower for sharper render, higher for perf headroom. */
  quality?: number;
};

export function BlackHolePipeline({ quality = 2 }: Props) {
  // Opt out of the React Compiler for this component. The 5-pass render loop
  // is fully imperative — it mutates ref-held Three.js objects every frame,
  // which the compiler's immutability rules can't reason about. R3F
  // components doing direct three.js work commonly need this escape hatch.
  'use no memo';

  const noiseTex = useLoader(TextureLoader, '/textures/black-hole/noise.png');
  const gasTex = useLoader(TextureLoader, '/textures/black-hole/gas.jpg');

  // Attach the WebGL nodes handler to R3F's renderer. Without it the legacy
  // WebGLRenderer doesn't know how to compile NodeMaterial / TSL programs.
  // Done in useEffect so it runs once per Canvas; the nodesReady ref gates
  // useFrame so we don't try to render before the handler is in place.
  const gl = useThree((s) => s.gl);
  const nodesReady = useRef(false);
  useEffect(() => {
    type RendererWithNodes = typeof gl & {
      _nodesHandler?: unknown;
      setNodesHandler?: (h: unknown) => void;
    };
    const renderer = gl as RendererWithNodes;
    if (renderer.setNodesHandler && !renderer._nodesHandler) {
      renderer.setNodesHandler(new WebGLNodesHandler());
    }
    nodesReady.current = true;
  }, [gl]);

  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const bufferW = Math.max(2, Math.floor((size.width * dpr) / quality));
  const bufferH = Math.max(2, Math.floor((size.height * dpr) / quality));

  // -------------- Render targets ----------------------------------------
  const rts = useMemo(() => {
    const baseOpts = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
      format: RGBAFormat,
      type: FloatType,
    } as const;
    const bloomOpts = {
      ...baseOpts,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
      type: HalfFloatType,
    } as const;
    return {
      buffer1A: new WebGLRenderTarget(2, 2, baseOpts),
      buffer1B: new WebGLRenderTarget(2, 2, baseOpts),
      buffer2: new WebGLRenderTarget(2, 2, baseOpts),
      buffer3: new WebGLRenderTarget(2, 2, baseOpts),
      buffer4: new WebGLRenderTarget(2, 2, bloomOpts),
    };
  }, []);

  // Resize when canvas size or quality changes
  useEffect(() => {
    rts.buffer1A.setSize(bufferW, bufferH);
    rts.buffer1B.setSize(bufferW, bufferH);
    rts.buffer2.setSize(bufferW, bufferH);
    rts.buffer3.setSize(bufferW, bufferH);
    rts.buffer4.setSize(bufferW, bufferH);
    uResolution.value.set(bufferW, bufferH);
  }, [rts, bufferW, bufferH]);

  // Dispose RTs on unmount
  useEffect(() => {
    return () => {
      rts.buffer1A.dispose();
      rts.buffer1B.dispose();
      rts.buffer2.dispose();
      rts.buffer3.dispose();
      rts.buffer4.dispose();
    };
  }, [rts]);

  // -------------- Materials --------------------------------------------
  const materials = useMemo(() => ({
    buffer1: createBuffer1Material(),
    buffer2: createBuffer2Material(),
    buffer3: createBuffer3Material(),
    buffer4: createBuffer4Material(),
    composite: createCompositeMaterial(),
  }), []);

  useEffect(() => {
    return () => {
      materials.buffer1.dispose();
      materials.buffer2.dispose();
      materials.buffer3.dispose();
      materials.buffer4.dispose();
      materials.composite.dispose();
    };
  }, [materials]);

  // -------------- Offscreen scene + ortho camera -----------------------
  const offscreen = useMemo(() => {
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new PlaneGeometry(2, 2);
    // Generic Material typing so we can hot-swap NodeMaterial instances onto
    // mesh.material each pass. Without the explicit generic, TS infers the
    // type as MeshBasicMaterial and rejects later assignments.
    const mesh = new Mesh<PlaneGeometry, Material>(geometry, new MeshBasicMaterial());
    scene.add(mesh);
    return { scene, camera, mesh, geometry };
  }, []);

  useEffect(() => {
    return () => {
      offscreen.geometry.dispose();
    };
  }, [offscreen]);

  // -------------- Ping-pong tracking -----------------------------------
  // pingPong.cur is where this frame's raymarch writes. After render we
  // swap so next frame's raymarch reads from this RT as the "previous".
  const pingPong = useRef<{ cur: WebGLRenderTarget; prev: WebGLRenderTarget }>({
    cur: rts.buffer1A,
    prev: rts.buffer1B,
  });

  // -------------- Texture setup (one-shot in effect) -------------------
  // Texture nodes are module-level, so we mutate their .value once after
  // textures load. wrapS/wrapT must be set before first sample.
  useEffect(() => {
    noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping;
    gasTex.wrapS = gasTex.wrapT = RepeatWrapping;
    noiseTex.needsUpdate = true;
    gasTex.needsUpdate = true;
    tNoise.value = noiseTex;
    tGas.value = gasTex;
  }, [noiseTex, gasTex]);

  // -------------- The render loop --------------------------------------
  useFrame((state, delta) => {
    if (!nodesReady.current) return; // wait until WebGLNodesHandler is attached

    const gl = state.gl;
    const camera = state.camera;

    // Reference scales time by 4x — gives the disk a livelier rotation
    // without changing the underlying constants.
    uTime.value += delta * 4.0;

    // Camera basis derived from R3F's camera looking at the origin. This is
    // how OrbitControls drives the raymarch view.
    _forward.subVectors(_target, camera.position).normalize();
    _right.crossVectors(_forward, camera.up).normalize();
    _up.crossVectors(_right, _forward).normalize();
    uCameraForward.value.copy(_forward);
    uCameraRight.value.copy(_right);
    uCameraUp.value.copy(_up);
    uCameraPos.value.copy(camera.position);
    uCameraZoom.value = camera.position.length();

    // Wire the texture nodes for this frame.
    tBuffer1Prev.value = pingPong.current.prev.texture;

    // -------- Pass 1: raymarch --------
    offscreen.mesh.material = materials.buffer1;
    gl.setRenderTarget(pingPong.current.cur);
    gl.render(offscreen.scene, offscreen.camera);

    tBuffer1.value = pingPong.current.cur.texture;

    // -------- Pass 2: mipmap tree --------
    offscreen.mesh.material = materials.buffer2;
    gl.setRenderTarget(rts.buffer2);
    gl.render(offscreen.scene, offscreen.camera);
    tBuffer2.value = rts.buffer2.texture;

    // -------- Pass 3: horizontal blur --------
    offscreen.mesh.material = materials.buffer3;
    gl.setRenderTarget(rts.buffer3);
    gl.render(offscreen.scene, offscreen.camera);
    tBuffer3.value = rts.buffer3.texture;

    // -------- Pass 4: vertical blur --------
    offscreen.mesh.material = materials.buffer4;
    gl.setRenderTarget(rts.buffer4);
    gl.render(offscreen.scene, offscreen.camera);
    tBuffer4.value = rts.buffer4.texture;

    // -------- Pass 5: composite to screen --------
    offscreen.mesh.material = materials.composite;
    gl.setRenderTarget(null);
    gl.render(offscreen.scene, offscreen.camera);

    // Swap ping-pong for next frame
    const swap = pingPong.current.cur;
    pingPong.current.cur = pingPong.current.prev;
    pingPong.current.prev = swap;
  }, 1); // priority > 0 disables R3F's auto-render

  return null;
}
