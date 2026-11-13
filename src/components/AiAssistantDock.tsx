import React, { useEffect, useRef, useState } from 'react';
import { Send, Wrench, X } from 'lucide-react';
import { fmt } from '../engine/processSimulation';
import type { ChatMessage, ProcessPoint, ShapDriverKey } from '../types/process';

interface AiAssistantDockProps {
  isOpen: boolean;
  onClose: () => void;
  point: ProcessPoint;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onExecuteAction: (type: 'rebalance_buffers' | 'apply_prescription', driverKey: ShapDriverKey) => void;
}

const QUICK_PROMPTS = [
  'Por que o risco de meta subiu?',
  'Status do Buffer AB e starvation',
  'Qual é o gargalo atual da linha?',
  'Recomende uma prescrição contrafactual',
  'Resumo executivo do turno',
];

export const AiAssistantDock: React.FC<AiAssistantDockProps> = ({
  isOpen,
  onClose,
  point,
  messages,
  isLoading,
  onSendMessage,
  onExecuteAction,
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs xl:hidden no-print"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="Assistente de IA Operacional"
        className="fixed right-0 top-14 z-50 flex h-[calc(100vh-3.5rem)] w-full max-w-[380px] flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-14 xl:z-30 xl:w-[360px] xl:shrink-0 no-print"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Assistente IA Operacional
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Conectado à telemetria · Instante{' '}
              <span className="font-mono font-semibold tabular-nums">{point.time}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Assistente IA"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Throughput C
            </span>
            <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {fmt(point.throughput, 0)} t/h
            </span>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Risco Meta
            </span>
            <span
              className={`font-mono text-xs font-bold tabular-nums ${
                point.risk >= 45
                  ? 'text-rose-600 dark:text-rose-400'
                  : point.risk >= 30
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {fmt(point.risk, 0)}%
            </span>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
              AB / BC
            </span>
            <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {fmt(point.ab, 0)} / {fmt(point.bc, 0)} t
            </span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3.5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-semibold opacity-80">
                    <span>{isUser ? 'Operador' : 'Copiloto XAI'}</span>
                    <span className="font-mono tabular-nums">
                      {msg.timestamp} · {msg.tag}
                    </span>
                  </div>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  {msg.recommendedAction && (
                    <button
                      type="button"
                      onClick={() =>
                        onExecuteAction(
                          msg.recommendedAction!.type,
                          msg.recommendedAction!.driverKey
                        )
                      }
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white cursor-pointer"
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span>{msg.recommendedAction.label}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                Analisando telemetria e atribuição SHAP...
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isLoading}
              onClick={() => onSendMessage(prompt)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-sky-400 hover:text-sky-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400 cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre gargalos, buffers ou SHAP..."
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Enviar pergunta"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Enviar</span>
          </button>
        </form>
      </aside>
    </>
  );
};
