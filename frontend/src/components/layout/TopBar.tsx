import React from 'react';
import { SystemHealth } from '../../types/api';
import {
  Calendar,
  Clock,
  Radio,
  Settings,
  ChevronDown,
  Moon,
  Sparkles,
} from 'lucide-react';

interface TopBarProps {
  health: SystemHealth | null;
  utcTime: string;
  startUtc: string;
  onChangeStartUtc: (utc: string) => void;
  activeScenarioName?: string;
  onOpenConfigModal?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  health,
  utcTime,
  startUtc,
  onChangeStartUtc,
  activeScenarioName = 'Artemis IV',
  onOpenConfigModal,
}) => {
  // Format startUtc into readable Date: MMM DD, YYYY and Time: HH:MM UTC
  let formattedDate = 'Feb 12, 2027';
  let formattedTime = '00:00 UTC';
  try {
    const d = new Date(startUtc);
    if (!isNaN(d.getTime())) {
      formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      formattedTime = d.toISOString().slice(11, 16) + ' UTC';
    }
  } catch {
    formattedDate = startUtc.slice(0, 10);
    formattedTime = '00:00 UTC';
  }

  return (
    <header className="h-14 bg-obsidian-950 border-b border-slate-800/90 px-5 flex items-center justify-between z-30 select-none">
      {/* 1. Left: Brand & Tagline */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2.5 cursor-pointer" onClick={onOpenConfigModal}>
          {/* Stylized Lunar Crescent Logo */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500/20 via-slate-900 to-cyan-400/40 border border-cyan-400/50 flex items-center justify-center shadow-cyan-glow relative overflow-hidden">
            <div className="w-5 h-5 rounded-full bg-cyan-400 absolute -top-0.5 -right-0.5" />
            <div className="w-4 h-4 rounded-full bg-obsidian-950 absolute top-0.5 right-0.5" />
          </div>

          <div>
            <div className="font-mono font-black text-sm tracking-widest text-white flex items-center space-x-1.5">
              <span>LUNAR EDGE</span>
            </div>
            <div className="text-[10px] font-sans tracking-tight text-slate-400">
              Explore • Analyze • Land
            </div>
          </div>
        </div>
      </div>

      {/* 2. Center: Mission, Date, and Time Selectors */}
      <div className="flex items-center space-x-3 font-mono text-xs">
        {/* Mission Dropdown / Modal Trigger */}
        <button
          onClick={onOpenConfigModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-obsidian-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-200 transition-all shadow-aerospace"
        >
          <div className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          </div>
          <span className="text-slate-400">Mission:</span>
          <span className="text-white font-bold">{activeScenarioName}</span>
          <ChevronDown className="w-3 h-3 text-slate-500 ml-0.5" />
        </button>

        {/* Date Selector */}
        <button
          onClick={onOpenConfigModal}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-obsidian-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-200 transition-all shadow-aerospace"
        >
          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Date:</span>
          <span className="text-white font-semibold">{formattedDate}</span>
          <ChevronDown className="w-3 h-3 text-slate-500 ml-0.5" />
        </button>

        {/* Time Selector */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-obsidian-900/90 border border-slate-800 text-slate-200 shadow-aerospace">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Time:</span>
          <span className="text-white font-semibold">{utcTime} UTC</span>
        </div>
      </div>

      {/* 3. Right: Scientific Provenance Badge & NASA Meatball Emblem */}
      <div className="flex items-center space-x-4">
        {/* SPICE & LOLA Health Pill */}
        <div
          className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-[11px] font-mono backdrop-blur-md ${
            health?.spice_kernels_loaded && health?.dem_file_exists
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
          title="Telemetry connected to NASA SPICE DE440s ephemerides & LOLA 80m South Pole DEM"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold tracking-wide">SPICE | LOLA 80m DEM</span>
          <span className="text-emerald-400 text-xs">✓</span>
        </div>

        {/* NASA Official Blue Insignia Meatball Emblem */}
        <div
          className="w-8 h-8 rounded-full bg-[#0b3d91] border border-blue-400/40 flex items-center justify-center shadow-lg relative overflow-hidden flex-shrink-0 cursor-pointer"
          title="NASA Space Apps Challenge 2026: Lunar Landing Site Navigator"
        >
          <span className="font-serif font-black text-white text-[9px] tracking-tighter z-10">NASA</span>
          {/* Subtle red chevron across NASA meatball */}
          <div className="absolute w-8 h-1 bg-[#fc3d21] rotate-45 transform -translate-y-0.5 opacity-90" />
          {/* Orbit vector ring */}
          <div className="absolute w-7 h-3 rounded-full border border-white/60 rotate-[20deg]" />
        </div>
      </div>
    </header>
  );
};
