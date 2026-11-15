import React from 'react';
import Plot from 'react-plotly.js';
import { VisibilityTimeSeriesResponse } from '../../types/api';
import { Sun, Battery, Radio, Zap } from 'lucide-react';

interface TimelineChartProps {
  data: VisibilityTimeSeriesResponse | null;
  loading?: boolean;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="h-[480px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center">
        <div className="flex flex-col items-center space-y-2 font-mono text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-solar-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Computing terrain-aware solar disc occultation & comms windows...</span>
        </div>
      </div>
    );
  }

  if (!data || !data.samples.length) {
    return (
      <div className="h-[480px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center font-mono text-xs text-slate-500">
        No visibility timeline data available. Run mission analysis first.
      </div>
    );
  }

  const { summary, samples } = data;

  const times = samples.map((s) => s.utc);
  const sunClearance = samples.map((s) => s.sun_clearance_deg);
  const sunFraction = samples.map((s) => s.sun_illumination_fraction * 100);
  const earthClearance = samples.map((s) => s.earth_clearance_deg);
  const simulOperating = samples.map((s) => (s.is_simultaneous_operating ? 1 : 0));

  const traces: Plotly.Data[] = [
    // Subplot 1: Solar Clearance & Disc Fraction
    {
      x: times,
      y: sunClearance,
      type: 'scatter',
      mode: 'lines',
      name: 'Sun Clearance (°)',
      line: { color: '#f59e0b', width: 2 },
      yaxis: 'y1',
      hovertemplate: '%{x}<br>Sun Clearance: %{y:.2f}°<extra></extra>',
    },
    {
      x: times,
      y: sunFraction,
      type: 'scatter',
      mode: 'lines',
      name: 'Sun Disc Visible (%)',
      line: { color: '#fbbf24', width: 1.5, dash: 'dot' },
      yaxis: 'y2',
      hovertemplate: '%{x}<br>Solar Disc Fraction: %{y:.1f}%<extra></extra>',
    },
    // Subplot 2: Earth Clearance & Comm Line-of-Sight
    {
      x: times,
      y: earthClearance,
      type: 'scatter',
      mode: 'lines',
      name: 'Earth Clearance (°)',
      line: { color: '#38bdf8', width: 2 },
      yaxis: 'y3',
      hovertemplate: '%{x}<br>Earth Clearance: %{y:.2f}°<extra></extra>',
    },
    // Subplot 3: Simultaneous Power & Direct Comms State
    {
      x: times,
      y: simulOperating,
      type: 'scatter',
      mode: 'lines',
      name: 'Simultaneous Power + Comms',
      line: { color: '#10b981', width: 2 },
      fill: 'tozeroy',
      fillcolor: 'rgba(16, 185, 129, 0.2)',
      yaxis: 'y4',
      hovertemplate: '%{x}<br>Simultaneous Window: %{y}<extra></extra>',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 480,
    margin: { l: 55, r: 55, t: 30, b: 45 },
    paper_bgcolor: '#0b111e',
    plot_bgcolor: '#060911',
    grid: { rows: 3, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.08,
      font: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    // Subplot 1 Y-Axes (Sun)
    yaxis: {
      title: { text: 'Sun Clr (°)', font: { size: 9, color: '#f59e0b' } },
      domain: [0.68, 1.0],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#334155',
    },
    yaxis2: {
      title: { text: 'Disc %', font: { size: 9, color: '#fbbf24' } },
      overlaying: 'y',
      side: 'right',
      range: [0, 105],
      tickfont: { color: '#64748b', size: 8, family: 'monospace' },
      showgrid: false,
    },
    // Subplot 2 Y-Axis (Earth)
    yaxis3: {
      title: { text: 'Earth Clr (°)', font: { size: 9, color: '#38bdf8' } },
      domain: [0.34, 0.64],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#334155',
    },
    // Subplot 3 Y-Axis (Simultaneous Operations)
    yaxis4: {
      title: { text: 'Both Vis', font: { size: 9, color: '#10b981' } },
      domain: [0.0, 0.28],
      range: [-0.1, 1.2],
      tickvals: [0, 1],
      ticktext: ['OFF', 'ACTIVE'],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
    xaxis: {
      showticklabels: false,
      gridcolor: '#162035',
    },
    xaxis2: {
      showticklabels: false,
      gridcolor: '#162035',
    },
    xaxis3: {
      title: { text: 'Mission Timeline (UTC)', font: { size: 10, color: '#94a3b8' } },
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
    },
  };

  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3 select-none space-y-3">
      {/* High-level Mission Operational Metrics Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-space-950 border border-space-800 p-2.5 rounded">
          <div className="flex items-center space-x-1.5 text-solar-400 mb-1">
            <Sun className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Sunlight Availability</span>
          </div>
          <div className="text-lg font-mono font-bold text-slate-100">
            {summary.sunlit_hours.toFixed(1)}h
            <span className="text-xs text-slate-400 ml-1.5 font-normal">
              ({(summary.sunlit_fraction * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Longest Window: {summary.longest_sunlit_window_hours.toFixed(1)}h
          </div>
        </div>

        <div className="bg-space-950 border border-space-800 p-2.5 rounded">
          <div className="flex items-center space-x-1.5 text-rose-400 mb-1">
            <Battery className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Max Darkness Period</span>
          </div>
          <div className="text-lg font-mono font-bold text-rose-400">
            {summary.longest_dark_period_hours.toFixed(1)}h
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Total Dark: {summary.dark_hours.toFixed(1)}h (Battery Critical)
          </div>
        </div>

        <div className="bg-space-950 border border-space-800 p-2.5 rounded">
          <div className="flex items-center space-x-1.5 text-earth-400 mb-1">
            <Radio className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Earth Direct Comms</span>
          </div>
          <div className="text-lg font-mono font-bold text-slate-100">
            {summary.earth_visible_hours.toFixed(1)}h
            <span className="text-xs text-slate-400 ml-1.5 font-normal">
              ({(summary.earth_visible_fraction * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Longest Comms: {summary.longest_earth_visible_window_hours.toFixed(1)}h
          </div>
        </div>

        <div className="bg-space-950 border border-space-800 p-2.5 rounded">
          <div className="flex items-center space-x-1.5 text-emerald-400 mb-1">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Simultaneous Ops</span>
          </div>
          <div className="text-lg font-mono font-bold text-emerald-400">
            {summary.simultaneous_hours.toFixed(1)}h
            <span className="text-xs text-slate-400 ml-1.5 font-normal">
              ({(summary.simultaneous_fraction * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Longest Mutual: {summary.longest_simultaneous_window_hours.toFixed(1)}h
          </div>
        </div>
      </div>

      {/* High-Resolution Scientific Plotly Timeline */}
      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        className="w-full"
      />
    </div>
  );
};
