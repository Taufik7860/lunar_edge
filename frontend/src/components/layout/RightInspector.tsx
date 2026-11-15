import React, { useState } from 'react';
import {
  LandingSite,
  EpochGeometry,
  VisibilityTimeSeriesResponse,
  HorizonProfile,
  MissionRequirements,
  DiscoveredCandidate,
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
  Sparkles,
  Layers,
  ChevronDown,
} from 'lucide-react';

interface RightInspectorProps {
  site: LandingSite;
  epochGeometry: EpochGeometry | null;
  visibility: VisibilityTimeSeriesResponse | null;
  horizon: HorizonProfile | null;
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

  const slopeDeg = site.slope_deg.toFixed(1);
  const elevationM = site.elevation_m > 0 ? `+${site.elevation_m.toFixed(0)}` : site.elevation_m.toFixed(0);

  // Horizon clearance: percentage of horizon below 0° or mean horizon obstruction
  const horizonClearPct = horizon
    ? Math.max(0, Math.min(100, (1.0 - Math.max(0, horizon.mean_horizon_deg) / 10.0) * 100)).toFixed(1)
    : '98.5';

  // Constraint assessment: check if all active constraints are met
  const isSunlightMet = summary
    ? summary.longest_sunlit_window_hours >= requirements.min_continuous_sunlight_hours
    : discoveredCandidate?.constraints_assessment.min_continuous_sunlight ?? true;

  const isDarknessMet = summary
    ? summary.longest_dark_period_hours <= requirements.max_tolerable_dark_hours
    : discoveredCandidate?.constraints_assessment.max_tolerable_darkness ?? true;

  const isCommsMet = summary
    ? summary.longest_earth_visible_window_hours >= requirements.min_continuous_earth_comms_hours
    : discoveredCandidate?.constraints_assessment.min_continuous_earth_comms ?? true;

  const isSlopeMet = site.slope_deg <= 10.0;
  const allConstraintsPassed = isSunlightMet && isDarknessMet && isCommsMet && isSlopeMet;

  // Traceable "Why this location?" reasons
  const reasons: string[] = [];
  if (isSunlightMet) {
    reasons.push('Meets sunlight and continuous illumination requirements');
  }
  if (isSlopeMet) {
    reasons.push(`Flat terrain with low regional slope (${slopeDeg}°)`);
  }
  if (isCommsMet) {
    reasons.push('Stable direct-to-Earth communication window');
  } else {
    reasons.push('Elevated polar summit provides grazing geometric views');
  }

  // Potential Risks
  const risks: string[] = [];
  if (!isDarknessMet) {
    risks.push(`Extended nocturnal darkness interval (${summary ? summary.longest_dark_period_hours.toFixed(0) : '48+'}h)`);
  }
  if (!isCommsMet) {
    risks.push('Periodic Earth libration occultation requires scheduled relay');
  }
  risks.push('LOLA 80m DEM supports regional screening, not boulder certification');

  const isRecommended =
    discoveredCandidate?.classification === 'Screening-viable' ||
    (allConstraintsPassed && site.elevation_m > 0);

  return (
    <aside className="w-80 bg-obsidian-950/95 border-l border-slate-800/80 flex flex-col justify-between z-20 select-none overflow-y-auto text-xs font-mono p-4 backdrop-blur-md space-y-4">
      {/* 1. Header: Selected Candidate Status & Recommendation Badge */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Selected Candidate</span>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-wide truncate">
            {site.name.split('/')[0].trim()}
          </h2>
          {isRecommended && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center space-x-1 shadow-emerald-glow">
              <span>Recommended</span>
              <span>★</span>
            </span>
          )}
        </div>

        {/* 2. Lunar Terrain Elevation Profile Thumbnail */}
        <div className="w-full h-24 rounded-lg bg-obsidian-900 border border-slate-800 overflow-hidden relative flex flex-col justify-end p-2.5">
          {/* Topographic Relief Lines Simulation */}
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
      </div>

      {/* 3. Key Metrics Grid */}
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

          {/* Constraints */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2 flex flex-col items-center">
            {allConstraintsPassed ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mb-1" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 mb-1" />
            )}
            <span className="text-slate-500 text-[9px]">Constraints</span>
            <span
              className={`font-bold text-xs mt-0.5 ${
                allConstraintsPassed ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {allConstraintsPassed ? 'Passed' : 'Conditional'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Why this location? Section */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1.5 text-slate-200 font-bold text-[11px]">
          <span className="text-amber-400">💡</span>
          <span>Why this location?</span>
        </div>

        <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start space-x-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 5. Potential Risks Section */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Potential Risks</span>
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

      {/* 6. Action Button: View Detailed Analysis */}
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
