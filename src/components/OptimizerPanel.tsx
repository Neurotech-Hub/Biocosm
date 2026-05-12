import { useMemo, type ReactNode } from "react";
import {
  OptimizerCalibrationScatter,
  OptimizerCaptureEnergyPlot,
  type OptimizerScatterObserved
} from "./OptimizerPlots";
import type { SimulationConfig } from "../simulation/types";
import { firmwarePolicyFromSweepSummary } from "../simulation/sweep/adaptiveBleSweep";
import type { SweepBundleWithCandidates } from "../simulation/sweep/adaptiveBleSweep";
import type { SweepPolicySummary } from "../simulation/sweep/sweepCandidates";
import { defaultOptimizerBounds } from "../simulation/optimizer/bounds";
import {
  buildOptimizerMarkdownReport,
  serializeOptimizerPredictionsCsv,
  serializeOptimizerRecommendationsCsv,
  serializeOptimizerVerificationCsv
} from "../simulation/optimizer/optimizerExport";
import type { OptimizerPipelineResult } from "../simulation/optimizer/pipeline";
import { sweepSummaryForOptimizerCandidate } from "../simulation/optimizer/sweepSummaryForCandidate";
import type { PredictedPolicyCandidate, VerifiedCandidateResult } from "../simulation/optimizer/types";

export type { SweepBundleWithCandidates };

export type OptimizerPanelProps = {
  baseConfig: SimulationConfig;
  sweepResult: SweepBundleWithCandidates | null;
  pipeline: OptimizerPipelineResult | null;
  candidatePreset: number;
  optimizerSeed: string;
  verificationResults?: VerifiedCandidateResult[] | null;
  verificationRunning?: boolean;
  verificationProgress?: { completed: number; total: number };
  verificationMode: "builtSeedSingle" | "sweepSeedsMean";
  verificationSeeds: string[];
  simulateDisabled?: boolean;
  onSimulateRecommendation?: (candidate: PredictedPolicyCandidate) => void;
};

function policyHoverLabel(summary: SweepPolicySummary): string {
  return `${summary.policyId} — ${summary.label}`;
}

function nearlyEqual(a: number, b: number, eps = 1e-5): boolean {
  return Math.abs(a - b) < eps;
}

function sweepSummaryMatchesBuilt(summary: SweepPolicySummary, config: SimulationConfig): boolean {
  if (!summary.params) {
    return false;
  }
  const active = config.activePolicy;
  if (summary.params.family === "adaptive" && active.type === "motion_peer_adaptive") {
    const p = summary.params;
    return (
      nearlyEqual(p.baselineDrive, active.baselineDrive) &&
      nearlyEqual(p.motionWeight, active.motionWeight) &&
      nearlyEqual(p.peerWeight, active.peerWeight) &&
      p.tauPeerSeconds === active.tauPeerSeconds
    );
  }
  if (summary.params.family === "fixed" && active.type === "fixed") {
    const p = summary.params;
    const burstP = p.advertisingBurstDurationSeconds ?? active.advertisingBurstDurationSeconds ?? 2;
    const burstA = active.advertisingBurstDurationSeconds ?? 2;
    const pInactive = p.doubleWhenInactive === true;
    const aInactive = active.doubleWhenInactive === true;
    const pMult = p.inactiveScanIntervalMultiplier ?? 2;
    const aMult = active.inactiveScanIntervalMultiplier ?? 2;
    return (
      nearlyEqual(p.scanIntervalSeconds, active.scanIntervalSeconds) &&
      nearlyEqual(p.scanWindowSeconds, active.scanWindowSeconds) &&
      nearlyEqual(p.advIntervalSeconds, active.advIntervalSeconds) &&
      nearlyEqual(burstP, burstA) &&
      pInactive === aInactive &&
      (!pInactive || pMult === aMult)
    );
  }
  return false;
}

