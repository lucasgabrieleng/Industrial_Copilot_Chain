import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

interface AssistantRequestBody {
  query: string;
  telemetry: {
    time: string;
    rateA: number;
    rateB: number;
    rateC: number;
    throughput: number;
    ab: number;
    bc: number;
    autoAB: number;
    autoBC: number;
    oeeA: number;
    oeeB: number;
    oeeC: number;
    prodCum: number;
    targetCum: number;
    risk: number;
    starvedB: boolean;
    starvedC: boolean;
    topDrivers: Array<{ key: string; label: string; value: number }>;
    activeAlerts: Array<{ severity: string; title: string; detail: string }>;
  };
  simParams: {
    targetRateA: number;
    initialBufferAB: number;
    effB: number;
    initialBufferBC: number;
    targetRateC: number;
    shockEvent: string | null;
  };
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}

function buildDeterministicFallback(body: AssistantRequestBody) {
  const { query, telemetry } = body;
  const q = query.toLowerCase();
  const top = telemetry.topDrivers[0] ?? { key: "shap_A", label: "Estágio A", value: 0 };
  const second = telemetry.topDrivers[1] ?? { key: "shap_B", label: "Estágio B", value: 0 };

  if (q.includes("buffer") || q.includes("starvation") || q.includes("estoque") || q.includes("pulm")) {
    const abWarn = telemetry.autoAB < 15 ? "risco iminente de starvation no Estágio B" : "autonomia segura";
    const bcWarn = telemetry.autoBC < 15 ? "risco iminente de starvation no Estágio C" : "autonomia segura";
    return {
      reply: `No instante ${telemetry.time}, o Buffer AB opera com ${telemetry.ab.toFixed(0)} t (${telemetry.autoAB.toFixed(0)} min de autonomia — ${abWarn}) e o Buffer BC com ${telemetry.bc.toFixed(0)} t (${telemetry.autoBC.toFixed(0)} min — ${bcWarn}). ${telemetry.starvedB || telemetry.starvedC ? "Há restrição ativa por desabastecimento downstream; recomenda-se rebalanceamento imediato dos pulmões." : "Recomenda-se manter margem mínima de 15 minutos em ambos os silos."}`,
      recommendedAction: {
        type: "rebalance_buffers" as const,
        label: "Aplicar Rebalanceamento Automático de Buffers (+40t AB / +30t BC)",
        driverKey: "shap_AB",
      },
    };
  }

  if (q.includes("prescri") || q.includes("contrafactual") || q.includes("resolver") || q.includes("o que fazer") || q.includes("reduzir")) {
    const gain = (top.value * 0.65).toFixed(1);
    return {
      reply: `Prescrição Contrafactual para o instante ${telemetry.time}: o maior ofensor é ${top.label} (+${top.value.toFixed(1)} pp de risco). Intervir diretamente neste eixo oferece redução estimada de -${gain} pp no risco consolidado de perda de meta.`,
      recommendedAction: {
        type: "apply_prescription" as const,
        label: `Executar Ajuste Prescrito em ${top.label.split(" ")[0]} (-${gain} pp)`,
        driverKey: top.key,
      },
    };
  }

  if (q.includes("gargalo") || q.includes("taxa") || q.includes("ritmo") || q.includes("vazão") || q.includes("oee")) {
    const stages = [
      { name: "Estágio A", rate: telemetry.rateA, oee: telemetry.oeeA },
      { name: "Estágio B", rate: telemetry.rateB, oee: telemetry.oeeB },
      { name: "Estágio C", rate: telemetry.rateC, oee: telemetry.oeeC },
    ].sort((a, b) => a.rate - b.rate);
    const bottleneck = stages[0];
    return {
      reply: `Diagnóstico de fluxo às ${telemetry.time}: o gargalo físico atual é o ${bottleneck.name}, operando a ${bottleneck.rate.toFixed(0)} t/h (OEE ${bottleneck.oee.toFixed(0)}%) frente à meta final de 200 t/h. Estágio A: ${telemetry.rateA.toFixed(0)} t/h | Estágio B: ${telemetry.rateB.toFixed(0)} t/h | Estágio C: ${telemetry.rateC.toFixed(0)} t/h.`,
      recommendedAction: {
        type: "apply_prescription" as const,
        label: `Otimizar ${bottleneck.name} via Setpoint Prescrito`,
        driverKey: bottleneck.name.includes("A") ? "shap_A" : bottleneck.name.includes("B") ? "shap_B" : "shap_C",
      },
    };
  }

  const gap = telemetry.prodCum - telemetry.targetCum;
  return {
    reply: `No instante ${telemetry.time}, o Risco Consolidado de Inadimplência da Meta está em ${telemetry.risk.toFixed(0)}% (baseline natural 18%) com throughput final de ${telemetry.throughput.toFixed(0)} t/h e saldo acumulado de ${gap >= 0 ? "+" : ""}${gap.toFixed(0)} t vs meta. Pela decomposição SHAP, o driver primário é ${top.label} (+${top.value.toFixed(1)} pp), seguido por ${second.label} (+${second.value.toFixed(1)} pp).`,
    recommendedAction:
      telemetry.risk >= 30
        ? {
            type: "apply_prescription" as const,
            label: `Mitigar ${top.label.split(" ")[0]} (-${(top.value * 0.65).toFixed(1)} pp)`,
            driverKey: top.key,
          }
        : null,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/assistant", async (req, res) => {
    const body = req.body as AssistantRequestBody;
    if (!body || !body.query || !body.telemetry) {
      res.status(400).json({ error: "Payload de telemetria inválido." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.json({ ...buildDeterministicFallback(body), source: "local-xai" });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemInstruction = `Você é o Copiloto Operacional de Engenharia de Processos do painel FluxChain XAI.
Responda em português do Brasil, de forma objetiva, técnica, precisa e concisa (máximo 110 palavras), sempre ancorado exatamente nos números da telemetria fornecida.
Use unidades corretas (t/h, t, min, %, pp). Não invente dados fora do contexto recebido.
Se houver risco elevado (>= 30%), starvation ou gargalo claro, sugira uma ação recomendada estruturada compatível com o schema JSON.`;

      const promptContext = JSON.stringify({
        perguntaOperador: body.query,
        telemetriaInstante: body.telemetry,
        parametrosSimulador: body.simParams,
        historicoRecente: (body.history ?? []).slice(-4),
      });

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: promptContext,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: "Resposta técnica concisa e fundamentada nos valores de telemetria e atribuição SHAP.",
              },
              actionType: {
                type: Type.STRING,
                description: "Opcional: 'rebalance_buffers', 'apply_prescription', ou 'none'.",
              },
              actionLabel: {
                type: Type.STRING,
                description: "Rótulo curto de botão em português para a ação sugerida, se aplicável.",
              },
              driverKey: {
                type: Type.STRING,
                description: "Chave SHAP alvo: 'shap_A', 'shap_AB', 'shap_B', 'shap_BC', 'shap_C' ou 'shap_SYS'.",
              },
            },
            required: ["reply", "actionType"],
          },
        },
      });

      const raw = (response.text ?? "").trim();
      const parsed = JSON.parse(raw) as {
        reply: string;
        actionType?: string;
        actionLabel?: string;
        driverKey?: string;
      };

      const recommendedAction =
        parsed.actionType === "rebalance_buffers" || parsed.actionType === "apply_prescription"
          ? {
              type: parsed.actionType,
              label:
                parsed.actionLabel ||
                (parsed.actionType === "rebalance_buffers"
                  ? "Aplicar Rebalanceamento de Buffers"
                  : "Executar Prescrição Recomendada"),
              driverKey: parsed.driverKey || body.telemetry.topDrivers[0]?.key || "shap_A",
            }
          : null;

      res.json({
        reply: parsed.reply,
        recommendedAction,
        source: "gemini",
      });
    } catch (error) {
      console.error("Assistant Gemini error, falling back to deterministic XAI:", error);
      res.json({ ...buildDeterministicFallback(body), source: "local-xai" });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FluxChain XAI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
