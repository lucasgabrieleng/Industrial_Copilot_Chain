import React, { useEffect, useRef, useState } from 'react';
import { CAPACITIES, DRIVERS, clamp, fmt } from '../engine/processSimulation';
import type { ProcessPoint } from '../types/process';

interface BaseChartProps {
  series: ProcessPoint[];
  cursorIdx: number;
  theme: 'dark' | 'light';
  onCursorChange?: (idx: number) => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  point: ProcessPoint | null;
}

function prepareCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function useInteractiveCanvas(
  seriesLength: number,
  onCursorChange: ((idx: number) => void) | undefined,
  externalRef?: React.RefObject<HTMLCanvasElement | null>
) {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = externalRef ?? internalRef;
  const [hoverPos, setHoverPos] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  const handlePointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || seriesLength < 2) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const padLeft = 48;
    const padRight = 48;
    const plotW = Math.max(10, rect.width - padLeft - padRight);
    const ratio = clamp((mouseX - padLeft) / plotW, 0, 1);
    const idx = Math.round(ratio * (seriesLength - 1));
    onCursorChange?.(idx);
    setHoverPos({
      visible: true,
      x: clamp(mouseX + 14, 8, Math.max(8, rect.width - 230)),
      y: clamp(mouseY - 24, 8, Math.max(8, rect.height - 110)),
    });
  };

  return {
    canvasRef,
    hoverPos,
    handlers: {
      onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => handlePointer(e.clientX, e.clientY),
      onMouseLeave: () => setHoverPos((prev) => ({ ...prev, visible: false })),
      onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.touches.length > 0) {
          handlePointer(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      onTouchEnd: () => setHoverPos((prev) => ({ ...prev, visible: false })),
    },
  };
}

