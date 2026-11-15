import React from 'react';
import { LunarGlobeCanvas } from '../3d/LunarGlobeCanvas';
import { LandingSite, LayerSettings, DiscoveredCandidate } from '../../types/api';
import { Compass, Eye, ShieldCheck, MapPin } from 'lucide-react';

interface MissionExplorerWorkspaceProps {
  sites: Record<string, LandingSite>;
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  currentSite: LandingSite;
  onCoordinatesClick?: (lat: number, lon: number) => void;
  layers: LayerSettings;
  onToggleLayer: (layer: keyof LayerSettings) => void;
  highlightAzimuth?: number | null;
  discoveredCandidates?: DiscoveredCandidate[];
  epochGeometry?: any | null;
}

export const MissionExplorerWorkspace: React.FC<MissionExplorerWorkspaceProps> = ({
  sites,
  selectedSiteKey,
  onSelectSite,
  currentSite,
  onCoordinatesClick,
  layers,
  onToggleLayer,
  highlightAzimuth,
  discoveredCandidates,
  epochGeometry,
}) => {
  return (
    <div className="relative w-full h-full flex flex-col bg-obsidian-950 overflow-hidden">
      {/* 3D Lunar Visualization Centerpiece */}
      <div className="flex-1 w-full h-full relative">
        <LunarGlobeCanvas
          sites={sites}
          selectedSiteKey={selectedSiteKey}
          onSelectSite={onSelectSite}
          currentSite={currentSite}
          onCoordinatesClick={onCoordinatesClick}
          layers={layers}
          onToggleLayer={onToggleLayer}
          highlightAzimuth={highlightAzimuth}
          discoveredCandidates={discoveredCandidates}
          epochGeometry={epochGeometry}
        />

        {/* Candidate Selector Quick Strip at Bottom of 3D Canvas */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-1 bg-obsidian-900/90 border border-slate-800/90 rounded-full px-2 py-1 backdrop-blur-md shadow-aerospace text-xs font-mono max-w-[90vw] overflow-x-auto">
          <span className="text-[10px] text-slate-500 font-bold px-2 flex items-center space-x-1 flex-shrink-0">
            <MapPin className="w-3 h-3 text-cyan-400" />
            <span>CANDIDATES:</span>
          </span>
          {(discoveredCandidates && discoveredCandidates.length > 0
            ? discoveredCandidates.map((c) => ({
                key: c.key,
                name: c.name,
                status: c.classification,
              }))
            : Object.entries(sites).map(([k, s]) => ({
                key: k,
                name: s.name,
                status: undefined,
              }))
          ).map((item) => {
            const isSelected = item.key === selectedSiteKey;
            return (
              <button
                key={item.key}
                onClick={() => onSelectSite(item.key)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center space-x-1.5 flex-shrink-0 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-glow font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {item.status && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.status === 'Screening-viable'
                        ? 'bg-cyan-400'
                        : item.status === 'Conditional'
                        ? 'bg-amber-400'
                        : item.status === 'Infeasible'
                        ? 'bg-red-400'
                        : 'bg-slate-400'
                    }`}
                  />
                )}
                <span>{item.name.split('/')[0].trim()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
