import React, { Suspense, lazy } from 'react';
import {
  LandingSite,
  ContinuityEnvelopeResult,
  MissionRequirements,
  ProbabilisticResilienceResponse,
} from '../../types/api';
import {
  ShieldCheck,
  ShieldAlert,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  HelpCircle,
  Activity,
  RefreshCw,
  BarChart3,
  Target,
  Info,
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
  resilienceResult?: ProbabilisticResilienceResponse | null;
  isLoadingResilience?: boolean;
  onRunResilience?: () => void;
  requirements: MissionRequirements;
  onChangeRequirements?: (reqs: MissionRequirements) => void;
  onReevaluate?: () => void;
}

export const MissionResilienceWorkspace: React.FC<MissionResilienceWorkspaceProps> = ({
  site,
  envelope,
  resilienceResult,
  isLoadingResilience = false,
  onRunResilience,
  requirements,
  onChangeRequirements,
  onReevaluate,
}) => {
  const scenarios = resilienceResult?.scenarios ?? [];
  const sensitivities = resilienceResult?.parameter_sensitivities ?? [];
  const failureBreakdown = resilienceResult?.failure_mode_breakdown ?? {};

  // Compute summary stats from actual scenario runs
  const maxDispersion = scenarios.length > 0
    ? Math.max(...scenarios.map((s) => s.radial_dispersion_m)).toFixed(1)
    : '—';
  const meanDispersion = scenarios.length > 0
    ? (scenarios.reduce((acc, s) => acc + s.radial_dispersion_m, 0) / scenarios.length).toFixed(1)
    : '—';
  const meanSlope = scenarios.length > 0
    ? (scenarios.reduce((acc, s) => acc + s.evaluated_slope_deg, 0) / scenarios.length).toFixed(1)
    : '—';

  return (
    <div className="w-full h-full bg-obsidian-950 p-6 overflow-y-auto space-y-6 text-xs font-mono select-none">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm tracking-wide">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>MISSION CONTINUITY ENVELOPE & PROBABILISTIC RESILIENCE</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            Evaluating operational sensitivity to spatial touchdown dispersion (±100m, ±250m) and temporal launch slippage (±1 to ±3 days) for{' '}
            <strong className="text-white">{site.name}</strong>.
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Robustness Score Indicator */}
          {envelope && (
            <div className="flex items-center space-x-3 bg-graphite-900 border border-slate-800 px-3 py-1.5 rounded">
              <span className="text-slate-400 text-[11px]">DETERMINISTIC ROBUSTNESS:</span>
              <span
                className={`text-sm font-bold ${
                  envelope.overall_robustness_score >= 0.8
                    ? 'text-emerald-400'
                    : envelope.overall_robustness_score >= 0.5
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {(envelope.overall_robustness_score * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Monte Carlo Re-run Button */}
          {onRunResilience && (
            <button
              onClick={onRunResilience}
              disabled={isLoadingResilience}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-500/40 rounded transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingResilience ? 'animate-spin' : ''}`} />
              <span>{isLoadingResilience ? 'SIMULATING...' : 'RUN MONTE CARLO'}</span>
            </button>
          )}
        </div>
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
              <span>DETERMINISTIC SENSITIVITY</span>
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
                <div
                  className={`p-2 rounded border flex items-center space-x-2 ${
                    envelope?.baseline_meets_requirements
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
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

      {/* Phase 9: Monte Carlo Probabilistic Resilience Section */}
      <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
          <div className="flex items-center space-x-2 text-white font-bold text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>MONTE CARLO PROBABILISTIC RESILIENCE ENGINE (PHASE 9)</span>
          </div>
          {resilienceResult && (
            <div className="text-[11px] text-slate-400 font-mono">
              Simulated: <strong className="text-white">{resilienceResult.num_scenarios_evaluated}</strong> scenarios | Passed:{' '}
              <strong className="text-emerald-400">{resilienceResult.num_scenarios_feasible}</strong>
            </div>
          )}
        </div>

        {isLoadingResilience && !resilienceResult ? (
          <div className="h-40 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Running 50 Monte Carlo landing dispersion & slippage scenarios...</span>
          </div>
        ) : resilienceResult ? (
          <div className="space-y-5">
            {/* KPI Cards: Feasibility Frequency, 95% Wilson CI, Most Influential Condition */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-obsidian-950/80 border border-slate-800 rounded-lg p-3.5 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">FEASIBILITY FREQUENCY</span>
                <div className="flex items-baseline space-x-2">
                  <span
                    className={`text-2xl font-bold font-mono ${
                      resilienceResult.feasibility_frequency >= 0.8
                        ? 'text-emerald-400'
                        : resilienceResult.feasibility_frequency >= 0.5
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {(resilienceResult.feasibility_frequency * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({resilienceResult.num_scenarios_feasible}/{resilienceResult.num_scenarios_evaluated} pass)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full ${
                      resilienceResult.feasibility_frequency >= 0.8 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${resilienceResult.feasibility_frequency * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-obsidian-950/80 border border-slate-800 rounded-lg p-3.5 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">95% WILSON SCORE CI</span>
                <div className="text-xl font-bold font-mono text-cyan-300">
                  [{(resilienceResult.confidence_interval_95[0] * 100).toFixed(1)}% –{' '}
                  {(resilienceResult.confidence_interval_95[1] * 100).toFixed(1)}%]
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Statistical confidence interval on binomial feasibility rate
                </span>
              </div>

              <div className="bg-obsidian-950/80 border border-slate-800 rounded-lg p-3.5 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">PRIMARY FAILURE CONDITION</span>
                <div className="text-xs font-bold text-amber-300 truncate mt-1">
                  {resilienceResult.most_influential_failure_condition}
                </div>
                <span className="text-[10px] text-slate-400 block truncate">
                  Dominant binding constraint under dispersion
                </span>
              </div>
            </div>

            {/* Landing Dispersion & Sensitivity Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Parameter Sensitivity Analysis */}
              <div className="bg-obsidian-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="text-white font-bold text-xs flex items-center space-x-2 border-b border-slate-800/80 pb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>PARAMETER SENSITIVITY CORRELATION</span>
                </div>

                <div className="space-y-2.5">
                  {sensitivities.map((s, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-obsidian-900/90 border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-[11px]">{s.parameter_name}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            r = {s.correlation_with_margin > 0 ? `+${s.correlation_with_margin}` : s.correlation_with_margin}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                              s.impact_rating === 'HIGH'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : s.impact_rating === 'MEDIUM'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-700/50 text-slate-300 border border-slate-600/50'
                            }`}
                          >
                            {s.impact_rating} IMPACT
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans leading-relaxed">{s.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Landing Dispersion Metrics & Failure Breakdown */}
              <div className="bg-obsidian-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="text-white font-bold text-xs flex items-center space-x-2 border-b border-slate-800/80 pb-2">
                  <Target className="w-3.5 h-3.5 text-red-400" />
                  <span>LANDING DISPERSION & FAILURE MODES</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] py-1">
                  <div className="p-2 bg-obsidian-900 border border-slate-800 rounded">
                    <span className="text-slate-500 block text-[9px]">MEAN DISPERSION</span>
                    <span className="text-white font-bold text-xs mt-0.5">{meanDispersion} m</span>
                  </div>
                  <div className="p-2 bg-obsidian-900 border border-slate-800 rounded">
                    <span className="text-slate-500 block text-[9px]">MAX DISPERSION</span>
                    <span className="text-cyan-400 font-bold text-xs mt-0.5">{maxDispersion} m</span>
                  </div>
                  <div className="p-2 bg-obsidian-900 border border-slate-800 rounded">
                    <span className="text-slate-500 block text-[9px]">MEAN SLOPE</span>
                    <span className="text-white font-bold text-xs mt-0.5">{meanSlope}°</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                    Failed Scenarios Breakdown:
                  </span>
                  {Object.entries(failureBreakdown).map(([mode, pct], i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">{mode}</span>
                      <span className={`font-mono font-bold ${pct > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Evaluated Monte Carlo Scenarios Table */}
            {scenarios.length > 0 && (
              <div className="bg-obsidian-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="text-white font-bold text-xs flex items-center space-x-2">
                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                    <span>MONTE CARLO SCENARIO RUNS ({scenarios.length} EVALUATED)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">BIVARIATE DISPERSION & SLIPPAGE</span>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded">
                  <table className="w-full text-left text-[10px] font-mono">
                    <thead className="bg-obsidian-900 text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">Offset (dx, dy)</th>
                        <th className="p-2">Radial</th>
                        <th className="p-2">Slippage (dt)</th>
                        <th className="p-2">Slope</th>
                        <th className="p-2">Sunlight</th>
                        <th className="p-2">Max Dark</th>
                        <th className="p-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {scenarios.map((scen) => (
                        <tr key={scen.scenario_id} className="hover:bg-slate-900/40">
                          <td className="p-2 text-slate-400">{scen.scenario_id}</td>
                          <td className="p-2 text-slate-300">
                            {scen.dx_m > 0 ? `+${scen.dx_m}` : scen.dx_m}m, {scen.dy_m > 0 ? `+${scen.dy_m}` : scen.dy_m}m
                          </td>
                          <td className="p-2 font-bold text-white">{scen.radial_dispersion_m}m</td>
                          <td className="p-2 text-slate-300">
                            {scen.dt_hours > 0 ? `+${scen.dt_hours}` : scen.dt_hours}h
                          </td>
                          <td className="p-2 text-slate-300">{scen.evaluated_slope_deg}°</td>
                          <td className="p-2 text-amber-300">{scen.longest_sunlit_window_hours}h</td>
                          <td className="p-2 text-slate-400">{scen.longest_dark_period_hours}h</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                scen.is_feasible
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
                              }`}
                            >
                              {scen.is_feasible ? 'PASS' : scen.failed_constraints[0] || 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Scientific Disclaimer from Backend */}
            <div className="p-3 bg-obsidian-950 border border-cyan-900/40 rounded-lg text-[11px] text-slate-300 flex items-start space-x-2.5">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed font-sans">{resilienceResult.methodology_and_disclaimer}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-obsidian-950/60 border border-slate-800 rounded text-center text-slate-400">
            Click <strong>RUN MONTE CARLO</strong> to evaluate 50 bivariate normal landing dispersion and launch slippage scenarios.
          </div>
        )}
      </div>
    </div>
  );
};