export const TrendChart: React.FC<BaseChartProps> = ({
  series,
  cursorIdx,
  theme,
  onCursorChange,
  canvasRef: externalRef,
}) => {
  const { canvasRef, hoverPos, handlers } = useInteractiveCanvas(
    series.length,
    onCursorChange,
    externalRef
  );

  useEffect(() => {
    const draw = () => {
      const target = prepareCanvas(canvasRef.current);
      if (!target || series.length === 0) return;
      const { ctx, width, height } = target;
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 20, right: 56, bottom: 32, left: 50 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const isDark = theme === 'dark';

      // Grid lines
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      const minVal = 50;
      const maxVal = 290;
      const mapX = (i: number) => pad.left + (plotW / Math.max(1, series.length - 1)) * i;
      const mapY = (v: number) => pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
      const mapRisk = (r: number) => pad.top + plotH - (r / 100) * plotH;

      // Target throughput reference line
      const targetY = mapY(CAPACITIES.targetFinal);
      ctx.strokeStyle = isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.4)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, targetY);
      ctx.lineTo(width - pad.right, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      const lines = [
        { k: 'rateA' as const, c: '#f43f5e', w: 1.75 },
        { k: 'rateB' as const, c: '#eab308', w: 1.75 },
        { k: 'rateC' as const, c: '#06b6d4', w: 1.75 },
        { k: 'throughput' as const, c: '#38bdf8', w: 2.6 },
      ];

      lines.forEach((l) => {
        ctx.strokeStyle = l.c;
        ctx.lineWidth = l.w;
        ctx.beginPath();
        series.forEach((pt, i) => {
          const x = mapX(i);
          const y = mapY(pt[l.k]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      // Risk dashed curve
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = mapX(i);
        const y = mapRisk(pt.risk);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Cursor vertical rule & markers
      const safeIdx = clamp(cursorIdx, 0, series.length - 1);
      const cx = mapX(safeIdx);
      ctx.strokeStyle = isDark ? 'rgba(248, 250, 252, 0.45)' : 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, height - pad.bottom);
      ctx.stroke();

      const cur = series[safeIdx];
      lines.forEach((l) => {
        ctx.fillStyle = l.c;
        ctx.beginPath();
        ctx.arc(cx, mapY(cur[l.k]), 3.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(cx, mapRisk(cur.risk), 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Axis labels
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('290 t/h', pad.left - 6, pad.top + 8);
      ctx.fillText('170 t/h', pad.left - 6, pad.top + plotH / 2 + 3);
      ctx.fillText('50 t/h', pad.left - 6, height - pad.bottom);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#fb7185';
      ctx.fillText('100% Risco', width - pad.right + 6, pad.top + 8);
      ctx.fillText('50%', width - pad.right + 6, pad.top + plotH / 2 + 3);
      ctx.fillText('0%', width - pad.right + 6, height - pad.bottom);

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.textAlign = 'center';
      const step = Math.max(1, Math.floor(series.length / 6));
      for (let i = 0; i < series.length; i += step) {
        ctx.fillText(series[i].time, mapX(i), height - 10);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [series, cursorIdx, theme, canvasRef]);

  const cur = series[clamp(cursorIdx, 0, Math.max(0, series.length - 1))];

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" {...handlers} />
      {hoverPos.visible && cur && (
        <div
          className="pointer-events-none absolute z-30 min-w-[215px] rounded-lg border border-slate-300 bg-white/95 p-2.5 text-xs text-slate-900 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="mb-1 flex items-center justify-between font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Instante {cur.time}</span>
            <span className="text-rose-500">Risco {fmt(cur.risk, 0)}%</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
            <span className="text-rose-500">Estágio A:</span>
            <span className="text-right font-semibold">{fmt(cur.rateA, 0)} t/h</span>
            <span className="text-amber-500">Estágio B:</span>
            <span className="text-right font-semibold">{fmt(cur.rateB, 0)} t/h</span>
            <span className="text-cyan-500">Estágio C:</span>
            <span className="text-right font-semibold">{fmt(cur.rateC, 0)} t/h</span>
            <span className="text-sky-500">Throughput:</span>
            <span className="text-right font-bold">{fmt(cur.throughput, 0)} t/h</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const BufferChart: React.FC<BaseChartProps> = ({
  series,
  cursorIdx,
  theme,
  onCursorChange,
  canvasRef: externalRef,
}) => {
  const { canvasRef, hoverPos, handlers } = useInteractiveCanvas(
    series.length,
    onCursorChange,
    externalRef
  );

  useEffect(() => {
    const draw = () => {
      const target = prepareCanvas(canvasRef.current);
      if (!target || series.length === 0) return;
      const { ctx, width, height } = target;
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 20, right: 24, bottom: 32, left: 46 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const isDark = theme === 'dark';

      const mapX = (i: number) => pad.left + (plotW / Math.max(1, series.length - 1)) * i;
      const mapY = (v: number) => pad.top + plotH - (v / 320) * plotH;

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      // Critical threshold ~45t
      const dangerY = mapY(45);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, dangerY);
      ctx.lineTo(width - pad.right, dangerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Buffer AB
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = mapX(i);
        const y = mapY(pt.ab);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Buffer BC
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = mapX(i);
        const y = mapY(pt.bc);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const safeIdx = clamp(cursorIdx, 0, series.length - 1);
      const cx = mapX(safeIdx);
      ctx.strokeStyle = isDark ? 'rgba(248, 250, 252, 0.45)' : 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, height - pad.bottom);
      ctx.stroke();

      const cur = series[safeIdx];
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx, mapY(cur.ab), 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(cx, mapY(cur.bc), 3.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('320 t', pad.left - 6, pad.top + 8);
      ctx.fillText('160 t', pad.left - 6, pad.top + plotH / 2 + 3);
      ctx.fillText('0 t', pad.left - 6, height - pad.bottom);

      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'left';
      ctx.fillText('Zona Crítica', pad.left + 6, dangerY - 5);

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.textAlign = 'center';
      const step = Math.max(1, Math.floor(series.length / 4));
      for (let i = 0; i < series.length; i += step) {
        ctx.fillText(series[i].time, mapX(i), height - 10);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [series, cursorIdx, theme, canvasRef]);

  const cur = series[clamp(cursorIdx, 0, Math.max(0, series.length - 1))];

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" {...handlers} />
      {hoverPos.visible && cur && (
        <div
          className="pointer-events-none absolute z-30 min-w-[205px] rounded-lg border border-slate-300 bg-white/95 p-2.5 text-xs text-slate-900 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="mb-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Pulmões · {cur.time}
          </div>
          <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-orange-500">Buffer AB:</span>
              <span className="font-semibold">
                {fmt(cur.ab, 0)} t ({fmt(cur.autoAB, 0)} min)
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-emerald-500">Buffer BC:</span>
              <span className="font-semibold">
                {fmt(cur.bc, 0)} t ({fmt(cur.autoBC, 0)} min)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CumulativeChart: React.FC<BaseChartProps> = ({
  series,
  cursorIdx,
  theme,
  onCursorChange,
  canvasRef: externalRef,
}) => {
  const { canvasRef, hoverPos, handlers } = useInteractiveCanvas(
    series.length,
    onCursorChange,
    externalRef
  );

  useEffect(() => {
    const draw = () => {
      const target = prepareCanvas(canvasRef.current);
      if (!target || series.length === 0) return;
      const { ctx, width, height } = target;
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 20, right: 28, bottom: 32, left: 54 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const isDark = theme === 'dark';

      const last = series[series.length - 1];
      const maxCum = Math.max(last.targetCum * 1.15, last.prodCum * 1.15, 100);
      const mapX = (i: number) => pad.left + (plotW / Math.max(1, series.length - 1)) * i;
      const mapY = (v: number) => pad.top + plotH - (v / maxCum) * plotH;

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      // Target trajectory
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = mapX(i);
        const y = mapY(pt.targetCum);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      const safeIdx = clamp(cursorIdx, 0, series.length - 1);
      const cur = series[safeIdx];
      const remaining = series.length - 1 - safeIdx;
      if (remaining > 0) {
        const cx = mapX(safeIdx);
        const endX = mapX(series.length - 1);
        const projUpper = cur.prodCum + ((cur.throughput + 15) / 60) * remaining;
        const projLower = cur.prodCum + ((cur.throughput - 20) / 60) * remaining;

        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.14)';
        ctx.beginPath();
        ctx.moveTo(cx, mapY(cur.prodCum));
        ctx.lineTo(endX, mapY(projUpper));
        ctx.lineTo(endX, mapY(projLower));
        ctx.closePath();
        ctx.fill();
      }

      // Actual cumulative production up to cursor
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let i = 0; i <= safeIdx; i++) {
        const x = mapX(i);
        const y = mapY(series[i].prodCum);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const cx = mapX(safeIdx);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx, mapY(cur.prodCum), 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${fmt(maxCum, 0)} t`, pad.left - 6, pad.top + 8);
      ctx.fillText(`${fmt(maxCum / 2, 0)} t`, pad.left - 6, pad.top + plotH / 2 + 3);
      ctx.fillText('0 t', pad.left - 6, height - pad.bottom);

      ctx.textAlign = 'center';
      const step = Math.max(1, Math.floor(series.length / 5));
      for (let i = 0; i < series.length; i += step) {
        ctx.fillText(series[i].time, mapX(i), height - 10);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [series, cursorIdx, theme, canvasRef]);

  const cur = series[clamp(cursorIdx, 0, Math.max(0, series.length - 1))];
  const gap = cur ? cur.prodCum - cur.targetCum : 0;

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" {...handlers} />
      {hoverPos.visible && cur && (
        <div
          className="pointer-events-none absolute z-30 min-w-[205px] rounded-lg border border-slate-300 bg-white/95 p-2.5 text-xs text-slate-900 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="mb-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Acumulado · {cur.time}
          </div>
          <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-sky-500">Realizado:</span>
              <span className="font-semibold">{fmt(cur.prodCum, 0)} t</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-indigo-400">Meta Parcial:</span>
              <span className="font-semibold">{fmt(cur.targetCum, 0)} t</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Saldo:</span>
              <span className={`font-bold ${gap >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {gap >= 0 ? '+' : ''}
                {fmt(gap, 0)} t
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ShapTimelineChart: React.FC<BaseChartProps> = ({
  series,
  cursorIdx,
  theme,
  onCursorChange,
  canvasRef: externalRef,
}) => {
  const { canvasRef, hoverPos, handlers } = useInteractiveCanvas(
    series.length,
    onCursorChange,
    externalRef
  );

  useEffect(() => {
    const draw = () => {
      const target = prepareCanvas(canvasRef.current);
      if (!target || series.length === 0) return;
      const { ctx, width, height } = target;
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 20, right: 24, bottom: 32, left: 48 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const isDark = theme === 'dark';

      const mapX = (i: number) => pad.left + (plotW / Math.max(1, series.length - 1)) * i;
      const barW = Math.max(2.2, (plotW / Math.max(1, series.length)) * 0.88);
      const maxShapSum = 80;
      const mapY = (v: number) => pad.top + plotH - (clamp(v, 0, maxShapSum) / maxShapSum) * plotH;

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      series.forEach((pt, i) => {
        const x = mapX(i);
        let running = 0;
        DRIVERS.forEach((d) => {
          const val = pt[d.key];
          if (val > 0) {
            const yBottom = mapY(running);
            const yTop = mapY(running + val);
            ctx.fillStyle = d.hex;
            ctx.fillRect(x - barW / 2, yTop, barW, Math.max(0.5, yBottom - yTop));
            running += val;
          }
        });
      });

      const safeIdx = clamp(cursorIdx, 0, series.length - 1);
      const cx = mapX(safeIdx);
      ctx.strokeStyle = isDark ? 'rgba(248, 250, 252, 0.7)' : 'rgba(15, 23, 42, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, height - pad.bottom);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`+${maxShapSum} pp`, pad.left - 6, pad.top + 8);
      ctx.fillText(`+${maxShapSum / 2} pp`, pad.left - 6, pad.top + plotH / 2 + 3);
      ctx.fillText('+0 pp', pad.left - 6, height - pad.bottom);

      ctx.textAlign = 'center';
      const step = Math.max(1, Math.floor(series.length / 5));
      for (let i = 0; i < series.length; i += step) {
        ctx.fillText(series[i].time, mapX(i), height - 10);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [series, cursorIdx, theme, canvasRef]);

  const cur = series[clamp(cursorIdx, 0, Math.max(0, series.length - 1))];

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" {...handlers} />
      {hoverPos.visible && cur && (
        <div
          className="pointer-events-none absolute z-30 min-w-[215px] rounded-lg border border-slate-300 bg-white/95 p-2.5 text-xs text-slate-900 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="mb-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            SHAP Aditivo · {cur.time}
          </div>
          <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
            {DRIVERS.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-xs"
                    style={{ backgroundColor: d.hex }}
                  />
                  {d.shortLabel}:
                </span>
                <span className="font-semibold">+{fmt(cur[d.key], 1)} pp</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface WaterfallChartProps {
  point: ProcessPoint;
  theme: 'dark' | 'light';
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({
  point,
  theme,
  canvasRef: externalRef,
}) => {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = externalRef ?? internalRef;
  const [tip, setTip] = useState<TooltipState>({ visible: false, x: 0, y: 0, point: null });

  useEffect(() => {
    const draw = () => {
      const target = prepareCanvas(canvasRef.current);
      if (!target) return;
      const { ctx, width, height } = target;
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 22, right: 16, bottom: 26, left: 36 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const isDark = theme === 'dark';

      const items = [
        { label: 'Base', val: CAPACITIES.baselineRisk, color: '#64748b' },
        ...DRIVERS.map((d) => ({
          label: d.shortLabel.replace('Estágio ', '').replace('Buffer ', ''),
          val: point[d.key],
          color: d.hex,
        })),
      ];

      const maxRisk = 100;
      const mapY = (v: number) => pad.top + plotH - (clamp(v, 0, maxRisk) / maxRisk) * plotH;

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      const totalBars = items.length + 1;
      const spacing = plotW / totalBars;
      const barW = Math.min(46, spacing * 0.72);

      let running = 0;
      items.forEach((it, idx) => {
        const x = pad.left + spacing * idx + (spacing - barW) / 2;
        const startY = idx === 0 ? 0 : running;
        const endY = startY + it.val;
        const topPx = mapY(endY);
        const botPx = mapY(startY);

        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.roundRect(x, topPx, barW, Math.max(2, botPx - topPx), 3);
        ctx.fill();

        ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(idx === 0 ? `${fmt(it.val, 0)}%` : `+${fmt(it.val, 1)}`, x + barW / 2, topPx - 5);

        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '500 9.5px "IBM Plex Sans", system-ui';
        ctx.fillText(it.label, x + barW / 2, height - 7);

        running = endY;
      });

      // Total bar
      const xTot = pad.left + spacing * items.length + (spacing - barW) / 2;
      const totTop = mapY(point.risk);
      const totBot = mapY(0);
      ctx.fillStyle = point.risk >= 45 ? '#ef4444' : '#fb7185';
      ctx.beginPath();
      ctx.roundRect(xTot, totTop, barW, Math.max(2, totBot - totTop), 3);
      ctx.fill();

      ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${fmt(point.risk, 0)}%`, xTot + barW / 2, totTop - 5);

      ctx.fillStyle = '#fb7185';
      ctx.font = '700 9.5px "IBM Plex Sans", system-ui';
      ctx.fillText('Risco', xTot + barW / 2, height - 7);

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('100%', pad.left - 5, pad.top + 6);
      ctx.fillText('0%', pad.left - 5, height - pad.bottom);
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [point, theme, canvasRef]);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTip({
            visible: true,
            x: clamp(e.clientX - rect.left + 12, 8, Math.max(8, rect.width - 210)),
            y: clamp(e.clientY - rect.top - 24, 8, Math.max(8, rect.height - 80)),
            point,
          });
        }}
        onMouseLeave={() => setTip((prev) => ({ ...prev, visible: false }))}
      />
      {tip.visible && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg border border-slate-300 bg-white/95 px-2.5 py-2 font-mono text-[11px] text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-semibold">Composição SHAP ({point.time})</div>
          <div className="text-slate-500 dark:text-slate-400">
            Base {CAPACITIES.baselineRisk}% → Risco Total {fmt(point.risk, 0)}%
          </div>
        </div>
      )}
    </div>
  );
};
