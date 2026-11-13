import React, { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import { fmt, getRankedDrivers } from '../engine/processSimulation';
import type { AuditEntry, ProcessPoint, SimParams } from '../types/process';

export interface SnapshotImages {
  flow: string;
  trend: string;
  buffer: string;
  cum: string;
  shap: string;
  waterfall: string;
}

interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  point: ProcessPoint;
  simParams: SimParams;
  images: SnapshotImages;
  auditTrail: AuditEntry[];
}

export const SnapshotModal: React.FC<SnapshotModalProps> = ({
  isOpen,
  onClose,
  point,
  simParams,
  images,
  auditTrail,
}) => {
  const { timestampStr, shiftStr, hashAuth } = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    return {
      timestampStr: `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`,
      shiftStr:
        h >= 6 && h < 14
          ? 'Shift 1 (Morning)'
          : h >= 14 && h < 22
            ? 'Shift 2 (Afternoon)'
            : 'Shift 3 (Night)',
      hashAuth: `AUTH-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const ranked = getRankedDrivers(point);
  const top = ranked[0];
  const second = ranked[1];

  return (
    <div className="print-only-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-2xl print:h-auto print:max-w-none print:rounded-none print:shadow-none">
        <div className="no-print flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
          <div>
            <h3 className="text-sm font-bold">
              Executive Audit Report & XAI Snapshot
            </h3>
            <p className="text-[11px] text-slate-400">
              Multi-page A4 structured preview ready for printing / PDF export
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-6 print:overflow-visible print:bg-white print:p-0">
          <div className="print-sheet mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            {/* Page 1 */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-sky-600 pb-3">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  Operational Audit & XAI Snapshot Report
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Continuous Production Chain A → B → C · Stochastic Monitoring & Root-Cause Diagnostics
                </p>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-600 tabular-nums">
                <div>Issued: {timestampStr}</div>
                <div>Frozen instant: {point.time}</div>
                <div>{shiftStr}</div>
                <div>Record: {hashAuth}</div>
                <div
                  className={`mt-1 font-sans text-xs font-bold ${
                    point.risk >= 40 ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {point.risk >= 40 ? '✖ Critical Target Alarm' : '● Stable Nominal Envelope'}
                </div>
              </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Stage A</div>
                <div className="my-0.5 font-mono text-base font-extrabold text-sky-700 tabular-nums">
                  {fmt(point.rateA, 0)} t/h
                </div>
                <div className="font-mono text-[10px] text-slate-600">OEE {fmt(point.oeeA, 0)}%</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Buffer AB</div>
                <div className="my-0.5 font-mono text-base font-extrabold text-orange-600 tabular-nums">
                  {fmt(point.ab, 0)} t
                </div>
                <div className="font-mono text-[10px] text-slate-600">
                  Auton {fmt(point.autoAB, 0)} min
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Stage B</div>
                <div className="my-0.5 font-mono text-base font-extrabold text-amber-600 tabular-nums">
                  {fmt(point.rateB, 0)} t/h
                </div>
                <div className="font-mono text-[10px] text-slate-600">
                  {point.starvedB ? 'STARVATION' : `OEE ${fmt(point.oeeB, 0)}%`}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Buffer BC</div>
                <div className="my-0.5 font-mono text-base font-extrabold text-emerald-600 tabular-nums">
                  {fmt(point.bc, 0)} t
                </div>
                <div className="font-mono text-[10px] text-slate-600">
                  Auton {fmt(point.autoBC, 0)} min
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Throughput C</div>
                <div className="my-0.5 font-mono text-base font-extrabold text-cyan-700 tabular-nums">
                  {fmt(point.throughput, 0)} t/h
                </div>
                <div className="font-mono text-[10px] text-slate-600">
                  Cum {fmt(point.prodCum, 0)} t
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Target Risk</div>
                <div
                  className={`my-0.5 font-mono text-base font-extrabold tabular-nums ${
                    point.risk >= 40 ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {fmt(point.risk, 0)}%
                </div>
                <div className="font-mono text-[10px] text-slate-600">Base 18%</div>
              </div>
            </div>

            <div className="print-break-avoid mb-4 rounded-md border border-slate-200 p-3.5">
              <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">
                Active What-If Simulator Parameters ({point.time})
              </h3>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="rounded bg-slate-50 p-2">
                  <span className="block text-[10px] text-slate-500">Setpoint A</span>
                  <strong className="font-mono">{simParams.targetRateA} t/h</strong>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <span className="block text-[10px] text-slate-500">Buffer AB</span>
                  <strong className="font-mono">{simParams.initialBufferAB} t</strong>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <span className="block text-[10px] text-slate-500">Stage B OEE</span>
                  <strong className="font-mono">{simParams.effB}%</strong>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <span className="block text-[10px] text-slate-500">Buffer BC</span>
                  <strong className="font-mono">{simParams.initialBufferBC} t</strong>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <span className="block text-[10px] text-slate-500">Target C</span>
                  <strong className="font-mono">{simParams.targetRateC} t/h</strong>
                </div>
              </div>
            </div>

            {images.flow && (
              <div className="print-break-avoid mb-4 rounded-md border border-slate-200 p-3.5">
                <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">
                  Frozen Physical-Stochastic Topology (SCADA)
                </h3>
                <img
                  src={images.flow}
                  alt="Frozen SCADA production chain snapshot"
                  className="max-h-44 w-full rounded bg-slate-50 object-contain"
                />
              </div>
            )}

            <div className="print-page-break" />

            {/* Page 2 */}
            <h2 className="mt-4 mb-3 border-b border-slate-300 pb-1.5 text-base font-bold text-slate-900">
              Temporal Dynamics & Batch Forecast
            </h2>
            <div className="print-break-avoid mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {images.trend && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <h4 className="mb-1 text-xs font-bold text-slate-700">
                    Chain Flow Rates vs Risk (%)
                  </h4>
                  <img src={images.trend} alt="Temporal flow rates chart" className="w-full rounded" />
                </div>
              )}
              {images.buffer && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <h4 className="mb-1 text-xs font-bold text-slate-700">
                    Buffer AB & BC Volume and Autonomy
                  </h4>
                  <img src={images.buffer} alt="Buffer levels chart" className="w-full rounded" />
                </div>
              )}
              {images.cum && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <h4 className="mb-1 text-xs font-bold text-slate-700">
                    Cumulative Production vs Target (Forecast)
                  </h4>
                  <img src={images.cum} alt="Cumulative production chart" className="w-full rounded" />
                </div>
              )}
              {images.shap && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <h4 className="mb-1 text-xs font-bold text-slate-700">
                    Additive Temporal SHAP Attribution (+pp)
                  </h4>
                  <img src={images.shap} alt="Temporal SHAP chart" className="w-full rounded" />
                </div>
              )}
            </div>

            <div className="print-page-break" />

            {/* Page 3 */}
            <h2 className="mt-4 mb-3 border-b border-slate-300 pb-1.5 text-base font-bold text-slate-900">
              SHAP Explainability, Counterfactual Prescriptions & Audit Trail
            </h2>
            <div className="print-break-avoid mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {images.waterfall && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <h4 className="mb-1 text-xs font-bold text-slate-700">
                    SHAP Waterfall at {point.time}
                  </h4>
                  <img src={images.waterfall} alt="SHAP Waterfall" className="w-full rounded" />
                </div>
              )}
              <div className="rounded-md border border-slate-200 p-3">
                <h4 className="mb-2 text-xs font-bold text-slate-900">
                  Weighted Risk Driver Ranking (SHAP)
                </h4>
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-1.5">#</th>
                      <th className="p-1.5">Driver</th>
                      <th className="p-1.5 text-right">Impact</th>
                      <th className="p-1.5">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((d, idx) => (
                      <tr key={d.key} className="border-b border-slate-100">
                        <td className="p-1.5 font-mono font-bold">{idx + 1}</td>
                        <td className="p-1.5">{d.shortLabel}</td>
                        <td className="p-1.5 text-right font-mono font-bold tabular-nums">
                          +{fmt(d.value, 1)} pp
                        </td>
                        <td
                          className={`p-1.5 font-semibold ${
                            d.value > 15
                              ? 'text-rose-600'
                              : d.value > 6
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                          }`}
                        >
                          {d.value > 15 ? 'Critical' : d.value > 6 ? 'Moderate' : 'Stable'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="print-break-avoid mb-4 rounded-md border border-slate-200 p-3.5">
              <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">
                Recommended Counterfactual Prescriptions
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>Priority: {top.shortLabel}</span>
                    <span className="font-mono text-emerald-700">
                      -{fmt(top.value * 0.65, 1)} pp
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    Intervene directly on {top.label} to stabilize mass transfer and prevent
                    downstream starvation propagation.
                  </p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>Preventive: {second.shortLabel}</span>
                    <span className="font-mono text-emerald-700">
                      -{fmt(second.value * 0.5, 1)} pp
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    Smooth transient setpoints to preserve at least 15 minutes of autonomy across
                    intermediate buffers.
                  </p>
                </div>
              </div>
            </div>

            <div className="print-break-avoid rounded-md border border-slate-200 p-3.5">
              <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">
                Audit Log: Operational Commands & AI Dialogs
              </h3>
              <div className="space-y-1.5 text-xs">
                {auditTrail.slice(-8).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col justify-between gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">[{entry.sender}]</span>{' '}
                      <span className="text-slate-600">{entry.action}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                      {entry.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
