import { useEffect, useRef, useState } from 'react';
import { PushpinIcon } from './Pushpin';

/*
 * Chinchetas que caen al soltarlas de una tarjeta: gravedad, rebote contra el suelo del lienzo y las
 * paredes, giro, reposo tumbadas y desvanecimiento. Coordenadas en píxeles del contenedor del lienzo.
 */

export interface FallingPin {
  id: number;
  x: number;
  y: number;
}

interface PinState extends FallingPin {
  vx: number;
  vy: number;
  rot: number;
  omega: number;
  restingSince: number | null;
  opacity: number;
}

const PIN_W = 30;
const PIN_H = 38;
const GRAVITY = 2200;
const REST_MS = 2500;
const FADE_MS = 700;

interface FallingPinsProps {
  pins: FallingPin[];
  /** Tamaño del contenedor, para el suelo y las paredes. */
  bounds: { width: number; height: number };
  onDone: (id: number) => void;
}

export function FallingPins({ pins, bounds, onDone }: FallingPinsProps) {
  const [states, setStates] = useState<PinState[]>([]);
  const frame = useRef<number | null>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // Cada chincheta nueva entra con un pequeño salto, como al arrancarla de la pared.
  useEffect(() => {
    setStates(current => {
      const known = new Set(current.map(s => s.id));
      const fresh = pins
        .filter(p => !known.has(p.id))
        .map<PinState>(p => ({
          ...p,
          vx: (Math.random() - 0.5) * 220,
          vy: -260,
          rot: 28,
          omega: (Math.random() - 0.5) * 720,
          restingSince: null,
          opacity: 1,
        }));
      return fresh.length ? [...current, ...fresh] : current;
    });
  }, [pins]);

  useEffect(() => {
    if (!states.length) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const { width, height } = boundsRef.current;
      const floor = height - PIN_H - 2;
      setStates(current =>
        current.map(s => {
          let { x, y, vx, vy, rot, omega, restingSince, opacity } = s;
          if (restingSince === null) {
            vy += GRAVITY * dt;
            x += vx * dt;
            y += vy * dt;
            rot += omega * dt;
            if (x < 0) {
              x = 0;
              vx = Math.abs(vx) * 0.6;
            } else if (x > width - PIN_W) {
              x = width - PIN_W;
              vx = -Math.abs(vx) * 0.6;
            }
            if (y >= floor) {
              y = floor;
              vy = -vy * 0.48;
              vx *= 0.72;
              omega = omega * 0.5 + (Math.random() - 0.5) * 240;
              if (Math.abs(vy) < 90) {
                vy = 0;
                vx = 0;
                omega = 0;
                restingSince = now;
              }
            }
          } else {
            // Tumbada: la cabeza cae hacia el lado que ya llevaba.
            const target = rot % 360 > 0 ? 96 : -96;
            rot += (target - rot) * Math.min(1, dt * 8);
            const elapsed = now - restingSince;
            if (elapsed > REST_MS) opacity = Math.max(0, 1 - (elapsed - REST_MS) / FADE_MS);
          }
          return { ...s, x, y, vx, vy, rot, omega, restingSince, opacity };
        }),
      );
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el bucle se reinicia solo cuando empieza o termina la caída
  }, [states.length > 0]);

  // Las que ya se han desvanecido se retiran (fuera del bucle de animación, que no debe tener efectos).
  useEffect(() => {
    const done = states.filter(s => s.opacity === 0);
    if (!done.length) return;
    done.forEach(d => onDone(d.id));
    setStates(current => current.filter(s => s.opacity > 0));
  }, [states, onDone]);

  if (!states.length) return null;
  return (
    <div className="falling-pins" aria-hidden>
      {states.map(s => (
        <span
          key={s.id}
          className="node-pushpin falling"
          style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`, opacity: s.opacity }}
        >
          <PushpinIcon />
        </span>
      ))}
    </div>
  );
}
