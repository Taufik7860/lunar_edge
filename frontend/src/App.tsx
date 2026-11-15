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
  MissionEvaluationResponse,
  ProbabilisticResilienceResponse,
  CounterfactualRecoveryResponse,
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

  // Master Scientific Mission Evaluation, Monte Carlo Resilience & Recovery State
  const [missionEvaluation, setMissionEvaluation] = useState<MissionEvaluationResponse | null>(null);
  const [resilienceResult, setResilienceResult] = useState<ProbabilisticResilienceResponse | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<CounterfactualRecoveryResponse | null>(null);
  const [isLoadingEvaluation, setIsLoadingEvaluation] = useState<boolean>(false);
  const [isLoadingResilience, setIsLoadingResilience] = useState<boolean>(false);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState<boolean>(false);

  // Request ID counters to prevent out-of-order race conditions from asynchronous API responses
  const analysisReqIdRef = React.useRef<number>(0);
  const resilienceReqIdRef = React.useRef<number>(0);
  const recoveryReqIdRef = React.useRef<number>(0);

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

  const toggleLayer = useCallback((layer: keyof LayerSettings) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
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
    const reqId = ++analysisReqIdRef.current;
    setLoading(true);
    setIsLoadingEvaluation(true);
    setError(null);

    // Immediately clear results belonging to the previous configuration to prevent showing stale data
    setEpochGeometry(null);
    setHorizon(null);
    setVisibility(null);
    setEnvelope(null);
    setMissionEvaluation(null);
    setResilienceResult(null);
    setRecoveryResult(null);

    try {
      // 1. Fetch live epoch geometry
      const geom = await api.getEpochGeometry(siteToEvaluate, epochStr);
      if (reqId !== analysisReqIdRef.current) return;
      setEpochGeometry(geom);

      // 2. Compute local terrain horizon & mission visibility timeline
      const [hRes, vRes] = await Promise.all([
        api.getHorizon(siteToEvaluate, 20.0, 360),
        api.evaluateVisibility(siteToEvaluate, epochStr, durationDays, stepMinutes, 20.0),
      ]);
      if (reqId !== analysisReqIdRef.current) return;
      setHorizon(hRes);
      setVisibility(vRes);
      setCurrentSampleIndex(0);

      // 3. Compute Mission Continuity Envelope sensitivity and Master Mission Evaluation
      const [eRes, evalRes] = await Promise.all([
        api.evaluateContinuityEnvelope(siteToEvaluate, epochStr, durationDays, 30.0, requirements),
        api.evaluateMission(siteToEvaluate, epochStr, durationDays, stepMinutes, maxSlopeDeg, requirements, 20.0),
      ]);
      if (reqId !== analysisReqIdRef.current) return;
      setEnvelope(eRes);
      setMissionEvaluation(evalRes);

      // 4. Trigger Probabilistic Resilience Monte Carlo in background
      const resReqId = ++resilienceReqIdRef.current;
      setIsLoadingResilience(true);
      api.evaluateResilience(siteToEvaluate, epochStr, durationDays, 30.0, maxSlopeDeg, requirements)
        .then((rRes) => {
          if (resReqId === resilienceReqIdRef.current && reqId === analysisReqIdRef.current) {
            setResilienceResult(rRes);
          }
        })
        .catch((err) => {
          if (resReqId === resilienceReqIdRef.current) {
            console.warn('Resilience evaluation warning:', err);
          }
        })
        .finally(() => {
          if (resReqId === resilienceReqIdRef.current) {
            setIsLoadingResilience(false);
          }
        });
    } catch (err: any) {
      if (reqId === analysisReqIdRef.current) {
        console.error('Analysis execution failed:', err);
        setError(`Scientific Analysis Alert: ${err.message || 'Unknown processing error'}`);
      }
    } finally {
      if (reqId === analysisReqIdRef.current) {
        setLoading(false);
        setIsLoadingEvaluation(false);
      }
    }
  }, [durationDays, stepMinutes, maxSlopeDeg, requirements]);

  // Handlers for explicit Resilience and Recovery re-evaluation with race-condition prevention
  const handleRunResilience = useCallback(async (siteToEvaluate: LandingSite = currentSite, epochStr: string = startUtc) => {
    const resReqId = ++resilienceReqIdRef.current;
    setIsLoadingResilience(true);
    try {
      const res = await api.evaluateResilience(siteToEvaluate, epochStr, durationDays, 30.0, maxSlopeDeg, requirements);
      if (resReqId === resilienceReqIdRef.current) {
        setResilienceResult(res);
      }
    } catch (err: any) {
      if (resReqId === resilienceReqIdRef.current) {
        console.error('Resilience calculation failed:', err);
        setError(`Resilience Engine Alert: ${err.message || 'Failed to compute resilience'}`);
      }
    } finally {
      if (resReqId === resilienceReqIdRef.current) {
        setIsLoadingResilience(false);
      }
    }
  }, [currentSite, startUtc, durationDays, maxSlopeDeg, requirements]);

  const handleRunRecovery = useCallback(async (siteToEvaluate: LandingSite = currentSite, epochStr: string = startUtc) => {
    const recReqId = ++recoveryReqIdRef.current;
    setIsLoadingRecovery(true);
    try {
      const res = await api.planRecovery(siteToEvaluate, epochStr, durationDays, 30.0, maxSlopeDeg, requirements);
      if (recReqId === recoveryReqIdRef.current) {
        setRecoveryResult(res);
      }
    } catch (err: any) {
      if (recReqId === recoveryReqIdRef.current) {
        console.error('Counterfactual recovery failed:', err);
        setError(`Recovery Engine Alert: ${err.message || 'Failed to compute recovery'}`);
      }
    } finally {
      if (recReqId === recoveryReqIdRef.current) {
        setIsLoadingRecovery(false);
      }
    }
  }, [currentSite, startUtc, durationDays, maxSlopeDeg, requirements]);

  // Auto-run Recovery when navigating to Recovery workspace if not yet evaluated
  useEffect(() => {
    if (activeWorkspace === 'recovery' && !recoveryResult && !isLoadingRecovery && currentSite) {
      handleRunRecovery(currentSite, startUtc);
    }
  }, [activeWorkspace, recoveryResult, isLoadingRecovery, currentSite, startUtc, handleRunRecovery]);

  // Trigger analysis on site or startUtc changes
  useEffect(() => {
    if (currentSite) {
      runAnalysis(currentSite, startUtc);
    }
  }, [currentSite, startUtc, runAnalysis]);

  // Handle Candidate Selection from 3D Globe, List, or Strip
  const handleSelectSite = useCallback((key: string) => {
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
  }, [discoveredCandidates, sites]);

  // Handle Click on 3D Moon Surface to Query Live LOLA DEM Elevation
  const handleCoordinatesClick = useCallback(async (lat: number, lon: number) => {
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
  }, []);

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
                epochGeometry={epochGeometry}
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
                resilienceResult={resilienceResult}
                isLoadingResilience={isLoadingResilience}
                onRunResilience={() => handleRunResilience(currentSite, startUtc)}
                requirements={requirements}
                onChangeRequirements={setRequirements}
                onReevaluate={() => runAnalysis(currentSite, startUtc)}
              />
            )}

            {activeWorkspace === 'recovery' && (
              <MissionRecoveryWorkspace
                site={currentSite}
                visibility={visibility}
                missionEvaluation={missionEvaluation}
                recoveryResult={recoveryResult}
                isLoadingRecovery={isLoadingRecovery}
                onRunRecovery={() => handleRunRecovery(currentSite, startUtc)}
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
          missionEvaluation={missionEvaluation}
          isLoadingEvaluation={isLoadingEvaluation}
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