const AX_POP_CAPTURE_ENERGY: ReactNode = (
  <dl className="metric-definition-list">
    <dt>Across (horizontal)</dt>
    <dd>
      Predicted or observed BLE energy burden (mAh/day). Same horizontal axis idea as the Sweep report capture-vs-energy chart.
    </dd>
    <dt>Up (vertical)</dt>
    <dd>
      BLE capture rate (fraction of contact opportunities with at least one detection). Higher is better capture.
    </dd>
  </dl>
);

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OptimizerPanel({
  baseConfig,
  sweepResult,
  pipeline,
  candidatePreset,
  optimizerSeed,
  verificationResults,
  verificationRunning = false,
  verificationProgress,
  verificationMode,
  verificationSeeds,
  simulateDisabled = false,
  onSimulateRecommendation
}: OptimizerPanelProps) {
  if (!sweepResult) {
    return (
      <div className="panel optimizer-panel optimizer-shell-panel">
        <div className="panel-title-row">
          <h2>Optimizer analysis</h2>
        </div>
        <p className="optimizer-panel-lead">
          Run a sweep first to populate optimizer training data. This tab will then show model fit, recommendations, verification,
          and exports.
        </p>
        <div className="sweep-placeholder-card">
          <h3>Waiting for sweep bundle</h3>
          <p className="helper-text">
            Use the Sweep tab to run either fast or report analysis. Once a sweep completes, return here and run the optimizer.
          </p>
        </div>
      </div>
    );
  }

  const summariesRanked = useMemo(() => {
    return [...sweepResult.summaries].sort((a, b) => b.meanBleEfficiency - a.meanBleEfficiency);
  }, [sweepResult.summaries]);

  const observedCaptureEnergy = useMemo((): OptimizerScatterObserved[] => {
    return summariesRanked.map((summary) => {
      let variant: OptimizerScatterObserved["variant"] = "fixed_no_inactive";
      if (summary.kind === "adaptive") {
        variant = "adaptive";
      } else if (
        summary.kind === "fixed_sweep_inactivity_double" ||
        summary.kind === "baseline_fixed_inactivity_double"
      ) {
        variant = "fixed_inactive_x2";
      } else if (
        summary.kind === "fixed_sweep_inactive_scan_x5" ||
        summary.kind === "baseline_fixed_inactive_scan_x5"
      ) {
        variant = "fixed_inactive_x5";
      }
      return {
        x: summary.meanMahPerDay,
        y: summary.meanCaptureRate,
        id: summary.policyId,
        tooltip: policyHoverLabel(summary),
        variant,
        highlight: sweepSummaryMatchesBuilt(summary, baseConfig),
        pareto: summary.isParetoEfficient
      };
    });
  }, [summariesRanked, baseConfig]);

  const baselinePointObserved = useMemo(
    () => ({
      x: sweepResult.baselineSummary.meanMahPerDay,
      y: sweepResult.baselineSummary.meanCaptureRate,
      label: "Juxta 5.6",
      tooltip: `Juxta baseline (${sweepResult.baselineSummary.policyId})`,
      pareto: sweepResult.baselineSummary.isParetoEfficient
    }),
    [sweepResult.baselineSummary]
  );

  const faintPredicted = useMemo(() => {
    if (!pipeline) {
      return [];
    }
    const maxPts = 5500;
    const { candidates } = pipeline;
    const stride = Math.max(1, Math.ceil(candidates.length / maxPts));
    const out: { x: number; y: number; id: string }[] = [];
    for (let i = 0; i < candidates.length; i += stride) {
      const c = candidates[i]!;
      if (c.isPredictedPareto) {
        continue;
      }
      out.push({
        x: c.predictedMahPerDay,
        y: c.predictedCaptureRate,
        id: c.candidateId
      });
    }
    return out;
  }, [pipeline]);

  const paretoPredicted = useMemo(() => {
    if (!pipeline) {
      return [];
    }
    return pipeline.candidates
      .filter((c) => c.isPredictedPareto)
      .map((c) => ({
        x: c.predictedMahPerDay,
        y: c.predictedCaptureRate,
        id: c.candidateId
      }));
  }, [pipeline]);

  const verifiedScatter = useMemo(() => {
    if (!verificationResults?.length) {
      return [];
    }
    return verificationResults.map((v) => ({
      x: v.verifiedMahPerDay,
      y: v.verifiedCaptureRate,
      id: `${v.candidateId}-${v.recommendationRole}`
    }));
  }, [verificationResults]);

  const recommendationCaptureEnergy = useMemo(() => {
    if (!pipeline) {
      return [];
    }
    return pipeline.recommendations.picks
      .filter((p) => p.candidate)
      .map((p) => ({
        x: p.candidate!.predictedMahPerDay,
        y: p.candidate!.predictedCaptureRate,
        id: p.candidate!.candidateId,
        label: p.label
      }));
  }, [pipeline]);

  const calibrationGroups = useMemo(() => {
    if (!verificationResults?.length) {
      return null;
    }
    const cap = verificationResults.map((v) => ({
      predicted: v.predictedCaptureRate,
      verified: v.verifiedCaptureRate,
      label: v.recommendationRole
    }));
    const en = verificationResults.map((v) => ({
      predicted: v.predictedMahPerDay,
      verified: v.verifiedMahPerDay,
      label: v.recommendationRole
    }));
    const eff = verificationResults.map((v) => ({
      predicted: v.predictedBleEfficiency,
      verified: v.verifiedBleEfficiency,
      label: v.recommendationRole
    }));
    return { cap, en, eff };
  }, [verificationResults]);

  const verificationRoleSummary = useMemo(() => {
    if (!verificationResults?.length) {
      return null;
    }
    const roles = [...new Set(verificationResults.map((v) => v.recommendationRole))];
    return roles.sort().join(", ");
  }, [verificationResults]);

  const verificationAgreement = useMemo(() => {
    if (!verificationResults?.length) {
      return null;
    }
    const maxEnergyError = Math.max(...verificationResults.map((v) => Math.abs(v.energyPredictionError)));
    const maxEnergyRelativeError = Math.max(...verificationResults.map((v) => Math.abs(v.energyRelativeError)));
    const maxCaptureError = Math.max(...verificationResults.map((v) => Math.abs(v.capturePredictionError)));
    return {
      maxEnergyError,
      maxEnergyRelativeError,
      maxCaptureError,
      needsWarning: maxEnergyError > 0.5 || maxCaptureError > 0.15
    };
  }, [verificationResults]);

  const verifiedByRole = useMemo(() => {
    if (!verificationResults?.length) {
      return new Map<string, VerifiedCandidateResult>();
    }
    return new Map(verificationResults.map((v) => [v.recommendationRole, v]));
  }, [verificationResults]);

  const bounds = defaultOptimizerBounds();
  const hasPipeline = Boolean(pipeline);

  return (
    <div className="panel optimizer-panel">
      <div className="panel-title-row">
        <h2>Optimizer analysis</h2>
      </div>
      <p className="optimizer-panel-lead">
        Results from the empirical model fit and verification runs. Use the sidebar to configure and run the optimizer.
      </p>

      {verificationRunning ? (
        <p className="helper-text" aria-live="polite">
          Verification progress: {verificationProgress?.completed ?? 0}/{verificationProgress?.total ?? ""}
        </p>
      ) : null}

      {pipeline ? (
        <div className="optimizer-model-summary">
          <h3>Model fit</h3>
          <table className="optimizer-summary-table">
            <tbody>
              <tr>
                <th scope="row">Training adaptive rows</th>
                <td>{pipeline.trainingRowCount}</td>
              </tr>
              <tr>
                <th scope="row">Feature count</th>
                <td>{pipeline.model.featureCount}</td>
              </tr>
              <tr>
                <th scope="row">R² capture</th>
                <td>{pipeline.model.captureR2.toFixed(6)}</td>
              </tr>
              <tr>
                <th scope="row">R² energy (mAh/day)</th>
                <td>{pipeline.model.energyR2.toFixed(6)}</td>
              </tr>
              <tr>
                <th scope="row">Energy target</th>
                <td>{pipeline.model.energyTarget}</td>
              </tr>
              <tr>
                <th scope="row">LOO energy MAE</th>
                <td>{pipeline.calibrationDiagnostics.energyMae.toFixed(4)} mAh/day</td>
              </tr>
              <tr>
                <th scope="row">Generated bounds</th>
                <td>{pipeline.constrainCandidatesToTrainingEnvelope ? "Observed sweep envelope" : "Configured optimizer bounds"}</td>
              </tr>
              <tr>
                <th scope="row">Ridge λ</th>
                <td>{pipeline.model.ridgeLambda}</td>
              </tr>
            </tbody>
          </table>
          <p className="helper-text optimizer-diagnostics-line">
            Sweep mode: <strong>{sweepResult.mode}</strong>. Sweep seeds:{" "}
            <strong>{sweepResult.seedsUsed.length > 0 ? sweepResult.seedsUsed.join(", ") : "none"}</strong>. Verification protocol:{" "}
            <strong>{verificationMode === "builtSeedSingle" ? "built seed only" : "mean over sweep seeds"}</strong>. Verification
            seeds: <strong>{verificationSeeds.join(", ")}</strong>.
          </p>
          <p className="helper-text optimizer-diagnostics-line">
            Leave-one-out calibration: capture RMSE{" "}
            <strong>{pipeline.calibrationDiagnostics.captureRmse.toFixed(4)}</strong>; energy RMSE{" "}
            <strong>{pipeline.calibrationDiagnostics.energyRmse.toFixed(4)} mAh/day</strong>. Candidate generation is{" "}
            <strong>{pipeline.constrainCandidatesToTrainingEnvelope ? "constrained" : "not constrained"}</strong> to the adaptive
            sweep training envelope.
          </p>
        </div>
      ) : null}

      {verificationAgreement?.needsWarning ? (
        <div className="optimizer-verification-warning">
          <h3>Verification overrides predictions</h3>
          <p className="helper-text">
            At least one recommended policy is outside the sanity band after simulation. Largest absolute energy miss:{" "}
            <strong>{verificationAgreement.maxEnergyError.toFixed(4)} mAh/day</strong> (
            {(verificationAgreement.maxEnergyRelativeError * 100).toFixed(1)}% relative to prediction). Use verified values for
            decisions from this run.
          </p>
        </div>
      ) : null}

      {pipeline ? (
        <div className="sweep-plots-grid optimizer-plots-grid optimizer-plots-grid--single">
          <OptimizerCaptureEnergyPlot
            axesPopoverTitle="Optimizer capture vs energy"
            axesPopoverChildren={AX_POP_CAPTURE_ENERGY}
            title="Capture rate vs energy (analysis)"
            subtitle="Single canonical tradeoff view: observed sweep, predicted cloud + Pareto, cyan = recommendation roles, pink = verified simulation (if run)."
            xLabel="mAh/day"
            yLabel="BLE capture rate"
            baselinePoint={{
              ...baselinePointObserved,
              tooltip: baselinePointObserved.tooltip
            }}
            baselineMatchesBuilt={sweepSummaryMatchesBuilt(sweepResult.baselineSummary, baseConfig)}
            observed={observedCaptureEnergy}
            faintPredicted={faintPredicted}
            paretoPredicted={paretoPredicted}
            verifiedPredicted={verifiedScatter}
            recommendationPoints={recommendationCaptureEnergy}
          />
        </div>
      ) : null}

      {calibrationGroups ? (
        <div className="optimizer-calibration-section">
          <h3>Verification calibration (per role)</h3>
          <p className="helper-text">
            Each marker is one recommendation role from this run. Roles included: <strong>{verificationRoleSummary}</strong>.
            Diagonal = perfect agreement between predicted (horizontal) and single-seed verified (vertical).
          </p>
          <div className="optimizer-calibration-grid">
            <OptimizerCalibrationScatter metricTitle="Capture rate (per role)" points={calibrationGroups.cap} />
            <OptimizerCalibrationScatter metricTitle="mAh/day (per role)" points={calibrationGroups.en} />
            <OptimizerCalibrationScatter metricTitle="Efficiency (per role)" points={calibrationGroups.eff} />
          </div>
        </div>
      ) : null}

      {pipeline ? (
        <div className="optimizer-rec-section">
          <h3>Recommendations</h3>
          {verificationResults?.length ? (
            <p className="helper-text">
              Verification has run for these roles. Treat the verified capture, energy, and efficiency columns as the decision values
              for this seed protocol; predicted values remain as surrogate context.
            </p>
          ) : null}
          <div className="table-wrap">
            <table className="optimizer-rec-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Note</th>
                  <th>Source</th>
                  <th>Simulate</th>
                  <th>candidateId</th>
                  <th>bd</th>
                  <th>mw</th>
                  <th>pw</th>
                  <th>τ peer</th>
                  <th>Pred capture</th>
                  <th>Ver capture</th>
                  <th>Pred mAh/d</th>
                  <th>Ver mAh/d</th>
                  <th>Pred eff.</th>
                  <th>Ver eff.</th>
                  <th>Rel cap</th>
                  <th>Rel E</th>
                  <th>Coverage</th>
                  <th>Pareto</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.recommendations.picks.map((p) => {
                  const c = p.candidate;
                  const verified = verifiedByRole.get(p.label);
                  const policySummary = c ? sweepSummaryForOptimizerCandidate(sweepResult, c) : null;
                  const canSimulate = Boolean(
                    c &&
                      onSimulateRecommendation &&
                      policySummary &&
                      firmwarePolicyFromSweepSummary(policySummary, baseConfig)
                  );
                  return (
                    <tr key={p.role}>
                      <td>{p.label}</td>
                      <td className="optimizer-note-cell">{p.note ?? "—"}</td>
                      <td>{c?.source ?? "—"}</td>
                      <td>
                        {c && onSimulateRecommendation ? (
                          <button
                            type="button"
                            className="sweep-policy-simulate-button"
                            disabled={simulateDisabled || !canSimulate}
                            title={
                              canSimulate
                                ? "Load this policy into the Simulator tab and rebuild"
                                : "No sweep parameters available for this row (e.g. baseline reference)"
                            }
                            onClick={() => c && canSimulate && onSimulateRecommendation(c)}
                          >
                            Simulate
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{c?.candidateId ?? "—"}</td>
                      <td>{c ? c.baselineDrive.toFixed(4) : "—"}</td>
                      <td>{c ? c.motionWeight.toFixed(4) : "—"}</td>
                      <td>{c ? c.peerWeight.toFixed(4) : "—"}</td>
                      <td>{c ? Math.round(c.tauPeerSeconds) : "—"}</td>
                      <td>{c ? c.predictedCaptureRate.toFixed(4) : "—"}</td>
                      <td>{verified ? verified.verifiedCaptureRate.toFixed(4) : "—"}</td>
                      <td>{c ? c.predictedMahPerDay.toFixed(4) : "—"}</td>
                      <td>{verified ? verified.verifiedMahPerDay.toFixed(4) : "—"}</td>
                      <td>{c ? c.predictedBleEfficiency.toFixed(4) : "—"}</td>
                      <td>{verified ? verified.verifiedBleEfficiency.toFixed(4) : "—"}</td>
                      <td>{c ? c.predictedRelativeCapture.toFixed(4) : "—"}</td>
                      <td>{c ? c.predictedRelativeEnergy.toFixed(4) : "—"}</td>
                      <td>
                        {c?.source === "predicted_adaptive"
                          ? `${c.trainingOutsideEnvelope ? "Outside" : "Inside"} / d=${c.trainingNearestDistance?.toFixed(2) ?? "—"}`
                          : "Observed"}
                      </td>
                      <td>{c ? (c.isPredictedPareto ? "Yes" : "No") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {verificationResults && verificationResults.length > 0 ? (
        <div className="optimizer-verify-section">
          <h3>Verification vs prediction</h3>
          <div className="table-wrap">
            <table className="optimizer-rec-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>candidateId</th>
                  <th>Pred capture</th>
                  <th>Ver capture</th>
                  <th>Δ capture</th>
                  <th>Pred mAh/d</th>
                  <th>Ver mAh/d</th>
                  <th>Δ mAh/d</th>
                  <th>Δ mAh/d %</th>
                  <th>Pred eff.</th>
                  <th>Ver eff.</th>
                  <th>Δ eff.</th>
                  <th>Seeds</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {verificationResults.map((v, i) => (
                  <tr key={`${v.candidateId}-${i}`}>
                    <td>{v.recommendationRole}</td>
                    <td>{v.candidateId}</td>
                    <td>{v.predictedCaptureRate.toFixed(4)}</td>
                    <td>{v.verifiedCaptureRate.toFixed(4)}</td>
                    <td>{v.capturePredictionError.toFixed(4)}</td>
                    <td>{v.predictedMahPerDay.toFixed(4)}</td>
                    <td>{v.verifiedMahPerDay.toFixed(4)}</td>
                    <td>{v.energyPredictionError.toFixed(4)}</td>
                    <td>{(v.energyRelativeError * 100).toFixed(1)}%</td>
                    <td>{v.predictedBleEfficiency.toFixed(4)}</td>
                    <td>{v.verifiedBleEfficiency.toFixed(4)}</td>
                    <td>{v.efficiencyPredictionError.toFixed(4)}</td>
                    <td>{v.verificationSeeds.join(", ")}</td>
                    <td>
                      {v.source === "predicted_adaptive"
                        ? `${v.trainingOutsideEnvelope ? "Outside" : "Inside"} / d=${v.trainingNearestDistance?.toFixed(2) ?? "—"}`
                        : "Observed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="sweep-downloads optimizer-downloads">
        <h3>Downloads</h3>
        <button
          type="button"
          className="secondary-button"
          disabled={!hasPipeline}
          onClick={() => {
            if (!pipeline) {
              return;
            }
            downloadBlob(
              `biocosm-optimizer-predictions-${baseConfig.seed}.csv`,
              serializeOptimizerPredictionsCsv(pipeline.candidates),
              "text/csv;charset=utf-8"
            );
          }}
        >
          optimizer_predictions.csv
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!hasPipeline}
          onClick={() => {
            if (!pipeline) {
              return;
            }
            downloadBlob(
              `biocosm-optimizer-recommendations-${baseConfig.seed}.csv`,
              serializeOptimizerRecommendationsCsv(pipeline.recommendations.picks),
              "text/csv;charset=utf-8"
            );
          }}
        >
          optimizer_recommendations.csv
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!verificationResults?.length}
          onClick={() => {
            if (!verificationResults?.length) {
              return;
            }
            downloadBlob(
              `biocosm-optimizer-verification-${baseConfig.seed}.csv`,
              serializeOptimizerVerificationCsv(verificationResults),
              "text/csv;charset=utf-8"
            );
          }}
        >
          optimizer_verification.csv
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!hasPipeline}
          onClick={() => {
            if (!pipeline) {
              return;
            }
            downloadBlob(
              `biocosm-optimizer-report-${baseConfig.seed}.md`,
              buildOptimizerMarkdownReport({
                bundle: sweepResult,
                pipeline,
                bounds,
                candidateCount: candidatePreset,
                optimizerSeed,
                verificationMode,
                verificationSeeds,
                builtSeed: String(baseConfig.seed),
                verification: verificationResults ?? undefined
              }),
              "text/markdown;charset=utf-8"
            );
          }}
        >
          optimizer_report.md
        </button>
      </div>

      <section className="optimizer-notes-section" aria-label="Caveats and notes">
        <h3 className="optimizer-notes-heading">Caveats and notes</h3>
        <div className="optimizer-panel-caveat-block">
          <p>
            The optimizer fits an empirical model to completed simulation sweeps. Recommendations combine predicted adaptive
            candidates and observed fixed sweep rows; they are not final firmware settings. Policies should be verified by
            simulation and validated on hardware before deployment.
          </p>
          <p>
            The model is trained under the current movement, sociality, radio, and energy assumptions. Changing species, enclosure,
            detection radius, or energy model may change the recommended policy.
          </p>
          <p className="helper-text">
            Sweep report rows may average multiple seeds; verification and Simulator loads use the current built configuration and
            a single seed ({baseConfig.seed}).
          </p>
        </div>
      </section>
    </div>
  );
}
