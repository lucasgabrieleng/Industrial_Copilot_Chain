import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Dice5,
  FileText,
  Languages,
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
import { FOCUS_LABELS, TAB_LABELS, UI_TEXT } from './i18n/translations';
import type {
  AuditEntry,
  ChatMessage,
  FocusChartKey,
  Language,
  NavMode,
  ProcessPoint,
  ShapDriverKey,
  ShockType,
  SimParams,
  TabId,
} from './types/process';

const TAB_IDS: TabId[] = ['all', 'rates', 'buffers', 'forecast', 'xai', 'counter'];
const FOCUS_IDS: FocusChartKey[] = ['trend', 'buffer', 'cum', 'shap', 'waterfall'];

export default function App() {
  const [lang, setLang] = useState<Language>('en');
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
      text: UI_TEXT.en.assistant.welcomeText,
      timestamp: UI_TEXT.en.assistant.initialLabel,
      tag: UI_TEXT.en.assistant.welcomeTag,
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

  const t = UI_TEXT[lang];

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
    document.documentElement.lang = lang;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === 'welcome-msg'
          ? {
              ...m,
              text: UI_TEXT[lang].assistant.welcomeText,
              timestamp: UI_TEXT[lang].assistant.initialLabel,
              tag: UI_TEXT[lang].assistant.welcomeTag,
            }
          : m
      )
    );
    setAuditTrail((prev) =>
      prev.map((entry) =>
        entry.id === 'audit-1'
          ? {
              ...entry,
              timestamp: lang === 'pt' ? 'Inicial' : 'Initial',
              sender: lang === 'pt' ? 'Sistema XAI' : 'XAI System',
              action:
                lang === 'pt'
                  ? 'Linha de base SHAP inicializada (18% de risco natural).'
                  : 'SHAP calibration baseline initialized (18% natural risk).',
            }
          : entry
      )
    );
  }, [lang]);

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
    () => (currentPoint ? getRankedDrivers(currentPoint, lang) : []),
    [currentPoint, lang]
  );

  const counterfactuals = useMemo(
    () => (currentPoint ? buildCounterfactuals(currentPoint, lang) : []),
    [currentPoint, lang]
  );

  const activeAlerts = useMemo(
    () => (currentPoint ? detectDeviationAlerts(currentPoint, lang) : []),
    [currentPoint, lang]
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
      const msg =
        lang === 'pt'
          ? `Parâmetro ${String(key)} ajustado para ${String(value)}.`
          : `Parameter ${String(key)} adjusted to ${String(value)}.`;
      recalcWithParams(next, lang === 'pt' ? 'Simulador' : 'Simulator', msg);
    },
    [simParams, recalcWithParams, lang]
  );

  const handleInjectShock = useCallback(
    (shock: ShockType | 'reset') => {
      if (shock === 'reset') {
        recalcWithParams(
          DEFAULT_SIM_PARAMS,
          lang === 'pt' ? 'Simulador' : 'Simulator',
          lang === 'pt'
            ? 'Parâmetros restaurados aos valores nominais de projeto.'
            : 'Parameters restored to nominal design defaults.'
        );
        return;
      }
      const label =
        shock === 'tripA'
          ? lang === 'pt'
            ? 'Falha Primária em A'
            : 'Primary Failure in A'
          : shock === 'bottleB'
            ? lang === 'pt'
              ? 'Gargalo no Estágio B'
              : 'Bottleneck in Stage B'
            : lang === 'pt'
              ? 'Surto de Demanda em C'
              : 'Demand Surge in C';
      recalcWithParams(
        { ...simParams, shockEvent: shock },
        lang === 'pt' ? 'Simulador' : 'Simulator',
        lang === 'pt' ? `Distúrbio injetado: ${label}.` : `Disturbance injected: ${label}.`
      );
    },
    [simParams, recalcWithParams, lang]
  );

  const handleRegenerate = () => {
    const nextSeries = generateProcessSeries(simParams);
    setSeries(nextSeries);
    setCursorIdx(nextSeries.length - 1);
    addAudit(
      lang === 'pt' ? 'Operador' : 'Operator',
      lang === 'pt' ? 'Novo cenário estocástico gerado.' : 'Generated new stochastic scenario.'
    );
  };

  const handleExecuteAction = useCallback(
    (actionType: 'rebalance_buffers' | 'apply_prescription', driverKey: ShapDriverKey) => {
      let nextParams: SimParams;
      let summary: string;
      const isPt = lang === 'pt';

      if (actionType === 'rebalance_buffers') {
        const nextAB = Math.min(CAPACITIES.capAB, simParams.initialBufferAB + 45);
        const nextBC = Math.min(CAPACITIES.capBC, simParams.initialBufferBC + 35);
        nextParams = {
          ...simParams,
          initialBufferAB: nextAB,
          initialBufferBC: nextBC,
        };
        summary = isPt
          ? `Rebalanceamento aplicado: Buffer AB (${nextAB} t) e Buffer BC (${nextBC} t).`
          : `Buffer rebalance applied: Buffer AB (${nextAB} t) and Buffer BC (${nextBC} t).`;
      } else {
        if (driverKey === 'shap_A') {
          nextParams = { ...simParams, targetRateA: 260, shockEvent: null };
          summary = isPt
            ? 'Setpoint de alimentação do Estágio A elevado para 260 t/h e distúrbio limpo.'
            : 'Stage A feed setpoint raised to 260 t/h and disturbance cleared.';
        } else if (driverKey === 'shap_AB') {
          nextParams = { ...simParams, initialBufferAB: 220, shockEvent: null };
          summary = isPt
            ? 'Buffer AB recomposto para 220 t.'
            : 'Buffer AB replenished to 220 t.';
        } else if (driverKey === 'shap_B') {
          nextParams = { ...simParams, effB: 95, shockEvent: null };
          summary = isPt
            ? 'OEE do Estágio B otimizado para 95%.'
            : 'Stage B OEE optimized to 95%.';
        } else if (driverKey === 'shap_BC') {
          nextParams = { ...simParams, initialBufferBC: 165, shockEvent: null };
          summary = isPt
            ? 'Buffer BC reforçado para 165 t.'
            : 'Buffer BC reinforced to 165 t.';
        } else {
          nextParams = { ...simParams, targetRateC: 200, shockEvent: null };
          summary = isPt
            ? 'Demanda meta do Estágio C realinhada para 200 t/h.'
            : 'Stage C target demand realigned to 200 t/h.';
        }
      }

      recalcWithParams(
        nextParams,
        isPt ? 'Intervenção Operacional' : 'Operational Intervention',
        summary
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          text: isPt
            ? `Ação executada com sucesso: ${summary} Trajetórias de risco e buffers recalculadas.`
            : `Action executed successfully: ${summary} Risk and buffer trajectories have been recalculated.`,
          timestamp: currentPoint?.time ?? '--:--',
          tag: isPt ? 'Ajuste Aplicado' : 'Adjustment Applied',
          recommendedAction: null,
        },
      ]);
    },
    [simParams, recalcWithParams, currentPoint?.time, lang]
  );

  const handleSendMessage = async (text: string) => {
    if (!currentPoint) return;

    const isPt = lang === 'pt';
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: currentPoint.time,
      tag: isPt ? 'Operador' : 'Operator',
    };

    setMessages((prev) => [...prev, userMsg]);
    addAudit(isPt ? 'Operador' : 'Operator', text);
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
          lang,
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
        (isPt
          ? `Às ${currentPoint.time}, a vazão final está em ${fmt(currentPoint.throughput, 0)} t/h com risco consolidado de ${fmt(currentPoint.risk, 0)}%.`
          : `At ${currentPoint.time}, throughput is ${fmt(currentPoint.throughput, 0)} t/h with consolidated risk at ${fmt(currentPoint.risk, 0)}%.`);

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: currentPoint.time,
          tag: data.source === 'gemini' ? 'Gemini XAI' : isPt ? 'Motor XAI' : 'XAI Engine',
          recommendedAction: data.recommendedAction ?? null,
        },
      ]);
      addAudit(isPt ? 'Copiloto XAI' : 'XAI Copilot', replyText);
    } catch {
      const top = rankedDrivers[0];
      const fallbackText = isPt
        ? `Análise local (${currentPoint.time}): Vazão em ${fmt(currentPoint.throughput, 0)} t/h, Risco em ${fmt(currentPoint.risk, 0)}%. Principal ofensor: ${top?.label ?? 'Estágio A'} (+${fmt(top?.value ?? 0, 1)} pp).`
        : `Local analysis (${currentPoint.time}): Throughput at ${fmt(currentPoint.throughput, 0)} t/h, Risk at ${fmt(currentPoint.risk, 0)}%. Primary offender: ${top?.label ?? 'Stage A'} (+${fmt(top?.value ?? 0, 1)} pp).`;
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: fallbackText,
          timestamp: currentPoint.time,
          tag: isPt ? 'Motor XAI' : 'XAI Engine',
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
      ? t.kpi.statusCritical
      : currentPoint.risk >= 30
        ? t.kpi.statusWarning
        : t.kpi.statusControlled;

  const riskStatusColor =
    currentPoint.risk >= 50
      ? 'text-rose-600 dark:text-rose-400'
      : currentPoint.risk >= 30
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  const cumGap = currentPoint.prodCum - currentPoint.targetCum;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: Brand wordmark — 4 concise single-line nav links — Language Toggle & 1 primary CTA */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:gap-8 sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
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
            {t.nav.alerts}
          </a>
          <a
            href="#topology"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            {t.nav.topology}
          </a>
          <a
            href="#analytics"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            {t.nav.analytics}
          </a>
          <a
            href="#shap"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white"
          >
            {t.nav.shap}
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'en' ? 'pt' : 'en'))}
            aria-label={t.nav.languageToggleAria}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Languages className="h-3.5 w-3.5 text-sky-500" />
            <span className="font-mono">
              <span className={lang === 'en' ? 'text-sky-600 dark:text-sky-400' : 'opacity-50'}>
                EN
              </span>
              <span className="mx-1 opacity-40">/</span>
              <span className={lang === 'pt' ? 'text-sky-600 dark:text-sky-400' : 'opacity-50'}>
                PT
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={handleOpenSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{t.nav.exportPdf}</span>
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
                    <span>{t.hero.eyebrow1}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.hero.eyebrow2}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.hero.eyebrow3}</span>
                  </div>
                  <h1 className="text-xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-2xl dark:text-white">
                    {t.hero.title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {t.hero.subtitle}
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      {t.hero.controlsTitle}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {t.hero.cursorLabel} {currentPoint.time}
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
                      <span>{isLive ? t.hero.liveOn : t.hero.liveOff}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRegenerate}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Dice5 className="h-3.5 w-3.5" />
                      <span>{t.hero.newScenario}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowGuide((prev) => !prev)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{showGuide ? t.hero.guideOn : t.hero.guideOff}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                      aria-label={t.hero.toggleThemeAria}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-3.5 w-3.5" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                      <span>{theme === 'dark' ? t.hero.lightMode : t.hero.darkMode}</span>
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
                      <span>{isAiOpen ? t.hero.aiActive : t.hero.aiOpen}</span>
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
                lang={lang}
                onExecuteAction={handleExecuteAction}
              />
            </div>

            {/* Interactive What-If Studio */}
            <WhatIfStudio
              simParams={simParams}
              lang={lang}
              onChangeParam={handleParamChange}
              onInjectShock={handleInjectShock}
            />

            {/* 6-Column KPI Telemetry Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
                  {t.kpi.stageA}
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
                  <span>{currentPoint.oeeA < 75 ? t.kpi.low : t.kpi.nominal}</span>
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
                  {t.kpi.bufferAB}
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
                  <span>
                    {t.kpi.cap} {CAPACITIES.capAB} t
                  </span>
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
                  {t.kpi.stageB}
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
                    {currentPoint.starvedB ? t.kpi.starvation : t.kpi.normal}
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
                  {t.kpi.bufferBC}
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
                  <span>
                    {t.kpi.cap} {CAPACITIES.capBC} t
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-semibold tracking-wide text-cyan-600 uppercase dark:text-cyan-400">
                  {t.kpi.throughputC}
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
                    {t.kpi.cum} {fmt(currentPoint.prodCum, 0)} t
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
                  {t.kpi.targetRisk}
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
                    {t.kpi.base18}
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
                    {t.topology.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t.topology.subtitle}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="hidden font-mono text-slate-500 tabular-nums sm:inline dark:text-slate-400">
                    {t.topology.balanceFormula}
                  </span>
                  <span
                    className={`font-semibold ${
                      currentPoint.starvedB || currentPoint.starvedC
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {currentPoint.starvedB || currentPoint.starvedC
                      ? t.topology.starvationDetected
                      : t.topology.flowStable}
                  </span>
                </div>
              </div>
              <div className="h-[245px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <ScadaFlowCanvas
                  point={currentPoint}
                  theme={theme}
                  lang={lang}
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
                    {t.inspection.modeLabel}
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
                      {t.inspection.tabs}
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
                      {t.inspection.focus}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{t.inspection.syncCursor}</span>
                  <span className="font-mono font-bold text-sky-600 tabular-nums dark:text-sky-400">
                    {currentPoint.time}
                  </span>
                </div>
              </div>

              {navMode === 'perspectives' ? (
                <div className="flex flex-wrap gap-2">
                  {TAB_IDS.map((tabId) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setActiveTab(tabId)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        activeTab === tabId
                          ? 'border-sky-500/50 bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {TAB_LABELS[lang][tabId]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {FOCUS_IDS.map((focusId) => (
                    <button
                      key={focusId}
                      type="button"
                      onClick={() => setFocusChart(focusId)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors truncate cursor-pointer ${
                        focusChart === focusId
                          ? 'border-sky-500/50 bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {FOCUS_LABELS[lang][focusId]}
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
                            {t.charts.trendTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.charts.trendSub}
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
                            <span className="h-0.5 w-3 bg-sky-400" /> {t.charts.throughputLegend}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-3 border-t-2 border-dashed border-rose-400" />{' '}
                            {t.charts.riskLegend}
                          </span>
                        </div>
                      </div>

                      {showGuide && (
                        <div className="mb-3 rounded-lg border border-dashed border-sky-500/35 bg-sky-500/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-white">
                            {t.charts.guideTitle}
                          </strong>{' '}
                          {t.charts.guideBody}
                        </div>
                      )}

                      <div className="h-[340px] w-full">
                        <TrendChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          lang={lang}
                          onCursorChange={setCursorIdx}
                          canvasRef={trendCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {t.charts.bufferTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.charts.bufferSub}
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
                            {t.charts.thresholdTitle}
                          </strong>{' '}
                          {t.charts.thresholdBody}
                        </div>
                      )}

                      <div className="h-[340px] w-full">
                        <BufferChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          lang={lang}
                          onCursorChange={setCursorIdx}
                          canvasRef={bufferCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {t.charts.cumTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.charts.cumSub}
                          </p>
                        </div>
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            cumGap >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {t.charts.variance} {cumGap >= 0 ? '+' : ''}
                          {fmt(cumGap, 0)} t
                        </span>
                      </div>
                      <div className="h-[270px] w-full">
                        <CumulativeChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          lang={lang}
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
                            {t.charts.shapTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.charts.shapSub}
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
                          lang={lang}
                          onCursorChange={setCursorIdx}
                          canvasRef={shapCanvasRef}
                        />
                      </div>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {t.charts.waterfallTitle} {currentPoint.time}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.charts.waterfallSub}
                          </p>
                        </div>
                        <span className={`font-mono text-xs font-bold tabular-nums ${riskStatusColor}`}>
                          {t.charts.riskLabel} {fmt(currentPoint.risk, 0)}%
                        </span>
                      </div>
                      <div className="h-[220px] w-full">
                        <WaterfallChart
                          point={currentPoint}
                          theme={theme}
                          lang={lang}
                          canvasRef={waterfallCanvasRef}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {t.charts.waterfallExplain1}{' '}
                        <span className="font-mono font-semibold">{currentPoint.time}</span>,{' '}
                        {t.charts.waterfallExplain2}{' '}
                        <span className="font-mono font-semibold">{fmt(currentPoint.risk, 0)}%</span>
                        . {t.charts.waterfallExplain3}{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {rankedDrivers[0]?.label}
                        </strong>{' '}
                        (+{fmt(rankedDrivers[0]?.value ?? 0, 1)} pp), {t.charts.waterfallExplain4}
                      </p>
                    </section>

                    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {t.charts.driversTitle}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t.charts.driversSub}
                        </p>
                      </div>
                      <XaiDiagnostics
                        rankedDrivers={rankedDrivers}
                        counterfactuals={counterfactuals}
                        lang={lang}
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
                      {t.expandedTabs.ratesTitle}
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      {t.expandedTabs.ratesSub}
                    </p>
                    <div className="h-[420px] w-full">
                      <TrendChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={trendCanvasRef}
                      />
                    </div>
                  </section>
                )}

                {activeTab === 'buffers' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t.expandedTabs.buffersTitle}
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      {t.expandedTabs.buffersSub}
                    </p>
                    <div className="h-[420px] w-full">
                      <BufferChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={bufferCanvasRef}
                      />
                    </div>
                  </section>
                )}

                {activeTab === 'forecast' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t.expandedTabs.forecastTitle}
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      {t.expandedTabs.forecastSub}
                    </p>
                    <div className="h-[420px] w-full">
                      <CumulativeChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
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
                        {t.expandedTabs.xaiTitle}
                      </h3>
                      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        {t.expandedTabs.xaiSub}
                      </p>
                      <div className="h-[380px] w-full">
                        <ShapTimelineChart
                          series={series}
                          cursorIdx={safeCursorIdx}
                          theme={theme}
                          lang={lang}
                          onCursorChange={setCursorIdx}
                          canvasRef={shapCanvasRef}
                        />
                      </div>
                    </section>
                    <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {t.expandedTabs.waterfallTitle} ({currentPoint.time})
                      </h3>
                      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        {t.expandedTabs.waterfallSub}
                      </p>
                      <div className="h-[380px] w-full">
                        <WaterfallChart
                          point={currentPoint}
                          theme={theme}
                          lang={lang}
                          canvasRef={waterfallCanvasRef}
                        />
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'counter' && (
                  <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {t.expandedTabs.counterTitle}
                    </h3>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                      {t.expandedTabs.counterSubPrefix} {currentPoint.time}.
                    </p>
                    <XaiDiagnostics
                      rankedDrivers={rankedDrivers}
                      counterfactuals={counterfactuals}
                      lang={lang}
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
                        {t.expandedTabs.focusTitlePrefix} {FOCUS_LABELS[lang][focusChart]}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.expandedTabs.focusSub}
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
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={trendCanvasRef}
                      />
                    )}
                    {focusChart === 'buffer' && (
                      <BufferChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={bufferCanvasRef}
                      />
                    )}
                    {focusChart === 'cum' && (
                      <CumulativeChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={cumCanvasRef}
                      />
                    )}
                    {focusChart === 'shap' && (
                      <ShapTimelineChart
                        series={series}
                        cursorIdx={safeCursorIdx}
                        theme={theme}
                        lang={lang}
                        onCursorChange={setCursorIdx}
                        canvasRef={shapCanvasRef}
                      />
                    )}
                    {focusChart === 'waterfall' && (
                      <WaterfallChart
                        point={currentPoint}
                        theme={theme}
                        lang={lang}
                        canvasRef={waterfallCanvasRef}
                      />
                    )}
                  </div>
                </section>

                <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {t.expandedTabs.focusSnapshot}
                      </h3>
                      <span className="font-mono text-xs font-bold text-slate-500 tabular-nums">
                        {currentPoint.time}
                      </span>
                    </div>
                    <div className="h-[200px] w-full">
                      <WaterfallChart point={currentPoint} theme={theme} lang={lang} />
                    </div>
                  </div>
                  <XaiDiagnostics
                    rankedDrivers={rankedDrivers}
                    counterfactuals={counterfactuals}
                    lang={lang}
                    onApplyPrescription={(driverKey) =>
                      handleExecuteAction('apply_prescription', driverKey)
                    }
                    compact
                  />
                </section>
              </div>
            )}

            <footer className="no-print border-t border-slate-200 pt-4 pb-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {t.footer}
            </footer>
          </div>
        </main>

        <AiAssistantDock
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          point={currentPoint}
          messages={messages}
          isLoading={isAiLoading}
          lang={lang}
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
        lang={lang}
      />
    </div>
  );
}
