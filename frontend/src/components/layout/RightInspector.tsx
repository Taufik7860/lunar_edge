import React from 'react';
import {
  LandingSite,
  EpochGeometry,
  VisibilityTimeSeriesResponse,
  HorizonProfile,
  MissionRequirements,
  DiscoveredCandidate,
  MissionEvaluationResponse,
} from '../../types/api';
import {
  Sun,
  Radio,
  Mountain,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Compass,
  ArrowRight,
  Layers,
  ChevronDown,
  Scale,
} from 'lucide-react';

interface RightInspectorProps {
  site: LandingSite;
  epochGeometry: EpochGeometry | null;
  visibility: VisibilityTimeSeriesResponse | null;
  horizon: HorizonProfile | null;
  missionEvaluation?: MissionEvaluationResponse | null;
  isLoadingEvaluation?: boolean;
  requirements: MissionRequirements;
  onUpdateRequirements: (req: MissionRequirements) => void;
  isLoadingElevation?: boolean;
  discoveredCandidate?: DiscoveredCandidate | null;
  onViewDetailedAnalysis?: () => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  site,
  epochGeometry,
  visibility,
  horizon,
  missionEvaluation,
  isLoadingEvaluation = false,
  requirements,
  onUpdateRequirements,
  isLoadingElevation = false,
  discoveredCandidate,
  onViewDetailedAnalysis,
}) => {
  const summary = visibility?.summary;

  // Real calculated metrics from backend
  const sunlightPct = summary
    ? (summary.sunlit_fraction * 100).toFixed(1)
    : discoveredCandidate
    ? discoveredCandidate.sunlight_percentage.toFixed(1)
    : '—';

  const earthVisPct = summary
    ? (summary.earth_visible_fraction * 100).toFixed(1)
    : discoveredCandidate && discoveredCandidate.longest_comms_window_hours > 0
    ? Math.min(100, Math.round((discoveredCandidate.longest_comms_window_hours / (14 * 24)) * 100)).toFixed(1)
    : '—';

  const slopeDeg = (missionEvaluation?.constraints.find((c) => c.name === 'Terrain Slope')?.actual_value ?? site.slope_deg).toFixed(1);
  const elevationM = site.elevation_m > 0 ? `+${site.elevation_m.toFixed(0)}` : site.elevation_m.toFixed(0);

  // Horizon clearance: percentage of horizon below 0° or mean horizon obstruction
  const horizonClearPct = horizon
    ? Math.max(0, Math.min(100, (1.0 - Math.max(0, horizon.mean_horizon_deg) / 10.0) * 100)).toFixed(1)
    : '—';

  // Scientific Mission Evaluation (Phase 8 API)
  const isFeasible = missionEvaluation ? missionEvaluation.is_feasible : false;
  const classification = missionEvaluation
    ? missionEvaluation.overall_classification
    : (discoveredCandidate?.classification ?? 'ANALYZING...');

  const bindingConstraint = missionEvaluation?.binding_constraints?.[0];
  const constraintsList = missionEvaluation?.constraints ?? [];
  const compositeScore = missionEvaluation ? missionEvaluation.composite_score.toFixed(1) : null;

  // Operational Risks from backend engine
  const risks: string[] = missionEvaluation?.identified_risks && missionEvaluation.identified_risks.length > 0
    ? missionEvaluation.identified_risks
    : (discoveredCandidate?.explanation?.identified_risks ?? []);

  // Scientific Recommendation
  const recommendation = missionEvaluation?.recommendation;

  return (
    <aside className="w-80 bg-obsidian-950/95 border-l border-slate-800/80 flex flex-col justify-between z-20 select-none overflow-y-auto text-xs font-mono p-4 backdrop-blur-md space-y-4">
      {/* 1. Header: Selected Candidate Status & Recommendation Badge */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <span
            className={`w-2 h-2 rounded-full ${
              isLoadingEvaluation
                ? 'bg-cyan-400 animate-ping'
                : classification === 'FEASIBLE'
                ? 'bg-emerald-400 animate-pulse'
                : classification === 'CONDITIONAL'
                ? 'bg-amber-400'
                : 'bg-red-400'
            }`}
          />
          <span>{isLoadingEvaluation ? 'Evaluating Site...' : 'Selected Candidate'}</span>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-wide truncate">
            {site.name.split('/')[0].trim()}
          </h2>
          {isLoadingEvaluation ? (
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center space-x-1.5">
              <span>Evaluating</span>
              <div className="w-2.5 h-2.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
            </span>
          ) : classification === 'FEASIBLE' ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center space-x-1 shadow-emerald-glow">
              <span>Feasible</span>
              <span>★</span>
            </span>
          ) : classification === 'CONDITIONAL' ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center space-x-1">
              <span>Conditional</span>
              <span>⚠</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold flex items-center space-x-1">
              <span>{classification}</span>
              <span>✕</span>
            </span>
          )}
        </div>

        {/* 2. Lunar Terrain Elevation Profile Thumbnail */}
        <div className="w-full h-24 rounded-lg bg-obsidian-900 border border-slate-800 overflow-hidden relative flex flex-col justify-end p-2.5">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-950/60 to-transparent z-10" />
          <svg className="absolute inset-0 w-full h-full opacity-35" preserveAspectRatio="none" viewBox="0 0 100 40">
            <path d="M0,35 Q15,10 30,22 T60,15 T85,28 T100,20 L100,40 L0,40 Z" fill="#475569" />
            <path d="M0,28 Q20,18 45,30 T75,12 T100,25 L100,40 L0,40 Z" fill="#64748b" />
          </svg>
          <div className="relative z-20 flex items-center justify-between text-[10px] text-slate-300">
            <span className="text-slate-400">LOLA 80m Relief Profile</span>
            <span className="text-cyan-400 font-bold">{elevationM} m</span>
          </div>
        </div>

        {/* Evaluation Epoch Interval Indicator */}
        <div className="p-1.5 bg-obsidian-900/60 border border-slate-800/80 rounded text-[10px] text-slate-400 flex justify-between">
          <span>Evaluation Epoch:</span>
          <span className="text-white font-semibold">14.0 days ({summary ? (summary.duration_days * 24).toFixed(0) : '336'}h window)</span>
        </div>
      </div>

      {/* 3. Key Telemetry Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold">
          <span>Key Metrics</span>
          <ChevronDown className="w-3 h-3 text-slate-500" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          {/* Sunlight */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            <Sun className="w-3.5 h-3.5 text-amber-400 mb-1" />
            <span className="text-slate-500 text-[9px]">Sunlight</span>
            <span className="text-amber-400 font-bold text-xs mt-0.5">{sunlightPct}%</span>
          </div>

          {/* Earth Visibility */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            <Radio className="w-3.5 h-3.5 text-cyan-400 mb-1" />
            <span className="text-slate-500 text-[9px]">Earth Visibility</span>
            <span className="text-cyan-400 font-bold text-xs mt-0.5">{earthVisPct}%</span>
          </div>

          {/* Slope */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            <Mountain className="w-3.5 h-3.5 text-slate-300 mb-1" />
            <span className="text-slate-500 text-[9px]">Slope</span>
            <span className="text-white font-bold text-xs mt-0.5">{slopeDeg}°</span>
          </div>

          {/* Elevation */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            <Compass className="w-3.5 h-3.5 text-cyan-300 mb-1" />
            <span className="text-slate-500 text-[9px]">Elevation</span>
            <span className="text-cyan-300 font-bold text-[11px] mt-0.5 truncate">{elevationM} m</span>
          </div>

          {/* Horizon Clear */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            <Layers className="w-3.5 h-3.5 text-slate-300 mb-1" />
            <span className="text-slate-500 text-[9px]">Horizon Clear</span>
            <span className="text-slate-200 font-bold text-xs mt-0.5">{horizonClearPct}%</span>
          </div>

          {/* Overall Feasibility */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            {isFeasible ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mb-1" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 mb-1" />
            )}
            <span className="text-slate-500 text-[9px]">Feasibility</span>
            <span
              className={`font-bold text-xs mt-0.5 ${
                isFeasible ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {isFeasible ? 'Passed' : classification}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Five Physical Constraints Assessment (Phase 8 Master Evaluation) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-300 font-bold text-[11px]">
          <div className="flex items-center space-x-1.5">
            <Scale className="w-3.5 h-3.5 text-cyan-400" />
            <span>PHYSICAL CONSTRAINTS (5/5)</span>
          </div>
          {compositeScore !== null && (
            <span className="text-[10px] text-cyan-300 font-mono">
              Score: <span className="font-bold">{compositeScore}</span>/100
            </span>
          )}
        </div>

        {isLoadingEvaluation ? (
          <div className="p-3 bg-obsidian-900/60 border border-slate-800 rounded flex items-center space-x-2 text-slate-400 text-[10px]">
            <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span>Evaluating physical flight constraints...</span>
          </div>
        ) : constraintsList.length > 0 ? (
          <div className="space-y-1.5">
            {constraintsList.map((c, i) => {
              const isPass = c.status === 'EVALUATED_PASS';
              const sign = c.margin !== null && c.margin > 0 ? '+' : '';
              return (
                <div
                  key={i}
                  className={`p-2 rounded border text-[10px] flex flex-col space-y-1 ${
                    c.is_binding && !isPass
                      ? 'bg-red-950/30 border-red-500/50 text-red-200'
                      : isPass
                      ? 'bg-obsidian-900/90 border-slate-800 text-slate-300'
                      : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <div className="flex items-center space-x-1.5">
                      {isPass ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-white">{c.name}</span>
                    </div>
                    {c.is_binding && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                          isPass
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/40'
                        }`}
                      >
                        BINDING
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-400 text-[9px]">
                    <span>
                      Val: <strong className="text-slate-200">{c.actual_value !== null ? `${c.actual_value} ${c.unit}` : 'N/A'}</strong> (req {c.operator} {c.threshold} {c.unit})
                    </span>
                    <span className={c.margin !== null && c.margin >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      Margin: {c.margin !== null ? `${sign}${c.margin} ${c.unit}` : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-2.5 bg-obsidian-900/60 border border-slate-800 rounded text-slate-400 text-[10px] text-center">
            Awaiting scientific constraint evaluation...
          </div>
        )}
      </div>

      {/* Binding Constraint Highlight */}
      {bindingConstraint && (
        <div
          className={`p-2 rounded border text-[10px] flex items-center justify-between ${
            bindingConstraint.status === 'EVALUATED_PASS'
              ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-300'
              : 'bg-red-950/30 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center space-x-1.5">
            <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Binding:</span>
            <span className="font-bold text-white">{bindingConstraint.name}</span>
          </div>
          <span className="font-mono text-[9px]">
            {bindingConstraint.margin !== null && bindingConstraint.margin > 0 ? `+${bindingConstraint.margin}` : bindingConstraint.margin}{' '}
            {bindingConstraint.unit} margin
          </span>
        </div>
      )}

      {/* 5. Scientific Recommendation */}
      {recommendation && (
        <div className="space-y-1.5">
          <div className="flex items-center space-x-1.5 text-slate-200 font-bold text-[11px]">
            <span className="text-amber-400">💡</span>
            <span>Scientific Assessment</span>
          </div>
          <p className="text-[11px] text-slate-300 font-sans leading-relaxed bg-obsidian-900/60 p-2 rounded border border-slate-800">
            {recommendation}
          </p>
        </div>
      )}

      {/* 6. Identified Operational Flight Risks */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Operational Risks</span>
        </div>

        <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
          {risks.map((risk, i) => (
            <li key={i} className="flex items-start space-x-2 text-red-300/90">
              <span className="text-red-400 font-bold flex-shrink-0">⚠</span>
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 7. Action Button: View Detailed Analysis */}
      {onViewDetailedAnalysis && (
        <button
          onClick={onViewDetailedAnalysis}
          className="w-full py-2.5 rounded-lg bg-obsidian-900 hover:bg-graphite-900 text-cyan-400 border border-slate-800 hover:border-cyan-500/50 font-bold text-xs transition flex items-center justify-center space-x-2"
        >
          <span>View Detailed Analysis</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </aside>
  );
};
