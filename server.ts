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
  const top = telemetry.topDrivers[0] ?? { key: "shap_A", label: "Stage A", value: 0 };
  const second = telemetry.topDrivers[1] ?? { key: "shap_B", label: "Stage B", value: 0 };

  if (q.includes("buffer") || q.includes("starvation") || q.includes("inventory") || q.includes("silo")) {
    const abWarn = telemetry.autoAB < 15 ? "imminent starvation risk at Stage B" : "safe autonomy";
    const bcWarn = telemetry.autoBC < 15 ? "imminent starvation risk at Stage C" : "safe autonomy";
    return {
      reply: `At ${telemetry.time}, Buffer AB holds ${telemetry.ab.toFixed(0)} t (${telemetry.autoAB.toFixed(0)} min autonomy — ${abWarn}) and Buffer BC holds ${telemetry.bc.toFixed(0)} t (${telemetry.autoBC.toFixed(0)} min — ${bcWarn}). ${telemetry.starvedB || telemetry.starvedC ? "Downstream starvation throttling is active; immediate buffer rebalancing is recommended." : "Maintain at least 15 minutes of autonomy across both intermediate silos."}`,
      recommendedAction: {
        type: "rebalance_buffers" as const,
        label: "Apply Automatic Buffer Rebalance (+45t AB / +35t BC)",
        driverKey: "shap_AB",
      },
    };
  }

  if (q.includes("prescri") || q.includes("counterfactual") || q.includes("fix") || q.includes("action") || q.includes("reduce")) {
    const gain = (top.value * 0.65).toFixed(1);
    return {
      reply: `Counterfactual Prescription at ${telemetry.time}: the primary risk driver is ${top.label} (+${top.value.toFixed(1)} pp). Intervening directly on this stage yields an estimated -${gain} pp reduction in consolidated target-miss risk.`,
      recommendedAction: {
        type: "apply_prescription" as const,
        label: `Execute Prescribed Adjustment on ${top.label.split(" (")[0]} (-${gain} pp)`,
        driverKey: top.key,
      },
    };
  }

  if (q.includes("bottleneck") || q.includes("rate") || q.includes("flow") || q.includes("throughput") || q.includes("oee")) {
    const stages = [
      { name: "Stage A", rate: telemetry.rateA, oee: telemetry.oeeA },
      { name: "Stage B", rate: telemetry.rateB, oee: telemetry.oeeB },
      { name: "Stage C", rate: telemetry.rateC, oee: telemetry.oeeC },
    ].sort((a, b) => a.rate - b.rate);
    const bottleneck = stages[0];
    return {
      reply: `Flow diagnosis at ${telemetry.time}: the current physical bottleneck is ${bottleneck.name}, running at ${bottleneck.rate.toFixed(0)} t/h (OEE ${bottleneck.oee.toFixed(0)}%) against the 200 t/h final target. Stage A: ${telemetry.rateA.toFixed(0)} t/h | Stage B: ${telemetry.rateB.toFixed(0)} t/h | Stage C: ${telemetry.rateC.toFixed(0)} t/h.`,
      recommendedAction: {
        type: "apply_prescription" as const,
        label: `Optimize ${bottleneck.name} via Prescribed Setpoint`,
        driverKey: bottleneck.name.includes("A") ? "shap_A" : bottleneck.name.includes("B") ? "shap_B" : "shap_C",
      },
    };
  }

  const gap = telemetry.prodCum - telemetry.targetCum;
  return {
    reply: `At ${telemetry.time}, Consolidated Target-Miss Risk is ${telemetry.risk.toFixed(0)}% (18% natural baseline) with final throughput at ${telemetry.throughput.toFixed(0)} t/h and cumulative variance of ${gap >= 0 ? "+" : ""}${gap.toFixed(0)} t vs target. Per SHAP decomposition, the primary driver is ${top.label} (+${top.value.toFixed(1)} pp), followed by ${second.label} (+${second.value.toFixed(1)} pp).`,
    recommendedAction:
      telemetry.risk >= 30
        ? {
            type: "apply_prescription" as const,
            label: `Mitigate ${top.label.split(" (")[0]} (-${(top.value * 0.65).toFixed(1)} pp)`,
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
      res.status(400).json({ error: "Invalid telemetry payload." });
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

      const systemInstruction = `You are the Process Engineering Operational Copilot for the FluxChain XAI dashboard.
Respond in clear, concise, technical English (maximum 110 words), always grounded strictly in the provided telemetry numbers.
Use accurate units (t/h, t, min, %, pp). Never invent metrics outside the received context.
If risk is elevated (>= 30%), starvation is occurring, or a bottleneck is clear, provide a structured recommended action matching the JSON schema.`;

      const promptContext = JSON.stringify({
        operatorQuery: body.query,
        instantTelemetry: body.telemetry,
        simulatorParams: body.simParams,
        recentHistory: (body.history ?? []).slice(-4),
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
                description: "Concise technical answer grounded in telemetry values and SHAP attribution.",
              },
              actionType: {
                type: Type.STRING,
                description: "Optional: 'rebalance_buffers', 'apply_prescription', or 'none'.",
              },
              actionLabel: {
                type: Type.STRING,
                description: "Short button label in English for the suggested action, if applicable.",
              },
              driverKey: {
                type: Type.STRING,
                description: "Target SHAP key: 'shap_A', 'shap_AB', 'shap_B', 'shap_BC', 'shap_C', or 'shap_SYS'.",
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
                  ? "Apply Buffer Rebalance"
                  : "Execute Prescribed Action"),
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
