import React, { useState } from 'react';
import {
  MissionRequirements,
  GeographicBounds,
} from '../../types/api';
import {
  Settings,
  X,
  Compass,
  Calendar,
  Clock,
  Sliders,
  ShieldCheck,
  Sun,
  Radio,
  Mountain,
  Zap,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';

interface MissionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  missionName: string;
  onChangeMissionName: (name: string) => void;
  missionType: string;
  onChangeMissionType: (type: string) => void;
  targetRegion: string;
  onChangeTargetRegion: (region: string) => void;
  bounds: GeographicBounds | null;
  onChangeBounds: (bounds: GeographicBounds | null) => void;
  startUtc: string;
  onChangeStartUtc: (utc: string) => void;
  durationDays: number;
  onChangeDurationDays: (days: number) => void;
  requirements: MissionRequirements;
  onChangeRequirements: (reqs: MissionRequirements) => void;
  maxSlopeDeg: number;
  onChangeMaxSlopeDeg: (deg: number) => void;
  onRunDiscovery: () => void;
  isDiscovering: boolean;
  lastClickedCoord?: { lat: number; lon: number } | null;
}

export const MissionConfigModal: React.FC<MissionConfigModalProps> = ({
  isOpen,
  onClose,
  missionName,
  onChangeMissionName,
  missionType,
  onChangeMissionType,
  targetRegion,
  onChangeTargetRegion,
  bounds,
  onChangeBounds,
  startUtc,
  onChangeStartUtc,
  durationDays,
  onChangeDurationDays,
  requirements,
  onChangeRequirements,
  maxSlopeDeg,
  onChangeMaxSlopeDeg,
  onRunDiscovery,
  isDiscovering,
  lastClickedCoord,
}) => {
  const [activeTab, setActiveTab] = useState<'definition' | 'search' | 'constraints'>('definition');

  if (!isOpen) return null;

  const handleSetCustomBboxFromCoord = () => {
    if (lastClickedCoord) {
      const lat = lastClickedCoord.lat;
      const lon = lastClickedCoord.lon;
      onChangeTargetRegion('custom_bbox');
      onChangeBounds({
        lat_min: Math.max(-90.0, lat - 0.5),
        lat_max: Math.min(-80.0, lat + 0.5),
        lon_min: Math.max(-180.0, lon - 5.0),
        lon_max: Math.min(180.0, lon + 5.0),
      });
    }
  };

  const handleResetDefaults = () => {
    onChangeMissionName('Artemis Polar Mission');
    onChangeMissionType('Crewed Lander');
    onChangeTargetRegion('south_pole_all');
    onChangeBounds(null);
    onChangeStartUtc('2026-07-01T00:00:00Z');
    onChangeDurationDays(14);
    onChangeMaxSlopeDeg(10.0);
    onChangeRequirements({
      min_continuous_sunlight_hours: 72.0,
      max_tolerable_dark_hours: 48.0,
      min_continuous_earth_comms_hours: 24.0,
      min_simultaneous_operating_hours: 24.0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="bg-graphite-900 border border-slate-700/80 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-obsidian-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wide uppercase">
                Mission Configuration & Opportunity Discovery Parameters
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Configure mission objectives, geographic search boundaries, and operational constraints for autonomous evaluation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-obsidian-950/40 px-6">
          <button
            onClick={() => setActiveTab('definition')}
            className={`py-2.5 px-4 text-xs font-mono font-semibold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'definition'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>1. MISSION DEFINITION</span>
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2.5 px-4 text-xs font-mono font-semibold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'search'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>2. GEOGRAPHIC SEARCH</span>
          </button>
          <button
            onClick={() => setActiveTab('constraints')}
            className={`py-2.5 px-4 text-xs font-mono font-semibold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'constraints'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>3. OPERATIONAL CONSTRAINTS</span>
          </button>
        </div>

        {/* Modal Body / Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 font-mono text-xs">
          {/* TAB 1: MISSION DEFINITION */}
          {activeTab === 'definition' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-semibold">Mission Designation:</label>
                  <input
                    type="text"
                    value={missionName}
                    onChange={(e) => onChangeMissionName(e.target.value)}
                    className="w-full bg-obsidian-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g. Artemis Polar Expedition"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Identifier for tracking scenario results</span>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-semibold">Mission Architecture / Type:</label>
                  <select
                    value={missionType}
                    onChange={(e) => onChangeMissionType(e.target.value)}
                    className="w-full bg-obsidian-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="Crewed Lander">Crewed Lunar Lander (Artemis III Class)</option>
                    <option value="Robotic Rover">Robotic Surface Rover (VIPER Class)</option>
                    <option value="Science Outpost">Surface Habitat / Fixed Science Station</option>
                    <option value="ISRU Pilot Plant">Volatile Cold-Trap ISRU Facility</option>
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">Influences default battery and comms tolerances</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-semibold flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Mission Start Epoch (UTC ISO):</span>
                  </label>
                  <input
                    type="text"
                    value={startUtc}
                    onChange={(e) => onChangeStartUtc(e.target.value)}
                    className="w-full bg-obsidian-950 border border-slate-700 rounded px-3 py-1.5 text-amber-300 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Format: YYYY-MM-DDTHH:MM:SSZ</span>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-semibold flex items-center space-x-1">
                    <Calendar className="w-3 h-3 text-cyan-400" />
                    <span>Analysis Duration (Days):</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={durationDays}
                      onChange={(e) => onChangeDurationDays(Math.max(1, Math.min(60, Number(e.target.value))))}
                      className="w-24 bg-obsidian-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                    />
                    <span className="text-slate-400 text-xs">days ({durationDays * 24} hours)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Standard lunar day synodic cycle is ~29.5 days</span>
                </div>
              </div>

              {/* Quick Epoch Season Presets */}
              <div className="p-3 bg-obsidian-950/60 rounded border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                  Recommended Epoch Presets (Subsolar Latitude Alignment):
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onChangeStartUtc('2026-01-15T00:00:00Z')}
                    className="px-2.5 py-1 bg-graphite-800 hover:bg-graphite-700 text-slate-200 rounded text-[11px] border border-slate-700"
                  >
                    Jan 2026 (South Summer Solstice / Peak Polar Light)
                  </button>
                  <button
                    onClick={() => onChangeStartUtc('2026-07-01T00:00:00Z')}
                    className="px-2.5 py-1 bg-graphite-800 hover:bg-graphite-700 text-slate-200 rounded text-[11px] border border-slate-700"
                  >
                    Jul 2026 (South Winter Low / Stress Test)
                  </button>
                  <button
                    onClick={() => onChangeStartUtc('2026-10-15T00:00:00Z')}
                    className="px-2.5 py-1 bg-graphite-800 hover:bg-graphite-700 text-slate-200 rounded text-[11px] border border-slate-700"
                  >
                    Oct 2026 (Nominal Artemis Window)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GEOGRAPHIC SEARCH */}
          {activeTab === 'search' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="text-[11px] text-slate-300 block mb-1 font-semibold">Target Lunar Region / Filter:</label>
                <select
                  value={targetRegion}
                  onChange={(e) => {
                    onChangeTargetRegion(e.target.value);
                    if (e.target.value !== 'custom_bbox') {
                      onChangeBounds(null);
                    } else if (!bounds) {
                      onChangeBounds({ lat_min: -90.0, lat_max: -80.0, lon_min: -180.0, lon_max: 180.0 });
                    }
                  }}
                  className="w-full bg-obsidian-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                >
                  <option value="south_pole_all">All South Polar Candidate Regions (80°S – 90°S)</option>
                  <option value="shackleton_connecting_ridge">Shackleton / Connecting Ridge Sector</option>
                  <option value="nobile_region">Nobile Crater Massif & Plateau</option>
                  <option value="deep_polar">Ultra-Deep Polar Highs (&lt; 87°S)</option>
                  <option value="custom_bbox">Custom Selenographic Bounding Box</option>
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  LOLA 80m DEM coverage extends from -80.0°S to the pole (-90.0°S).
                </span>
              </div>

              {/* Custom Bounding Box Inputs */}
              {targetRegion === 'custom_bbox' && (
                <div className="p-3 bg-obsidian-950 border border-slate-800 rounded space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase">Custom Selenographic Bounds (Deg):</span>
                    {lastClickedCoord && (
                      <button
                        onClick={handleSetCustomBboxFromCoord}
                        className="px-2 py-0.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 rounded text-[10px]"
                      >
                        Center on Clicked Point ({lastClickedCoord.lat.toFixed(2)}°S, {lastClickedCoord.lon.toFixed(2)}°E)
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Min Lat (°S):</label>
                      <input
                        type="number"
                        step={0.1}
                        min={-90.0}
                        max={-80.0}
                        value={bounds?.lat_min ?? -90.0}
                        onChange={(e) =>
                          onChangeBounds({
                            lat_min: Number(e.target.value),
                            lat_max: bounds?.lat_max ?? -80.0,
                            lon_min: bounds?.lon_min ?? -180.0,
                            lon_max: bounds?.lon_max ?? 180.0,
                          })
                        }
                        className="w-full bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Max Lat (°S):</label>
                      <input
                        type="number"
                        step={0.1}
                        min={-90.0}
                        max={-80.0}
                        value={bounds?.lat_max ?? -80.0}
                        onChange={(e) =>
                          onChangeBounds({
                            lat_min: bounds?.lat_min ?? -90.0,
                            lat_max: Number(e.target.value),
                            lon_min: bounds?.lon_min ?? -180.0,
                            lon_max: bounds?.lon_max ?? 180.0,
                          })
                        }
                        className="w-full bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Min Lon (°E):</label>
                      <input
                        type="number"
                        step={1.0}
                        min={-180.0}
                        max={180.0}
                        value={bounds?.lon_min ?? -180.0}
                        onChange={(e) =>
                          onChangeBounds({
                            lat_min: bounds?.lat_min ?? -90.0,
                            lat_max: bounds?.lat_max ?? -80.0,
                            lon_min: Number(e.target.value),
                            lon_max: bounds?.lon_max ?? 180.0,
                          })
                        }
                        className="w-full bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Max Lon (°E):</label>
                      <input
                        type="number"
                        step={1.0}
                        min={-180.0}
                        max={180.0}
                        value={bounds?.lon_max ?? 180.0}
                        onChange={(e) =>
                          onChangeBounds({
                            lat_min: bounds?.lat_min ?? -90.0,
                            lat_max: bounds?.lat_max ?? -80.0,
                            lon_min: bounds?.lon_min ?? -180.0,
                            lon_max: Number(e.target.value),
                          })
                        }
                        className="w-full bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Regional Terrain Notice */}
              <div className="p-3 bg-obsidian-950/80 border border-slate-800 rounded flex items-start space-x-2 text-slate-400 text-[11px]">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <p>
                  <strong>Scientific Resolution Notice:</strong> LOLA 80m DEM data supports regional opportunity screening and horizon obstruction profiles. Sub-pixel micro-topography (boulders &lt; 80m) requires narrow-angle camera (LROC NAC) verification.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: OPERATIONAL CONSTRAINTS */}
          {activeTab === 'constraints' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sunlight Requirement */}
                <div className="p-3 bg-obsidian-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold">
                    <Sun className="w-4 h-4" />
                    <span>Min Continuous Sunlight Window:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={requirements.min_continuous_sunlight_hours}
                      onChange={(e) =>
                        onChangeRequirements({
                          ...requirements,
                          min_continuous_sunlight_hours: Number(e.target.value),
                        })
                      }
                      className="w-24 bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                    />
                    <span className="text-slate-400 text-xs">hours ({requirements.min_continuous_sunlight_hours / 24} days)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Uninterrupted daylight window required for surface solar arrays.
                  </span>
                </div>

                {/* Darkness Limit */}
                <div className="p-3 bg-obsidian-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center space-x-2 text-red-400 font-bold">
                    <Zap className="w-4 h-4" />
                    <span>Max Tolerable Continuous Darkness:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={requirements.max_tolerable_dark_hours}
                      onChange={(e) =>
                        onChangeRequirements({
                          ...requirements,
                          max_tolerable_dark_hours: Number(e.target.value),
                        })
                      }
                      className="w-24 bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                    />
                    <span className="text-slate-400 text-xs">hours (Battery Limit)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Maximum time lander can survive on internal battery without freezing.
                  </span>
                </div>

                {/* Earth Communication Requirement */}
                <div className="p-3 bg-obsidian-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                    <Radio className="w-4 h-4" />
                    <span>Min Continuous Earth Comms Window:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={requirements.min_continuous_earth_comms_hours}
                      onChange={(e) =>
                        onChangeRequirements({
                          ...requirements,
                          min_continuous_earth_comms_hours: Number(e.target.value),
                        })
                      }
                      className="w-24 bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                    />
                    <span className="text-slate-400 text-xs">hours</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Direct-to-Earth line-of-sight clearance above terrain (Set 0h if relay available).
                  </span>
                </div>

                {/* Terrain Slope Limit */}
                <div className="p-3 bg-obsidian-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                    <Mountain className="w-4 h-4" />
                    <span>Maximum Permitted Terrain Slope:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={1}
                      max={35}
                      step={0.5}
                      value={maxSlopeDeg}
                      onChange={(e) => onChangeMaxSlopeDeg(Number(e.target.value))}
                      className="w-24 bg-graphite-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                    />
                    <span className="text-slate-400 text-xs">degrees</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Lander stability tip-over threshold (Artemis Human Landing System limit ~8-12°).
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Scenario Summary Card */}
          <div className="p-3 bg-obsidian-950/90 rounded border border-slate-800 flex items-center justify-between text-[11px]">
            <div className="space-y-0.5">
              <span className="text-slate-400 font-semibold block">ACTIVE SCENARIO SUMMARY:</span>
              <span className="text-slate-200">
                {missionName} • {targetRegion.toUpperCase()} • Epoch: {startUtc.slice(0, 10)} ({durationDays}d) • Sun Req: ≥{requirements.min_continuous_sunlight_hours}h • Dark Tol: ≤{requirements.max_tolerable_dark_hours}h • Slope: ≤{maxSlopeDeg}°
              </span>
            </div>
            <button
              onClick={handleResetDefaults}
              className="text-slate-400 hover:text-slate-200 flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-800 transition"
              title="Reset parameters to NASA Artemis III baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Defaults</span>
            </button>
          </div>
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="px-6 py-4 border-t border-slate-800 bg-obsidian-900/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono bg-graphite-800 hover:bg-graphite-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Close & Review
          </button>

          <button
            onClick={onRunDiscovery}
            disabled={isDiscovering}
            className="px-5 py-2 text-xs font-mono font-bold bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-obsidian-950 rounded shadow-cyan-glow transition flex items-center space-x-2 disabled:opacity-50"
          >
            {isDiscovering ? (
              <>
                <div className="w-4 h-4 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
                <span>EVALUATING DEM & SPICE EPHEMERIDES...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-obsidian-950" />
                <span>DISCOVER LANDING OPPORTUNITIES</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
