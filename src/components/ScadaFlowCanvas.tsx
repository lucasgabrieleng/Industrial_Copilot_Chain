import React, { useEffect, useRef } from 'react';
import { CAPACITIES, clamp, fmt } from '../engine/processSimulation';
import type { ProcessPoint } from '../types/process';

interface ScadaFlowCanvasProps {
  point: ProcessPoint;
  theme: 'dark' | 'light';
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

interface Particle {
  progress: number;
  speed: number;
  lane: number;
  size: number;
}

export const ScadaFlowCanvas: React.FC<ScadaFlowCanvasProps> = ({
  point,
  theme,
  canvasRef: externalRef,
}) => {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = externalRef ?? internalRef;
  const pointRef = useRef(point);
  const themeRef = useRef(theme);
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef(0);

  pointRef.current = point;
  themeRef.current = theme;

  useEffect(() => {
    particlesRef.current = Array.from({ length: 48 }, () => ({
      progress: Math.random(),
      speed: 0.0024 + Math.random() * 0.0034,
      lane: Math.random() * 10 - 5,
      size: 1.8 + Math.random() * 1.4,
    }));

    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = window.devicePixelRatio || 1;
          const targetW = Math.round(rect.width * dpr);
          const targetH = Math.round(rect.height * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const width = rect.width;
            const height = rect.height;
            const p = pointRef.current;
            const isDark = themeRef.current === 'dark';
            ctx.fillStyle = isDark ? '#020617' : '#f8fafc';
            ctx.fillRect(0, 0, width, height);
            const speedFactor = clamp(p.throughput / 185, 0.2, 1.5);
            phaseRef.current += 0.045 * speedFactor;

            // Subtle technical dot-matrix background
            ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.16)';
            const gridStep = 24;
            for (let gx = 16; gx < width; gx += gridStep) {
              for (let gy = 16; gy < height; gy += gridStep) {
                ctx.fillRect(gx, gy, 1.2, 1.2);
              }
            }

            const compact = width < 680;
            const nodeW = compact ? Math.max(76, width * 0.175) : Math.min(168, width * 0.165);
            const nodeH = compact ? 92 : 114;
            const bufW = compact ? 64 : 96;
            const bufH = compact ? 104 : 132;
            const centerY = height / 2 + 4;

            const xA = width * 0.095 - nodeW / 2;
            const xAB = width * 0.305 - bufW / 2;
            const xB = width * 0.50 - nodeW / 2;
            const xBC = width * 0.695 - bufW / 2;
            const xC = width * 0.905 - nodeW / 2;

            // Draw industrial conduits (outer casing + inner laminar core)
            const segments = [
              { x1: xA + nodeW, x2: xAB, delta: p.rateA - p.rateB, starved: false },
              { x1: xAB + bufW, x2: xB, delta: null, starved: p.starvedB },
              { x1: xB + nodeW, x2: xBC, delta: p.rateB - p.rateC, starved: p.starvedB },
              { x1: xBC + bufW, x2: xC, delta: null, starved: p.starvedC },
            ];

            segments.forEach((seg) => {
              const pipeW = compact ? 10 : 14;
              // Outer pipe flange
              ctx.fillStyle = isDark ? '#1e293b' : '#cbd5e1';
              ctx.fillRect(seg.x1, centerY - pipeW / 2, seg.x2 - seg.x1, pipeW);

              // Pipe top/bottom highlight
              ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(71, 85, 105, 0.28)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(seg.x1, centerY - pipeW / 2);
              ctx.lineTo(seg.x2, centerY - pipeW / 2);
              ctx.moveTo(seg.x1, centerY + pipeW / 2);
              ctx.lineTo(seg.x2, centerY + pipeW / 2);
              ctx.stroke();

              // Inner fluid stream
              ctx.fillStyle = seg.starved
                ? isDark
                  ? 'rgba(239, 68, 68, 0.22)'
                  : 'rgba(239, 68, 68, 0.16)'
                : isDark
                  ? 'rgba(56, 189, 248, 0.16)'
                  : 'rgba(2, 132, 199, 0.14)';
              ctx.fillRect(seg.x1, centerY - (pipeW - 4) / 2, seg.x2 - seg.x1, pipeW - 4);

              // Animated directional chevrons along the pipe
              const segLen = seg.x2 - seg.x1;
              if (segLen > 24) {
                const chevSpacing = 22;
                const offset = (phaseRef.current * 14) % chevSpacing;
                ctx.strokeStyle = seg.starved
                  ? 'rgba(248, 113, 113, 0.7)'
                  : isDark
                    ? 'rgba(56, 189, 248, 0.55)'
                    : 'rgba(2, 132, 199, 0.55)';
                ctx.lineWidth = 1.4;
                for (let cx = seg.x1 + offset + 6; cx < seg.x2 - 6; cx += chevSpacing) {
                  ctx.beginPath();
                  ctx.moveTo(cx - 3, centerY - 3);
                  ctx.lineTo(cx + 1.5, centerY);
                  ctx.lineTo(cx - 3, centerY + 3);
                  ctx.stroke();
                }
              }

              // Net mass-balance label between stages & buffers
              if (!compact && seg.delta !== null && segLen > 38) {
                const midX = (seg.x1 + seg.x2) / 2;
                const pos = seg.delta >= 0;
                const sign = pos ? '+' : '';
                const label = `${sign}${fmt(seg.delta, 0)} t/h`;
                ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
                ctx.strokeStyle = pos
                  ? 'rgba(16, 185, 129, 0.45)'
                  : 'rgba(245, 158, 11, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(midX - 28, centerY - 34, 56, 18, 5);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = pos ? '#10b981' : '#f59e0b';
                ctx.font = '600 9.5px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(label, midX, centerY - 22);
              }
            });

            // Animated mass particles inside conduits
            particlesRef.current.forEach((pt) => {
              pt.progress += pt.speed * speedFactor;
              if (pt.progress > 1) pt.progress = 0;

              const startX = xA + nodeW;
              const endX = xC;
              const px = startX + (endX - startX) * pt.progress;
              const py = centerY + pt.lane * (compact ? 0.65 : 0.85);

              // Skip particles passing behind nodes
              const insideNode =
                (px >= xAB && px <= xAB + bufW) ||
                (px >= xB && px <= xB + nodeW) ||
                (px >= xBC && px <= xBC + bufW);
              if (insideNode) return;

              const isStarvedSection =
                (p.starvedB && px > xAB && px < xBC) || (p.starvedC && px > xBC);

              ctx.fillStyle = isStarvedSection
                ? '#ef4444'
                : isDark
                  ? '#38bdf8'
                  : '#0284c7';
              ctx.beginPath();
              ctx.arc(px, py, compact ? 1.8 : pt.size, 0, Math.PI * 2);
              ctx.fill();
            });

            // Draw Stage Equipment Cards
            const drawStage = (cfg: {
              x: number;
              kind: 'A' | 'B' | 'C';
              name: string;
              sub: string;
              rate: number;
              cap: number;
              oee: number;
              color: string;
              starved?: boolean;
            }) => {
              const y = centerY - nodeH / 2;
              const util = clamp(cfg.rate / cfg.cap, 0, 1);

              // Soft outer warning halo when starved
              if (cfg.starved) {
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.roundRect(cfg.x - 2, y - 2, nodeW + 4, nodeH + 4, 14);
                ctx.stroke();
              }

              // Card surface
              ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
              ctx.strokeStyle = cfg.starved ? '#ef4444' : cfg.color;
              ctx.lineWidth = cfg.starved ? 2.2 : 1.75;
              ctx.beginPath();
              ctx.roundRect(cfg.x, y, nodeW, nodeH, 12);
              ctx.fill();
              ctx.stroke();

              // Top colored accent strip inside rounded clip
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(cfg.x, y, nodeW, nodeH, 12);
              ctx.clip();
              ctx.fillStyle = cfg.starved ? 'rgba(239, 68, 68, 0.14)' : `${cfg.color}18`;
              ctx.fillRect(cfg.x, y, nodeW, compact ? 24 : 30);
              ctx.restore();

              // Header text
              ctx.fillStyle = cfg.starved ? '#ef4444' : cfg.color;
              ctx.font = compact
                ? '700 10px "Plus Jakarta Sans", system-ui'
                : '700 11.5px "Plus Jakarta Sans", system-ui';
              ctx.textAlign = 'left';
              ctx.fillText(cfg.name, cfg.x + 10, y + (compact ? 16 : 19));

              // Animated Equipment Rotor / Agitator / Dispatch Glyph on top-right
              if (!compact) {
                const gx = cfg.x + nodeW - 22;
                const gy = y + 18;
                ctx.save();
                ctx.translate(gx, gy);
                const spin = phaseRef.current * (cfg.rate / 180) * (cfg.kind === 'B' ? -1 : 1);
                ctx.rotate(spin);
                ctx.strokeStyle = cfg.starved ? '#ef4444' : cfg.color;
                ctx.lineWidth = 1.6;
                for (let b = 0; b < 3; b++) {
                  ctx.rotate((Math.PI * 2) / 3);
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  ctx.lineTo(6.5, 0);
                  ctx.stroke();
                }
                ctx.restore();

                ctx.beginPath();
                ctx.arc(gx, gy, 8.5, 0, Math.PI * 2);
                ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }

              // Subtitle
              if (!compact) {
                ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
                ctx.font = '500 10px "IBM Plex Sans", system-ui';
                ctx.fillText(cfg.sub, cfg.x + 10, y + 44);
              }

              // Primary rate metric
              ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
              ctx.font = compact
                ? '700 13px "JetBrains Mono", monospace'
                : '700 17px "JetBrains Mono", monospace';
              ctx.fillText(`${fmt(cfg.rate, 0)} t/h`, cfg.x + 10, y + (compact ? 47 : 67));

              // Utilization bar
              const barX = cfg.x + 10;
              const barY = y + (compact ? 58 : 79);
              const barW = nodeW - 20;
              ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
              ctx.beginPath();
              ctx.roundRect(barX, barY, barW, 5, 2.5);
              ctx.fill();

              ctx.fillStyle = cfg.starved ? '#ef4444' : cfg.color;
              ctx.beginPath();
              ctx.roundRect(barX, barY, Math.max(4, barW * util), 5, 2.5);
              ctx.fill();

              // Bottom status & OEE
              ctx.font = compact
                ? '600 8.5px "JetBrains Mono", monospace'
                : '600 10px "JetBrains Mono", monospace';
              if (cfg.starved) {
                ctx.fillStyle = '#ef4444';
                ctx.fillText('✖ STARVATION', cfg.x + 10, y + (compact ? 80 : 101));
              } else {
                ctx.fillStyle = cfg.oee < 75 ? '#f59e0b' : '#10b981';
                ctx.fillText(`● OEE ${fmt(cfg.oee, 0)}%`, cfg.x + 10, y + (compact ? 80 : 101));
              }
            };

            // Draw Cylindrical Industrial Silo Buffers
            const drawBuffer = (cfg: {
              x: number;
              name: string;
              val: number;
              cap: number;
              auto: number;
            }) => {
              const y = centerY - bufH / 2;
              const isCritical = cfg.auto < 15;
              const fillRatio = clamp(cfg.val / cfg.cap, 0.04, 1);

              const domeH = compact ? 10 : 13;
              const coneH = compact ? 12 : 16;
              const bodyTop = y + domeH;
              const bodyBot = y + bufH - coneH;
              const bodyH = bodyBot - bodyTop;

              // Outer silo silhouette path
              const traceSilo = () => {
                ctx.beginPath();
                ctx.moveTo(cfg.x, bodyTop);
                ctx.quadraticCurveTo(cfg.x + bufW / 2, y - 2, cfg.x + bufW, bodyTop);
                ctx.lineTo(cfg.x + bufW, bodyBot);
                ctx.lineTo(cfg.x + bufW * 0.72, y + bufH);
                ctx.lineTo(cfg.x + bufW * 0.28, y + bufH);
                ctx.lineTo(cfg.x, bodyBot);
                ctx.closePath();
              };

              // Silo background
              ctx.fillStyle = isDark ? '#0b1120' : '#f8fafc';
              traceSilo();
              ctx.fill();

              // Clipped fluid fill with subtle animated wave
              ctx.save();
              traceSilo();
              ctx.clip();

              const totalFillable = bodyH + coneH;
              const fluidTop = y + bufH - totalFillable * fillRatio;

              const grad = ctx.createLinearGradient(0, fluidTop, 0, y + bufH);
              if (isCritical) {
                grad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
                grad.addColorStop(1, 'rgba(185, 28, 28, 0.35)');
              } else {
                grad.addColorStop(0, 'rgba(249, 115, 22, 0.48)');
                grad.addColorStop(1, 'rgba(234, 88, 12, 0.24)');
              }
              ctx.fillStyle = grad;

              ctx.beginPath();
              ctx.moveTo(cfg.x, y + bufH);
              for (let sx = 0; sx <= bufW; sx += 4) {
                const wave = Math.sin(phaseRef.current * 2 + sx * 0.12) * 2.2;
                ctx.lineTo(cfg.x + sx, fluidTop + wave);
              }
              ctx.lineTo(cfg.x + bufW, y + bufH);
              ctx.closePath();
              ctx.fill();

              // Surface meniscus highlight
              ctx.strokeStyle = isCritical ? '#fca5a5' : '#fdba74';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              for (let sx = 0; sx <= bufW; sx += 4) {
                const wave = Math.sin(phaseRef.current * 2 + sx * 0.12) * 2.2;
                if (sx === 0) ctx.moveTo(cfg.x + sx, fluidTop + wave);
                else ctx.lineTo(cfg.x + sx, fluidTop + wave);
              }
              ctx.stroke();

              ctx.restore();

              // Silo outline stroke
              ctx.strokeStyle = isCritical
                ? '#ef4444'
                : isDark
                  ? 'rgba(249, 115, 22, 0.65)'
                  : 'rgba(234, 88, 12, 0.72)';
              ctx.lineWidth = isCritical ? 2.2 : 1.75;
              traceSilo();
              ctx.stroke();

              // Level gauge ticks on left wall
              if (!compact) {
                ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.38)' : 'rgba(71, 85, 105, 0.38)';
                ctx.lineWidth = 1;
                [0.25, 0.5, 0.75].forEach((ratio) => {
                  const ty = bodyBot - bodyH * ratio;
                  ctx.beginPath();
                  ctx.moveTo(cfg.x + 2, ty);
                  ctx.lineTo(cfg.x + 8, ty);
                  ctx.stroke();
                });
              }

              // Silo title above dome
              ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a';
              ctx.font = compact
                ? '700 9.5px "Plus Jakarta Sans", system-ui'
                : '700 11px "Plus Jakarta Sans", system-ui';
              ctx.textAlign = 'center';
              ctx.fillText(cfg.name, cfg.x + bufW / 2, y - 9);

              // Volume & Autonomy readout centered inside silo
              ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
              ctx.font = compact
                ? '700 11px "JetBrains Mono", monospace'
                : '700 14px "JetBrains Mono", monospace';
              ctx.fillText(`${fmt(cfg.val, 0)} t`, cfg.x + bufW / 2, centerY - 2);

              ctx.font = compact
                ? '600 8.5px "JetBrains Mono", monospace'
                : '600 10px "JetBrains Mono", monospace';
              ctx.fillStyle = isCritical ? '#f87171' : isDark ? '#cbd5e1' : '#334155';
              ctx.fillText(`${fmt(cfg.auto, 0)} min`, cfg.x + bufW / 2, centerY + 14);

              ctx.font = compact
                ? '500 8px "JetBrains Mono", monospace'
                : '500 9px "JetBrains Mono", monospace';
              ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
              ctx.fillText(`${Math.round(fillRatio * 100)}% cap`, cfg.x + bufW / 2, centerY + 28);
            };

            drawStage({
              x: xA,
              kind: 'A',
              name: 'Stage A',
              sub: 'Feed / Milling',
              rate: p.rateA,
              cap: CAPACITIES.capA,
              oee: p.oeeA,
              color: '#f43f5e',
            });

            drawBuffer({
              x: xAB,
              name: 'Buffer AB',
              val: p.ab,
              cap: CAPACITIES.capAB,
              auto: p.autoAB,
            });

            drawStage({
              x: xB,
              kind: 'B',
              name: 'Stage B',
              sub: 'Reaction / Mass',
              rate: p.rateB,
              cap: CAPACITIES.capB,
              oee: p.oeeB,
              color: '#eab308',
              starved: p.starvedB,
            });

            drawBuffer({
              x: xBC,
              name: 'Buffer BC',
              val: p.bc,
              cap: CAPACITIES.capBC,
              auto: p.autoBC,
            });

            drawStage({
              x: xC,
              kind: 'C',
              name: 'Stage C',
              sub: 'Final Delivery',
              rate: p.rateC,
              cap: CAPACITIES.capC,
              oee: p.oeeC,
              color: '#06b6d4',
              starved: p.starvedC,
            });
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label="Physical-stochastic production chain diagram: Stage A, Buffer AB, Stage B, Buffer BC, and Stage C"
    />
  );
};
