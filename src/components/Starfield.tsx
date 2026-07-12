import { useEffect, useRef } from 'preact/hooks';
import type { Overlay } from '../config/types';

interface Particle {
  x: number; y: number; vx: number; vy: number; size: number; alpha: number;
}

interface Props {
  hue: number;
  overlay: Overlay;
  hyperspace: boolean;
  reducedMotion: boolean;
}

export function Starfield({ hue, overlay, hyperspace, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ hue, overlay, hyperspace, reducedMotion });
  stateRef.current = { hue, overlay, hyperspace, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      if (!canvas) return;
      w = canvas.width = canvas.offsetWidth * dpr;
      h = canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = Array.from({ length: 46 }, () => ({
      x: Math.random() * (canvas.offsetWidth || 400),
      y: Math.random() * (canvas.offsetHeight || 700),
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      size: Math.random() * 2 + 0.6,
      alpha: Math.random() * 0.5 + 0.25,
    }));

    function frame() {
      if (!ctx || !canvas) return;
      const { hue, overlay, hyperspace, reducedMotion } = stateRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.scale(dpr, dpr);
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight;

      for (const p of particles) {
        let vx = p.vx, vy = p.vy;
        if (!reducedMotion) {
          if (overlay === 'frost') vy = Math.abs(p.vy) * 0.7 + 0.06;
          else if (overlay === 'embers') vy = -Math.abs(p.vy) * 1.3 - 0.12;
          else if (overlay === 'spores') vy = -Math.abs(p.vy) * 0.6 - 0.04;
          else if (overlay === 'glitch' && Math.random() < 0.01) { p.x = Math.random() * cw; p.y = Math.random() * ch; }

          if (hyperspace) {
            p.x += 0;
            p.y += 9 + p.size * 5;
          } else {
            p.x += vx;
            p.y += vy;
          }
        }
        if (p.x < 0) p.x = cw; if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch; if (p.y > ch) p.y = 0;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 85%, 72%, ${p.alpha})`;
        if (hyperspace && !reducedMotion) {
          ctx.fillRect(p.x, p.y, 1.6, 12 + p.size * 6);
        } else {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (overlay === 'scanlines') {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        for (let y = 0; y < ch; y += 4) ctx.fillRect(0, y, cw, 1);
      }

      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} class="starfield-canvas" />;
}
