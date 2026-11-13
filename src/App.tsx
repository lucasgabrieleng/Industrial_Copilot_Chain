import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Dice5,
  FileText,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Sun,
} from 'lucide-react';
import { AiAssistantDock } from './components/AiAssistantDock';
import { AlertsBanner } from './components/AlertsBanner';
import {
  BufferChart,
  CumulativeChart,
  ShapTimelineChart,
  TrendChart,
  WaterfallChart,
} from './components/ProcessCharts';
import { ScadaFlowCanvas } from './components/ScadaFlowCanvas';
import { SnapshotModal, type SnapshotImages } from './components/SnapshotModal';
import { WhatIfStudio } from './components/WhatIfStudio';
import { XaiDiagnostics } from './components/XaiDiagnostics';
import {
  CAPACITIES,
  DEFAULT_SIM_PARAMS,
  buildCounterfactuals,
  clamp,
  detectDeviationAlerts,
  fmt,
  generateProcessSeries,
  getRankedDrivers,
  stepProcessPoint,
} from './engine/processSimulation';
import type {
  AuditEntry,
  ChatMessage,
  FocusChartKey,
  NavMode,
  ProcessPoint,
  ShapDriverKey,
  ShockType,
  SimParams,
  TabId,
} from './types/process';

const TAB_ITEMS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'Integrated View' },
  { id: 'rates', label: 'Flow & Throughput' },
  { id: 'buffers', label: 'Buffers & Starvation' },
  { id: 'forecast', label: 'Production & Targets' },
  { id: 'xai', label: 'SHAP Diagnostics' },
  { id: 'counter', label: 'Counterfactual Prescriptions' },
];

