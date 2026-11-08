'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { SphereGeometry, Vector3, type Mesh } from 'three';
import { globeDirections, globeRadius, type Scores } from '@/lib/globe-shape';

function Globe({
  scores,
  rotating,
  onReady,
  surface,
}: {
  scores: Scores;
  rotating: boolean;
  onReady: () => void;
  surface: string;
}) {
  const mesh = useRef<Mesh>(null);
  const ready = useRef(false);
  const geometry = useMemo(() => new SphereGeometry(1, 96, 64), []);
  const original = useMemo(() => new Float32Array(geometry.attributes['position']?.array ?? []), [geometry]);
  const directions = useMemo(() => globeDirections(scores.length), [scores.length]);
  const target = useMemo(() => {
    const values = new Float32Array(original.length);
    for (let i = 0; i < original.length; i += 3) {
      const x = original[i] ?? 0, y = original[i + 1] ?? 0, z = original[i + 2] ?? 0;
      const radius = globeRadius(x, y, z, scores, directions);
      values[i] = x * radius; values[i + 1] = y * radius; values[i + 2] = z * radius;
    }
    return values;
  }, [scores, directions, original]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  /* eslint-disable react-hooks/immutability -- per-frame vertex mutation is
     the sanctioned react-three-fiber pattern; three.js objects are mutable by
     design and never flow back into React state. */
  useFrame((_, delta) => {
    const position = geometry.attributes['position'];
    if (!position) return;
    const blend = ready.current ? 1 - Math.exp(-5 * Math.min(delta, 0.05)) : 1;
    for (let i = 0; i < target.length; i++) {
      const current = position.array[i] ?? 0;
      position.array[i] = current + ((target[i] ?? 0) - current) * blend;
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    if (rotating && mesh.current) mesh.current.rotation.y += Math.min(delta, 0.05) * 0.18;
    if (!ready.current) { ready.current = true; onReady(); }
  });
  /* eslint-enable react-hooks/immutability */
  return (
    <mesh ref={mesh} geometry={geometry} rotation={[0.22, 0.4, 0]}>
      <meshPhysicalMaterial color={surface} metalness={0.12} roughness={0.27} clearcoat={0.45} clearcoatRoughness={0.4} />
    </mesh>
  );
}

export default function ScoreGlobeScene({ scores, rotating }: { scores: Scores; rotating: boolean }) {
  const [ready, setReady] = useState(false);
  // Loaded via next/dynamic ssr:false, so DOM access in the initializer is safe.
  const [colors] = useState<{ surface: string; light: string } | null>(() => {
    const css = getComputedStyle(document.documentElement);
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const read = (token: string) => {
      context.fillStyle = css.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    return { surface: read('--globe-surface'), light: read('--globe-light') };
  });
  return (
    <div className="absolute inset-0" data-scene-ready={ready || undefined}>
      {colors && <Canvas camera={{ position: [0, 0, 5.3], fov: 40 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} color={colors.light} />
        <Environment resolution={64}>
          <Lightformer intensity={2.5} color={colors.light} position={[-3, 4, 4]} scale={[4, 5, 1]} />
          <Lightformer intensity={1.8} color={colors.surface} position={[4, 0, 2]} scale={[3, 5, 1]} />
        </Environment>
        <Globe scores={scores} rotating={rotating} surface={colors.surface} onReady={() => setReady(true)} />
        <OrbitControls enableZoom={false} enablePan={false} target={new Vector3(0, 0, 0)} />
      </Canvas>}
    </div>
  );
}
