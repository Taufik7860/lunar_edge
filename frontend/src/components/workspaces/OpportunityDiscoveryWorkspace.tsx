import React, { useState } from 'react';
import {
  LandingSite,
  MissionRequirements,
  DiscoveredCandidate,
  OpportunityDiscoveryResponse,
} from '../../types/api';
import {
  Compass,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sliders,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Radio,
  Layers,
  Settings,
  Mountain,
  Eye,
  Activity,
  Filter,
} from 'lucide-react';

interface OpportunityDiscoveryWorkspaceProps {
  sites: Record<string, LandingSite>;
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  onNavigateToCandidate: (key: string) => void;
  onNavigateToExplorer: () => void;
  onOpenConfigModal: () => void;
  startUtc: string;
  durationDays: number;
  requirements: MissionRequirements;
  maxSlopeDeg: number;
  missionName: string;
  targetRegion: string;
  discoveredCandidates: DiscoveredCandidate[];
  discoveryResponse: OpportunityDiscoveryResponse | null;
  isDiscovering: boolean;
  onRunDiscovery: () => void;
}

export const OpportunityDiscoveryWorkspace: React.FC<OpportunityDiscoveryWorkspaceProps> = ({
  sites,
  selectedSiteKey,
  onSelectSite,
  onNavigateToCandidate,
  onNavigateToExplorer,
  onOpenConfigModal,
  startUtc,
  durationDays,
  requirements,
  maxSlopeDeg,
  missionName,
  targetRegion,
  discoveredCandidates,
  discoveryResponse,
  isDiscovering,
  onRunDiscovery,
}) => {
  const [filterTab, setFilterTab] = useState<'ALL' | 'Screening-viable' | 'Conditional' | 'Infeasible'>('ALL');

  const filteredCandidates = discoveredCandidates.filter((c) => {
    if (filterTab === 'ALL') return true;
    return c.classification === filterTab;
  });

  return (
    <div className="w-full h-full bg-obsidian-950 p-6 overflow-y-auto space-y-6 text-xs font-mono select-none">
      {/* Workspace Header & Action Console */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-800/80 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm tracking-wide">
            <Compass className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>AUTONOMOUS LANDING OPPORTUNITY DISCOVERY & SCREENING</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            Automated multi-criteria evaluation of lunar south polar candidate regions against NASA SPICE DE440s ephemerides, LOLA 80m DEM topography, and user mission constraints.
          </div>
        </div>

        {/* Discovery Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenConfigModal}
            className="px-3.5 py-1.5 bg-graphite-800 hover:bg-graphite-700 text-slate-200 rounded border border-slate-700 flex items-center space-x-1.5 transition text-xs"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            <span>MISSION CONFIG</span>
          </button>

          <button
            onClick={onRunDiscovery}
            disabled={isDiscovering}
            className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-obsidian-950 font-bold rounded shadow-cyan-glow flex items-center space-x-2 transition disabled:opacity-50 text-xs"
          >
            {isDiscovering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
                <span>EVALUATING DEM & SPICE...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-obsidian-950" />
                <span>DISCOVER LANDING OPPORTUNITIES</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Active Screening Parameters Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-graphite-900/60 border border-slate-800 rounded-lg text-[11px]">
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Mission Scenario:</span>
          <span className="text-white font-semibold">{missionName}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Search Region:</span>
          <span className="text-cyan-300 font-semibold">{targetRegion.toUpperCase()}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Analysis Window:</span>
          <span className="text-amber-300">{startUtc.slice(0, 10)} ({durationDays} days)</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Min Sunlight / Max Dark:</span>
          <span className="text-slate-200">≥{requirements.min_continuous_sunlight_hours}h / ≤{requirements.max_tolerable_dark_hours}h</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Comms / Slope Limits:</span>
          <span className="text-slate-200">≥{requirements.min_continuous_earth_comms_hours}h / ≤{maxSlopeDeg}°</span>
        </div>
      </div>

      {/* Discovery Outcome Metrics & Classification Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        {/* Classification Filter Tabs */}
        <div className="flex items-center space-x-1 bg-obsidian-900 border border-slate-800 rounded p-1">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1 rounded text-xs transition ${
              filterTab === 'ALL'
                ? 'bg-graphite-800 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL CANDIDATES ({discoveredCandidates.length})
          </button>
          <button
            onClick={() => setFilterTab('Screening-viable')}
            className={`px-3 py-1 rounded text-xs transition flex items-center space-x-1.5 ${
              filterTab === 'Screening-viable'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-cyan-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>SCREENING-VIABLE ({discoveryResponse?.viable_count ?? 0})</span>
          </button>
          <button
            onClick={() => setFilterTab('Conditional')}
            className={`px-3 py-1 rounded text-xs transition flex items-center space-x-1.5 ${
              filterTab === 'Conditional'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>CONDITIONAL ({discoveryResponse?.conditional_count ?? 0})</span>
          </button>
          <button
            onClick={() => setFilterTab('Infeasible')}
            className={`px-3 py-1 rounded text-xs transition flex items-center space-x-1.5 ${
              filterTab === 'Infeasible'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 font-bold'
                : 'text-slate-400 hover:text-red-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>INFEASIBLE ({discoveryResponse?.infeasible_count ?? 0})</span>
          </button>
        </div>

        {/* Global Summary Badge */}
        {discoveryResponse && (
          <div className="text-[11px] text-slate-400 font-mono flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Evaluated <strong>{discoveryResponse.total_evaluated}</strong> polar regions across LOLA 80m DEM
            </span>
          </div>
        )}
      </div>

      {/* Candidates Grid / List */}
      {filteredCandidates.length === 0 ? (
        <div className="h-64 bg-obsidian-900 border border-slate-800 rounded-lg flex flex-col items-center justify-center space-y-3 text-slate-400">
          <HelpCircle className="w-8 h-8 text-slate-600" />
          <div className="text-center">
            <span className="font-bold text-slate-300 block">No Candidates Match Active Filter</span>
            <span className="text-[11px] text-slate-500">
              Run autonomous opportunity discovery or adjust constraint thresholds.
            </span>
          </div>
          <button
            onClick={onRunDiscovery}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-obsidian-950 font-bold rounded text-xs transition"
          >
            Run Discovery Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredCandidates.map((cand) => {
            const isSelected = cand.key === selectedSiteKey;
            const isViable = cand.classification === 'Screening-viable';
            const isConditional = cand.classification === 'Conditional';
            const isInfeasible = cand.classification === 'Infeasible';

            return (
              <div
                key={cand.key}
                onClick={() => onSelectSite(cand.key)}
                className={`p-4 rounded-lg border transition-all cursor-pointer relative space-y-3 ${
                  isSelected
                    ? 'bg-graphite-900 border-cyan-500 shadow-cyan-glow'
                    : 'bg-obsidian-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Candidate Header: Name, Score, Classification Badge */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{cand.name}</span>
                      {isSelected && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/40">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {cand.latitude_deg.toFixed(2)}°S, {cand.longitude_deg.toFixed(2)}°E • Elevation:{' '}
                      <strong className="text-cyan-300">
                        {cand.elevation_m > 0 ? `+${cand.elevation_m}` : cand.elevation_m} m
                      </strong>{' '}
                      • Slope: <strong>{cand.slope_deg}°</strong>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                        isViable
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                          : isConditional
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : isInfeasible
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {cand.classification}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Score: <strong className="text-white">{cand.composite_score}</strong>/100
                    </span>
                  </div>
                </div>

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-4 gap-2 p-2 bg-obsidian-950/80 rounded border border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Sunlight Pct:</span>
                    <span className="text-amber-400 font-bold">{cand.sunlight_percentage}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Max Darkness:</span>
                    <span className={`font-bold ${cand.longest_dark_period_hours > requirements.max_tolerable_dark_hours ? 'text-red-400' : 'text-slate-200'}`}>
                      {cand.longest_dark_period_hours}h
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Earth Comms:</span>
                    <span className={`font-bold ${cand.longest_comms_window_hours >= requirements.min_continuous_earth_comms_hours ? 'text-cyan-300' : 'text-slate-400'}`}>
                      {cand.longest_comms_window_hours}h
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Simultaneous:</span>
                    <span className="text-emerald-400 font-bold">{cand.longest_simultaneous_window_hours}h</span>
                  </div>
                </div>

                {/* Explainable Recommendation & Constraints Summary */}
                <div className="space-y-1.5 text-[11px]">
                  <p className="text-slate-300 leading-relaxed font-sans">
                    {cand.explanation.why_this_location}
                  </p>

                  {/* Primary Identified Risk if Any */}
                  {cand.explanation.identified_risks.length > 0 && (
                    <div className="flex items-start space-x-1.5 text-red-300 bg-red-950/20 p-1.5 rounded border border-red-900/30 text-[10px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <span>{cand.explanation.identified_risks[0]}</span>
                    </div>
                  )}
                </div>

                {/* Action Shortcuts */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSite(cand.key);
                      onNavigateToExplorer();
                    }}
                    className="text-slate-400 hover:text-cyan-300 flex items-center space-x-1 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View on 3D Moon</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToCandidate(cand.key);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1 transition"
                  >
                    <span>Inspect Candidate Intelligence</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
