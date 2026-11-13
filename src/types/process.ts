export type ShapDriverKey =
  | 'shap_A'
  | 'shap_AB'
  | 'shap_B'
  | 'shap_BC'
  | 'shap_C'
  | 'shap_SYS';

export interface DriverDefinition {
  key: ShapDriverKey;
  shortLabel: string;
  label: string;
  hex: string;
}

export interface ProcessPoint {
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
  shap_A: number;
  shap_AB: number;
  shap_B: number;
  shap_BC: number;
  shap_C: number;
  shap_SYS: number;
  starvedB: boolean;
  starvedC: boolean;
}

export type ShockType = 'tripA' | 'bottleB' | 'surgeC' | null;

export interface SimParams {
  targetRateA: number;
  initialBufferAB: number;
  effB: number;
  initialBufferBC: number;
  targetRateC: number;
  shockEvent: ShockType;
}

export type AlertSeverity = 'critical' | 'warning' | 'nominal';

export interface DeviationAlert {
  id: string;
  severity: 'critical' | 'warning';
  code: string;
  title: string;
  detail: string;
  metricValue: string;
  targetDriverKey: ShapDriverKey;
  actionType: 'rebalance_buffers' | 'apply_prescription';
  actionLabel: string;
}

export interface RankedDriver extends DriverDefinition {
  value: number;
}

export interface CounterfactualAction {
  id: string;
  title: string;
  action: string;
  gainPp: number;
  driverKey: ShapDriverKey;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  sender: string;
  action: string;
}

export interface AssistantAction {
  type: 'rebalance_buffers' | 'apply_prescription';
  label: string;
  driverKey: ShapDriverKey;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  tag: string;
  recommendedAction?: AssistantAction | null;
}

export type NavMode = 'perspectives' | 'focus';
export type TabId = 'all' | 'rates' | 'buffers' | 'forecast' | 'xai' | 'counter';
export type FocusChartKey = 'trend' | 'buffer' | 'cum' | 'shap' | 'waterfall';
