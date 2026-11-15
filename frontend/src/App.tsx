import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { TopBar } from './components/layout/TopBar';
import { WorkflowStepper } from './components/layout/WorkflowStepper';
import { SidebarNav } from './components/layout/SidebarNav';
import { RightInspector } from './components/layout/RightInspector';
import { TimelineDock } from './components/layout/TimelineDock';
import { MissionExplorerWorkspace } from './components/workspaces/MissionExplorerWorkspace';
import { OpportunityDiscoveryWorkspace } from './components/workspaces/OpportunityDiscoveryWorkspace';
import { CandidateIntelligenceWorkspace } from './components/workspaces/CandidateIntelligenceWorkspace';
import { MissionResilienceWorkspace } from './components/workspaces/MissionResilienceWorkspace';
import { MissionRecoveryWorkspace } from './components/workspaces/MissionRecoveryWorkspace';
import { MissionConfigModal } from './components/panels/MissionConfigModal';
import { api } from './services/api';
import {
  LandingSite,
  HorizonProfile,
  VisibilityTimeSeriesResponse,
  ContinuityEnvelopeResult,
  MissionRequirements,
  SystemHealth,
  EpochGeometry,
  WorkspaceId,
  LayerSettings,
  GeographicBounds,
  DiscoveredCandidate,
  OpportunityDiscoveryResponse,
} from './types/api';
import { AlertTriangle, Compass } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Active Workspace
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('explorer');
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  // Mission Configuration State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [missionName, setMissionName] = useState<string>('Artemis Polar Mission');
  const [missionType, setMissionType] = useState<string>('Crewed Lander');
  const [targetRegion, setTargetRegion] = useState<string>('south_pole_all');
  const [bounds, setBounds] = useState<GeographicBounds | null>(null);
  const [maxSlopeDeg, setMaxSlopeDeg] = useState<number>(10.0);
  const [lastClickedCoord, setLastClickedCoord] = useState<{ lat: number; lon: number } | null>(null);

  // System & Sites state
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [sites, setSites] = useState<Record<string, LandingSite>>({});
  const [selectedSiteKey, setSelectedSiteKey] = useState<string>('shackleton_connecting_ridge');
  const [currentSite, setCurrentSite] = useState<LandingSite>({
    name: 'Peak Near Shackleton / Connecting Ridge',
    latitude_deg: -89.7,
    longitude_deg: -129.0,
    elevation_m: 1293.8,
    slope_deg: 5.0,
    aspect_deg: 130.0,
  });

  // Analysis Parameters
  const [startUtc, setStartUtc] = useState<string>('2026-07-01T00:00:00Z');
  const [durationDays, setDurationDays] = useState<number>(14);
  const [stepMinutes, setStepMinutes] = useState<number>(15);
  const [requirements, setRequirements] = useState<MissionRequirements>({
    min_continuous_sunlight_hours: 72.0,
    max_tolerable_dark_hours: 48.0,
    min_continuous_earth_comms_hours: 24.0,
    min_simultaneous_operating_hours: 24.0,
  });

  // Opportunity Discovery Results State
  const [discoveredCandidates, setDiscoveredCandidates] = useState<DiscoveredCandidate[]>([]);
  const [discoveryResponse, setDiscoveryResponse] = useState<OpportunityDiscoveryResponse | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);

  // Results State
  const [horizon, setHorizon] = useState<HorizonProfile | null>(null);
  const [visibility, setVisibility] = useState<VisibilityTimeSeriesResponse | null>(null);
  const [envelope, setEnvelope] = useState<ContinuityEnvelopeResult | null>(null);
  const [epochGeometry, setEpochGeometry] = useState<EpochGeometry | null>(null);

  // Timeline Scrubber State
  const [currentSampleIndex, setCurrentSampleIndex] = useState<number>(0);

  // Status & Progress
  const [loading, setLoading] = useState<boolean>(false);
  const [isLoadingElevation, setIsLoadingElevation] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 3D Scientific Overlays Layer Settings
  const [layers, setLayers] = useState<LayerSettings>({
    elevationHeatmap: false,
    coordinateGrid: true,
    candidateRegions: true,
    sunDirectionVector: true,
    earthDirectionVector: true,
    dispersionFootprint: false,
    highResSouthPoleMesh: true,
  });

  const [highlightAzimuth, setHighlightAzimuth] = useState<number | null>(null);

  const toggleLayer = (layer: keyof LayerSettings) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // UTC clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Autonomous Opportunity Discovery Handler
  const handleRunDiscovery = useCallback(async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      const res = await api.discoverOpportunities({
        mission_name: missionName,
        target_region: targetRegion,
        bounds: bounds || undefined,
        start_utc: startUtc,
        duration_days: durationDays,
        step_minutes: 60.0,
        requirements: requirements,
        max_slope_deg: maxSlopeDeg,
      });
      setDiscoveryResponse(res);
      setDiscoveredCandidates(res.candidates);
      setIsConfigModalOpen(false);

      // If candidates found and current site not in list, select top candidate
      if (res.candidates.length > 0) {
        const top = res.candidates[0];
        setSelectedSiteKey(top.key);
        setCurrentSite({
          name: top.name,
          latitude_deg: top.latitude_deg,
          longitude_deg: top.longitude_deg,
          elevation_m: top.elevation_m,
          slope_deg: top.slope_deg,
          aspect_deg: top.aspect_deg,
        });
      }
    } catch (err: any) {
      console.error('Opportunity discovery failed:', err);
      setError(`Discovery Engine Alert: ${err.message || 'Calculation error'}`);
    } finally {
      setIsDiscovering(false);
    }
  }, [missionName, targetRegion, bounds, startUtc, durationDays, requirements, maxSlopeDeg]);

  // Initial load of health, candidate sites, and initial discovery run
  useEffect(() => {
    async function initSystem() {
      try {
        const [h, s] = await Promise.all([api.getHealth(), api.getCandidateSites()]);
        setHealth(h);
        setSites(s);
        if (s['shackleton_connecting_ridge']) {
          setCurrentSite(s['shackleton_connecting_ridge']);
        }
        // Run initial discovery sweep
        handleRunDiscovery();
      } catch (err: any) {
        console.error('Failed to initialize system:', err);
        setError(`Backend Connection Standby: ${err.message || 'Cannot reach API'}`);
      }
    }
    initSystem();
  }, []);

  // Run Mission Analysis when site or epoch changes
  const runAnalysis = useCallback(async (siteToEvaluate: LandingSite, epochStr: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch live epoch geometry
      const geom = await api.getEpochGeometry(siteToEvaluate, epochStr);
      setEpochGeometry(geom);

      // 2. Compute local terrain horizon & mission visibility timeline
      const [hRes, vRes] = await Promise.all([
        api.getHorizon(siteToEvaluate, 20.0, 360),
        api.evaluateVisibility(siteToEvaluate, epochStr, durationDays, stepMinutes, 20.0),
      ]);
      setHorizon(hRes);
      setVisibility(vRes);
      setCurrentSampleIndex(0);

      // 3. Compute Mission Continuity Envelope sensitivity
      const eRes = await api.evaluateContinuityEnvelope(siteToEvaluate, epochStr, durationDays, 30.0, requirements);
      setEnvelope(eRes);
    } catch (err: any) {
      console.error('Analysis execution failed:', err);
      setError(`Scientific Analysis Alert: ${err.message || 'Unknown processing error'}`);
    } finally {
      setLoading(false);
    }
  }, [durationDays, stepMinutes, requirements]);

  // Trigger analysis on site or startUtc changes
  useEffect(() => {
    if (currentSite) {
      runAnalysis(currentSite, startUtc);
    }
  }, [currentSite, startUtc, runAnalysis]);

  // Handle Candidate Selection from 3D Globe, List, or Strip
  const handleSelectSite = (key: string) => {
    setSelectedSiteKey(key);
    // First check discovered candidates
    const foundDiscovered = discoveredCandidates.find((c) => c.key === key);
    if (foundDiscovered) {
      setCurrentSite({
        name: foundDiscovered.name,
        latitude_deg: foundDiscovered.latitude_deg,
        longitude_deg: foundDiscovered.longitude_deg,
        elevation_m: foundDiscovered.elevation_m,
        slope_deg: foundDiscovered.slope_deg,
        aspect_deg: foundDiscovered.aspect_deg,
      });
      return;
    }
    if (sites[key]) {
      setCurrentSite(sites[key]);
    }
  };

  // Handle Click on 3D Moon Surface to Query Live LOLA DEM Elevation
  const handleCoordinatesClick = async (lat: number, lon: number) => {
    setIsLoadingElevation(true);
    setLastClickedCoord({ lat, lon });
    try {
      const res = await api.getElevation(lat, lon);
      const customSite: LandingSite = {
        name: `Custom Location (${lat.toFixed(2)}°S, ${lon.toFixed(2)}°E)`,
        latitude_deg: lat,
        longitude_deg: lon,
        elevation_m: res.elevation_m,
        slope_deg: 3.0,
        aspect_deg: 0.0,
      };
      setSelectedSiteKey('custom');
      setCurrentSite(customSite);
    } catch (err: any) {
      console.warn('Failed to query DEM elevation at clicked point:', err);
    } finally {
      setIsLoadingElevation(false);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-obsidian-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Global Aerospace Top Bar */}
      <TopBar
        health={health}
        utcTime={utcTime}
        startUtc={startUtc}
        onChangeStartUtc={setStartUtc}
        activeScenarioName={missionName.toUpperCase()}
        onOpenConfigModal={() => setIsConfigModalOpen(true)}
      />

      {/* 1b. Mission Workflow Stepper Pipeline */}
      <WorkflowStepper
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        onOpenConfigModal={() => setIsConfigModalOpen(true)}
        hasRunDiscovery={discoveredCandidates.length > 0}
      />

      {/* Main Workstation Body: Sidebar + Central Viewport + Right Inspector */}
      <div className="flex-1 flex w-full overflow-hidden relative">
        {/* 2. Workspace Navigation Sidebar */}
        <SidebarNav
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={setActiveWorkspace}
          candidateCount={discoveredCandidates.length > 0 ? discoveredCandidates.length : Object.keys(sites).length}
        />

        {/* 3. Central Dynamic Workspace Canvas */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-obsidian-950">
          {/* Global Loading / Status Overlay */}
          {(loading || isDiscovering) && (
            <div className="absolute top-4 right-4 z-30 bg-graphite-900/90 border border-cyan-500/40 rounded-full px-3 py-1 flex items-center space-x-2 text-xs font-mono text-cyan-300 shadow-cyan-glow backdrop-blur-md">
              <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span>{isDiscovering ? 'DISCOVERING LANDING OPPORTUNITIES...' : 'UPDATING SCIENTIFIC TELEMETRY...'}</span>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-4 z-30 bg-red-950/90 border border-red-500/50 rounded px-3 py-2 text-xs font-mono text-red-300 shadow-xl flex items-center space-x-2 backdrop-blur-md">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Active Workspace Viewport Switcher */}
          <div className="flex-1 w-full h-full relative overflow-hidden">
            {activeWorkspace === 'explorer' && (
              <MissionExplorerWorkspace
                sites={sites}
                selectedSiteKey={selectedSiteKey}
                onSelectSite={handleSelectSite}
                currentSite={currentSite}
                onCoordinatesClick={handleCoordinatesClick}
                layers={layers}
                onToggleLayer={toggleLayer}
                highlightAzimuth={highlightAzimuth}
                discoveredCandidates={discoveredCandidates}
              />
            )}

            {activeWorkspace === 'discovery' && (
              <OpportunityDiscoveryWorkspace
                sites={sites}
                selectedSiteKey={selectedSiteKey}
                onSelectSite={handleSelectSite}
                onNavigateToCandidate={(key) => {
                  handleSelectSite(key);
                  setActiveWorkspace('intelligence');
                }}
                onNavigateToExplorer={() => setActiveWorkspace('explorer')}
                onOpenConfigModal={() => setIsConfigModalOpen(true)}
                startUtc={startUtc}
                durationDays={durationDays}
                requirements={requirements}
                maxSlopeDeg={maxSlopeDeg}
                missionName={missionName}
                targetRegion={targetRegion}
                discoveredCandidates={discoveredCandidates}
                discoveryResponse={discoveryResponse}
                isDiscovering={isDiscovering}
                onRunDiscovery={handleRunDiscovery}
              />
            )}

            {activeWorkspace === 'intelligence' && (
              <CandidateIntelligenceWorkspace
                site={currentSite}
                selectedSiteKey={selectedSiteKey}
                onSelectSite={handleSelectSite}
                horizon={horizon}
                visibility={visibility}
                epochGeometry={epochGeometry}
                requirements={requirements}
                discoveredCandidates={discoveredCandidates}
                onHighlightAzimuth={setHighlightAzimuth}
                onNavigateToRecovery={() => setActiveWorkspace('recovery')}
              />
            )}

            {activeWorkspace === 'resilience' && (
              <MissionResilienceWorkspace
                site={currentSite}
                envelope={envelope}
                requirements={requirements}
                onChangeRequirements={setRequirements}
                onReevaluate={() => runAnalysis(currentSite, startUtc)}
              />
            )}

            {activeWorkspace === 'recovery' && (
              <MissionRecoveryWorkspace
                site={currentSite}
                visibility={visibility}
                requirements={requirements}
              />
            )}
          </div>

          {/* 4. Bottom Operational Timeline Dock */}
          <TimelineDock
            visibility={visibility}
            discoveredCandidates={discoveredCandidates}
            selectedSiteKey={selectedSiteKey}
            onSelectSite={handleSelectSite}
            onProceedToAnalysis={() => setActiveWorkspace('intelligence')}
            currentSite={currentSite}
          />
        </main>

        {/* 5. Right Context-Sensitive Inspector */}
        <RightInspector
          site={currentSite}
          epochGeometry={epochGeometry}
          visibility={visibility}
          horizon={horizon}
          requirements={requirements}
          onUpdateRequirements={setRequirements}
          isLoadingElevation={isLoadingElevation}
          discoveredCandidate={discoveredCandidates.find((c) => c.key === selectedSiteKey) || null}
          onViewDetailedAnalysis={() => setActiveWorkspace('intelligence')}
        />
      </div>

      {/* 6. Mission Configuration & Discovery Modal */}
      <MissionConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        missionName={missionName}
        onChangeMissionName={setMissionName}
        missionType={missionType}
        onChangeMissionType={setMissionType}
        targetRegion={targetRegion}
        onChangeTargetRegion={setTargetRegion}
        bounds={bounds}
        onChangeBounds={setBounds}
        startUtc={startUtc}
        onChangeStartUtc={setStartUtc}
        durationDays={durationDays}
        onChangeDurationDays={setDurationDays}
        requirements={requirements}
        onChangeRequirements={setRequirements}
        maxSlopeDeg={maxSlopeDeg}
        onChangeMaxSlopeDeg={setMaxSlopeDeg}
        onRunDiscovery={handleRunDiscovery}
        isDiscovering={isDiscovering}
        lastClickedCoord={lastClickedCoord}
      />
    </div>
  );
};

export default App;

