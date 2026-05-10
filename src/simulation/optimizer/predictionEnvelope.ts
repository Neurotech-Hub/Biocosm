import type { OptimizerTrainingRow } from "./responseSurface";

/** Soft clamp model outputs to training envelope ± margin fraction (reduces wild extrapolation). */
export function clampPredictionToTrainingEnvelope(
  pred: { captureRate: number; mahPerDay: number; bleEfficiency: number },
  trainingRows: OptimizerTrainingRow[],
  marginFrac = 0.35
): { captureRate: number; mahPerDay: number; bleEfficiency: number; clamped: boolean } {
  if (trainingRows.length === 0) {
    return { ...pred, clamped: false };
  }
  const caps = trainingRows.map((r) => r.captureRate);
  const ens = trainingRows.map((r) => r.mahPerDay);
  const minC = Math.min(...caps);
  const maxC = Math.max(...caps);
  const minE = Math.min(...ens);
  const maxE = Math.max(...ens);
  const spanC = maxC - minC || 1e-6;
  const spanE = maxE - minE || 1e-6;
  const loC = minC - marginFrac * spanC;
  const hiC = maxC + marginFrac * spanC;
  const loE = minE - marginFrac * spanE;
  const hiE = maxE + marginFrac * spanE;

  let capture = pred.captureRate;
  let mah = pred.mahPerDay;
  let clamped = false;
  if (capture < loC || capture > hiC) {
    capture = Math.min(hiC, Math.max(loC, capture));
    clamped = true;
  }
  if (mah < loE || mah > hiE) {
    mah = Math.min(hiE, Math.max(loE, mah));
    clamped = true;
  }
  const bleEfficiency = mah > 1e-12 ? capture / mah : 0;
  return { captureRate: capture, mahPerDay: mah, bleEfficiency, clamped };
}
