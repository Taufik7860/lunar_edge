import React, { Suspense, lazy } from 'react';
import {
  LandingSite,
  ContinuityEnvelopeResult,
  MissionRequirements,
} from '../../types/api';
import {
  ShieldCheck,
  ShieldAlert,
  Crosshair,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  HelpCircle,
} from 'lucide-react';

const ContinuityEnvelopeChart = lazy(() =>
  import('../charts/ContinuityEnvelopeChart').then((m) => ({ default: m.ContinuityEnvelopeChart }))
);

const ChartFallback = () => (
  <div className="h-[360px] bg-obsidian-900 border border-slate-800 rounded-md flex items-center justify-center font-mono text-xs text-slate-400">
    <div className="flex items-center space-x-2">
      <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      <span>Loading Mission Continuity Envelope chart...</span>
    </div>
  </div>
);

interface MissionResilienceWorkspaceProps {
  site: LandingSite;
  envelope: ContinuityEnvelopeResult | null;
  requirements: MissionRequirements;
  onChangeRequirements?: (reqs: MissionRequirements) => void;
  onReevaluate?: () => void;
}

export const MissionResilienceWorkspace: React.FC<MissionResilienceWorkspaceProps> = ({
  site,
  envelope,
  requirements,
  onChangeRequirements,
  onReevaluate,
}) => {
  return (
    <div className="w-full h-full bg-obsidian-950 p-6 overflow-y-auto space-y-6 text-xs font-mono select-none">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm tracking-wide">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>MISSION CONTINUITY ENVELOPE & RESILIENCE ANALYSIS</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            Evaluating operational sensitivity to spatial touchdown dispersion (±100m, ±250m) and temporal launch slippage (±1 to ±3 days) for{' '}
            <strong className="text-white">{site.name}</strong>.
          </div>
        </div>

        {/* Robustness Score Indicator */}
        {envelope && (
          <div className="flex items-center space-x-3 bg-graphite-900 border border-slate-800 px-3 py-1.5 rounded">
            <span className="text-slate-400 text-[11px]">OVERALL ROBUSTNESS:</span>
            <span className={`text-sm font-bold ${
              envelope.overall_robustness_score >= 0.8
                ? 'text-emerald-400'
                : envelope.overall_robustness_score >= 0.5
                ? 'text-amber-400'
                : 'text-red-400'
            }`}>
              {(envelope.overall_robustness_score * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Envelope Chart & Sensitivity Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Continuity Envelope Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center space-x-2 text-slate-200 font-bold text-xs">
              <Crosshair className="w-4 h-4 text-red-400" />
              <span>SPATIAL TOUCHDOWN DISPERSION FOOTPRINT</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">±250M RADIUS MATRIX</span>
          </div>

          <Suspense fallback={<ChartFallback />}>
            <ContinuityEnvelopeChart
              envelope={envelope}
              requirements={requirements}
              onChangeRequirements={onChangeRequirements}
              onReevaluate={onReevaluate}
            />
          </Suspense>

          {/* Scientific Disclaimer Note */}
          <div className="p-2.5 bg-obsidian-950/80 border border-slate-800/80 rounded text-[11px] text-slate-400 flex items-start space-x-2">
            <HelpCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Scientific Notice:</strong> Robustness scores indicate empirical perturbation pass-rates under deterministic displacement scenarios across the LOLA 80m DEM, NOT statistical probability of mission success.
            </p>
          </div>
        </div>

        {/* Right Column: Sensitivity Metrics & Dispersion Breakdown */}
        <div className="space-y-4">
          <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="text-white font-bold text-xs flex items-center space-x-2 border-b border-slate-800/80 pb-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>SENSITIVITY BREAKDOWN</span>
            </div>

            <div className="space-y-3 text-[11px]">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Spatial Dispersion Pass Rate:</span>
                  <span className="text-white font-bold">
                    {envelope ? `${(envelope.spatial_success_rate * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400"
                    style={{ width: `${(envelope?.spatial_success_rate ?? 0) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Temporal Slippage Pass Rate:</span>
                  <span className="text-white font-bold">
                    {envelope ? `${(envelope.temporal_success_rate * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${(envelope?.temporal_success_rate ?? 0) * 100}%` }}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">
                  BASELINE EVALUATION
                </div>
                <div className={`p-2 rounded border flex items-center space-x-2 ${
                  envelope?.baseline_meets_requirements
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  {envelope?.baseline_meets_requirements ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>
                    {envelope?.baseline_meets_requirements
                      ? 'Baseline satisfies all mission constraints'
                      : 'Baseline violates mission constraints'}
                  </span>
                </div>

                {envelope?.baseline_failure_reasons && envelope.baseline_failure_reasons.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {envelope.baseline_failure_reasons.map((r, i) => (
                      <div key={i} className="text-[10px] text-red-400 bg-red-950/20 p-1.5 rounded border border-red-900/30">
                        {r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
