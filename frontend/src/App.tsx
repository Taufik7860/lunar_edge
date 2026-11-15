import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { SiteSelector } from './components/SiteSelector';
import { LunarMapViewer } from './components/LunarMap/LunarMapViewer';
import { api } from './services/api';
import {
  LandingSite,
  HorizonProfile,
  VisibilityTimeSeriesResponse,
  ContinuityEnvelopeResult,
  MissionRequirements,
  SystemHealth,
} from './types/api';
import { AlertTriangle, Compass } from 'lucide-react';

// Lazy-loaded heavy visualization components for code-splitting
const HorizonChart = lazy(() =>
  import('./components/charts/HorizonChart').then((m) => ({ default: m.HorizonChart }))
);
const TimelineChart = lazy(() =>
  import('./components/charts/TimelineChart').then((m) => ({ default: m.TimelineChart }))
);
const ContinuityEnvelopeChart = lazy(() =>
  import('./components/charts/ContinuityEnvelopeChart').then((m) => ({ default: m.ContinuityEnvelopeChart }))
);
const SiteComparison = lazy(() =>
  import('./components/panels/SiteComparison').then((m) => ({ default: m.SiteComparison }))
);

const ChartFallback = () => (
  <div className="h-[400px] bg-space-900 border border-space-700 rounded-md flex items-center justify-center font-mono text-xs text-slate-400">
    <div className="flex items-center space-x-2">
      <div className="w-4 h-4 border-2 border-earth-400 border-t-transparent rounded-full animate-spin"></div>
      <span>Loading scientific visualization module...</span>
    </div>
  </div>
);

