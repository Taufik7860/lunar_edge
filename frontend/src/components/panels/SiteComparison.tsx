import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { LandingSite, VisibilityTimeSeriesResponse, ContinuityEnvelopeResult } from '../../types/api';
import { Award, CheckCircle, BarChart3, AlertCircle, ArrowUpRight } from 'lucide-react';

interface SiteComparisonRecord {
  site: LandingSite;
  key: string;
  visibility: VisibilityTimeSeriesResponse | null;
  continuity: ContinuityEnvelopeResult | null;
  loading: boolean;
}

interface SiteComparisonProps {
  sites: Record<string, LandingSite>;
  onSelectSite: (siteKey: string) => void;
  onEvaluateSite: (siteKey: string) => Promise<{ visibility: VisibilityTimeSeriesResponse; continuity: ContinuityEnvelopeResult }>;
}

export const SiteComparison: React.FC<SiteComparisonProps> = ({
  sites,
  onSelectSite,
  onEvaluateSite,
}) => {
  const [comparisonData, setComparisonData] = useState<Record<string, SiteComparisonRecord>>(() => {
    const init: Record<string, SiteComparisonRecord> = {};
    for (const [key, site] of Object.entries(sites)) {
      init[key] = { site, key, visibility: null, continuity: null, loading: false };
    }
    return init;
  });

  const [evaluatingAll, setEvaluatingAll] = useState(false);

  const handleRunAllComparisons = async () => {
    setEvaluatingAll(true);
    const updated = { ...comparisonData };

    for (const key of Object.keys(sites)) {
      updated[key] = { ...updated[key], loading: true };
      setComparisonData({ ...updated });

      try {
        const { visibility, continuity } = await onEvaluateSite(key);
        updated[key] = {
          ...updated[key],
          visibility,
          continuity,
          loading: false,
        };
      } catch (err) {
        console.error(`Comparison failed for ${key}:`, err);
        updated[key] = { ...updated[key], loading: false };
      }
      setComparisonData({ ...updated });
    }
    setEvaluatingAll(false);
  };

  const records = Object.values(comparisonData);
  const evaluatedRecords = records.filter((r) => r.visibility !== null && r.continuity !== null);

  // Plotly Multi-Site Comparison Bar Chart
  const siteNames = evaluatedRecords.map((r) => r.site.name.replace('Crater', 'Cr.'));
  const daylightFractions = evaluatedRecords.map((r) => (r.visibility?.summary.sunlit_fraction || 0) * 100);
  const commsFractions = evaluatedRecords.map((r) => (r.visibility?.summary.earth_visible_fraction || 0) * 100);
  const robustnessScores = evaluatedRecords.map((r) => (r.continuity?.overall_robustness_score || 0) * 100);

  const chartTraces: Plotly.Data[] = [
    {
      x: siteNames,
      y: daylightFractions,
      name: 'Sunlight Availability (%)',
      type: 'bar',
      marker: { color: '#f59e0b' },
    },
    {
      x: siteNames,
      y: commsFractions,
      name: 'Earth Direct Comms (%)',
      type: 'bar',
      marker: { color: '#38bdf8' },
    },
    {
      x: siteNames,
      y: robustnessScores,
      name: 'Continuity Robustness Score (%)',
      type: 'bar',
      marker: { color: '#10b981' },
    },
  ];

  const chartLayout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 320,
    margin: { l: 45, r: 25, t: 25, b: 65 },
    paper_bgcolor: '#0b111e',
    plot_bgcolor: '#060911',
    barmode: 'group',
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.12,
      font: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    xaxis: {
      tickfont: { color: '#cbd5e1', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
    yaxis: {
      title: { text: 'Score / Fraction (%)', font: { size: 10, color: '#94a3b8' } },
      range: [0, 105],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
  };

  // Find best site based on composite score
  const bestSite = evaluatedRecords.length
    ? [...evaluatedRecords].sort(
        (a, b) => (b.continuity?.overall_robustness_score || 0) - (a.continuity?.overall_robustness_score || 0)
      )[0]
    : null;

  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3.5 select-none space-y-4">
      {/* Header and Run Benchmark Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-space-700/80 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-earth-400" />
            <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              Artemis III Candidate Landing Sites Comparative Matrix
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 font-sans mt-0.5">
            Cross-evaluate illumination, direct comms, dark survival, and landing envelope robustness
          </p>
        </div>

        <button
          onClick={handleRunAllComparisons}
          disabled={evaluatingAll}
          className={`px-3.5 py-1.5 rounded text-xs font-mono font-semibold transition tracking-wider uppercase ${
            evaluatingAll
              ? 'bg-space-800 text-slate-500 cursor-not-allowed border border-space-700'
              : 'bg-earth-600 hover:bg-earth-500 text-white shadow'
          }`}
        >
          {evaluatingAll ? 'EVALUATING SITES...' : 'BENCHMARK ALL CANDIDATE SITES'}
        </button>
      </div>

      {/* Decision-Support Ranking Callout */}
      {bestSite && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 p-3 rounded-md flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2.5">
            <Award className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <span className="text-emerald-400 font-bold uppercase tracking-wider block">
                OPTIMAL CANDIDATE SITE: {bestSite.site.name}
              </span>
              <span className="text-slate-300 text-[11px]">
                Robustness: {((bestSite.continuity?.overall_robustness_score || 0) * 100).toFixed(1)}% | Daylight: {((bestSite.visibility?.summary.sunlit_fraction || 0) * 100).toFixed(1)}% | Max Dark: {bestSite.visibility?.summary.longest_dark_period_hours.toFixed(1)}h
              </span>
            </div>
          </div>
          <button
            onClick={() => onSelectSite(bestSite.key)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50 text-[11px] transition"
          >
            <span>Load in Console</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Comparative Bar Chart */}
      {evaluatedRecords.length > 0 && (
        <div className="bg-space-950 border border-space-800 p-2.5 rounded">
          <Plot
            data={chartTraces}
            layout={chartLayout}
            config={{ responsive: true, displayModeBar: false }}
            className="w-full"
          />
        </div>
      )}

      {/* Direct Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-space-700 bg-space-950 text-slate-400 text-[11px]">
              <th className="py-2 px-3">CANDIDATE SITE</th>
              <th className="py-2 px-2">COORDINATES</th>
              <th className="py-2 px-2">ELEVATION</th>
              <th className="py-2 px-2">SUNLIGHT %</th>
              <th className="py-2 px-2">MAX DARK</th>
              <th className="py-2 px-2">EARTH COMMS</th>
              <th className="py-2 px-2">MUTUAL OPS</th>
              <th className="py-2 px-2">ROBUSTNESS</th>
              <th className="py-2 px-2 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-800">
            {records.map((r) => {
              const vis = r.visibility?.summary;
              const con = r.continuity;

              return (
                <tr key={r.key} className="hover:bg-space-850/60 transition-colors">
                  <td className="py-2 px-3 font-semibold text-slate-200">
                    {r.site.name}
                  </td>
                  <td className="py-2 px-2 text-slate-400 text-[11px]">
                    {r.site.latitude_deg.toFixed(2)}°, {r.site.longitude_deg.toFixed(2)}°
                  </td>
                  <td className="py-2 px-2 text-slate-300">
                    {r.site.elevation_m.toFixed(0)} m
                  </td>
                  <td className="py-2 px-2 text-solar-400">
                    {vis ? `${(vis.sunlit_fraction * 100).toFixed(1)}% (${vis.sunlit_hours.toFixed(0)}h)` : r.loading ? '...' : '—'}
                  </td>
                  <td className="py-2 px-2 text-rose-400">
                    {vis ? `${vis.longest_dark_period_hours.toFixed(1)}h` : r.loading ? '...' : '—'}
                  </td>
                  <td className="py-2 px-2 text-earth-400">
                    {vis ? `${(vis.earth_visible_fraction * 100).toFixed(1)}%` : r.loading ? '...' : '—'}
                  </td>
                  <td className="py-2 px-2 text-emerald-400">
                    {vis ? `${vis.simultaneous_hours.toFixed(0)}h` : r.loading ? '...' : '—'}
                  </td>
                  <td className="py-2 px-2 font-bold">
                    {con ? (
                      <span className={con.overall_robustness_score >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}>
                        {(con.overall_robustness_score * 100).toFixed(1)}%
                      </span>
                    ) : r.loading ? (
                      '...'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => onSelectSite(r.key)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-space-800 hover:bg-space-700 text-slate-200 border border-space-600 transition"
                    >
                      Select
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
