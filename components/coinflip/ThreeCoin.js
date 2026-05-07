'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';

/**
 * ThreeCoin Component (Tactical Zinc Refactor)
 * -------------------
 * Optimized for performance and visual clarity using transparent logos 
 * and a non-reflective 'Zinc' finish.
 */
function CoinMesh({ selectedSide, isFlipping, result }) {
  const meshRef = useRef();
  
  // STEP 5: Apply Transparent Textures (Fast loading)
  const headsTexture = useTexture('/veltro-casino-nobg.png');
  const tailsTexture = useTexture('/solana.png');

  // Normalization logic: catches the moment flipping stops to prevent 'backward snapping'
  const wasFlipping = useRef(false);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isFlipping) {
      // STEP 7: Smooth Tumble Flip (No wobble)
      meshRef.current.rotation.x += delta * 15; 
      wasFlipping.current = true;
    } else {
      // STEP 6 & 8: Pre-selection and Landing Logic
      if (wasFlipping.current) {
        // One-time normalization to prevent 'snapping backward'
        // We find the 'closest' rotation to the target so it keeps moving forward
        meshRef.current.rotation.x %= (Math.PI * 2);
        wasFlipping.current = false;
      }

      const targetSide = result || selectedSide;
      const targetRotationX = targetSide === 'HEADS' ? Math.PI / 2 : 3 * Math.PI / 2;
      
      meshRef.current.rotation.x = THREE.MathUtils.lerp(
        meshRef.current.rotation.x,
        targetRotationX,
        0.12 // Faster snapping
      );
      
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.1);
    }
  });

  const goldColor = "#ffd235"; // Vibrant Gold
  
  return (
    <group ref={meshRef}>
      {/* 
         1. THE COIN BODY (Solid Gold Shade) 
      */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 0.1, 32]} />
        <meshStandardMaterial 
          color={goldColor} 
          metalness={0} 
          roughness={0.5} 
          emissive={goldColor}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* 
         2. HEADS OVERLAY 
      */}
      <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 32]} />
        <meshStandardMaterial 
          map={headsTexture} 
          transparent={true}
          roughness={1}
          metalness={0}
        />
      </mesh>

      {/* 
         3. TAILS OVERLAY (Solana Logo) 
      */}
      <mesh position={[0, -0.051, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 32]} />
        <meshStandardMaterial 
          map={tailsTexture} 
          transparent={true}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

export default function ThreeCoin({ selectedSide = 'HEADS', isFlipping = false, result = null }) {
  return (
    <div className="w-[750px] h-[300px] relative pointer-events-none mx-auto scale-90 md:scale-100 max-w-[100vw] overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute inset-0 bg-radial-gradient from-zinc-500/5 to-transparent blur-3xl opacity-30" />
      
      <Canvas 
        shadows 
        camera={{ position: [0, 0, 4], fov: 40 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        
        <Float speed={2.0} rotationIntensity={0.5} floatIntensity={0.5}>
            <CoinMesh 
                selectedSide={selectedSide} 
                isFlipping={isFlipping} 
                result={result} 
            />
        </Float>

        <ContactShadows 
            position={[0, -1.2, 0]} 
            opacity={0.2} 
            scale={6} 
            blur={3} 
            far={1} 
        />
      </Canvas>
    </div>
  );
}


