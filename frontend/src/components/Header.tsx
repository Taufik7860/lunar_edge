import React from 'react';
import { Activity, Database, Satellite, Compass, Moon } from 'lucide-react';
import { SystemHealth } from '../types/api';

interface HeaderProps {
  health: SystemHealth | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  utcTime: string;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  activeTab,
  setActiveTab,
  utcTime,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'OPERATIONS CONSOLE' },
    { id: 'horizon', label: 'TERRAIN HORIZON' },
    { id: 'timeline', label: 'VISIBILITY TIMELINE' },
    { id: 'continuity', label: 'CONTINUITY ENVELOPE' },
    { id: 'comparison', label: 'SITE COMPARISON' },
  ];

  return (
    <header className="border-b border-space-700 bg-space-900/95 backdrop-blur px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 select-none">
      {/* Brand & System Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded bg-earth-600/20 border border-earth-500/40 flex items-center justify-center text-earth-400 shadow-inner">
          <Moon className="w-5 h-5 text-earth-400" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-wider text-base text-slate-100 font-mono">
              LUNAR EDGE
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest bg-earth-500/20 text-earth-400 border border-earth-500/30">
              NASA SPICE + LOLA
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans tracking-wide">
            Lunar South-Pole Mission Opportunity & Constraint Analysis System
          </p>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav className="flex items-center bg-space-950 p-1 rounded border border-space-700/80">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-earth-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Telemetry Status Bar */}
      <div className="flex items-center space-x-3 text-xs font-mono">
        {/* SPICE Kernel Indicator */}
        <div className="flex items-center space-x-1.5 bg-space-950 px-2.5 py-1 rounded border border-space-700">
          <Satellite className="w-3.5 h-3.5 text-earth-400" />
          <span className="text-slate-400 text-[11px]">SPICE:</span>
          <span className={`text-[11px] font-semibold ${health?.spice_kernels_loaded ? 'text-emerald-400' : 'text-amber-400'}`}>
            {health?.spice_kernels_loaded ? `${health.spice_kernel_count} KERNELS (DE440s)` : 'STANDBY'}
          </span>
        </div>

        {/* DEM Indicator */}
        <div className="flex items-center space-x-1.5 bg-space-950 px-2.5 py-1 rounded border border-space-700">
          <Database className="w-3.5 h-3.5 text-solar-400" />
          <span className="text-slate-400 text-[11px]">DEM:</span>
          <span className={`text-[11px] font-semibold ${health?.dem_file_exists ? 'text-emerald-400' : 'text-rose-400'}`}>
            {health?.dem_file_exists ? 'LOLA 80M/PX' : 'UNAVAILABLE'}
          </span>
        </div>

        {/* Clock */}
        <div className="flex items-center space-x-1.5 bg-space-950 px-2.5 py-1 rounded border border-space-700">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-slate-400 text-[11px]">UTC:</span>
          <span className="text-slate-200 text-[11px] font-mono">
            {utcTime}
          </span>
        </div>
      </div>
    </header>
  );
};
