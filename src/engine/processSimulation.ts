import type {
  CounterfactualAction,
  DeviationAlert,
  DriverDefinition,
  ProcessPoint,
  RankedDriver,
  ShapDriverKey,
  SimParams,
} from '../types/process';

export const DRIVERS: DriverDefinition[] = [
  { key: 'shap_A', shortLabel: 'Stage A', label: 'Stage A (Feed Rate / Availability)', hex: '#f43f5e' },
  { key: 'shap_AB', shortLabel: 'Buffer AB', label: 'Buffer AB (Level / Starvation)', hex: '#f97316' },
  { key: 'shap_B', shortLabel: 'Stage B', label: 'Stage B (OEE / Efficiency)', hex: '#eab308' },
  { key: 'shap_BC', shortLabel: 'Buffer BC', label: 'Buffer BC (Level / Starvation)', hex: '#10b981' },
  { key: 'shap_C', shortLabel: 'Stage C', label: 'Stage C (Regime / Quality)', hex: '#06b6d4' },
  { key: 'shap_SYS', shortLabel: 'Systemic', label: 'Systemic Instability & Noise', hex: '#a855f7' },
];

export const CAPACITIES = {
  capA: 260,
  capAB: 300,
  capB: 230,
  capBC: 220,
  capC: 215,
  targetFinal: 200,
  baselineRisk: 18,
} as const;

