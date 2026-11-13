import React from 'react';
import { RotateCcw, SlidersHorizontal, TrendingUp, TriangleAlert, Zap } from 'lucide-react';
import { UI_TEXT } from '../i18n/translations';
import type { Language, ShockType, SimParams } from '../types/process';

interface WhatIfStudioProps {
  simParams: SimParams;
  lang: Language;
  onChangeParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  onInjectShock: (shock: ShockType | 'reset') => void;
}

export const WhatIfStudio: React.FC<WhatIfStudioProps> = ({
  simParams,
  lang,
  onChangeParam,
  onInjectShock,
}) => {
  const t = UI_TEXT[lang].whatIf;
  const shockStatusText =
    simParams.shockEvent === 'tripA'
      ? t.shockTripA
      : simParams.shockEvent === 'bottleB'
        ? t.shockBottleB
        : simParams.shockEvent === 'surgeC'
          ? t.shockSurgeC
          : t.shockNominal;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SlidersHorizontal className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {t.title}
          </h2>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span
            className={`text-xs font-semibold ${
              simParams.shockEvent
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {shockStatusText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.quickShocks}
          </span>
          <button
            type="button"
            onClick={() => onInjectShock('tripA')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simParams.shockEvent === 'tripA'
                ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-rose-300'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{t.btnTripA}</span>
          </button>
          <button
            type="button"
            onClick={() => onInjectShock('bottleB')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simParams.shockEvent === 'bottleB'
                ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-amber-300'
            }`}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            <span>{t.btnBottleB}</span>
          </button>
          <button
            type="button"
            onClick={() => onInjectShock('surgeC')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simParams.shockEvent === 'surgeC'
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-cyan-300'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{t.btnSurgeC}</span>
          </button>
          <button
            type="button"
            onClick={() => onInjectShock('reset')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t.btnReset}</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <label htmlFor="slider-a" className="font-medium text-slate-600 dark:text-slate-300">
              {t.sliderA}
            </label>
            <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {simParams.targetRateA} t/h
            </span>
          </div>
          <input
            id="slider-a"
            type="range"
            min={120}
            max={280}
            step={1}
            value={simParams.targetRateA}
            onChange={(e) => onChangeParam('targetRateA', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-rose-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <label htmlFor="slider-ab" className="font-medium text-slate-600 dark:text-slate-300">
              {t.sliderAB}
            </label>
            <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {simParams.initialBufferAB} t
            </span>
          </div>
          <input
            id="slider-ab"
            type="range"
            min={10}
            max={300}
            step={5}
            value={simParams.initialBufferAB}
            onChange={(e) => onChangeParam('initialBufferAB', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-orange-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <label htmlFor="slider-b" className="font-medium text-slate-600 dark:text-slate-300">
              {t.sliderB}
            </label>
            <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {simParams.effB}%
            </span>
          </div>
          <input
            id="slider-b"
            type="range"
            min={50}
            max={100}
            step={1}
            value={simParams.effB}
            onChange={(e) => onChangeParam('effB', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-amber-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <label htmlFor="slider-bc" className="font-medium text-slate-600 dark:text-slate-300">
              {t.sliderBC}
            </label>
            <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {simParams.initialBufferBC} t
            </span>
          </div>
          <input
            id="slider-bc"
            type="range"
            min={10}
            max={220}
            step={5}
            value={simParams.initialBufferBC}
            onChange={(e) => onChangeParam('initialBufferBC', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-emerald-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <label htmlFor="slider-c" className="font-medium text-slate-600 dark:text-slate-300">
              {t.sliderC}
            </label>
            <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {simParams.targetRateC} t/h
            </span>
          </div>
          <input
            id="slider-c"
            type="range"
            min={140}
            max={230}
            step={1}
            value={simParams.targetRateC}
            onChange={(e) => onChangeParam('targetRateC', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-cyan-500"
          />
        </div>
      </div>
    </section>
  );
};
