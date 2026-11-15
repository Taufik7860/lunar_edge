import React, { useState, Suspense, lazy } from 'react';
import Plot from 'react-plotly.js';
import {
  LandingSite,
  HorizonProfile,
  VisibilityTimeSeriesResponse,
  EpochGeometry,
  MissionRequirements,
  DiscoveredCandidate,
} from '../../types/api';
import {
  Activity,
  Compass,
  Sun,
  Radio,
  Maximize2,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Mountain,
  FileText,
  TrendingUp,
} from 'lucide-react';

const HorizonChart = lazy(() =>
  import('../charts/HorizonChart').then((m) => ({ default: m.HorizonChart }))
);
const TimelineChart = lazy(() =>
  import('../charts/TimelineChart').then((m) => ({ default: m.TimelineChart }))
);

const ChartFallback = () => (
  <div className="h-[360px] bg-obsidian-900 border border-slate-800 rounded-md flex items-center justify-center font-mono text-xs text-slate-400">
    <div className="flex items-center space-x-2">
      <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      <span>Loading scientific visualization module...</span>
    </div>
  </div>
);

interface CandidateIntelligenceWorkspaceProps {
  site: LandingSite;
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  horizon: HorizonProfile | null;
  visibility: VisibilityTimeSeriesResponse | null;
  epochGeometry: EpochGeometry | null;
  requirements: MissionRequirements;
  discoveredCandidates: DiscoveredCandidate[];
  onHighlightAzimuth?: (azimuth: number | null) => void;
  onNavigateToRecovery?: () => void;
}

