import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Wrench } from 'lucide-react';
import type { DeviationAlert, ShapDriverKey } from '../types/process';

interface AlertsBannerProps {
  alerts: DeviationAlert[];
  currentTime: string;
  onExecuteAction: (actionType: 'rebalance_buffers' | 'apply_prescription', driverKey: ShapDriverKey) => void;
}

export const AlertsBanner: React.FC<AlertsBannerProps> = ({
  alerts,
  currentTime,
  onExecuteAction,
}) => {
  const [expanded, setExpanded] = useState(true);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  if (alerts.length === 0) {
    return (
      <section
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-950/20"
      >
        <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Nominal Operation</span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            No flow deviation, starvation risk, or target breach detected at{' '}
            <span className="font-mono font-semibold tabular-nums">{currentTime}</span>.
          </span>
        </div>
        <span className="font-mono text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
          0 active alerts
        </span>
      </section>
    );
  }

  const hasCritical = criticalCount > 0;

  return (
    <section
      aria-live="assertive"
      className={`rounded-xl border px-4 py-3 transition-colors ${
        hasCritical
          ? 'border-rose-500/40 bg-rose-500/8 dark:border-rose-500/40 dark:bg-rose-950/30'
          : 'border-amber-500/40 bg-amber-500/8 dark:border-amber-500/40 dark:bg-amber-950/25'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {hasCritical ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Real-Time Visual Alerts · Instant{' '}
            <span className="font-mono tabular-nums">{currentTime}</span>
          </h2>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {criticalCount > 0 && `${criticalCount} critical`}
            {criticalCount > 0 && warningCount > 0 && ' · '}
            {warningCount > 0 && `${warningCount} warning`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <span>{expanded ? 'Collapse details' : `View ${alerts.length} deviations`}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {alerts.map((alert) => {
            const isCrit = alert.severity === 'critical';
            return (
              <div
                key={alert.id}
                className={`flex flex-col justify-between gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center ${
                  isCrit
                    ? 'border-rose-500/35 bg-white/80 dark:border-rose-500/30 dark:bg-slate-900/80'
                    : 'border-amber-500/35 bg-white/80 dark:border-amber-500/30 dark:bg-slate-900/80'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        isCrit
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {isCrit ? '✖ Critical' : '▲ Warning'}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                      {alert.metricValue}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {alert.title}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {alert.detail}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onExecuteAction(alert.actionType, alert.targetDriverKey)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isCrit
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>{alert.actionLabel}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
