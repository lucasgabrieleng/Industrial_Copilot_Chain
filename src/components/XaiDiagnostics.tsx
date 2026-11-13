import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { clamp, fmt } from '../engine/processSimulation';
import { UI_TEXT } from '../i18n/translations';
import type { CounterfactualAction, Language, RankedDriver, ShapDriverKey } from '../types/process';

interface XaiDiagnosticsProps {
  rankedDrivers: RankedDriver[];
  counterfactuals: CounterfactualAction[];
  lang: Language;
  onApplyPrescription: (driverKey: ShapDriverKey) => void;
  compact?: boolean;
}

export const XaiDiagnostics: React.FC<XaiDiagnosticsProps> = ({
  rankedDrivers,
  counterfactuals,
  lang,
  onApplyPrescription,
  compact = false,
}) => {
  const t = UI_TEXT[lang].xai;
  const visibleDrivers = compact ? rankedDrivers.slice(0, 3) : rankedDrivers.slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2.5">
        {visibleDrivers.map((item) => {
          const pctBar = clamp((item.value / 40) * 100, 4, 100);
          return (
            <div
              key={item.key}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="truncate text-slate-900 dark:text-slate-100">{item.label}</span>
                <span
                  className="font-mono font-bold tabular-nums shrink-0"
                  style={{ color: item.hex }}
                >
                  +{fmt(item.value, 1)} pp
                </span>
              </div>
              <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pctBar}%`, backgroundColor: item.hex }}
                />
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.value > 12 ? t.primaryOffender : t.secondaryImpact}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div>
          <h4 className="mb-2 text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-400">
            {t.counterTitle}
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {counterfactuals.map((sc) => (
              <div
                key={sc.id}
                className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {sc.title}
                  </h5>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {sc.action}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {t.estReduction}
                    </span>
                    <span className="font-mono text-lg font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                      -{fmt(sc.gainPp, 1)} pp
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyPrescription(sc.driverKey)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {sc.gainPp > 0 ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span>{t.applyFix}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
