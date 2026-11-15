import React from 'react';
import { Compass, Calendar, Clock, MapPin, Sliders, ChevronDown } from 'lucide-react';
import { LandingSite } from '../types/api';

interface SiteSelectorProps {
  sites: Record<string, LandingSite>;
  selectedSiteKey: string;
  onSelectSiteKey: (key: string) => void;
  currentSite: LandingSite;
  onChangeSite: (site: LandingSite) => void;
  startUtc: string;
  onChangeStartUtc: (utc: string) => void;
  durationDays: number;
  onChangeDurationDays: (days: number) => void;
  stepMinutes: number;
  onChangeStepMinutes: (min: number) => void;
  onRecalculate: () => void;
  loading: boolean;
}

export const SiteSelector: React.FC<SiteSelectorProps> = ({
  sites,
  selectedSiteKey,
  onSelectSiteKey,
  currentSite,
  onChangeSite,
  startUtc,
  onChangeStartUtc,
  durationDays,
  onChangeDurationDays,
  stepMinutes,
  onChangeStepMinutes,
  onRecalculate,
  loading,
}) => {
  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3.5 select-none space-y-3.5">
      <div className="flex items-center justify-between border-b border-space-700/60 pb-2">
        <div className="flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-earth-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            Mission Target & Ephemeris Epoch
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-space-950 border border-space-700 text-slate-400">
          MOON_ME DATUM
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Site Preset Dropdown */}
        <div className="lg:col-span-2 space-y-1">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
            Target Landing Site
          </label>
          <div className="relative">
            <select
              value={selectedSiteKey}
              onChange={(e) => onSelectSiteKey(e.target.value)}
              className="w-full bg-space-950 border border-space-700 text-slate-200 text-xs rounded px-2.5 py-1.5 font-sans focus:outline-none focus:border-earth-500 appearance-none pr-8 cursor-pointer"
            >
              {Object.entries(sites).map(([key, site]) => (
                <option key={key} value={key} className="bg-space-900 text-slate-200">
                  {site.name} ({site.latitude_deg.toFixed(2)}°, {site.longitude_deg.toFixed(2)}°)
                </option>
              ))}
              <option value="custom" className="bg-space-900 text-slate-200">
                Custom Coordinates...
              </option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Start Date / Time */}
        <div className="lg:col-span-2 space-y-1">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block flex items-center space-x-1">
            <Calendar className="w-3 h-3 text-earth-400 inline" />
            <span>Landing Epoch (UTC)</span>
          </label>
          <input
            type="datetime-local"
            value={startUtc.replace('Z', '').slice(0, 16)}
            onChange={(e) => {
              if (e.target.value) {
                onChangeStartUtc(`${e.target.value}:00Z`);
              }
            }}
            className="w-full bg-space-950 border border-space-700 text-slate-200 text-xs rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-earth-500"
          />
        </div>

        {/* Mission Duration */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block flex items-center space-x-1">
            <Clock className="w-3 h-3 text-solar-400 inline" />
            <span>Duration (Days)</span>
          </label>
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            value={durationDays}
            onChange={(e) => onChangeDurationDays(Math.max(1, Math.min(60, Number(e.target.value))))}
            className="w-full bg-space-950 border border-space-700 text-slate-200 text-xs rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-earth-500"
          />
        </div>

        {/* Step Size */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block flex items-center space-x-1">
            <Sliders className="w-3 h-3 text-emerald-400 inline" />
            <span>Resolution (Min)</span>
          </label>
          <select
            value={stepMinutes}
            onChange={(e) => onChangeStepMinutes(Number(e.target.value))}
            className="w-full bg-space-950 border border-space-700 text-slate-200 text-xs rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-earth-500"
          >
            <option value="15">15 min (High Res)</option>
            <option value="30">30 min (Standard)</option>
            <option value="60">60 min (Fast)</option>
            <option value="120">120 min (Overview)</option>
          </select>
        </div>
      </div>

      {/* Target Site Physical Coordinates Strip */}
      <div className="bg-space-950 border border-space-800 rounded p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-slate-400 text-[11px] mr-1">LATITUDE:</span>
            <span className="text-slate-100 font-semibold">{currentSite.latitude_deg.toFixed(4)}° S</span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] mr-1">LONGITUDE:</span>
            <span className="text-slate-100 font-semibold">{currentSite.longitude_deg.toFixed(4)}° E</span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] mr-1">ELEVATION (LOLA):</span>
            <span className="text-slate-100 font-semibold">{currentSite.elevation_m.toFixed(1)} m</span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] mr-1">SLOPE:</span>
            <span className="text-slate-100 font-semibold">{currentSite.slope_deg.toFixed(1)}°</span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] mr-1">ASPECT:</span>
            <span className="text-slate-100 font-semibold">{currentSite.aspect_deg.toFixed(0)}°</span>
          </div>
        </div>

        <button
          onClick={onRecalculate}
          disabled={loading}
          className={`px-4 py-1.5 rounded text-xs font-mono font-semibold transition tracking-wider uppercase ${
            loading
              ? 'bg-space-800 text-slate-500 cursor-not-allowed border border-space-700'
              : 'bg-earth-600 hover:bg-earth-500 text-white shadow-md active:translate-y-0.5'
          }`}
        >
          {loading ? 'CALCULATING EPHEMERIS...' : 'RUN MISSION ANALYSIS'}
        </button>
      </div>
    </div>
  );
};
