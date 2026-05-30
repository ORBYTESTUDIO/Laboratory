'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FULLSCREEN_VERT } from './shadertoy';

// Quad de pantalla completa que ejecuta un fragment shader estilo Shadertoy.
// Mantiene vivos los uniforms globales (iTime, iResolution, iMouse) y, si el
// shader necesita canales (texturas), se pasan en `uniforms`.
export function FullscreenShader({
  fragmentShader,
  uniforms: extra,
  onFrame,
}: {
  fragmentShader: string;
  // Canales/uniforms extra del shader (p. ej. iChannel0..3). Debe ser estable.
  uniforms?: Record<string, THREE.IUniform>;
  // Hook por frame para mutar uniforms propios (p. ej. animar el FFT sintético).
  onFrame?: (elapsed: number, delta: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const materialRef = useRef<THREE.RawShaderMaterial>(null);
  const mouse = useRef({ x: 0, y: 0, down: false });
  const elapsed = useRef(0);

  // Creado una sola vez (initializer de useState, igual que buildGalaxyGeometry):
  // a diferencia de un ref, leerlo en render es válido, así que se lo pasamos al
  // material. Luego mutamos su `.value` por frame vía materialRef (mismo objeto),
  // sin re-subir ni re-renderizar — el patrón de uniforms del proyecto.
  const [uniforms] = useState<Record<string, THREE.IUniform>>(() => ({
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    ...(extra ?? {}),
  }));

  // iMouse imita a Shadertoy: xy = posición en px (origen abajo-izquierda),
  // z > 0 mientras se mantiene presionado. Escuchamos sobre el canvas en vez de
  // usar los eventos de R3F porque el quad vive en clip-space y el raycaster no
  // lo intersecta de forma fiable.
  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mouse.current.x = e.clientX - r.left;
      mouse.current.y = r.height - (e.clientY - r.top); // flip a origen abajo
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      mouse.current.down = true;
    };
    const onUp = () => {
      mouse.current.down = false;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    elapsed.current += delta; // delta acumulado (Clock.elapsedTime está deprecado)
    const mat = materialRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    u.iTime.value = elapsed.current;
    (u.iResolution.value as THREE.Vector3).set(state.size.width, state.size.height, 1);
    const m = mouse.current;
    (u.iMouse.value as THREE.Vector4).set(m.x, m.y, m.down ? 1 : 0, 0);
    onFrame?.(elapsed.current, delta);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <rawShaderMaterial
        ref={materialRef}
        vertexShader={FULLSCREEN_VERT}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        glslVersion={THREE.GLSL3}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// Canvas a pantalla completa para experimentos de shader fullscreen. Equivale a
// CanvasFrame pero SIN OrbitControls/CameraDive (no aplican a un fondo 2D) y con
// `customCanvas: true` en el registry. El fade de transición sigue funcionando:
// vive en el overlay del TransitionProvider, por encima de este canvas.
export function ShaderCanvas({
  children,
  dpr = [1, 1.5],
  background = '#000',
}: {
  children: ReactNode;
  dpr?: number | [number, number];
  background?: string;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background }}>
      <Canvas dpr={dpr} gl={{ antialias: false }}>
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}