const FOCUS_ITEMS: Array<{ id: FocusChartKey; label: string }> = [
  { id: 'trend', label: 'Flow & Risk' },
  { id: 'buffer', label: 'Buffers AB/BC' },
  { id: 'cum', label: 'Production & Targets' },
  { id: 'shap', label: 'SHAP Timeline' },
  { id: 'waterfall', label: 'SHAP Waterfall' },
];

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showGuide, setShowGuide] = useState(true);
  const [simParams, setSimParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const [series, setSeries] = useState<ProcessPoint[]>(() =>
    generateProcessSeries(DEFAULT_SIM_PARAMS)
  );
  const [cursorIdx, setCursorIdx] = useState<number>(159);
  const [isLive, setIsLive] = useState(false);

  const [navMode, setNavMode] = useState<NavMode>('perspectives');
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [focusChart, setFocusChart] = useState<FocusChartKey>('trend');

  const [isAiOpen, setIsAiOpen] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      text: 'Connected to continuous telemetry across A → B → C. I can interpret risk deviations, explain additive SHAP attribution at the cursor, and apply counterfactual adjustments in one click.',
      timestamp: 'Initial',
      tag: 'XAI Copilot',
      recommendedAction: null,
    },
  ]);

  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([
    {
      id: 'audit-1',
      timestamp: 'Initial',
      sender: 'XAI System',
      action: 'SHAP calibration baseline initialized (18% natural risk).',
    },
  ]);

  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotImages, setSnapshotImages] = useState<SnapshotImages>({
    flow: '',
    trend: '',
    buffer: '',
    cum: '',
    shap: '',
    waterfall: '',
  });

  const flowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      setSeries((prev) => {
        if (prev.length === 0) return prev;
        const nextPoint = stepProcessPoint(prev[prev.length - 1], simParams);
        const updated = [...prev.slice(1), nextPoint];
        setCursorIdx(updated.length - 1);
        return updated;
      });
    }, 1200);
    return () => window.clearInterval(id);
  }, [isLive, simParams]);

  const safeCursorIdx = clamp(cursorIdx, 0, Math.max(0, series.length - 1));
  const currentPoint = series[safeCursorIdx] ?? series[series.length - 1];

  const rankedDrivers = useMemo(
    () => (currentPoint ? getRankedDrivers(currentPoint) : []),
    [currentPoint]
  );

  const counterfactuals = useMemo(
    () => (currentPoint ? buildCounterfactuals(currentPoint) : []),
    [currentPoint]
  );

  const activeAlerts = useMemo(
    () => (currentPoint ? detectDeviationAlerts(currentPoint) : []),
    [currentPoint]
  );

  const addAudit = useCallback(
    (sender: string, action: string, pointTime?: string) => {
      const ts = pointTime ?? currentPoint?.time ?? '--:--';
      setAuditTrail((prev) => [
        ...prev.slice(-24),
        {
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: ts,
          sender,
          action,
        },
      ]);
    },
    [currentPoint?.time]
  );

  const recalcWithParams = useCallback(
    (nextParams: SimParams, logSender?: string, logAction?: string) => {
      setSimParams(nextParams);
      const nextSeries = generateProcessSeries(nextParams);
      setSeries(nextSeries);
      setCursorIdx(nextSeries.length - 1);
      if (logSender && logAction) {
        addAudit(logSender, logAction, nextSeries[nextSeries.length - 1]?.time);
      }
    },
    [addAudit]
  );

  const handleParamChange = useCallback(
    <K extends keyof SimParams>(key: K, value: SimParams[K]) => {
      const next = { ...simParams, [key]: value };
      recalcWithParams(next, 'Simulator', `Parameter ${String(key)} adjusted to ${String(value)}.`);
    },
    [simParams, recalcWithParams]
  );

  const handleInjectShock = useCallback(
    (shock: ShockType | 'reset') => {
      if (shock === 'reset') {
        recalcWithParams(
          DEFAULT_SIM_PARAMS,
          'Simulator',
          'Parameters restored to nominal design defaults.'
        );
        return;
      }
      const label =
        shock === 'tripA'
          ? 'Primary Failure in A'
          : shock === 'bottleB'
            ? 'Bottleneck in Stage B'
            : 'Demand Surge in C';
      recalcWithParams(
        { ...simParams, shockEvent: shock },
        'Simulator',
        `Disturbance injected: ${label}.`
      );
    },
    [simParams, recalcWithParams]
  );

  const handleRegenerate = () => {
    const nextSeries = generateProcessSeries(simParams);
    setSeries(nextSeries);
    setCursorIdx(nextSeries.length - 1);
    addAudit('Operator', 'Generated new stochastic scenario.');
  };

  const handleExecuteAction = useCallback(
    (actionType: 'rebalance_buffers' | 'apply_prescription', driverKey: ShapDriverKey) => {
      let nextParams: SimParams;
      let summary: string;

      if (actionType === 'rebalance_buffers') {
        const nextAB = Math.min(CAPACITIES.capAB, simParams.initialBufferAB + 45);
        const nextBC = Math.min(CAPACITIES.capBC, simParams.initialBufferBC + 35);
        nextParams = {
          ...simParams,
          initialBufferAB: nextAB,
          initialBufferBC: nextBC,
        };
        summary = `Buffer rebalance applied: Buffer AB (${nextAB} t) and Buffer BC (${nextBC} t).`;
      } else {
        if (driverKey === 'shap_A') {
          nextParams = { ...simParams, targetRateA: 260, shockEvent: null };
          summary = 'Stage A feed setpoint raised to 260 t/h and disturbance cleared.';
        } else if (driverKey === 'shap_AB') {
          nextParams = { ...simParams, initialBufferAB: 220, shockEvent: null };
          summary = 'Buffer AB replenished to 220 t.';
        } else if (driverKey === 'shap_B') {
          nextParams = { ...simParams, effB: 95, shockEvent: null };
          summary = 'Stage B OEE optimized to 95%.';
        } else if (driverKey === 'shap_BC') {
          nextParams = { ...simParams, initialBufferBC: 165, shockEvent: null };
          summary = 'Buffer BC reinforced to 165 t.';
        } else {
          nextParams = { ...simParams, targetRateC: 200, shockEvent: null };
          summary = 'Stage C target demand realigned to 200 t/h.';
        }
      }

      recalcWithParams(nextParams, 'Operational Intervention', summary);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          text: `Action executed successfully: ${summary} Risk and buffer trajectories have been recalculated.`,
          timestamp: currentPoint?.time ?? '--:--',
          tag: 'Adjustment Applied',
          recommendedAction: null,
        },
      ]);
    },
    [simParams, recalcWithParams, currentPoint?.time]
  );

  const handleSendMessage = async (text: string) => {
    if (!currentPoint) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: currentPoint.time,
      tag: 'Operator',
    };

    setMessages((prev) => [...prev, userMsg]);
    addAudit('Operator', text);
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          telemetry: {
            time: currentPoint.time,
            rateA: currentPoint.rateA,
            rateB: currentPoint.rateB,
            rateC: currentPoint.rateC,
            throughput: currentPoint.throughput,
            ab: currentPoint.ab,
            bc: currentPoint.bc,
            autoAB: currentPoint.autoAB,
            autoBC: currentPoint.autoBC,
            oeeA: currentPoint.oeeA,
            oeeB: currentPoint.oeeB,
            oeeC: currentPoint.oeeC,
            prodCum: currentPoint.prodCum,
            targetCum: currentPoint.targetCum,
            risk: currentPoint.risk,
            starvedB: currentPoint.starvedB,
            starvedC: currentPoint.starvedC,
            topDrivers: rankedDrivers.map((d) => ({
              key: d.key,
              label: d.label,
              value: d.value,
            })),
            activeAlerts: activeAlerts.map((a) => ({
              severity: a.severity,
              title: a.title,
              detail: a.detail,
            })),
          },
          simParams,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        recommendedAction?: {
          type: 'rebalance_buffers' | 'apply_prescription';
          label: string;
          driverKey: ShapDriverKey;
        } | null;
        source?: string;
      };

      const replyText =
        data.reply ??
        `At ${currentPoint.time}, throughput is ${fmt(currentPoint.throughput, 0)} t/h with consolidated risk at ${fmt(currentPoint.risk, 0)}%.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: currentPoint.time,
          tag: data.source === 'gemini' ? 'Gemini XAI' : 'XAI Engine',
          recommendedAction: data.recommendedAction ?? null,
        },
      ]);
      addAudit('XAI Copilot', replyText);
    } catch {
      const top = rankedDrivers[0];
      const fallbackText = `Local analysis (${currentPoint.time}): Throughput at ${fmt(currentPoint.throughput, 0)} t/h, Risk at ${fmt(currentPoint.risk, 0)}%. Primary offender: ${top?.label ?? 'Stage A'} (+${fmt(top?.value ?? 0, 1)} pp).`;
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: fallbackText,
          timestamp: currentPoint.time,
          tag: 'XAI Engine',
          recommendedAction: null,
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleOpenSnapshot = () => {
    const safeUrl = (ref: React.RefObject<HTMLCanvasElement | null>) => {
      try {
        return ref.current ? ref.current.toDataURL('image/png') : '';
      } catch {
        return '';
      }
    };

    setSnapshotImages({
      flow: safeUrl(flowCanvasRef),
      trend: safeUrl(trendCanvasRef),
      buffer: safeUrl(bufferCanvasRef),
      cum: safeUrl(cumCanvasRef),
      shap: safeUrl(shapCanvasRef),
      waterfall: safeUrl(waterfallCanvasRef),
    });
    setSnapshotOpen(true);
  };

  if (!currentPoint) return null;

  const riskStatusLabel =
    currentPoint.risk >= 50
      ? '✖ Critical'
      : currentPoint.risk >= 30
        ? '▲ Warning'
        : '● Under Control';

  const riskStatusColor =
    currentPoint.risk >= 50
      ? 'text-rose-600 dark:text-rose-400'
      : currentPoint.risk >= 30
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  const cumGap = currentPoint.prodCum - currentPoint.targetCum;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: Brand wordmark — 4 concise single-line nav links — 1 primary CTA */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-8 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
        <a
          href="#top"
          className="font-display text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
        >
          FluxChain XAI
        </a>

        <nav className="hidden items-center gap-6 text-xs font-semibold text-slate-600 md:flex dark:text-slate-400">
          <a
            href="#alerts"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            Alerts & Simulator
          </a>
          <a
            href="#topology"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            SCADA Topology
          </a>
          <a
            href="#analytics"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            Series & Buffers
          </a>
          <a
            href="#shap"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            SHAP Explainability
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      <div className="flex w-full">
        <main id="top" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
            {/* Hero Intro & Workspace Toolbar */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>Continuous Mass Transfer</span>
                    <span aria-hidden="true">·</span>
                    <span>Stage A → Buffer AB → Stage B → Buffer BC → Stage C</span>
                    <span aria-hidden="true">·</span>
                    <span>Additive SHAP Attribution</span>
                  </div>
                  <h1 className="text-xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-2xl dark:text-white">
                    Continuous Flow Risk Monitoring & Explainability
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    Simulate upstream feed fluctuations, anticipate bottlenecks before buffer
                    depletion (starvation), and additively decompose root causes of final target
                    default risk.
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      Simulation & Display Controls
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      Cursor {currentPoint.time}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setIsLive((prev) => !prev)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isLive
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isLive && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      {isLive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      <span>{isLive ? 'Live: ON' : 'Live: OFF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRegenerate}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Dice5 className="h-3.5 w-3.5" />
                      <span>New Scenario</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowGuide((prev) => !prev)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{showGuide ? 'Guide: ON' : 'Guide: OFF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                      aria-label="Toggle light and dark theme"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-3.5 w-3.5" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                      <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAiOpen((prev) => !prev)}
                      className={`col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors sm:col-span-2 whitespace-nowrap shrink-0 cursor-pointer ${
                        isAiOpen
                          ? 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{isAiOpen ? 'AI Copilot: Active' : 'Open AI Copilot'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Real-Time Visual Deviation Alerts */}
            <div id="alerts">
              <AlertsBanner
                alerts={activeAlerts}
                currentTime={currentPoint.time}
                onExecuteAction={handleExecuteAction}
              />
            </div>

            {/* Interactive What-If Studio */}
            <WhatIfStudio
              simParams={simParams}
              onChangeParam={handleParamChange}
              onInjectShock={handleInjectShock}
            />

            {/* 6-Column KPI Telemetry Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
                  Stage A · Upstream
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.rateA, 0)}
                  </span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    t/h
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">OEE {fmt(currentPoint.oeeA, 0)}%</span>
                  <span>{currentPoint.oeeA < 75 ? '▲ Low' : '● Nominal'}</span>
                </div>
              </div>

              <div
                className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                  currentPoint.autoAB < 15
                    ? 'border-rose-500/60 dark:border-rose-500/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-[11px] font-semibold tracking-wide text-orange-600 uppercase dark:text-orange-400">
                  Buffer Silo AB
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.ab, 0)}
                  </span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    t
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      currentPoint.autoAB < 15 ? 'text-rose-600 dark:text-rose-400' : ''
                    }`}
                  >
                    {fmt(currentPoint.autoAB, 0)} min
                  </span>
                  <span>Cap {CAPACITIES.capAB} t</span>
                </div>
              </div>

              <div
                className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                  currentPoint.starvedB
                    ? 'border-rose-500/60 dark:border-rose-500/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-[11px] font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                  Stage B · Reaction
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.rateB, 0)}
                  </span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    t/h
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">OEE {fmt(currentPoint.oeeB, 0)}%</span>
                  <span
                    className={
                      currentPoint.starvedB
                        ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : ''
                    }
                  >
                    {currentPoint.starvedB ? '✖ Starvation' : '● Normal'}
                  </span>
                </div>
              </div>

              <div
                className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                  currentPoint.autoBC < 15
                    ? 'border-rose-500/60 dark:border-rose-500/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-[11px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                  Buffer Silo BC
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.bc, 0)}
                  </span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    t
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      currentPoint.autoBC < 15 ? 'text-rose-600 dark:text-rose-400' : ''
                    }`}
                  >
                    {fmt(currentPoint.autoBC, 0)} min
                  </span>
                  <span>Cap {CAPACITIES.capBC} t</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-semibold tracking-wide text-cyan-600 uppercase dark:text-cyan-400">
                  Final Throughput · C
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.throughput, 0)}
                  </span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    t/h
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">
                    Cum {fmt(currentPoint.prodCum, 0)} t
                  </span>
                  <span
                    className={`font-mono tabular-nums ${
                      cumGap >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {cumGap >= 0 ? '+' : ''}
                    {fmt(cumGap, 0)} t
                  </span>
                </div>
              </div>

              <div
                className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                  currentPoint.risk >= 45
                    ? 'border-rose-500/60 dark:border-rose-500/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-[11px] font-semibold tracking-wide text-rose-500 uppercase">
                  Target Default Risk
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
                    {fmt(currentPoint.risk, 0)}
                  </span>
                  <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    %
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                    Base 18%
                  </span>
                  <span className={`font-semibold ${riskStatusColor}`}>{riskStatusLabel}</span>
                </div>
              </div>
            </section>

            {/* Physical-Stochastic SCADA Topology */}
            <section
              id="topology"
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Physical-Stochastic Chain Topology
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Continuous mass flow, net inter-stage balance, dynamic silo levels, and
                    real-time starvation detection.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="hidden font-mono text-slate-500 tabular-nums sm:inline dark:text-slate-400">
                    Balance Δ = Inflow − Outflow
                  </span>
                  <span
                    className={`font-semibold ${
                      currentPoint.starvedB || currentPoint.starvedC
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {currentPoint.starvedB || currentPoint.starvedC
                      ? '✖ Starvation Detected on Line'
                      : '● Continuous Flow Stable'}
                  </span>
                </div>
              </div>
              <div className="h-[245px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <ScadaFlowCanvas
                  point={currentPoint}
                  theme={theme}
                  canvasRef={flowCanvasRef}
                />
              </div>
            </section>

            {/* Navigation & Synchronized Cursor Toolbar */}
            <nav
              id="analytics"
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Inspection Mode
                  </span>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setNavMode('perspectives')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        navMode === 'perspectives'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Thematic Tabs
                    </button>
                    <button
                      type="button"
                      onClick={() => setNavMode('focus')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        navMode === 'focus'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Focus Mode
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Synchronized chart cursor:</span>
                  <span className="font-mono font-bold text-sky-600 tabular-nums dark:text-sky-400">
                    {currentPoint.time}
                  </span>
                </div>
              </div>

              {navMode === 'perspectives' ? (
                <div className="flex flex-wrap gap-2">
                  {TAB_ITEMS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        activeTab === tab.id
                          ? 'border-sky-500/50 bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {FOCUS_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFocusChart(item.id)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors truncate cursor-pointer ${
                        focusChart === item.id
                          ? 'border-sky-500/50 bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </nav>

            {/* Analytical Views */}
            {navMode === 'perspectives' ? (
              <>
                {activeTab === 'all' && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Chain Temporal Dynamics & Final Throughput
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Hover across the chart to freeze any instant across all views and
                            recompute SHAP attribution.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-xs bg-rose-500" /> A
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-xs bg-yellow-500" /> B
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-xs bg-cyan-500" /> C
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-3 bg-sky-400" /> Throughput
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-3 border-t-2 border-dashed border-rose-400" />{' '}
                            Risk (%)
                          </span>
                        </div>
                      </div>

                      {showGuide && (
                        <div className="mb-3 rounded-lg border border-dashed border-sky-500/35 bg-sky-500/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-white">
                            How to interpret:
                          </strong>{' '}
                          Drops in Stage A that reach Stage C with delay illustrate the buffering
                          effect of AB and BC. When the dashed risk curve spikes, shift target
                          compliance is at risk.
                        </div>
                      )}

                      <div className="h-[340px] w-full">
                        <TrendChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          onCursorChange={setCursorIdx}
                          canvasRef={trendCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Buffer AB & BC Dynamics
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Stored volume vs critical starvation threshold.
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-orange-500" /> AB
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-emerald-500" /> BC
                          </span>
                        </div>
                      </div>

                      {showGuide && (
                        <div className="mb-3 rounded-lg border border-dashed border-amber-500/35 bg-amber-500/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-white">
                            Critical threshold:
                          </strong>{' '}
                          Below the red dashed line, remaining buffer autonomy drops under 15
                          minutes.
                        </div>
                      )}

                      <div className="h-[340px] w-full">
                        <BufferChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          onCursorChange={setCursorIdx}
                          canvasRef={bufferCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Cumulative Production vs Contracted Target
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Actual cumulative output and probabilistic uncertainty cone to end of
                            cycle.
                          </p>
                        </div>
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            cumGap >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          Variance {cumGap >= 0 ? '+' : ''}
                          {fmt(cumGap, 0)} t
                        </span>
                      </div>
                      <div className="h-[270px] w-full">
                        <CumulativeChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          onCursorChange={setCursorIdx}
                          canvasRef={cumCanvasRef}
                        />
                      </div>
                    </section>

                    <section
                      id="shap"
                      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Temporal SHAP Attribution (+pp Risk)
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Additive primary causes above the 18% natural baseline.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-rose-500" /> A
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-orange-500" /> AB
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-yellow-500" /> B
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-emerald-500" /> BC
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-xs bg-cyan-500" /> C
                          </span>
                        </div>
                      </div>
                      <div className="h-[270px] w-full">
                        <ShapTimelineChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          onCursorChange={setCursorIdx}
                          canvasRef={shapCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            SHAP Waterfall · Instant {currentPoint.time}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Additive risk breakdown starting from the 18% baseline.
                          </p>
                        </div>
                        <span className={`font-mono text-xs font-bold tabular-nums ${riskStatusColor}`}>
                          Risk {fmt(currentPoint.risk, 0)}%
                        </span>
                      </div>
                      <div className="h-[220px] w-full">
                        <WaterfallChart
                          point={currentPoint}
                          theme={theme}
                          canvasRef={waterfallCanvasRef}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        At <span className="font-mono font-semibold">{currentPoint.time}</span>,
                        consolidated risk is{' '}
                        <span className="font-mono font-semibold">{fmt(currentPoint.risk, 0)}%</span>
                        . The top risk driver is{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {rankedDrivers[0]?.label}
                        </strong>{' '}
                        (+{fmt(rankedDrivers[0]?.value ?? 0, 1)} pp), indicating the highest-leverage
                        point for operator intervention.
                      </p>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Driver Ranking & Counterfactual Prescriptions
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Lowest-effort interventions to recover target delivery.
                        </p>
                      </div>
                      <XaiDiagnostics
                        rankedDrivers={rankedDrivers}
                        counterfactuals={counterfactuals}
                        onApplyPrescription={(driverKey) =>
                          handleExecuteAction('apply_prescription', driverKey)
                        }
                      />
                    </section>
                  </div>
                )}

                {activeTab === 'rates' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Stage A, B, C Flow Rates & Consolidated Throughput
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      Expanded inspection of volumetric rates and downstream disturbance propagation.
                    </p>
                    <div className="h-[420px] w-full">
                      <TrendChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={trendCanvasRef}
                      />
                    </div>
                  </section>
                )}

                {activeTab === 'buffers' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Intermediate Buffers AB & BC Monitoring
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      Remaining autonomy in minutes before depletion and starvation protection.
                    </p>
                    <div className="h-[420px] w-full">
                      <BufferChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={bufferCanvasRef}
                      />
                    </div>
                  </section>
                )}

                {activeTab === 'forecast' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Cumulative Production vs Contracted Target (Forecast)
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      Probabilistic envelope based on instantaneous line throughput.
                    </p>
                    <div className="h-[420px] w-full">
                      <CumulativeChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={cumCanvasRef}
                      />
                    </div>
                  </section>
                )}

                {activeTab === 'xai' && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Temporal SHAP Series (+pp Risk)
                      </h3>
                      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        Historical additive contribution by stage and intermediate buffer.
                      </p>
                      <div className="h-[380px] w-full">
                        <ShapTimelineChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          onCursorChange={setCursorIdx}
                          canvasRef={shapCanvasRef}
                        />
                      </div>
                    </section>
                    <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        SHAP Waterfall ({currentPoint.time})
                      </h3>
                      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        Exact attribution at the cursor-selected instant.
                      </p>
                      <div className="h-[380px] w-full">
                        <WaterfallChart
                          point={currentPoint}
                          theme={theme}
                          canvasRef={waterfallCanvasRef}
                        />
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'counter' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Prescriptive Counterfactual Analysis ("Prescriptive What-If")
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      Lowest-effort recommended interventions to restore target at{' '}
                      {currentPoint.time}.
                    </p>
                    <XaiDiagnostics
                      rankedDrivers={rankedDrivers}
                      counterfactuals={counterfactuals}
                      onApplyPrescription={(driverKey) =>
                        handleExecuteAction('apply_prescription', driverKey)
                      }
                    />
                  </section>
                )}
              </>
            ) : (
              /* Focus / Deep Inspection Mode */
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Focus Inspection ·{' '}
                        {FOCUS_ITEMS.find((f) => f.id === focusChart)?.label ?? ''}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Expanded visualization with synchronized cursor for deviation analysis.
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-sky-600 tabular-nums dark:text-sky-400">
                      {currentPoint.time}
                    </span>
                  </div>
                  <div className="h-[460px] w-full">
                    {focusChart === 'trend' && (
                      <TrendChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={trendCanvasRef}
                      />
                    )}
                    {focusChart === 'buffer' && (
                      <BufferChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={bufferCanvasRef}
                      />
                    )}
                    {focusChart === 'cum' && (
                      <CumulativeChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={cumCanvasRef}
                      />
                    )}
                    {focusChart === 'shap' && (
                      <ShapTimelineChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        onCursorChange={setCursorIdx}
                        canvasRef={shapCanvasRef}
                      />
                    )}
                    {focusChart === 'waterfall' && (
                      <WaterfallChart
                        point={currentPoint}
                        theme={theme}
                        canvasRef={waterfallCanvasRef}
                      />
                    )}
                  </div>
                </section>

                <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        SHAP Snapshot at Cursor
                      </h3>
                      <span className="font-mono text-xs font-bold text-slate-500 tabular-nums">
                        {currentPoint.time}
                      </span>
                    </div>
                    <div className="h-[200px] w-full">
                      <WaterfallChart point={currentPoint} theme={theme} />
                    </div>
                  </div>
                  <XaiDiagnostics
                    rankedDrivers={rankedDrivers}
                    counterfactuals={counterfactuals}
                    onApplyPrescription={(driverKey) =>
                      handleExecuteAction('apply_prescription', driverKey)
                    }
                    compact
                  />
                </section>
              </div>
            )}

            <footer className="no-print border-t border-slate-200 pt-4 pb-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              FluxChain XAI · Continuous Operations Center A → B → C · Additive SHAP Attribution &
              Operational Audit
            </footer>
          </div>
        </main>

        <AiAssistantDock
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          point={currentPoint}
          messages={messages}
          isLoading={isAiLoading}
          onSendMessage={handleSendMessage}
          onExecuteAction={handleExecuteAction}
        />
      </div>

      <SnapshotModal
        isOpen={snapshotOpen}
        onClose={() => setSnapshotOpen(false)}
        point={currentPoint}
        simParams={simParams}
        images={snapshotImages}
        auditTrail={auditTrail}
      />
    </div>
  );
}
