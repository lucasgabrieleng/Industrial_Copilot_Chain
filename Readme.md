# FluxChain XAI — Continuous Production Chain A → B → C

Interactive industrial operations dashboard for monitoring and stochastic simulation of continuous mass-transfer dynamics along a serial production line (**Stage A → Buffer AB → Stage B → Buffer BC → Stage C**). The engine dynamically computes **Consolidated Final Target Default Risk** and additively decomposes its primary root causes using **SHAP** attribution, enabling operators to intervene before buffer depletion (*starvation*) halts final delivery.

---

## Application Snapshots

### 1. Integrated View, SCADA Topology & AI Copilot (Dark Mode)
Main dashboard view featuring simulation controls, real-time KPI telemetry, animated SCADA topology (graduated silos with dynamic fluid waves, spinning equipment rotors, and net mass-balance Δ indicators), synchronized time-series charts, and the telemetry-connected operational AI assistant.

![Integrated View and SCADA Topology](./docs/snapshots/dashboard-overview-dark.png)

---

### 2. Real-Time Visual Alerts, SHAP Attribution & Counterfactual Prescriptions
Automated detection of critical deviations (*starvation*, buffer autonomy dropping below 15 min, and elevated target risk) paired with additive SHAP decomposition (temporal + waterfall) and one-click counterfactual mitigation actions.

![Real-Time Alerts and SHAP Decomposition](./docs/snapshots/deviation-alerts-shap.png)

---

### 3. Focus Mode & Light Theme
Deep inspection mode displaying an expanded single time-series or Waterfall chart side-by-side with the top ranked SHAP drivers at the cursor-frozen instant.

![Focus Mode in Light Theme](./docs/snapshots/focus-mode-light.png)

---

### 4. Executive Audit Report & PDF Snapshot
Multi-page A4 print-ready report capturing shift metadata, frozen KPIs, active What-If simulator parameters, SCADA topology snapshot, analytical charts, weighted SHAP ranking table, and operational audit trail.

![Audit Report and PDF Export Modal](./docs/snapshots/pdf-audit-snapshot.png)

---

## Architecture & Key Features

- **Continuous Stochastic Simulation (`src/engine/processSimulation.ts`)**:
  - Models mass flow in t/h across 160 time steps (with optional **Live Streaming** every `1.2s`), accumulating and draining intermediate buffers `AB` (`300 t` capacity) and `BC` (`220 t` capacity).
  - Computes buffer autonomy in minutes, detects *starvation* throttling in Stages B and C, and projects cumulative production with an uncertainty cone against the `200 t/h` target.
- **SHAP Explainability & Prescriptions (`src/components/XaiDiagnostics.tsx`, `src/components/ProcessCharts.tsx`)**:
  - Additively attributes risk above the `18%` natural baseline across `Stage A`, `Buffer AB`, `Stage B`, `Buffer BC`, `Stage C`, and `Systemic Instability`.
  - Synchronized crosshair cursor across all charts to freeze any instant and inspect the **SHAP Waterfall** and driver ranking.
- **Real-Time Visual Alerts (`src/components/AlertsBanner.tsx`)**:
  - Surfaces dynamic severity alerts (`Critical` / `Warning`) with tabular numeric metrics and direct mitigation buttons (`Rebalance Buffers` or `Apply Prescribed Fix`).
- **Interactive What-If Studio (`src/components/WhatIfStudio.tsx`)**:
  - Real-time sliders for Stage A feed rate, Buffer AB/BC levels, Stage B OEE, and Stage C target demand, plus quick disturbance injection (`Failure in A`, `Bottleneck in B`, `Surge in C`).
- **Operational AI Copilot (`server.ts`, `src/components/AiAssistantDock.tsx`)**:
  - Server-side `POST /api/assistant` endpoint powered by `@google/genai` (`gemini-4-hydrogen`) with a deterministic local XAI fallback when `GEMINI_API_KEY` is not set.
- **High-DPI SCADA Canvas (`src/components/ScadaFlowCanvas.tsx`)**:
  - Crisp canvas rendering with laminar flow particles, directional conduit chevrons, net mass balance (`Δ = Inflow − Outflow`), animated equipment rotors, and graduated industrial silos.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, High-DPI HTML5 Canvas
- **Backend**: Node.js, Express, `@google/genai` (Server-side Gemini API)
- **Build & Tooling**: Vite 8, `tsx`

---

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables** (optional for generative AI Copilot replies):
   ```bash
   cp .env.example .env
   # Set GEMINI_API_KEY in .env (without a key, the copilot uses the local XAI engine)
   ```

3. **Start the development server** (port `3000`):
   ```bash
   npm run dev
   ```

4. **Type-check, build, and start production server**:
   ```bash
   npm run lint
   npm run build
   npm start
   ```
