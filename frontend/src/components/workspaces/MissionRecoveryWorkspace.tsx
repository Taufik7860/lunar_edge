import React from 'react';
import {
  LandingSite,
  VisibilityTimeSeriesResponse,
  MissionRequirements,
  MissionEvaluationResponse,
  CounterfactualRecoveryResponse,
  RecoveryIntervention,
} from '../../types/api';
import {
  RotateCcw,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Zap,
  Radio,
  Calendar,
  Compass,
  Sliders,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';

interface MissionRecoveryWorkspaceProps {
  site: LandingSite;
  visibility: VisibilityTimeSeriesResponse | null;
  missionEvaluation?: MissionEvaluationResponse | null;
  recoveryResult?: CounterfactualRecoveryResponse | null;
  isLoadingRecovery?: boolean;
  onRunRecovery?: () => void;
  requirements: MissionRequirements;
}

export const MissionRecoveryWorkspace: React.FC<MissionRecoveryWorkspaceProps> = ({
  site,
  visibility,
  missionEvaluation,
  recoveryResult,
  isLoadingRecovery = false,
  onRunRecovery,
  requirements,
}) => {
  const summary = visibility?.summary;
  const failedConstraints = missionEvaluation?.constraints.filter((c) => c.status === 'EVALUATED_FAIL') ?? [];

  // Map physical constraints to engineering subsystems
  const getSubsystemForConstraint = (name: string): string => {
    switch (name) {
      case 'Terrain Slope':
        return 'Touchdown Gear & Hazard Detection Subsystem';
      case 'Continuous Sunlight':
        return 'Solar Array Generation & Power Subsystem';
      case 'Battery Darkness Limit':
        return 'Primary Battery & Thermal Heating Subsystem';
      case 'Earth Communications':
        return 'Direct-to-Earth (DTE) High-Gain Antenna';
      case 'Simultaneous Power & Comms':
        return 'Surface Operations Science Architecture';
      default:
        return 'Flight Avionics & Environmental Control';
    }
  };

  const interventions = recoveryResult?.interventions_evaluated ?? [];
  const optimalIntervention = recoveryResult?.optimal_recovery_path;

  return (
    <div className="w-full h-full bg-obsidian-950 p-6 overflow-y-auto space-y-6 text-xs font-mono select-none">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm tracking-wide">
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span>COUNTERFACTUAL MISSION RECOVERY & DIAGNOSTIC INTELLIGENCE</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            Automated constraint violation root-cause diagnostics and evaluated alternative mission recovery scenarios for{' '}
            <strong className="text-white">{site.name}</strong>.
          </div>
        </div>

        {onRunRecovery && (
          <button
            onClick={onRunRecovery}
            disabled={isLoadingRecovery}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-500/40 rounded transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecovery ? 'animate-spin' : ''}`} />
            <span>{isLoadingRecovery ? 'EVALUATING INTERVENTIONS...' : 'RE-RUN RECOVERY'}</span>
          </button>
        )}
      </div>

      {/* Section 1: Root-Cause Diagnostics */}
      <div className="space-y-3">
        <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span>PHYSICAL ROOT-CAUSE DIAGNOSTICS</span>
          </div>
          {missionEvaluation ? (
            <span
              className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                missionEvaluation.is_feasible
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
            >
              BASELINE STATUS: {missionEvaluation.overall_classification}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded border font-bold bg-slate-800 border-slate-700 text-slate-400">
              BASELINE STATUS: PENDING
            </span>
          )}
        </div>

        {/* Global failure cause if available */}
        {recoveryResult?.binding_failure_cause && (
          <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-red-200 text-[11px] space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-red-400 uppercase tracking-wider text-[10px]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>PRIMARY BINDING FAILURE CAUSE</span>
            </div>
            <p className="leading-relaxed font-sans">{recoveryResult.binding_failure_cause}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!missionEvaluation ? (
            <div className="col-span-2 p-4 rounded-lg border bg-obsidian-900/80 border-slate-800 text-slate-300 flex items-center space-x-3">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <span className="font-bold text-sm text-white block">BASELINE EVALUATION PENDING</span>
                <span className="text-[11px] text-slate-400">
                  Awaiting master mission evaluation from scientific backend for {site.name}.
                </span>
              </div>
            </div>
          ) : failedConstraints.length > 0 ? (
            failedConstraints.map((c, i) => (
              <div
                key={i}
                className="p-4 rounded-lg border bg-red-950/20 border-red-500/40 text-red-300 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{c.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-500/20 border-red-500/40 text-red-300">
                    VIOLATION ({c.margin !== null ? `${c.margin} ${c.unit}` : 'DEFICIT'})
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {c.description}. Measured actual value is{' '}
                  <strong className="text-white">
                    {c.actual_value !== null ? `${c.actual_value} ${c.unit}` : 'N/A'}
                  </strong>
                  , violating the operational limit of {c.operator} {c.threshold} {c.unit}.
                </p>

                <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                  AFFECTED SUBSYSTEM:{' '}
                  <span className="text-white font-semibold">{getSubsystemForConstraint(c.name)}</span>
                </div>
              </div>
            ))
          ) : missionEvaluation.is_feasible ? (
            <div className="col-span-2 p-4 rounded-lg border bg-emerald-950/20 border-emerald-500/40 text-emerald-300 flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm text-white block">ALL CONSTRAINTS SATISFIED</span>
                <span className="text-[11px] text-slate-300">
                  Current mission baseline satisfies all five physical flight constraints with positive safety margins. No recovery interventions required.
                </span>
              </div>
            </div>
          ) : (
            <div className="col-span-2 p-4 rounded-lg border bg-amber-950/20 border-amber-500/40 text-amber-300 flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm text-white block">DIAGNOSTICS UNAVAILABLE</span>
                <span className="text-[11px] text-slate-300">
                  Mission classified as {missionEvaluation.overall_classification}, but individual constraint violation breakdown is unavailable.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optimal Recovery Banner if present */}
      {optimalIntervention && (
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/50 rounded-lg space-y-2 shadow-emerald-glow">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>RECOMMENDED OPTIMAL COUNTERFACTUAL INTERVENTION</span>
          </div>
          <div className="text-sm font-bold text-white">{optimalIntervention.title}</div>
          <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
            {recoveryResult?.recovery_recommendation}
          </p>
        </div>
      )}

      {/* Section 2: Evaluated Counterfactual Interventions */}
      <div className="space-y-3 pt-2">
        <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>VERIFIED COUNTERFACTUAL RECOVERY ALTERNATIVES (PHASE 10)</span>
          </div>
          {interventions.length > 0 && (
            <span className="text-[10px] text-slate-400 font-mono">
              Evaluated {interventions.length} physics-verified interventions
            </span>
          )}
        </div>

        {isLoadingRecovery && interventions.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center space-y-3 text-slate-400 bg-obsidian-900 border border-slate-800 rounded-lg">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Re-evaluating SPICE ephemerides and LOLA DEM ray-cast horizons for alternative windows & locations...</span>
          </div>
        ) : interventions.length > 0 ? (
          <div className="space-y-4">
            {interventions.map((intv, idx) => (
              <div
                key={idx}
                className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center space-x-2.5">
                    {intv.intervention_type === 'TEMPORAL_SHIFT' ? (
                      <Calendar className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    ) : intv.intervention_type === 'SPATIAL_RELOCATION' ? (
                      <Compass className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    ) : (
                      <Sliders className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    )}
                    <span className="font-bold text-sm text-white">{intv.title}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        intv.new_feasibility
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : intv.is_resolved
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {intv.new_feasibility ? 'FEASIBLE' : intv.is_resolved ? 'RESOLVED' : 'PARTIAL RESOLUTION'}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {intv.description}
                </p>

                {/* Resolved Constraints List */}
                {intv.resolved_constraints.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Resolved:</span>
                    {intv.resolved_constraints.map((rc, rIdx) => (
                      <span
                        key={rIdx}
                        className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] flex items-center space-x-1"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>{rc}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Verified Improvement Summary Box */}
                <div className="p-2.5 bg-graphite-900/60 rounded border border-slate-800/80 text-[11px] space-y-1">
                  <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">
                    RECALCULATED PHYSICAL IMPROVEMENT:
                  </div>
                  <div className="text-slate-200 font-mono">{intv.improvement_summary}</div>
                </div>

                {/* Parameters & Residual Risks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1">
                  <div className="p-2 bg-obsidian-950/80 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[9px] font-bold uppercase">INTERVENTION PARAMETERS</span>
                    <span className="text-slate-300 font-mono">
                      {Object.entries(intv.parameters)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' | ')}
                    </span>
                  </div>
                  <div className="p-2 bg-obsidian-950/80 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[9px] font-bold uppercase">RESIDUAL FLIGHT RISKS</span>
                    <span className="text-slate-300">{intv.remaining_risks.join('; ') || 'None identified'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-obsidian-900/90 border border-slate-800 rounded-lg text-center space-y-3">
            <p className="text-slate-400">
              No counterfactual interventions evaluated yet for <strong>{site.name}</strong>.
            </p>
            {onRunRecovery && (
              <button
                onClick={onRunRecovery}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-cyan-glow transition"
              >
                Trigger Counterfactual Recovery Engine
              </button>
            )}
          </div>
        )}

        {/* Scientific Validation Note */}
        {recoveryResult?.scientific_validation_note && (
          <div className="p-3 bg-obsidian-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 flex items-start space-x-2">
            <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed font-sans">{recoveryResult.scientific_validation_note}</p>
          </div>
        )}
      </div>
    </div>
  );
};
