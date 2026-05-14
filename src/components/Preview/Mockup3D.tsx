'use client';

import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { useStore } from '@/store/useStore';
import { sleeveCopyPreviewUrl } from '@/lib/packOrder';
import * as THREE from 'three';
import { Suspense, useState, useEffect, useRef } from 'react';

// Suppress known Three.js deprecation warnings coming from R3F internals
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('THREE.Clock:') ||
      args[0].includes('PCFSoftShadowMap has been deprecated')
    )) {
      return;
    }
    originalWarn(...args);
  };
}

function SleeveModel({ textureUrl, sleeveType }: { textureUrl?: string, sleeveType?: 'Standard' | 'Japanese' }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const isJapanese = sleeveType === 'Japanese';
  // Standard: 5x7
  // Japanese: 5x7.18 (derived from 62x89mm ratio)
  const height = isJapanese ? 7.18 : 7;
  
  useEffect(() => {
    if (!textureUrl) {
      setTexture(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = textureUrl;
  }, [textureUrl]);

  // Slow continuous rotation
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2; // Slow and steady 360 rotation
    }
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[5, height, 0.05]} />
      {/* Front material (The design) */}
      {texture ? (
        <meshStandardMaterial 
          key={texture.uuid}
          attach="material-4" 
          map={texture} 
          roughness={0.3}
          metalness={0.1}
          color="#ffffff"
        />
      ) : (
        <meshStandardMaterial 
          attach="material-4" 
          roughness={0.3}
          metalness={0.1}
          color="#111111"
        />
      )}
      {/* Back and sides (The "Brushed" texture) */}
      <meshStandardMaterial attach="material-0" color="#0a0a0a" roughness={0.8} />
      <meshStandardMaterial attach="material-1" color="#0a0a0a" roughness={0.8} />
      <meshStandardMaterial attach="material-2" color="#0a0a0a" roughness={0.8} />
      <meshStandardMaterial attach="material-3" color="#0a0a0a" roughness={0.8} />
      <meshStandardMaterial attach="material-5" color="#0a0a0a" roughness={0.8} />
    </mesh>
  );
}

export default function Mockup3D() {
  const { activeSleeveId, activeSleeveCopyId, sleeves, packs } = useStore();
  const activeSleeve = sleeves.find(s => s.id === activeSleeveId);
  const activeCopy = activeSleeve?.sleeveCopies?.find((copy) => copy.id === activeSleeveCopyId);
  const previewUrl = activeSleeve ? sleeveCopyPreviewUrl(activeSleeve, activeCopy) : undefined;
  const activePack = activeSleeve
    ? packs.find((p) => p.id === activeSleeve.packId)
    : undefined;

  return (
    <div className="w-full h-full">
      <Canvas shadows={{ type: THREE.PCFShadowMap }}>
        <color attach="background" args={['#2a2a2a']} />
        <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={45} />
        <OrbitControls 
          enablePan={false} 
          enableZoom={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.5}
        />
        
        <ambientLight intensity={1.5} />
        <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={10} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={3} />
        <directionalLight position={[0, 0, 10]} intensity={2} />
        <Suspense fallback={null}>
          <SleeveModel textureUrl={previewUrl} sleeveType={activePack?.sleeveType} />
          <Environment preset="studio" />
          <ContactShadows 
            position={[0, -4, 0]} 
            opacity={0.4} 
            scale={15} 
            blur={2} 
            far={4.5} 
          />
        </Suspense>
      </Canvas>
      
      {!previewUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Waiting for design...
          </p>
        </div>
      )}
    </div>
  );
}