export const App: React.FC = () => {
  // Navigation & UTC Clock
  const [activeTab, setActiveTab] = useState('dashboard');
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  // System & Sites state
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [sites, setSites] = useState<Record<string, LandingSite>>({});
  const [selectedSiteKey, setSelectedSiteKey] = useState<string>('shackleton_connecting_ridge');
  const [currentSite, setCurrentSite] = useState<LandingSite>({
    name: 'Peak Near Shackleton / Connecting Ridge',
    latitude_deg: -89.7,
    longitude_deg: 129.0,
    elevation_m: 1120.0,
    slope_deg: 5.0,
    aspect_deg: 130.0,
  });

  // Analysis Parameters
  const [startUtc, setStartUtc] = useState<string>('2026-02-01T00:00:00Z');
  const [durationDays, setDurationDays] = useState<number>(14);
  const [stepMinutes, setStepMinutes] = useState<number>(15);
  const [requirements, setRequirements] = useState<MissionRequirements>({
    min_continuous_sunlight_hours: 72.0,
    max_tolerable_dark_hours: 48.0,
    min_continuous_earth_comms_hours: 24.0,
    min_simultaneous_operating_hours: 24.0,
  });

  // Results State
  const [horizon, setHorizon] = useState<HorizonProfile | null>(null);
  const [visibility, setVisibility] = useState<VisibilityTimeSeriesResponse | null>(null);
  const [envelope, setEnvelope] = useState<ContinuityEnvelopeResult | null>(null);

  // Status
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // UTC clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial load of health and candidate sites
  useEffect(() => {
    async function initSystem() {
      try {
        const [h, s] = await Promise.all([api.getHealth(), api.getCandidateSites()]);
        setHealth(h);
        setSites(s);
        if (s['shackleton_connecting_ridge']) {
          setCurrentSite(s['shackleton_connecting_ridge']);
        }
      } catch (err: any) {
        console.error('Failed to initialize system:', err);
        setError(`Backend Connection Standby: ${err.message || 'Cannot reach API'}`);
      }
    }
    initSystem();
  }, []);

  // Run Mission Analysis
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Compute local terrain horizon & mission visibility timeline
      const [hRes, vRes] = await Promise.all([
        api.getHorizon(currentSite, 20.0, 360),
        api.evaluateVisibility(currentSite, startUtc, durationDays, stepMinutes, 20.0),
      ]);
      setHorizon(hRes);
      setVisibility(vRes);

      // Step 2: Compute Mission Continuity Envelope sensitivity
      const eRes = await api.evaluateContinuityEnvelope(currentSite, startUtc, durationDays, 30.0, requirements);
      setEnvelope(eRes);
    } catch (err: any) {
      console.error('Analysis execution failed:', err);
      setError(`Calculation Notice: ${err.message || 'Engine computation failed'}`);
    } finally {
      setLoading(false);
    }
  }, [currentSite, startUtc, durationDays, stepMinutes, requirements]);

  // Run on initial site readiness
  useEffect(() => {
    if (Object.keys(sites).length > 0) {
      runAnalysis();
    }
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle preset site change
  const handleSelectSiteKey = async (key: string) => {
    setSelectedSiteKey(key);
    if (key === 'custom') return;

    const site = sites[key];
    if (site) {
      setCurrentSite(site);
      try {
        const elevData = await api.getElevation(site.latitude_deg, site.longitude_deg);
        setCurrentSite((prev) => ({
          ...prev,
          elevation_m: elevData.elevation_m,
        }));
      } catch {
        // Fallback to configured elevation
      }
    }
  };

  // Handle map click for custom coordinates
  const handleCoordinatesClick = async (lat: number, lon: number) => {
    setSelectedSiteKey('custom');
    let elev = 0;
    try {
      const elevData = await api.getElevation(lat, lon);
      elev = elevData.elevation_m;
    } catch {
      elev = 0;
    }

    setCurrentSite({
      name: `Custom Location (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      latitude_deg: lat,
      longitude_deg: lon,
      elevation_m: elev,
      slope_deg: 0.0,
      aspect_deg: 0.0,
    });
  };

  // Benchmark single site for comparison tab
  const handleEvaluateSiteForComparison = async (siteKey: string) => {
    const site = sites[siteKey];
    if (!site) throw new Error('Site not found');

    const [v, c] = await Promise.all([
      api.evaluateVisibility(site, startUtc, durationDays, 30.0, 15.0),
      api.evaluateContinuityEnvelope(site, startUtc, durationDays, 60.0, requirements),
    ]);
    return { visibility: v, continuity: c };
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-space-950 font-sans">
      {/* Aerospace Console Header */}
      <Header
        health={health}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        utcTime={utcTime}
      />

      {/* Error / Warning Alert Banner */}
      {error && (
        <div className="bg-rose-950/80 border-b border-rose-500/50 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-rose-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <main className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Mission Target & Epoch Configuration Header Bar */}
        <SiteSelector
          sites={sites}
          selectedSiteKey={selectedSiteKey}
          onSelectSiteKey={handleSelectSiteKey}
          currentSite={currentSite}
          onChangeSite={setCurrentSite}
          startUtc={startUtc}
          onChangeStartUtc={setStartUtc}
          durationDays={durationDays}
          onChangeDurationDays={setDurationDays}
          stepMinutes={stepMinutes}
          onChangeStepMinutes={setStepMinutes}
          onRecalculate={runAnalysis}
          loading={loading}
        />

        {/* Tab 1: Operations Console (Primary Dashboard) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-3.5">
            {/* Top Row: Map + Horizon Profile */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-4">
                <LunarMapViewer
                  sites={sites}
                  selectedSiteKey={selectedSiteKey}
                  onSelectSite={handleSelectSiteKey}
                  currentSite={currentSite}
                  onCoordinatesClick={handleCoordinatesClick}
                />
              </div>
              <div className="lg:col-span-8">
                <Suspense fallback={<ChartFallback />}>
                  <HorizonChart
                    horizon={horizon}
                    samples={visibility ? visibility.samples : []}
                    loading={loading}
                  />
                </Suspense>
              </div>
            </div>

            {/* Bottom Row: Mission Visibility Timeline */}
            <Suspense fallback={<ChartFallback />}>
              <TimelineChart data={visibility} loading={loading} />
            </Suspense>

            {/* Quick Envelope Summary Strip */}
            {envelope && (
              <div className="bg-space-900 border border-space-700 rounded-md p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center space-x-3">
                  <span className="text-slate-400 uppercase text-[11px]">Mission Continuity Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      envelope.baseline_meets_requirements
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {envelope.baseline_meets_requirements ? 'REQUIREMENTS SATISFIED' : 'CONSTRAINTS VIOLATED'}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-300">
                    Composite Robustness Score: <strong>{(envelope.overall_robustness_score * 100).toFixed(1)}%</strong>
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('continuity')}
                  className="px-2.5 py-1 rounded bg-space-800 hover:bg-space-700 text-slate-200 text-[11px] border border-space-600 transition"
                >
                  View Sensitivity Details →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Detailed Terrain Horizon Analysis */}
        {activeTab === 'horizon' && (
          <div className="space-y-3.5">
            <Suspense fallback={<ChartFallback />}>
              <HorizonChart
                horizon={horizon}
                samples={visibility ? visibility.samples : []}
                loading={loading}
              />
            </Suspense>
          </div>
        )}

        {/* Tab 3: Detailed Visibility Timeline */}
        {activeTab === 'timeline' && (
          <div className="space-y-3.5">
            <Suspense fallback={<ChartFallback />}>
              <TimelineChart data={visibility} loading={loading} />
            </Suspense>
          </div>
        )}

        {/* Tab 4: Mission Continuity Envelope */}
        {activeTab === 'continuity' && (
          <div className="space-y-3.5">
            <Suspense fallback={<ChartFallback />}>
              <ContinuityEnvelopeChart
                envelope={envelope}
                requirements={requirements}
                onChangeRequirements={setRequirements}
                onReevaluate={runAnalysis}
                loading={loading}
              />
            </Suspense>
          </div>
        )}

        {/* Tab 5: Artemis Candidate Sites Comparison */}
        {activeTab === 'comparison' && (
          <div className="space-y-3.5">
            <Suspense fallback={<ChartFallback />}>
              <SiteComparison
                sites={sites}
                onSelectSite={(key) => {
                  handleSelectSiteKey(key);
                  setActiveTab('dashboard');
                }}
                onEvaluateSite={handleEvaluateSiteForComparison}
              />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
};
export default App;
