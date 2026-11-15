import React, { useState } from 'react';
import {
  VisibilityTimeSeriesResponse,
  DiscoveredCandidate,
  LandingSite,
} from '../../types/api';
import {
  Sun,
  Radio,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
  Layers,
  ChevronDown,
} from 'lucide-react';

interface TimelineDockProps {
  visibility: VisibilityTimeSeriesResponse | null;
  discoveredCandidates: DiscoveredCandidate[];
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  onProceedToAnalysis: () => void;
  currentSite: LandingSite;
}

export const TimelineDock: React.FC<TimelineDockProps> = ({
  visibility,
  discoveredCandidates,
  selectedSiteKey,
  onSelectSite,
  onProceedToAnalysis,
  currentSite,
}) => {
  const [activeMetricView, setActiveMetricView] = useState<'key_metrics' | 'coverage'>('key_metrics');

  const summary = visibility?.summary;
  const samples = visibility?.samples || [];

  // Identify recommended (highest-scoring viable) candidate
  const viableCandidates = discoveredCandidates.filter((c) => c.classification === 'Screening-viable');
  const recommendedCandidate =
    viableCandidates.length > 0
      ? viableCandidates[0]
      : discoveredCandidates.length > 0
      ? discoveredCandidates[0]
      : null;

  // Build timeline blocks (downsampled for crisp rendering across 24h or total duration)
  const totalHours = summary?.duration_days ? summary.duration_days * 24 : 336;
  const displayHours = Math.min(48, totalHours); // Display first 48h or scaled

  // Generate hourly blocks for Illumination & Earth visibility
  const stepHours = summary?.step_minutes ? summary.step_minutes / 60 : 1;
  const maxSamplesToRender = Math.min(samples.length, Math.round(displayHours / stepHours));
  const renderSamples = samples.slice(0, maxSamplesToRender);

  // Candidates for comparison chart (take up to 3 candidates)
  const compCandidates = discoveredCandidates.slice(0, 3);
  const candColors = ['#00e5ff', '#f59e0b', '#a855f7'];

  return (
    <footer className="h-44 bg-obsidian-950/95 border-t border-slate-800/90 px-4 py-2.5 flex items-stretch gap-4 z-20 select-none text-xs font-mono backdrop-blur-md">
      {/* 1. LEFT PANEL: Candidate Comparison Grouped Bar Chart */}
      <div className="w-80 bg-obsidian-900/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between shadow-aerospace">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <div className="flex items-center space-x-1.5 text-slate-200 font-bold text-[11px]">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Candidate Comparison</span>
          </div>
          <div className="flex items-center space-x-1 text-[10px] text-slate-400 bg-graphite-900 px-2 py-0.5 rounded border border-slate-800">
            <span>Key Metrics</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </div>
        </div>

        {/* Comparison Legend */}
        {compCandidates.length > 0 && (
          <div className="flex items-center space-x-3 text-[10px] py-1 overflow-x-auto">
            {compCandidates.map((cand, idx) => (
              <button
                key={cand.key}
                onClick={() => onSelectSite(cand.key)}
                className={`flex items-center space-x-1 transition ${
                  cand.key === selectedSiteKey ? 'font-bold text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: candColors[idx % candColors.length] }}
                />
                <span className="truncate max-w-[70px]">{cand.name.split('/')[0].trim()}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mini Grouped Bars */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-[9px] text-center text-slate-400">
          {/* Sunlight Avail */}
          <div className="flex flex-col items-center">
            <div className="w-full h-12 flex items-end justify-center space-x-1 bg-obsidian-950/80 rounded p-1">
              {compCandidates.map((c, i) => (
                <div
                  key={c.key}
                  className="w-2 rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, (c.sunlight_percentage / 100) * 40)}px`,
                    backgroundColor: candColors[i],
                  }}
                  title={`${c.name}: ${c.sunlight_percentage}% Sunlight`}
                />
              ))}
            </div>
            <span className="mt-1 leading-tight text-slate-400">Sunlight Avail.</span>
          </div>

          {/* Earth Visibility */}
          <div className="flex flex-col items-center">
            <div className="w-full h-12 flex items-end justify-center space-x-1 bg-obsidian-950/80 rounded p-1">
              {compCandidates.map((c, i) => {
                const commPct = Math.min(100, Math.round((c.longest_comms_window_hours / (14 * 24)) * 100));
                return (
                  <div
                    key={c.key}
                    className="w-2 rounded-t transition-all"
                    style={{
                      height: `${Math.max(4, (commPct / 100) * 40)}px`,
                      backgroundColor: candColors[i],
                    }}
                    title={`${c.name}: ${commPct}% Earth Visibility`}
                  />
                );
              })}
            </div>
            <span className="mt-1 leading-tight text-slate-400">Earth Visibility</span>
          </div>

          {/* Terrain Slope */}
          <div className="flex flex-col items-center">
            <div className="w-full h-12 flex items-end justify-center space-x-1 bg-obsidian-950/80 rounded p-1">
              {compCandidates.map((c, i) => (
                <div
                  key={c.key}
                  className="w-2 rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, (1.0 - c.slope_deg / 15.0) * 40)}px`,
                    backgroundColor: candColors[i],
                  }}
                  title={`${c.name}: Slope ${c.slope_deg}°`}
                />
              ))}
            </div>
            <span className="mt-1 leading-tight text-slate-400">Terrain Slope</span>
          </div>

          {/* Mission Coverage */}
          <div className="flex flex-col items-center">
            <div className="w-full h-12 flex items-end justify-center space-x-1 bg-obsidian-950/80 rounded p-1">
              {compCandidates.map((c, i) => (
                <div
                  key={c.key}
                  className="w-2 rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, (c.composite_score / 100) * 40)}px`,
                    backgroundColor: candColors[i],
                  }}
                  title={`${c.name}: Composite Score ${c.composite_score}/100`}
                />
              ))}
            </div>
            <span className="mt-1 leading-tight text-slate-400">Mission Coverage</span>
          </div>
        </div>
      </div>

      {/* 2. CENTER PANEL: Dual Operational Timelines (Illumination & Earth Visibility) */}
      <div className="flex-1 bg-obsidian-900/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between shadow-aerospace">
        {/* Track 1: Illumination Timeline */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2 text-slate-200 font-bold">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Illumination Timeline</span>
            </div>
            <div className="flex items-center space-x-3 text-[10px] text-slate-400">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Sunlight</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-slate-700" />
                <span>Shadow</span>
              </span>
            </div>
          </div>

          {/* Horizontal Illumination Bar Strip */}
          <div className="w-full h-5 bg-graphite-950 rounded overflow-hidden flex border border-slate-800">
            {renderSamples.length > 0 ? (
              renderSamples.map((s, idx) => (
                <div
                  key={idx}
                  className="flex-1 h-full transition-colors"
                  style={{
                    backgroundColor: s.is_sunlit
                      ? '#f59e0b'
                      : s.is_sun_partial
                      ? 'rgba(245, 158, 11, 0.45)'
                      : '#1e293b',
                  }}
                  title={`${s.utc}: ${s.is_sunlit ? '100% Sunlit' : s.is_sun_partial ? 'Partial' : 'Shadow'}`}
                />
              ))
            ) : (
              <div className="w-full h-full bg-slate-800/40 flex items-center justify-center text-[10px] text-slate-500">
                Awaiting Solar Visibility Evaluation
              </div>
            )}
          </div>

          {/* Timeline Hour Scale */}
          <div className="flex justify-between text-[9px] text-slate-500 px-0.5">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
            <span>36h</span>
            <span>48h</span>
          </div>
        </div>

        {/* Track 2: Earth Visibility Timeline */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2 text-slate-200 font-bold">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>Earth Visibility</span>
            </div>
            <div className="flex items-center space-x-3 text-[10px] text-slate-400">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Visible</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-slate-700" />
                <span>Not Visible</span>
              </span>
            </div>
          </div>

          {/* Horizontal Earth Visibility Bar Strip */}
          <div className="w-full h-5 bg-graphite-950 rounded overflow-hidden flex border border-slate-800">
            {renderSamples.length > 0 ? (
              renderSamples.map((s, idx) => (
                <div
                  key={idx}
                  className="flex-1 h-full transition-colors"
                  style={{
                    backgroundColor: s.is_earth_visible ? '#00e5ff' : '#1e293b',
                  }}
                  title={`${s.utc}: ${s.is_earth_visible ? 'Direct Earth Line of Sight' : 'Obstructed'}`}
                />
              ))
            ) : (
              <div className="w-full h-full bg-slate-800/40 flex items-center justify-center text-[10px] text-slate-500">
                Awaiting Earth Communication Analysis
              </div>
            )}
          </div>

          {/* Timeline Hour Scale */}
          <div className="flex justify-between text-[9px] text-slate-500 px-0.5">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
            <span>36h</span>
            <span>48h</span>
          </div>
        </div>
      </div>

      {/* 3. RIGHT PANEL: Mission Summary Card & Proceed Action */}
      <div className="w-88 bg-obsidian-900/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between shadow-aerospace relative overflow-hidden">
        {/* Subtle decorative Earth & Lander illustration */}
        <div className="absolute right-2 top-4 w-28 h-24 pointer-events-none opacity-40 flex items-center justify-center">
          <svg viewBox="0 0 120 100" className="w-full h-full">
            {/* Distant Earth with blue atmosphere glow */}
            <circle cx="95" cy="25" r="14" fill="#1e3a8a" />
            <circle cx="95" cy="25" r="14" fill="url(#earthGlow)" opacity="0.8" />
            <path d="M 86 22 Q 92 16 98 21 Q 102 26 95 33 Q 88 30 86 22 Z" fill="#22c55e" opacity="0.7" />
            <path d="M 94 32 Q 99 35 104 31 Q 101 24 97 27 Z" fill="#22c55e" opacity="0.6" />
            <circle cx="95" cy="25" r="14" fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.8" />

            {/* Lunar surface curve */}
            <path d="M 20 85 Q 70 82 120 88 L 120 100 L 20 100 Z" fill="#334155" opacity="0.5" />

            {/* Lunar Lander Silhouette (Artemis HLS / Apollo Descent Stage) */}
            {/* Descent Stage Body */}
            <rect x="52" y="58" width="22" height="14" rx="2" fill="#d97706" opacity="0.9" />
            {/* Ascent Stage / Crew Cabin */}
            <path d="M 55 58 L 59 48 L 67 48 L 71 58 Z" fill="#cbd5e1" opacity="0.9" />
            {/* Cabin Window */}
            <polygon points="61,51 65,51 64,54 62,54" fill="#0284c7" />
            {/* Antenna */}
            <line x1="63" y1="48" x2="63" y2="42" stroke="#94a3b8" strokeWidth="1.5" />
            <circle cx="63" cy="41" r="1.5" fill="#38bdf8" />
            {/* Landing Legs */}
            <line x1="52" y1="65" x2="42" y2="82" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="74" y1="65" x2="84" y2="82" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="58" y1="72" x2="52" y2="83" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="68" y1="72" x2="74" y2="83" stroke="#94a3b8" strokeWidth="1.5" />
            {/* Footpads */}
            <ellipse cx="41" cy="83" rx="3" ry="1" fill="#64748b" />
            <ellipse cx="85" cy="83" rx="3" ry="1" fill="#64748b" />
            <ellipse cx="51" cy="84" rx="2.5" ry="1" fill="#64748b" />
            <ellipse cx="75" cy="84" rx="2.5" ry="1" fill="#64748b" />

            <defs>
              <radialGradient id="earthGlow" cx="40%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#1d4ed8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.1" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-[11px] pb-1.5 border-b border-slate-800">
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Mission Summary</span>
          </div>

          <div className="space-y-1.5 pt-2 text-[11px]">
            <div className="flex items-center space-x-2 text-slate-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>Optimal Landing Region Found</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>Confidence Level: <strong className="text-white ml-1">High</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300 truncate pr-8">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span className="truncate">
                Recommended: <strong className="text-amber-300 ml-1">{recommendedCandidate ? recommendedCandidate.name.split('/')[0].trim() : 'South Polar Zone'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Primary CTA Button */}
        <button
          onClick={onProceedToAnalysis}
          className="relative z-10 w-full py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-obsidian-950 font-bold rounded-lg transition-all shadow-cyan-glow flex items-center justify-center space-x-2 text-xs cursor-pointer mt-2"
        >
          <span>Proceed to Analysis</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
};
