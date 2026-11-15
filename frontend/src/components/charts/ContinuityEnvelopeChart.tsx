import React from 'react';
import Plot from 'react-plotly.js';
import { ContinuityEnvelopeResult, MissionRequirements } from '../../types/api';
import { ShieldCheck, AlertTriangle, Crosshair, Calendar, Sliders } from 'lucide-react';

interface ContinuityEnvelopeChartProps {
  envelope: ContinuityEnvelopeResult | null;
  requirements: MissionRequirements;
  onChangeRequirements: (reqs: MissionRequirements) => void;
  onReevaluate: () => void;
  loading?: boolean;
}

export const ContinuityEnvelopeChart: React.FC<ContinuityEnvelopeChartProps> = ({
  envelope,
  requirements,
  onChangeRequirements,
  onReevaluate,
  loading,
}) => {
  if (loading) {
    return (
      <div className="h-[520px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center">
        <div className="flex flex-col items-center space-y-2 font-mono text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Evaluating Mission Continuity Envelope sensitivity ellipse...</span>
        </div>
      </div>
    );
  }

  if (!envelope) {
    return (
      <div className="h-[520px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center font-mono text-xs text-slate-500">
        No continuity envelope data available. Run mission analysis.
      </div>
    );
  }

  // Filter spatial and temporal points
  const spatialPoints = envelope.perturbations.filter((p) => p.date_slippage_days === 0);
  const temporalPoints = envelope.perturbations.filter(
    (p) => p.displacement_distance_m === 0 && p.date_slippage_days !== 0
  );

  // 1. Spatial Scatter Plot Data
  const passX = spatialPoints.filter((p) => p.meets_requirements).map((p) => p.displacement_dx_m);
  const passY = spatialPoints.filter((p) => p.meets_requirements).map((p) => p.displacement_dy_m);
  const passText = spatialPoints
    .filter((p) => p.meets_requirements)
    .map((p) => `Touchdown: (${p.displacement_dx_m}m, ${p.displacement_dy_m}m)<br>Status: PASSED<br>Sunlit: ${p.longest_sunlit_window_hours}h<br>Dark: ${p.longest_dark_period_hours}h`);

  const failX = spatialPoints.filter((p) => !p.meets_requirements).map((p) => p.displacement_dx_m);
  const failY = spatialPoints.filter((p) => !p.meets_requirements).map((p) => p.displacement_dy_m);
  const failText = spatialPoints
    .filter((p) => !p.meets_requirements)
    .map((p) => `Touchdown: (${p.displacement_dx_m}m, ${p.displacement_dy_m}m)<br>Status: FAILED<br>Reasons: ${p.failure_reasons.join(', ')}`);

  const spatialTraces: Plotly.Data[] = [
    // Target Nominal Center (0, 0)
    {
      x: [0],
      y: [0],
      type: 'scatter',
      mode: 'markers',
      name: 'Nominal Target (0, 0)',
      marker: { size: 12, color: '#38bdf8', symbol: 'star' },
      hoverinfo: 'text',
      text: [`Nominal Touchdown<br>Robustness: ${(envelope.overall_robustness_score * 100).toFixed(1)}%`],
    },
    // Passing Perturbations
    {
      x: passX,
      y: passY,
      type: 'scatter',
      mode: 'markers',
      name: 'Passed Requirements',
      marker: { size: 9, color: '#10b981', symbol: 'circle' },
      hoverinfo: 'text',
      text: passText,
    },
    // Failing Perturbations
    {
      x: failX,
      y: failY,
      type: 'scatter',
      mode: 'markers',
      name: 'Violated Requirements',
      marker: { size: 9, color: '#ef4444', symbol: 'x' },
      hoverinfo: 'text',
      text: failText,
    },
  ];

  const spatialLayout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 300,
    margin: { l: 45, r: 25, t: 30, b: 40 },
    paper_bgcolor: '#0b111e',
    plot_bgcolor: '#060911',
    title: {
      text: 'Landing Dispersion Uncertainty Ellipse (±250m)',
      font: { color: '#cbd5e1', size: 11, family: 'JetBrains Mono, monospace' },
      x: 0.02,
    },
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.15,
      font: { color: '#94a3b8', size: 9, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    xaxis: {
      title: { text: 'East-West Offset ΔX (metres)', font: { size: 9, color: '#94a3b8' } },
      range: [-300, 300],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#334155',
    },
    yaxis: {
      title: { text: 'North-South Offset ΔY (metres)', font: { size: 9, color: '#94a3b8' } },
      range: [-300, 300],
      scaleanchor: 'x',
      scaleratio: 1,
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#334155',
    },
  };

  // 2. Temporal Slippage Traces
  const sortedTemporal = [...temporalPoints].sort((a, b) => a.date_slippage_days - b.date_slippage_days);
  const slipDays = sortedTemporal.map((p) => `${p.date_slippage_days > 0 ? '+' : ''}${p.date_slippage_days}d`);
  const slipSunHours = sortedTemporal.map((p) => p.longest_sunlit_window_hours);
  const slipDarkHours = sortedTemporal.map((p) => p.longest_dark_period_hours);
  const slipCommsHours = sortedTemporal.map((p) => p.longest_comms_window_hours);

  const temporalTraces: Plotly.Data[] = [
    {
      x: slipDays,
      y: slipSunHours,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Longest Sunlight Window (h)',
      line: { color: '#f59e0b', width: 2 },
      marker: { size: 6 },
    },
    {
      x: slipDays,
      y: slipDarkHours,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Longest Dark Period (h)',
      line: { color: '#ef4444', width: 2, dash: 'dash' },
      marker: { size: 6 },
    },
    {
      x: slipDays,
      y: slipCommsHours,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Longest Comms Window (h)',
      line: { color: '#38bdf8', width: 2 },
      marker: { size: 6 },
    },
  ];

  const temporalLayout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 300,
    margin: { l: 45, r: 25, t: 30, b: 40 },
    paper_bgcolor: '#0b111e',
    plot_bgcolor: '#060911',
    title: {
      text: 'Launch Date Slippage Sensitivity (±Days)',
      font: { color: '#cbd5e1', size: 11, family: 'JetBrains Mono, monospace' },
      x: 0.02,
    },
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.15,
      font: { color: '#94a3b8', size: 9, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    xaxis: {
      title: { text: 'Launch / Landing Slippage', font: { size: 9, color: '#94a3b8' } },
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
    yaxis: {
      title: { text: 'Duration (hours)', font: { size: 9, color: '#94a3b8' } },
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
  };

  const scoreColor =
    envelope.overall_robustness_score >= 0.8
      ? 'text-emerald-400'
      : envelope.overall_robustness_score >= 0.5
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3.5 select-none space-y-3.5">
      {/* Header and Robustness Score Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-space-700/80 pb-3">
        <div className="flex items-center space-x-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              Mission Continuity Envelope & Robustness Analysis
            </h2>
            <p className="text-[11px] text-slate-400 font-sans">
              Deterministic sensitivity testing across spatial touchdown dispersion (±250m) and launch slippage
            </p>
          </div>
        </div>

        {/* Robustness Composite Score Badge */}
        <div className="flex items-center space-x-4 bg-space-950 px-3.5 py-1.5 rounded border border-space-700">
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase block">OVERALL ROBUSTNESS</span>
            <span className={`text-xl font-mono font-bold ${scoreColor}`}>
              {(envelope.overall_robustness_score * 100).toFixed(1)}%
            </span>
          </div>
          <div className="border-l border-space-800 pl-3">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">SPATIAL PASS RATE</span>
            <span className="text-xs font-mono font-semibold text-slate-200">
              {(envelope.spatial_success_rate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="border-l border-space-800 pl-3">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">DATE SLIP PASS RATE</span>
            <span className="text-xs font-mono font-semibold text-slate-200">
              {(envelope.temporal_success_rate * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Mission Requirements Threshold Adjuster */}
      <div className="bg-space-950 border border-space-800 rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-300 font-semibold uppercase flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-earth-400" />
            <span>Mission Go / No-Go Constraints Thresholds</span>
          </span>
          <button
            onClick={onReevaluate}
            className="px-2.5 py-1 text-[11px] font-mono bg-earth-600/30 hover:bg-earth-600/50 text-earth-300 rounded border border-earth-500/40 transition"
          >
            Apply & Re-evaluate Envelope
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Min Sunlight Window:</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                value={requirements.min_continuous_sunlight_hours}
                onChange={(e) =>
                  onChangeRequirements({ ...requirements, min_continuous_sunlight_hours: Number(e.target.value) })
                }
                className="w-16 bg-space-900 border border-space-700 px-1.5 py-0.5 rounded text-slate-200 text-xs"
              />
              <span className="text-slate-500 text-[11px]">hours</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Max Tolerable Darkness:</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                value={requirements.max_tolerable_dark_hours}
                onChange={(e) =>
                  onChangeRequirements({ ...requirements, max_tolerable_dark_hours: Number(e.target.value) })
                }
                className="w-16 bg-space-900 border border-space-700 px-1.5 py-0.5 rounded text-rose-300 text-xs"
              />
              <span className="text-slate-500 text-[11px]">hours</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Min Continuous Comms:</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                value={requirements.min_continuous_earth_comms_hours}
                onChange={(e) =>
                  onChangeRequirements({ ...requirements, min_continuous_earth_comms_hours: Number(e.target.value) })
                }
                className="w-16 bg-space-900 border border-space-700 px-1.5 py-0.5 rounded text-slate-200 text-xs"
              />
              <span className="text-slate-500 text-[11px]">hours</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Min Simultaneous Ops:</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                value={requirements.min_simultaneous_operating_hours}
                onChange={(e) =>
                  onChangeRequirements({ ...requirements, min_simultaneous_operating_hours: Number(e.target.value) })
                }
                className="w-16 bg-space-900 border border-space-700 px-1.5 py-0.5 rounded text-emerald-300 text-xs"
              />
              <span className="text-slate-500 text-[11px]">hours</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dual Plots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Spatial Dispersion Ellipse */}
        <div className="bg-space-950 border border-space-800 p-2 rounded">
          <Plot
            data={spatialTraces}
            layout={spatialLayout}
            config={{ responsive: true, displayModeBar: false }}
            className="w-full"
          />
        </div>

        {/* Temporal Slippage Sensitivity Curve */}
        <div className="bg-space-950 border border-space-800 p-2 rounded">
          <Plot
            data={temporalTraces}
            layout={temporalLayout}
            config={{ responsive: true, displayModeBar: false }}
            className="w-full"
          />
        </div>
      </div>

      {/* Baseline Go/No-Go Decision Status Bar */}
      <div
        className={`p-2.5 rounded border text-xs font-mono flex items-center justify-between ${
          envelope.baseline_meets_requirements
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}
      >
        <div className="flex items-center space-x-2">
          {envelope.baseline_meets_requirements ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          )}
          <span>
            {envelope.baseline_meets_requirements
              ? 'BASELINE MISSION REQUIREMENTS MET: Favorable conditions survive dispersion envelope.'
              : `MISSION CONSTRAINT VIOLATION: ${envelope.baseline_failure_reasons.join('; ')}`}
          </span>
        </div>
        <span className="font-semibold uppercase tracking-wider text-[11px]">
          {envelope.baseline_meets_requirements ? 'GO FOR MISSION' : 'RISK MITIGATION REQUIRED'}
        </span>
      </div>
    </div>
  );
};
