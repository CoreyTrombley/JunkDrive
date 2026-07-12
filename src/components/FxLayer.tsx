import { useEffect, useRef, useState } from 'preact/hooks';
import { onUiEvent } from '../engine/bus';

interface FloaterItem { id: number; text: string; kind: string; }
interface ToastItem { id: number; text: string; icon?: string; }
interface ConfettiItem { id: number; emoji: string; left: number; delay: number; }

const CONFETTI_EMOJI = ['✨', '💰', '⭐', '🎉', '💎', '🚀'];

export function FxLayer() {
  const [floaters, setFloaters] = useState<FloaterItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confetti, setConfetti] = useState<ConfettiItem[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    return onUiEvent((e) => {
      if (e.type === 'floater') {
        const id = seq.current++;
        setFloaters((f) => [...f.slice(-5), { id, text: e.text, kind: e.kind }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 800);
      } else if (e.type === 'toast') {
        const id = seq.current++;
        setToasts((t) => [...t.slice(-2), { id, text: e.text, icon: e.icon }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
      } else if (e.type === 'confetti') {
        const count = e.power === 'big' ? 26 : 14;
        const batch: ConfettiItem[] = Array.from({ length: count }, () => ({
          id: seq.current++,
          emoji: CONFETTI_EMOJI[Math.floor(Math.random() * CONFETTI_EMOJI.length)],
          left: Math.random() * 100,
          delay: Math.random() * 250,
        }));
        setConfetti((c) => [...c, ...batch]);
        setTimeout(() => setConfetti((c) => c.filter((x) => !batch.includes(x))), 1200);
      }
    });
  }, []);

  return (
    <div class="fx-layer">
      <div class="floater-stack">
        {floaters.map((f) => (
          <div key={f.id} class={`floater ${f.kind}`}>{f.text}</div>
        ))}
      </div>
      <div class="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} class="toast">
            {t.icon && <span>{t.icon}</span>}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {confetti.map((c) => (
        <div key={c.id} class="confetti-piece" style={{ left: `${c.left}%`, animationDelay: `${c.delay}ms` }}>
          {c.emoji}
        </div>
      ))}
    </div>
  );
}