export const CandidateIntelligenceWorkspace: React.FC<CandidateIntelligenceWorkspaceProps> = ({
  site,
  selectedSiteKey,
  onSelectSite,
  horizon,
  visibility,
  epochGeometry,
  requirements,
  discoveredCandidates,
  onHighlightAzimuth,
  onNavigateToRecovery,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'comparison' | 'explainability'>('telemetry');

  const summary = visibility?.summary;
  const currentDiscovered = discoveredCandidates.find((c) => c.key === selectedSiteKey);

  // Traceable explanation fallback if not yet run through discovery engine
  const satisfiedReqs: string[] = [];
  const unsatisfiedReqs: string[] = [];
  const favourable: string[] = [];
  const unfavourable: string[] = [];
  const risks: string[] = [];

  if (summary) {
    if (summary.longest_sunlit_window_hours >= requirements.min_continuous_sunlight_hours) {
      satisfiedReqs.push(`Sunlight window: ${summary.longest_sunlit_window_hours.toFixed(1)}h continuous illumination (req: ≥${requirements.min_continuous_sunlight_hours}h)`);
      favourable.push(`Total mission illumination is ${(summary.sunlit_fraction * 100).toFixed(1)}% (${summary.sunlit_hours.toFixed(1)} hours).`);
    } else {
      unsatisfiedReqs.push(`Sunlight window: ${summary.longest_sunlit_window_hours.toFixed(1)}h is below required ${requirements.min_continuous_sunlight_hours}h`);
      unfavourable.push(`Insufficient continuous solar generation; primary daylight window restricted.`);
    }

    if (summary.longest_dark_period_hours <= requirements.max_tolerable_dark_hours) {
      satisfiedReqs.push(`Darkness tolerance: ${summary.longest_dark_period_hours.toFixed(1)}h is within battery threshold (limit: ≤${requirements.max_tolerable_dark_hours}h)`);
      favourable.push(`Lander battery capacity sufficient for worst-case darkness interval.`);
    } else {
      unsatisfiedReqs.push(`Darkness duration: ${summary.longest_dark_period_hours.toFixed(1)}h exceeds battery limit (${requirements.max_tolerable_dark_hours}h)`);
      unfavourable.push(`Excessive nocturnal interval threatens battery depletion and subsystem freeze.`);
      risks.push(`Battery exhaustion risk: Requires ${summary.longest_dark_period_hours.toFixed(1)}h storage or secondary RTG power.`);
    }

    if (summary.longest_earth_visible_window_hours >= requirements.min_continuous_earth_comms_hours) {
      satisfiedReqs.push(`Earth comms window: ${summary.longest_earth_visible_window_hours.toFixed(1)}h direct line of sight (req: ≥${requirements.min_continuous_earth_comms_hours}h)`);
      favourable.push(`Uninterrupted Direct-to-Earth line-of-sight during high Earth libration phases.`);
    } else {
      unsatisfiedReqs.push(`Earth comms window: ${summary.longest_earth_visible_window_hours.toFixed(1)}h is below required ${requirements.min_continuous_earth_comms_hours}h`);
      unfavourable.push(`Terrain occultation or low Earth libration angle blocks direct ground link.`);
      risks.push(`Comms blackout risk: Requires scheduled uplink passes or orbital relay.`);
    }
  }

  // Always include standard scientific topographical disclaimer
  risks.push(`Topographic resolution limit: LOLA 80m DEM supports regional mission screening, not landing-scale hazard certification.`);

  // Comparison Bar Chart Traces across evaluated candidates
  const candidatesForChart = discoveredCandidates.length > 0 ? discoveredCandidates : [];
  const chartNames = candidatesForChart.map((c) => c.name.split('/')[0].replace('Crater', 'Cr.').trim());
  const chartSunlight = candidatesForChart.map((c) => c.sunlight_percentage);
  const chartComms = candidatesForChart.map((c) =>
    c.longest_comms_window_hours > 0 ? Math.min(100, Math.round((c.longest_comms_window_hours / (14 * 24)) * 100)) : 0
  );
  const chartScores = candidatesForChart.map((c) => c.composite_score);

  const comparisonChartTraces: Plotly.Data[] = [
    {
      x: chartNames,
      y: chartSunlight,
      name: 'Sunlight Availability (%)',
      type: 'bar',
      marker: { color: '#f59e0b' },
    },
    {
      x: chartNames,
      y: chartComms,
      name: 'Earth Comms Window (%)',
      type: 'bar',
      marker: { color: '#00e5ff' },
    },
    {
      x: chartNames,
      y: chartScores,
      name: 'Composite Score (/100)',
      type: 'bar',
      marker: { color: '#10b981' },
    },
  ];

  const comparisonChartLayout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 280,
    margin: { l: 45, r: 25, t: 30, b: 65 },
    paper_bgcolor: '#030508',
    plot_bgcolor: '#0b111e',
    barmode: 'group',
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.15,
      font: { color: '#94a3b8', size: 9, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    xaxis: {
      tickfont: { color: '#cbd5e1', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
    yaxis: {
      title: { text: 'Metric Value (%)', font: { size: 9, color: '#94a3b8' } },
      range: [0, 105],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
  };

  return (
    <div className="w-full h-full bg-obsidian-950 p-6 overflow-y-auto space-y-6 text-xs font-mono select-none">
      {/* Workspace Header & Candidate Quick Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-800/80 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm tracking-wide">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>CANDIDATE INTELLIGENCE & COMPARISON WORKSPACE</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            Comprehensive topographical, ephemeris occultation, and explainable constraint evaluation for{' '}
            <strong className="text-white">{site.name}</strong>.
          </div>
        </div>

        {/* Selected Candidate Telemetry Badge */}
        <div className="flex items-center space-x-3 bg-graphite-900 border border-slate-800 px-3 py-1.5 rounded text-[11px]">
          <span>Lat: <strong className="text-white">{site.latitude_deg.toFixed(3)}°S</strong></span>
          <span>•</span>
          <span>Lon: <strong className="text-white">{site.longitude_deg.toFixed(3)}°E</strong></span>
          <span>•</span>
          <span className="text-cyan-400 font-bold">
            {site.elevation_m > 0 ? `+${site.elevation_m.toFixed(0)}` : site.elevation_m.toFixed(0)} m DEM
          </span>
          {currentDiscovered && (
            <>
              <span>•</span>
              <span
                className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                  currentDiscovered.classification === 'Screening-viable'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : currentDiscovered.classification === 'Conditional'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-red-500/20 text-red-300'
                }`}
              >
                {currentDiscovered.classification}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Candidate Selector Switcher Pills */}
      {discoveredCandidates.length > 0 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          <span className="text-[10px] text-slate-500 uppercase font-bold flex-shrink-0">Compare Site:</span>
          {discoveredCandidates.map((cand) => {
            const isSelected = cand.key === selectedSiteKey;
            return (
              <button
                key={cand.key}
                onClick={() => onSelectSite(cand.key)}
                className={`px-3 py-1 rounded text-xs transition flex items-center space-x-1.5 flex-shrink-0 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-cyan-glow'
                    : 'bg-obsidian-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    cand.classification === 'Screening-viable'
                      ? 'bg-cyan-400'
                      : cand.classification === 'Conditional'
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                />
                <span>{cand.name.split('/')[0].trim()}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Workspace Inner Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-obsidian-900/40 rounded-t p-1 space-x-1">
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`py-2 px-4 rounded text-xs font-mono font-semibold transition flex items-center space-x-2 ${
            activeTab === 'telemetry'
              ? 'bg-graphite-800 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>HORIZON & VISIBILITY TIMELINE</span>
        </button>

        <button
          onClick={() => setActiveTab('comparison')}
          className={`py-2 px-4 rounded text-xs font-mono font-semibold transition flex items-center space-x-2 ${
            activeTab === 'comparison'
              ? 'bg-graphite-800 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>SIDE-BY-SIDE COMPARISON MATRIX</span>
        </button>

        <button
          onClick={() => setActiveTab('explainability')}
          className={`py-2 px-4 rounded text-xs font-mono font-semibold transition flex items-center space-x-2 ${
            activeTab === 'explainability'
              ? 'bg-graphite-800 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>WHY THIS LOCATION? & RISKS</span>
        </button>
      </div>

      {/* TAB 1: HORIZON PROFILE & VISIBILITY TIMELINE */}
      {activeTab === 'telemetry' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel 1: 360° Polar Horizon Profile */}
            <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2 text-slate-200 font-bold text-xs">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span>360° TERRAIN HORIZON OBSTRUCTION PROFILE</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">LOLA 80M RAY CASTING</span>
              </div>

              <Suspense fallback={<ChartFallback />}>
                <HorizonChart
                  horizon={horizon}
                  samples={
                    visibility?.samples ||
                    (epochGeometry
                      ? [
                          {
                            sun_azimuth_deg: epochGeometry.sun.azimuth_deg,
                            sun_elevation_deg: epochGeometry.sun.elevation_deg,
                            earth_azimuth_deg: epochGeometry.earth.azimuth_deg,
                            earth_elevation_deg: epochGeometry.earth.elevation_deg,
                          },
                        ]
                      : [])
                  }
                />
              </Suspense>

              <div className="grid grid-cols-3 gap-2 p-2 bg-graphite-900/60 rounded text-[11px] text-slate-400">
                <div>
                  <span className="text-slate-500 block text-[10px]">Min Horizon Dip:</span>
                  <span className="text-white font-semibold">{horizon?.min_horizon_deg.toFixed(2) ?? '—'}°</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Mean Obstruction:</span>
                  <span className="text-white font-semibold">{horizon?.mean_horizon_deg.toFixed(2) ?? '—'}°</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Peak Obstruction:</span>
                  <span className="text-amber-400 font-semibold">{horizon?.max_horizon_deg.toFixed(2) ?? '—'}°</span>
                </div>
              </div>
            </div>

            {/* Panel 2: Operational Visibility Timeline */}
            <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2 text-slate-200 font-bold text-xs">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>TERRAIN-AWARE VISIBILITY & CELESTIAL TIMELINE</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">SPICE DE440S + LOLA</span>
              </div>

              <Suspense fallback={<ChartFallback />}>
                <TimelineChart data={visibility} />
              </Suspense>

              {summary && (
                <div className="grid grid-cols-4 gap-2 p-2 bg-graphite-900/60 rounded text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Sunlit:</span>
                    <span className="text-amber-400 font-bold">{(summary.sunlit_fraction * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Max Darkness:</span>
                    <span className="text-red-400 font-bold">{summary.longest_dark_period_hours.toFixed(1)}h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Earth Comms:</span>
                    <span className="text-cyan-400 font-bold">{(summary.earth_visible_fraction * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Simultaneous:</span>
                    <span className="text-emerald-400 font-bold">{(summary.simultaneous_fraction * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Traceable Explainability Preview */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2 text-white font-bold text-xs">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>EXPLAINABLE EVALUATION SUMMARY FOR {site.name.toUpperCase()}</span>
              </div>
              <button
                onClick={() => setActiveTab('explainability')}
                className="text-cyan-400 hover:text-cyan-300 text-[11px] flex items-center space-x-1"
              >
                <span>View Full Analysis</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              {currentDiscovered?.explanation.why_this_location ||
                `Evaluating ${site.name} against mission constraints. ${
                  summary
                    ? `Solar availability is ${(summary.sunlit_fraction * 100).toFixed(1)}% with longest continuous darkness of ${summary.longest_dark_period_hours.toFixed(1)}h.`
                    : 'Run mission analysis to generate telemetry.'
                }`}
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: CANDIDATE COMPARISON MATRIX & CHARTS */}
      {activeTab === 'comparison' && (
        <div className="space-y-6 animate-fade-in">
          {/* Comparative Scientific Bar Chart */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2 text-white font-bold text-xs">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>CROSS-CANDIDATE SCIENTIFIC BENCHMARK PLOT</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">NORMALIZED COMPARISON</span>
            </div>

            {candidatesForChart.length > 0 ? (
              <Plot
                data={comparisonChartTraces}
                layout={comparisonChartLayout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500">
                Run Autonomous Opportunity Discovery to populate candidate comparison plots.
              </div>
            )}
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2 text-white font-bold text-xs">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>CANDIDATE REGION SIDE-BY-SIDE COMPARISON TABLE</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">CALCULATED METRICS ONLY</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-obsidian-950 text-slate-400">
                    <th className="p-2.5 font-bold uppercase">Metric</th>
                    {discoveredCandidates.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => onSelectSite(c.key)}
                        className={`p-2.5 font-bold cursor-pointer transition ${
                          c.key === selectedSiteKey ? 'text-cyan-300 bg-cyan-950/20' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {c.name.split('/')[0].trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {/* Row 1: Classification */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Classification</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.classification === 'Screening-viable'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : c.classification === 'Conditional'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {c.classification}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Row 2: Composite Score */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Composite Score</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 font-bold text-white">
                        {c.composite_score} / 100
                      </td>
                    ))}
                  </tr>

                  {/* Row 3: Sunlight Availability */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Sunlight Availability</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 text-amber-300 font-bold">
                        {c.sunlight_percentage}% ({c.sunlit_hours}h)
                      </td>
                    ))}
                  </tr>

                  {/* Row 4: Worst-Case Continuous Darkness */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Worst-Case Darkness</td>
                    {discoveredCandidates.map((c) => (
                      <td
                        key={c.key}
                        className={`p-2.5 font-semibold ${
                          c.longest_dark_period_hours > requirements.max_tolerable_dark_hours ? 'text-red-400' : 'text-slate-200'
                        }`}
                      >
                        {c.longest_dark_period_hours} hours
                      </td>
                    ))}
                  </tr>

                  {/* Row 5: Earth Direct Line of Sight */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Earth Direct LoS Window</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 text-cyan-300 font-semibold">
                        {c.longest_comms_window_hours} hours
                      </td>
                    ))}
                  </tr>

                  {/* Row 6: LOLA DEM Elevation */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Terrain Elevation (LOLA)</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 text-slate-200">
                        {c.elevation_m > 0 ? `+${c.elevation_m}` : c.elevation_m} m
                      </td>
                    ))}
                  </tr>

                  {/* Row 7: Regional Slope */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Regional Slope</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 text-slate-200">
                        {c.slope_deg}°
                      </td>
                    ))}
                  </tr>

                  {/* Row 8: Data Coverage */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Data Coverage</td>
                    {discoveredCandidates.map((c) => (
                      <td key={c.key} className="p-2.5 text-[10px] text-slate-400">
                        {c.data_coverage_status.split('(')[0].trim()}
                      </td>
                    ))}
                  </tr>

                  {/* Row 9: Constraint Assessment */}
                  <tr className="hover:bg-graphite-900/40">
                    <td className="p-2.5 text-slate-400 font-semibold">Constraints Assessment</td>
                    {discoveredCandidates.map((c) => {
                      const allMet =
                        c.constraints_assessment.min_continuous_sunlight &&
                        c.constraints_assessment.max_tolerable_darkness &&
                        c.constraints_assessment.min_continuous_earth_comms &&
                        c.constraints_assessment.max_terrain_slope;
                      return (
                        <td key={c.key} className="p-2.5">
                          {allMet ? (
                            <span className="text-emerald-400 font-bold flex items-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ALL MET</span>
                            </span>
                          ) : (
                            <span className="text-amber-400 font-bold flex items-center space-x-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>VIOLATED</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WHY THIS LOCATION? & IDENTIFIED RISKS */}
      {activeTab === 'explainability' && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Explainability Card */}
          <div className="bg-obsidian-900/90 border border-cyan-500/40 rounded-lg p-5 space-y-4 shadow-cyan-glow">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                    WHY THIS LOCATION? — EXPLAINABLE MISSION ASSESSMENT
                  </h3>
                  <span className="text-[11px] text-slate-400 font-sans">
                    Traceable evaluation for {site.name} derived from SPICE DE440s ephemerides and LOLA 80m DEM raycasting.
                  </span>
                </div>
              </div>
              {currentDiscovered && (
                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold border ${
                    currentDiscovered.classification === 'Screening-viable'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : currentDiscovered.classification === 'Conditional'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-red-500/20 text-red-300 border-red-500/40'
                  }`}
                >
                  {currentDiscovered.classification}
                </span>
              )}
            </div>

            <p className="text-slate-200 font-sans leading-relaxed text-xs p-3 bg-obsidian-950/80 rounded border border-slate-800">
              {currentDiscovered?.explanation.why_this_location ||
                `Location provides ${summary ? `${(summary.sunlit_fraction * 100).toFixed(1)}% sunlight availability` : 'active illumination'} over the configured mission epoch.`}
            </p>

            {/* Satisfied vs Unsatisfied Requirements Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Satisfied Requirements */}
              <div className="p-3 bg-graphite-900/80 border border-emerald-900/40 rounded space-y-2">
                <span className="text-emerald-400 font-bold uppercase text-[11px] flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SATISFIED MISSION REQUIREMENTS</span>
                </span>
                <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
                  {(currentDiscovered?.explanation.satisfied_requirements || satisfiedReqs).map((r, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-emerald-400 font-bold mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                  {(currentDiscovered?.explanation.satisfied_requirements || satisfiedReqs).length === 0 && (
                    <li className="text-slate-500 italic">No primary requirements satisfied under baseline epoch.</li>
                  )}
                </ul>
              </div>

              {/* Unsatisfied Requirements */}
              <div className="p-3 bg-graphite-900/80 border border-red-900/40 rounded space-y-2">
                <span className="text-red-400 font-bold uppercase text-[11px] flex items-center space-x-1.5">
                  <XCircle className="w-4 h-4" />
                  <span>UNSATISFIED REQUIREMENTS / CONSTRAINTS</span>
                </span>
                <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
                  {(currentDiscovered?.explanation.unsatisfied_requirements || unsatisfiedReqs).map((r, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-red-400 font-bold mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                  {(currentDiscovered?.explanation.unsatisfied_requirements || unsatisfiedReqs).length === 0 && (
                    <li className="text-emerald-400 italic">All configured operational constraints are satisfied.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Favourable vs Unfavourable Physical Factors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-obsidian-950/80 border border-slate-800 rounded space-y-2">
                <span className="text-cyan-400 font-bold uppercase text-[11px] flex items-center space-x-1.5">
                  <Sun className="w-4 h-4 text-cyan-400" />
                  <span>FAVOURABLE PHYSICAL FACTORS</span>
                </span>
                <ul className="space-y-1 text-[11px] text-slate-300 font-sans">
                  {(currentDiscovered?.explanation.favourable_factors || favourable).map((f, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-cyan-400 font-bold mt-0.5">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-obsidian-950/80 border border-slate-800 rounded space-y-2">
                <span className="text-amber-400 font-bold uppercase text-[11px] flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <span>LIMITING OR UNFAVOURABLE FACTORS</span>
                </span>
                <ul className="space-y-1 text-[11px] text-slate-300 font-sans">
                  {(currentDiscovered?.explanation.unfavourable_factors || unfavourable).map((f, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-amber-400 font-bold mt-0.5">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Identified Risks & Scientific Limitations */}
            <div className="p-3.5 bg-red-950/20 border border-red-900/40 rounded space-y-2.5">
              <div className="flex items-center space-x-2 text-red-400 font-bold uppercase text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>IDENTIFIED MISSION RISKS & SCIENTIFIC LIMITATIONS</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
                {(currentDiscovered?.explanation.identified_risks || risks).map((r, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="text-red-400 font-bold mt-0.5">⚠</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>

              {/* Recovery Suggestion Button */}
              {onNavigateToRecovery && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={onNavigateToRecovery}
                    className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-200 border border-red-700/60 rounded text-xs transition flex items-center space-x-1.5"
                  >
                    <span>Investigate Recovery Interventions</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
