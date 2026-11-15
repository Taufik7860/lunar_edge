import React from 'react';
import Plot from 'react-plotly.js';
import { HorizonProfile, VisibilitySample, TimeSeriesSample } from '../../types/api';

type CelestialSample = VisibilitySample | TimeSeriesSample | {
  sun_azimuth_deg: number;
  sun_elevation_deg: number;
  earth_azimuth_deg: number;
  earth_elevation_deg: number;
};

interface HorizonChartProps {
  horizon: HorizonProfile | null;
  samples: CelestialSample[];
  loading?: boolean;
}

export const HorizonChart: React.FC<HorizonChartProps> = ({
  horizon,
  samples,
  loading,
}) => {
  if (loading) {
    return (
      <div className="h-[420px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center">
        <div className="flex flex-col items-center space-y-2 font-mono text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-earth-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Casting radial rays against LOLA 80m DEM...</span>
        </div>
      </div>
    );
  }

  if (!horizon) {
    return (
      <div className="h-[420px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center font-mono text-xs text-slate-500">
        No terrain horizon profile available. Select a site and click Run Mission Analysis.
      </div>
    );
  }

  // Terrain profile data
  const az = horizon.azimuths_deg;
  const el = horizon.horizon_elevations_deg;

  // Ephemeris paths
  const sunAz = samples.map((s) => s.sun_azimuth_deg);
  const sunEl = samples.map((s) => s.sun_elevation_deg);
  const earthAz = samples.map((s) => s.earth_azimuth_deg);
  const earthEl = samples.map((s) => s.earth_elevation_deg);

  // Plot traces
  const traces: Plotly.Data[] = [
    // 1. Terrain Horizon Obstruction Line with fill to -5 deg
    {
      x: az,
      y: el,
      type: 'scatter',
      mode: 'lines',
      name: 'Terrain Horizon (LOLA 80m)',
      line: { color: '#ef4444', width: 2 },
      fill: 'tozeroy',
      fillcolor: 'rgba(239, 68, 68, 0.15)',
      hoverinfo: 'x+y',
      hovertemplate: 'Azimuth: %{x:.1f}°<br>Horizon Elevation: %{y:.2f}°<extra></extra>',
    },
    // 2. Spherical Reference Horizon (0°)
    {
      x: [0, 360],
      y: [0, 0],
      type: 'scatter',
      mode: 'lines',
      name: 'Spherical Tangent Plane (0°)',
      line: { color: '#64748b', width: 1, dash: 'dot' },
      hoverinfo: 'none',
    },
    // 3. Sun Path Trajectory
    {
      x: sunAz,
      y: sunEl,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Sun Path (SPICE DE440s)',
      line: { color: '#f59e0b', width: 2 },
      marker: { size: 3, color: '#fbbf24' },
      hoverinfo: 'x+y',
      hovertemplate: 'Sun Az: %{x:.1f}°<br>Sun El: %{y:.2f}°<extra></extra>',
    },
    // 4. Earth Path (Libration Orbit)
    {
      x: earthAz,
      y: earthEl,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Earth Path (Libration)',
      line: { color: '#38bdf8', width: 2.5 },
      marker: { size: 4, color: '#0284c7' },
      hoverinfo: 'x+y',
      hovertemplate: 'Earth Az: %{x:.1f}°<br>Earth El: %{y:.2f}°<extra></extra>',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 420,
    margin: { l: 50, r: 25, t: 35, b: 45 },
    paper_bgcolor: '#0b111e',
    plot_bgcolor: '#060911',
    title: {
      text: `Terrain Horizon Obstruction & Celestial Trajectories (${horizon.site.name})`,
      font: { color: '#cbd5e1', size: 12, family: 'JetBrains Mono, monospace' },
      x: 0.02,
      y: 0.98,
    },
    legend: {
      orientation: 'h',
      x: 0.02,
      y: 1.05,
      font: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
      bgcolor: 'transparent',
    },
    xaxis: {
      title: { text: 'Azimuth (degrees, 0° = North, 90° = East, 180° = South, 270° = West)', font: { size: 10, color: '#94a3b8' } },
      range: [0, 360],
      dtick: 45,
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#1f2e4d',
    },
    yaxis: {
      title: { text: 'Elevation Angle (degrees above local tangent plane)', font: { size: 10, color: '#94a3b8' } },
      range: [
        Math.min(-3.0, Math.floor(horizon.min_horizon_deg - 1.0)),
        Math.max(10.0, Math.ceil(horizon.max_horizon_deg + 3.0)),
      ],
      tickfont: { color: '#64748b', size: 9, family: 'monospace' },
      gridcolor: '#162035',
      zerolinecolor: '#334155',
    },
  };

  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3 select-none">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-space-800 text-xs font-mono">
        <div className="flex items-center space-x-3">
          <span className="text-slate-300 font-semibold uppercase">360° Terrain Horizon Profile</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Ray Radius: {horizon.radius_km.toFixed(0)} km</span>
        </div>
        <div className="flex items-center space-x-4 text-[11px]">
          <div>
            <span className="text-slate-500 mr-1">MIN HORIZON:</span>
            <span className="text-emerald-400 font-mono font-semibold">{horizon.min_horizon_deg.toFixed(2)}°</span>
          </div>
          <div>
            <span className="text-slate-500 mr-1">MAX PEAK:</span>
            <span className="text-rose-400 font-mono font-semibold">{horizon.max_horizon_deg.toFixed(2)}°</span>
          </div>
          <div>
            <span className="text-slate-500 mr-1">MEAN:</span>
            <span className="text-slate-300 font-mono">{horizon.mean_horizon_deg.toFixed(2)}°</span>
          </div>
        </div>
      </div>

      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        className="w-full"
      />
    </div>
  );
};
