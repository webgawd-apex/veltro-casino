'use client';

import { useEffect, useRef } from 'react';

export default function CoinflipRain() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const updateSize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    updateSize();

    const particles = [];
    const maxParticles = 60;

    class Particle {
      constructor() {
        this.reset();
        this.y = Math.random() * canvas.height;
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = -20;
        this.l = Math.random() * 15 + 10;
        this.v = Math.random() * 4 + 8;
      }
      draw() {
        // BLUE THEME for the casino site
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + this.l);
        ctx.stroke();
      }
      update() {
        this.y += this.v;
        if (this.y > canvas.height) {
          this.reset();
        }
        this.draw();
      }
    }

    for (let i = 0; i < maxParticles; i++) {
        particles.push(new Particle());
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => p.update());
      animationFrameId = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas.parentElement);
    
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[1] opacity-50"
      style={{ mixBlendMode: 'plus-lighter' }}
    />
  );
}