export const DEFAULT_SIM_PARAMS: SimParams = {
  targetRateA: 240,
  initialBufferAB: 160,
  effB: 88,
  initialBufferBC: 120,
  targetRateC: 200,
  shockEvent: null,
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function fmt(val: number, dec = 0): string {
  return Number(val).toFixed(dec);
}

function randomGaussian(mean = 0, stdev = 1): number {
  const u1 = Math.max(1e-7, 1 - Math.random());
  const u2 = 1 - Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdev * z;
}

function computeShapPoint(params: {
  rateA: number;
  rateB: number;
  throughput: number;
  ab: number;
  bc: number;
  oeeA: number;
  oeeB: number;
  oeeC: number;
}): {
  risk: number;
  shap_A: number;
  shap_AB: number;
  shap_B: number;
  shap_BC: number;
  shap_C: number;
  shap_SYS: number;
} {
  const riskNormA = clamp((CAPACITIES.targetFinal + 15 - params.rateA) / 85, 0, 1);
  const riskNormAB = clamp((55 - params.ab) / 55, 0, 1);
  const riskNormB = clamp((CAPACITIES.targetFinal + 10 - params.rateB) / 75, 0, 1);
  const riskNormBC = clamp((45 - params.bc) / 45, 0, 1);
  const riskNormC = clamp((CAPACITIES.targetFinal - params.throughput) / 60, 0, 1);
  const riskNormSys = clamp(
    (1 - params.oeeA / 100) * 0.25 + (1 - params.oeeB / 100) * 0.35 + (1 - params.oeeC / 100) * 0.4,
    0,
    1
  );

  const wA = 0.26;
  const wAB = 0.18;
  const wB = 0.2;
  const wBC = 0.16;
  const wC = 0.15;
  const wSys = 0.05;

  const rawRisk =
    wA * riskNormA +
    wAB * riskNormAB +
    wB * riskNormB +
    wBC * riskNormBC +
    wC * riskNormC +
    wSys * riskNormSys;

  const risk = clamp(
    rawRisk * 100 + (params.throughput < CAPACITIES.targetFinal ? 12 : -4),
    4,
    98
  );
  const delta = Math.max(0, risk - CAPACITIES.baselineRisk);
  const sumWeights =
    wA * riskNormA +
    wAB * riskNormAB +
    wB * riskNormB +
    wBC * riskNormBC +
    wC * riskNormC +
    wSys * riskNormSys +
    1e-5;

  return {
    risk: Number(risk.toFixed(1)),
    shap_A: Number((delta * ((wA * riskNormA) / sumWeights)).toFixed(1)),
    shap_AB: Number((delta * ((wAB * riskNormAB) / sumWeights)).toFixed(1)),
    shap_B: Number((delta * ((wB * riskNormB) / sumWeights)).toFixed(1)),
    shap_BC: Number((delta * ((wBC * riskNormBC) / sumWeights)).toFixed(1)),
    shap_C: Number((delta * ((wC * riskNormC) / sumWeights)).toFixed(1)),
    shap_SYS: Number((delta * ((wSys * riskNormSys) / sumWeights)).toFixed(1)),
  };
}

export function generateProcessSeries(simParams: SimParams): ProcessPoint[] {
  const data: ProcessPoint[] = [];
  const totalPoints = 160;
  const now = Date.now();

  let currentAB = simParams.initialBufferAB;
  let currentBC = simParams.initialBufferBC;
  let prodCum = 0;
  let targetCum = 0;

  const shockPoint = simParams.shockEvent
    ? Math.floor(totalPoints * 0.48)
    : 82 + Math.floor(Math.random() * 22);
  const shockDuration = 22 + Math.floor(Math.random() * 10);

  for (let i = 0; i < totalPoints; i++) {
    const timeObj = new Date(now - (totalPoints - 1 - i) * 60000);
    const hh = String(timeObj.getHours()).padStart(2, '0');
    const mm = String(timeObj.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    const inEvent = i >= shockPoint && i <= shockPoint + shockDuration;
    let rateA = simParams.targetRateA + Math.sin(i / 8) * 4 + randomGaussian(0, 3.2);
    let oeeA = 90 + randomGaussian(0, 1.8);

    if (inEvent) {
      if (simParams.shockEvent === 'tripA') {
        rateA -= 80 + (i - shockPoint) * 0.85;
        oeeA -= 26;
      } else if (simParams.shockEvent === 'bottleB') {
        // Stage A continues normally while B chokes
      } else if (simParams.shockEvent === 'surgeC') {
        // Stage A continues normally while C surges
      } else {
        rateA -= 42;
        oeeA -= 16;
      }
    }
    rateA = clamp(rateA, 80, CAPACITIES.capA);
    oeeA = clamp(oeeA, 55, 99);

    const inBEvent = simParams.shockEvent === 'bottleB' && inEvent;
    let nominalB =
      CAPACITIES.capB * (simParams.effB / 100) + Math.cos(i / 11) * 3 + randomGaussian(0, 2.6);
    if (inBEvent) nominalB -= 68;

    const availInAB = currentAB + rateA / 60;
    let rateB = nominalB;
    let starvedB = false;
    if (availInAB < nominalB / 60) {
      rateB = Math.max(30, availInAB * 60 * 0.95);
      starvedB = true;
    }
    rateB = clamp(rateB, 40, CAPACITIES.capB);
    let oeeB = starvedB ? simParams.effB * 0.65 : simParams.effB + randomGaussian(0, 2);
    oeeB = clamp(oeeB, 40, 99);

    currentAB = clamp(currentAB + (rateA - rateB) / 60, 0, CAPACITIES.capAB);

    const inCEvent = simParams.shockEvent === 'surgeC' && inEvent;
    let nominalC = simParams.targetRateC + Math.sin(i / 14) * 2 + randomGaussian(0, 2.4);
    if (inCEvent) nominalC += 26;

    const availInBC = currentBC + rateB / 60;
    let rateC = nominalC;
    let starvedC = false;
    if (availInBC < nominalC / 60) {
      rateC = Math.max(20, availInBC * 60 * 0.95);
      starvedC = true;
    }
    rateC = clamp(rateC, 30, CAPACITIES.capC);
    let oeeC = starvedC ? 60 : 89 + randomGaussian(0, 2.1);
    oeeC = clamp(oeeC, 45, 98);

    currentBC = clamp(currentBC + (rateB - rateC) / 60, 0, CAPACITIES.capBC);

    const throughput = rateC;
    prodCum += throughput / 60;
    targetCum += CAPACITIES.targetFinal / 60;

    const autoAB = rateB > 0 ? currentAB / (rateB / 60) : 999;
    const autoBC = rateC > 0 ? currentBC / (rateC / 60) : 999;

    const shapMetrics = computeShapPoint({
      rateA,
      rateB,
      throughput,
      ab: currentAB,
      bc: currentBC,
      oeeA,
      oeeB,
      oeeC,
    });

    data.push({
      time: timeStr,
      rateA: Number(rateA.toFixed(1)),
      rateB: Number(rateB.toFixed(1)),
      rateC: Number(rateC.toFixed(1)),
      throughput: Number(throughput.toFixed(1)),
      ab: Number(currentAB.toFixed(1)),
      bc: Number(currentBC.toFixed(1)),
      autoAB: Number(autoAB.toFixed(1)),
      autoBC: Number(autoBC.toFixed(1)),
      oeeA: Number(oeeA.toFixed(1)),
      oeeB: Number(oeeB.toFixed(1)),
      oeeC: Number(oeeC.toFixed(1)),
      prodCum: Number(prodCum.toFixed(1)),
      targetCum: Number(targetCum.toFixed(1)),
      ...shapMetrics,
      starvedB,
      starvedC,
    });
  }

  return data;
}

export function stepProcessPoint(last: ProcessPoint, simParams: SimParams): ProcessPoint {
  const [hhRaw, mmRaw] = last.time.split(':').map(Number);
  let newMm = (mmRaw || 0) + 1;
  let newHh = hhRaw || 0;
  if (newMm >= 60) {
    newMm = 0;
    newHh = (newHh + 1) % 24;
  }
  const newTimeStr = `${String(newHh).padStart(2, '0')}:${String(newMm).padStart(2, '0')}`;

  const shockPenaltyA = simParams.shockEvent === 'tripA' ? -72 : 0;
  const shockPenaltyB = simParams.shockEvent === 'bottleB' ? -60 : 0;
  const shockBoostC = simParams.shockEvent === 'surgeC' ? 25 : 0;

  const rateA = clamp(simParams.targetRateA + shockPenaltyA + randomGaussian(0, 4), 80, CAPACITIES.capA);
  const nominalB = clamp(CAPACITIES.capB * (simParams.effB / 100) + shockPenaltyB + randomGaussian(0, 3), 40, CAPACITIES.capB);
  const availAB = last.ab + rateA / 60;
  const starvedB = availAB < nominalB / 60;
  const rateB = clamp(starvedB ? Math.max(30, availAB * 60 * 0.95) : nominalB, 40, CAPACITIES.capB);
  const ab = clamp(last.ab + (rateA - rateB) / 60, 0, CAPACITIES.capAB);

  const nominalC = clamp(simParams.targetRateC + shockBoostC + randomGaussian(0, 2.8), 30, CAPACITIES.capC);
  const availBC = last.bc + rateB / 60;
  const starvedC = availBC < nominalC / 60;
  const rateC = clamp(starvedC ? Math.max(20, availBC * 60 * 0.95) : nominalC, 30, CAPACITIES.capC);
  const bc = clamp(last.bc + (rateB - rateC) / 60, 0, CAPACITIES.capBC);

  const throughput = rateC;
  const prodCum = last.prodCum + throughput / 60;
  const targetCum = last.targetCum + CAPACITIES.targetFinal / 60;
  const autoAB = rateB > 0 ? ab / (rateB / 60) : 999;
  const autoBC = rateC > 0 ? bc / (rateC / 60) : 999;

  const oeeA = clamp((simParams.shockEvent === 'tripA' ? 68 : 90) + randomGaussian(0, 2), 55, 99);
  const oeeB = clamp((starvedB ? simParams.effB * 0.68 : simParams.effB) + randomGaussian(0, 2), 40, 99);
  const oeeC = clamp((starvedC ? 62 : 90) + randomGaussian(0, 2), 45, 98);

  const shapMetrics = computeShapPoint({
    rateA,
    rateB,
    throughput,
    ab,
    bc,
    oeeA,
    oeeB,
    oeeC,
  });

  return {
    time: newTimeStr,
    rateA: Number(rateA.toFixed(1)),
    rateB: Number(rateB.toFixed(1)),
    rateC: Number(rateC.toFixed(1)),
    throughput: Number(throughput.toFixed(1)),
    ab: Number(ab.toFixed(1)),
    bc: Number(bc.toFixed(1)),
    autoAB: Number(autoAB.toFixed(1)),
    autoBC: Number(autoBC.toFixed(1)),
    oeeA: Number(oeeA.toFixed(1)),
    oeeB: Number(oeeB.toFixed(1)),
    oeeC: Number(oeeC.toFixed(1)),
    prodCum: Number(prodCum.toFixed(1)),
    targetCum: Number(targetCum.toFixed(1)),
    ...shapMetrics,
    starvedB,
    starvedC,
  };
}

export function getRankedDrivers(point: ProcessPoint): RankedDriver[] {
  return DRIVERS.map((d) => ({
    ...d,
    value: point[d.key],
  })).sort((a, b) => b.value - a.value);
}

export function buildCounterfactuals(point: ProcessPoint): CounterfactualAction[] {
  const ranked = getRankedDrivers(point);
  const primary = ranked[0];
  const secondary = ranked[1];

  const getPrescriptionDesc = (key: ShapDriverKey): string => {
    if (key === 'shap_A') return 'Increase Stage A feed rate to 255 t/h and stabilize upstream blend';
    if (key === 'shap_AB') return 'Replenish Buffer AB above 180 t by temporarily throttling Stage B draw';
    if (key === 'shap_B') return 'Eliminate micro-stops in Reactor B to restore operational OEE to 94%';
    if (key === 'shap_BC') return 'Reinforce Buffer BC above 140 t by synchronizing flow between B and C';
    if (key === 'shap_C') return 'Realign Stage C packaging cadence to the 200 t/h nominal target';
    return 'Smooth PID control loops to reduce inter-stage variance';
  };

  return [
    {
      id: `cf-${primary.key}`,
      title: `Direct Intervention · ${primary.shortLabel}`,
      action: getPrescriptionDesc(primary.key),
      gainPp: Number((primary.value * 0.65).toFixed(1)),
      driverKey: primary.key,
    },
    {
      id: `cf-${secondary.key}`,
      title: `Secondary Mitigation · ${secondary.shortLabel}`,
      action: getPrescriptionDesc(secondary.key),
      gainPp: Number((secondary.value * 0.5).toFixed(1)),
      driverKey: secondary.key,
    },
  ];
}

export function detectDeviationAlerts(point: ProcessPoint): DeviationAlert[] {
  const alerts: DeviationAlert[] = [];
  const ranked = getRankedDrivers(point);
  const top = ranked[0];

  if (point.starvedC || point.autoBC < 15) {
    alerts.push({
      id: 'alert-starvation-bc',
      severity: 'critical',
      code: 'STARVATION_BC',
      title: point.starvedC
        ? 'Active Starvation at Stage C (Final Delivery)'
        : 'Buffer BC at Critical Depletion Threshold',
      detail: `Buffer BC holds ${fmt(point.bc, 0)} t (${fmt(point.autoBC, 0)} min autonomy). Final delivery faces imminent stoppage.`,
      metricValue: `${fmt(point.autoBC, 0)} min`,
      targetDriverKey: 'shap_BC',
      actionType: 'rebalance_buffers',
      actionLabel: 'Rebalance Buffers',
    });
  }

  if (point.starvedB || point.autoAB < 15) {
    alerts.push({
      id: 'alert-starvation-ab',
      severity: 'critical',
      code: 'STARVATION_AB',
      title: point.starvedB
        ? 'Starvation Detected at Stage B (Reaction)'
        : 'Buffer AB Below Safe Margin (< 15 min)',
      detail: `Silo AB at ${fmt(point.ab, 0)} t (${fmt(point.autoAB, 0)} min). Upstream feed drop from A is propagating to B.`,
      metricValue: `${fmt(point.autoAB, 0)} min`,
      targetDriverKey: 'shap_AB',
      actionType: 'rebalance_buffers',
      actionLabel: 'Replenish Buffer AB',
    });
  }

  if (point.risk >= 45) {
    alerts.push({
      id: 'alert-high-risk',
      severity: 'critical',
      code: 'RISK_THRESHOLD',
      title: 'Elevated Target Default Risk',
      detail: `Consolidated risk at ${fmt(point.risk, 0)}% (18% baseline). Dominant SHAP driver: ${top.label} (+${fmt(top.value, 1)} pp).`,
      metricValue: `${fmt(point.risk, 0)}%`,
      targetDriverKey: top.key,
      actionType: 'apply_prescription',
      actionLabel: `Intervene on ${top.shortLabel}`,
    });
  } else if (point.risk >= 30) {
    alerts.push({
      id: 'alert-warn-risk',
      severity: 'warning',
      code: 'RISK_DRIFT',
      title: 'Preventive Risk Drift Detected',
      detail: `Target-miss risk at ${fmt(point.risk, 0)}%. Primary offender: ${top.shortLabel} (+${fmt(top.value, 1)} pp).`,
      metricValue: `${fmt(point.risk, 0)}%`,
      targetDriverKey: top.key,
      actionType: 'apply_prescription',
      actionLabel: `Adjust ${top.shortLabel}`,
    });
  }

  if (point.throughput < CAPACITIES.targetFinal - 18) {
    alerts.push({
      id: 'alert-throughput-drop',
      severity: point.throughput < CAPACITIES.targetFinal - 35 ? 'critical' : 'warning',
      code: 'THROUGHPUT_GAP',
      title: 'Final Throughput Below Contracted Target',
      detail: `Stage C running at ${fmt(point.throughput, 0)} t/h vs ${CAPACITIES.targetFinal} t/h target.`,
      metricValue: `${fmt(point.throughput, 0)} t/h`,
      targetDriverKey: point.rateB < point.rateA ? 'shap_B' : 'shap_A',
      actionType: 'apply_prescription',
      actionLabel: 'Fix Bottleneck',
    });
  }

  return alerts;
}
