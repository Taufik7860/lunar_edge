import React, { useRef, useEffect, useState } from 'react';
import { LandingSite } from '../../types/api';
import { Crosshair, ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

interface LunarMapViewerProps {
  sites: Record<string, LandingSite>;
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  currentSite: LandingSite;
  onCoordinatesClick?: (lat: number, lon: number) => void;
}

export const LunarMapViewer: React.FC<LunarMapViewerProps> = ({
  sites,
  selectedSiteKey,
  onSelectSite,
  currentSite,
  onCoordinatesClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1.0);

  // Exact Conformal Polar Stereographic Projection:
  // r = 2 R * tan(colatitude / 2)
  // Normalized to outer boundary at colat = 10° (-80° lat)
  const MAX_COLAT_DEG = 10.0;
  const TAN_HALF_MAX = Math.tan(((MAX_COLAT_DEG / 2.0) * Math.PI) / 180.0);

  const projectToCanvas = (
    lat: number,
    lon: number,
    width: number,
    height: number,
    zoomFactor: number
  ) => {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(cx, cy) * 0.88 * zoomFactor;

    // Colatitude in degrees from South Pole: 0 at -90°, 10 at -80°
    const colatDeg = Math.max(0.0, Math.min(10.0, lat + 90.0));
    const colatRad = (colatDeg * Math.PI) / 180.0;

    // Conformal stereographic radial ratio: tan(colat/2) / tan(maxColat/2)
    const r = (Math.tan(colatRad / 2.0) / TAN_HALF_MAX) * maxR;

    // Azimuth: lon in degrees. 0° = Prime Meridian (Sub-Earth, Top / -Y in canvas)
    // Canvas standard: theta = lon - 90 deg so 0° points UP
    const theta = ((lon - 90.0) * Math.PI) / 180.0;

    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    return { x, y };
  };

  const canvasToProject = (
    canvasX: number,
    canvasY: number,
    width: number,
    height: number,
    zoomFactor: number
  ) => {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(cx, cy) * 0.88 * zoomFactor;

    const dx = canvasX - cx;
    const dy = canvasY - cy;
    const r = Math.sqrt(dx * dx + dy * dy);

    // Exact inverse stereographic
    const rNorm = Math.min(1.0, r / maxR);
    const colatRad = 2.0 * Math.atan(rNorm * TAN_HALF_MAX);
    const colatDeg = (colatRad * 180.0) / Math.PI;
    const lat = Math.max(-90.0, Math.min(-80.0, -90.0 + colatDeg));

    let thetaDeg = (Math.atan2(dy, dx) * 180.0) / Math.PI + 90.0;
    if (thetaDeg > 180.0) thetaDeg -= 360.0;
    if (thetaDeg < -180.0) thetaDeg += 360.0;

    return { lat, lon: thetaDeg };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    // Clear background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, width, height);

    // Draw Polar Grid Rings (80°S, 84°S, 87°S, 89°S)
    const rings = [
      { lat: -80, label: '80°S' },
      { lat: -84, label: '84°S' },
      { lat: -87, label: '87°S' },
      { lat: -89, label: '89°S' },
    ];

    ctx.strokeStyle = '#162035';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    rings.forEach((ring) => {
      const p = projectToCanvas(ring.lat, 0, width, height, zoom);
      const r = Math.abs(p.y - cy);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '9px monospace';
      ctx.fillText(ring.label, cx + 4, cy - r + 10);
    });

    // Radial spokes (0°, 90°, 180°, 270°)
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 4]);
    [0, 90, 180, 270].forEach((deg) => {
      const p = projectToCanvas(-80, deg, width, height, zoom);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      const label = deg === 0 ? '0° (Sub-Earth)' : deg === 180 ? '180° (Far Side)' : `${deg}°`;
      ctx.fillText(label, p.x + 2, p.y - 2);
    });

    ctx.setLineDash([]); // Reset line dash

    // Draw major South Pole craters (approximate rims from IAU Gazetteer)
    const craters = [
      { name: 'Shackleton', lat: -89.9, lon: 0.0, radiusKm: 21 },
      { name: 'Haworth', lat: -87.45, lon: -5.1, radiusKm: 51 },
      { name: 'Shoemaker', lat: -88.1, lon: 44.9, radiusKm: 50 },
      { name: 'Faustini', lat: -87.3, lon: 77.0, radiusKm: 39 },
      { name: 'Nobile', lat: -85.3, lon: 53.5, radiusKm: 73 },
      { name: 'de Gerlache', lat: -88.5, lon: -88.3, radiusKm: 32 },
    ];

    craters.forEach((cr) => {
      const p = projectToCanvas(cr.lat, cr.lon, width, height, zoom);
      // Pixel radius on canvas
      const rPixels = Math.max(4, (cr.radiusKm / 304.0) * (width * 0.44 * zoom));

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rPixels, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '8px sans-serif';
      ctx.fillText(cr.name, p.x + rPixels + 2, p.y + 3);
    });

    // Draw Candidate Landing Site Markers
    Object.entries(sites).forEach(([key, site]) => {
      const isSelected = key === selectedSiteKey;
      const pos = projectToCanvas(site.latitude_deg, site.longitude_deg, width, height, zoom);

      // Marker circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
      ctx.fill();
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeStyle = isSelected ? '#ffffff' : '#1e293b';
      ctx.stroke();

      // Label
      if (isSelected || zoom > 1.2) {
        ctx.fillStyle = isSelected ? '#e0f2fe' : '#64748b';
        ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace';
        ctx.fillText(site.name.split(' ')[0], pos.x + 8, pos.y + 3);
      }
    });

    // Draw active observer cursor
    const activePos = projectToCanvas(currentSite.latitude_deg, currentSite.longitude_deg, width, height, zoom);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(activePos.x, activePos.y, 9, 0, 2 * Math.PI);
    ctx.stroke();

    // Crosshairs on selected site
    ctx.beginPath();
    ctx.moveTo(activePos.x - 13, activePos.y);
    ctx.lineTo(activePos.x + 13, activePos.y);
    ctx.moveTo(activePos.x, activePos.y - 13);
    ctx.lineTo(activePos.x, activePos.y + 13);
    ctx.stroke();
  }, [sites, selectedSiteKey, currentSite, zoom]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onCoordinatesClick) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { lat, lon } = canvasToProject(x, y, canvas.width, canvas.height, zoom);
    onCoordinatesClick(lat, lon);
  };

  return (
    <div className="bg-space-900 border border-space-700 rounded-md p-3 select-none flex flex-col space-y-2">
      <div className="flex items-center justify-between border-b border-space-800 pb-2 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <Crosshair className="w-3.5 h-3.5 text-earth-400" />
          <span className="text-slate-300 font-semibold uppercase">LOLA Polar Stereographic Map</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setZoom((z) => Math.min(3.0, z + 0.3))}
            className="p-1 bg-space-950 hover:bg-space-800 border border-space-700 text-slate-300 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.3))}
            className="p-1 bg-space-950 hover:bg-space-800 border border-space-700 text-slate-300 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={() => setZoom(1.0)}
            className="p-1 bg-space-950 hover:bg-space-800 border border-space-700 text-slate-300 rounded"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-space-950 rounded border border-space-800/80 overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={380}
          height={380}
          onClick={handleCanvasClick}
          className="w-full max-w-[380px] h-auto aspect-square"
        />
        <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-500 bg-space-950/80 px-2 py-0.5 rounded border border-space-800">
          Click map to set custom coordinates
        </div>
      </div>

      {/* Scientific Datum Disclaimer Note */}
      <div className="flex items-start space-x-1.5 text-[10px] text-slate-500 font-sans leading-tight pt-1">
        <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <span>
          <strong>LOLA Datum:</strong> Crater rings indicate nominal IAU crater boundaries. All elevation, slope, and horizon obstruction profiles are calculated directly from the NASA LOLA 80m GeoTIFF datum.
        </span>
      </div>
    </div>
  );
};
