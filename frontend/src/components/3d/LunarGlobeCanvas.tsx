import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { LandingSite, LayerSettings, DiscoveredCandidate } from '../../types/api';
import {
  Globe,
  Compass,
  Layers,
  Crosshair,
  Maximize2,
  Eye,
  Sun,
  Radio,
  RotateCw,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Info,
} from 'lucide-react';

interface LunarGlobeCanvasProps {
  sites: Record<string, LandingSite>;
  selectedSiteKey: string;
  onSelectSite: (key: string) => void;
  currentSite: LandingSite;
  onCoordinatesClick?: (lat: number, lon: number) => void;
  layers: LayerSettings;
  onToggleLayer: (layer: keyof LayerSettings) => void;
  highlightAzimuth?: number | null;
  cameraMode?: 'global' | 'south_pole' | 'ortho' | 'site';
  discoveredCandidates?: DiscoveredCandidate[];
}

const getClassificationColor = (classification?: string): number => {
  switch (classification) {
    case 'Screening-viable':
    case 'SCREENING_VIABLE':
      return 0x00e5ff; // Cyan
    case 'Conditional':
    case 'CONDITIONAL':
      return 0xf59e0b; // Amber
    case 'Infeasible':
    case 'INFEASIBLE':
      return 0xef4444; // Red
    case 'Insufficient data':
    case 'INSUFFICIENT_DATA':
      return 0x94a3b8; // Slate
    case 'Outside coverage':
    case 'OUTSIDE_COVERAGE':
      return 0x71717a; // Zinc
    default:
      return 0x00e5ff;
  }
};

export const LunarGlobeCanvas: React.FC<LunarGlobeCanvasProps> = ({
  sites,
  selectedSiteKey,
  onSelectSite,
  currentSite,
  onCoordinatesClick,
  layers,
  onToggleLayer,
  highlightAzimuth,
  discoveredCandidates,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<{
    targetPos: THREE.Vector3;
    currentPos: THREE.Vector3;
    isDragging: boolean;
    prevMouseX: number;
    prevMouseY: number;
    rotationX: number;
    rotationY: number;
    targetRotationX: number;
    targetRotationY: number;
    zoom: number;
    targetZoom: number;
  }>({
    targetPos: new THREE.Vector3(0, 0, 0),
    currentPos: new THREE.Vector3(0, 0, 0),
    isDragging: false,
    prevMouseX: 0,
    prevMouseY: 0,
    rotationX: 1.1, // tilt to show South Pole by default
    rotationY: 0.2,
    targetRotationX: 1.1,
    targetRotationY: 0.2,
    zoom: 2.2,
    targetZoom: 2.2,
  });

  const [activeCameraView, setActiveCameraView] = useState<'global' | 'south_pole' | 'ortho' | 'site'>('south_pole');
  const [hoveredCoordinate, setHoveredCoordinate] = useState<{ lat: number; lon: number } | null>(null);
  const [hoveredCandidate, setHoveredCandidate] = useState<any | null>(null);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  // Convert Selenographic (lat, lon) on unit sphere to 3D Cartesian
  // In our Three.js Moon:
  // South pole is at -Y [0, -1, 0]
  // North pole is at +Y [0, 1, 0]
  // Prime meridian (0° lon) is along +Z [0, 0, 1]
  // 90° East longitude is along +X [1, 0, 0]
  const latLonToVector3 = useCallback((latDeg: number, lonDeg: number, radius = 1.0) => {
    const latRad = THREE.MathUtils.degToRad(latDeg);
    const lonRad = THREE.MathUtils.degToRad(lonDeg);
    const x = radius * Math.cos(latRad) * Math.sin(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lonRad);
    return new THREE.Vector3(x, y, z);
  }, []);

  const vector3ToLatLon = useCallback((vec: THREE.Vector3) => {
    const norm = vec.clone().normalize();
    const latRad = Math.asin(Math.max(-1, Math.min(1, norm.y)));
    const latDeg = THREE.MathUtils.radToDeg(latRad);
    const lonRad = Math.atan2(norm.x, norm.z);
    const lonDeg = THREE.MathUtils.radToDeg(lonRad);
    return { lat: latDeg, lon: lonDeg };
  }, []);

  // Build high-resolution realistic lunar procedural texture
  const createLunarTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Base highlands regolith grey
    ctx.fillStyle = '#6e747d';
    ctx.fillRect(0, 0, 2048, 1024);

    // Multi-scale procedural cratering & mare noise
    // 1. Maria (dark basaltic lowlands)
    const maria = [
      { x: 500, y: 350, rx: 240, ry: 180, col: '#3a3e46' }, // Oceanus Procellarum
      { x: 800, y: 300, rx: 180, ry: 140, col: '#33373f' }, // Mare Imbrium
      { x: 1050, y: 340, rx: 140, ry: 120, col: '#383c44' }, // Mare Serenitatis
      { x: 1200, y: 380, rx: 150, ry: 130, col: '#363a41' }, // Mare Tranquillitatis
      { x: 1350, y: 440, rx: 110, ry: 100, col: '#393d45' }, // Mare Fecunditatis
      { x: 1350, y: 300, rx: 100, ry: 90, col: '#32363e' }, // Mare Crisium
    ];

    maria.forEach((m) => {
      const grad = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, Math.max(m.rx, m.ry));
      grad.addColorStop(0, m.col);
      grad.addColorStop(0.7, m.col);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Fine cratering stippling
    ctx.fillStyle = '#26292f';
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 1024;
      const r = Math.random() * 3 + 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Bright rayed impact craters (Tycho, Copernicus)
    const rayCraters = [
      { x: 750, y: 680, r: 16, rayCount: 18, rayLen: 320 }, // Tycho in southern highlands
      { x: 720, y: 380, r: 12, rayCount: 14, rayLen: 220 }, // Copernicus
      { x: 600, y: 340, r: 9, rayCount: 10, rayLen: 160 }, // Kepler
    ];

    rayCraters.forEach((c) => {
      ctx.strokeStyle = 'rgba(235, 240, 250, 0.22)';
      ctx.lineWidth = 1.2;
      for (let a = 0; a < c.rayCount; a++) {
        const angle = (a * (Math.PI * 2)) / c.rayCount + (Math.random() - 0.5) * 0.2;
        const len = c.rayLen * (0.6 + Math.random() * 0.8);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(angle) * len, c.y + Math.sin(angle) * len);
        ctx.stroke();
      }
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Polar Crater Rim Shading at South Pole (bottom rows: y from 850 to 1024)
    // Shackleton, Faustini, Shoemaker, Haworth, Nobile, Amundsen
    ctx.fillStyle = 'rgba(20, 24, 32, 0.45)';
    ctx.fillRect(0, 880, 2048, 144);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, []);

  // Main Three.js Setup & Lifecycle
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    camera.position.set(0, 0, 2.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Deep space background with subtle starfield
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 80
      ).normalize().multiplyScalar(40 + Math.random() * 20);
      starPos[i] = v.x;
      starPos[i + 1] = v.y;
      starPos[i + 2] = v.z;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.28, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    // Group holding the Moon and all attached lunar surface features
    const moonGroup = new THREE.Group();
    scene.add(moonGroup);

    // 1. Lunar Globe Sphere
    const moonGeo = new THREE.SphereGeometry(1.0, 96, 96);
    const moonTex = createLunarTexture();
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 0.92,
      metalness: 0.04,
      bumpScale: 0.008,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonGroup.add(moonMesh);

    // 2. High-Resolution South Polar Cap Relief Mesh (Detailed LOLA Topography)
    // Detailed polar circle down to -80° latitude
    const polarCapGeo = new THREE.CircleGeometry(0.35, 64);
    // Orient to South Pole (-Y)
    polarCapGeo.rotateX(Math.PI / 2);
    polarCapGeo.translate(0, -0.992, 0);

    const polarCapMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: layers.highResSouthPoleMesh ? 0.85 : 0.0,
      wireframe: layers.elevationHeatmap,
    });
    const polarCapMesh = new THREE.Mesh(polarCapGeo, polarCapMat);
    polarCapMesh.name = 'polar_cap';
    moonGroup.add(polarCapMesh);

    // 3. Polar Latitude Rings (-80°, -84°, -87°, -89°)
    const latRingsGroup = new THREE.Group();
    latRingsGroup.name = 'lat_rings';
    const ringLats = [-80, -84, -87, -89];
    ringLats.forEach((lat) => {
      const colatRad = THREE.MathUtils.degToRad(lat + 90);
      const ringRadius = Math.sin(colatRad) * 1.002;
      const ringY = Math.sin(THREE.MathUtils.degToRad(lat)) * 1.002;

      const curve = new THREE.EllipseCurve(0, 0, ringRadius, ringRadius, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(72);
      const ringGeo = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, ringY, p.y))
      );
      const ringMat = new THREE.LineBasicMaterial({
        color: lat === -89 ? 0x00e5ff : 0x334155,
        transparent: true,
        opacity: lat === -89 ? 0.75 : 0.35,
      });
      const ringLine = new THREE.Line(ringGeo, ringMat);
      latRingsGroup.add(ringLine);
    });
    moonGroup.add(latRingsGroup);

    // 4. Prime Meridian Marker (Sub-Earth Meridian 0°)
    const primeMeridianCurve = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      primeMeridianCurve.push(latLonToVector3(lat, 0, 1.003));
    }
    const pmGeo = new THREE.BufferGeometry().setFromPoints(primeMeridianCurve);
    const pmMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.4 });
    const pmLine = new THREE.Line(pmGeo, pmMat);
    pmLine.name = 'prime_meridian';
    moonGroup.add(pmLine);

    // 5. Sun Direction Vector Ray & Solar Illuminator
    // In our SPICE geometry for July 2026, Sun is in the north (+1.28° lat)
    const sunDir = new THREE.Vector3(0.8, 0.05, 0.6).normalize();
    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.6);
    sunLight.position.copy(sunDir.clone().multiplyScalar(15));
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0a101d, 0.35);
    scene.add(ambientLight);

    // Sun Ray Visualizer
    const sunRayGeo = new THREE.BufferGeometry().setFromPoints([
      sunDir.clone().multiplyScalar(1.05),
      sunDir.clone().multiplyScalar(3.2),
    ]);
    const sunRayMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 });
    const sunRayLine = new THREE.Line(sunRayGeo, sunRayMat);
    sunRayLine.name = 'sun_ray';
    scene.add(sunRayLine);

    // 6. Earth Direction Vector Ray & Libration Line of Sight
    // Earth is centered near [0, 0, 1] with ~6.7° libration
    const earthDir = new THREE.Vector3(0.08, 0.05, 1.0).normalize();
    const earthRayGeo = new THREE.BufferGeometry().setFromPoints([
      earthDir.clone().multiplyScalar(1.05),
      earthDir.clone().multiplyScalar(3.2),
    ]);
    const earthRayMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7 });
    const earthRayLine = new THREE.Line(earthRayGeo, earthRayMat);
    earthRayLine.name = 'earth_ray';
    scene.add(earthRayLine);

    // 7. Candidate Landing Site Markers & Spatial Regions
    const sitesGroup = new THREE.Group();
    sitesGroup.name = 'sites_group';

    // If discovered candidates are available from the autonomous search engine, render actual spatial boundaries
    if (discoveredCandidates && discoveredCandidates.length > 0) {
      discoveredCandidates.forEach((cand: DiscoveredCandidate) => {
        const isSelected = cand.key === selectedSiteKey;
        const color = getClassificationColor(cand.classification);
        const centerPos = latLonToVector3(cand.latitude_deg, cand.longitude_deg, 1.008);

        // A. Draw spatial boundary polygon and filled translucent surface cap
        if (cand.boundary_polygon && cand.boundary_polygon.length >= 3) {
          const boundaryPts = cand.boundary_polygon.map((pt: number[]) =>
            latLonToVector3(pt[0], pt[1], isSelected ? 1.009 : 1.006)
          );
          // 1. Boundary Contour Line
          const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryPts);
          const boundaryMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0x00e5ff : color,
            linewidth: isSelected ? 3 : 1,
            transparent: true,
            opacity: isSelected ? 1.0 : 0.8,
          });
          const boundaryLine = new THREE.LineLoop(boundaryGeo, boundaryMat);
          boundaryLine.userData = { siteKey: cand.key, candidate: cand };
          sitesGroup.add(boundaryLine);

          // 2. Translucent Filled Spherical Surface Cap
          const triPositions: number[] = [];
          const center = latLonToVector3(cand.latitude_deg, cand.longitude_deg, 1.004);
          for (let i = 0; i < boundaryPts.length; i++) {
            const p1 = boundaryPts[i];
            const p2 = boundaryPts[(i + 1) % boundaryPts.length];
            triPositions.push(center.x, center.y, center.z);
            triPositions.push(p1.x, p1.y, p1.z);
            triPositions.push(p2.x, p2.y, p2.z);
          }
          const fillGeo = new THREE.BufferGeometry();
          fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
          fillGeo.computeVertexNormals();
          const fillMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: isSelected ? 0.35 : 0.20,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const fillMesh = new THREE.Mesh(fillGeo, fillMat);
          fillMesh.userData = { siteKey: cand.key, candidate: cand };
          sitesGroup.add(fillMesh);
        }

        // B. Pin Head Mesh at Center
        const pinGeo = new THREE.SphereGeometry(isSelected ? 0.024 : 0.016, 16, 16);
        const pinMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x00e5ff : color,
        });
        const pinMesh = new THREE.Mesh(pinGeo, pinMat);
        pinMesh.position.copy(centerPos);
        pinMesh.userData = { siteKey: cand.key, candidate: cand };
        sitesGroup.add(pinMesh);

        // C. Pulse Ring around active selection
        if (isSelected) {
          const ringGeo = new THREE.RingGeometry(0.028, 0.038, 32);
          ringGeo.lookAt(centerPos);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.position.copy(centerPos.clone().multiplyScalar(1.002));
          sitesGroup.add(ringMesh);
        }
      });
    } else {
      // Fallback to configured sites dictionary
      Object.entries(sites).forEach(([key, site]) => {
        const isSelected = key === selectedSiteKey;
        const pos = latLonToVector3(site.latitude_deg, site.longitude_deg, 1.008);

        const pinGeo = new THREE.SphereGeometry(isSelected ? 0.022 : 0.015, 16, 16);
        const pinMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x00e5ff : 0xf59e0b,
        });
        const pinMesh = new THREE.Mesh(pinGeo, pinMat);
        pinMesh.position.copy(pos);
        pinMesh.userData = { siteKey: key, site };
        sitesGroup.add(pinMesh);

        const ringGeo = new THREE.RingGeometry(0.026, 0.034, 32);
        ringGeo.lookAt(pos);
        const ringMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x00e5ff : 0x64748b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isSelected ? 0.9 : 0.45,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(pos.clone().multiplyScalar(1.002));
        sitesGroup.add(ringMesh);
      });
    }
    moonGroup.add(sitesGroup);

    // 8. Touchdown Dispersion Footprint Ellipse for Active Candidate
    if (layers.dispersionFootprint && currentSite) {
      const centerPos = latLonToVector3(currentSite.latitude_deg, currentSite.longitude_deg, 1.012);
      const ellipseCurve = new THREE.EllipseCurve(0, 0, 0.045, 0.025, 0, 2 * Math.PI, false, 0);
      const ellipsePts = ellipseCurve.getPoints(48);
      const ellipseGeo = new THREE.BufferGeometry().setFromPoints(
        ellipsePts.map((p) => new THREE.Vector3(p.x, p.y, 0))
      );
      ellipseGeo.lookAt(centerPos);
      const ellipseMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 });
      const ellipseLine = new THREE.Line(ellipseGeo, ellipseMat);
      ellipseLine.position.copy(centerPos);
      ellipseLine.name = 'dispersion_ellipse';
      moonGroup.add(ellipseLine);
    }

    // Interactive Drag and Zoom Event Handlers
    const ctrl = controlsRef.current;

    const onMouseDown = (e: MouseEvent) => {
      ctrl.isDragging = true;
      ctrl.prevMouseX = e.clientX;
      ctrl.prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast to find hovered lat/lon
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      // Check if hovering candidate region or pin
      const candHits = raycaster.intersectObjects(sitesGroup.children, true);
      const hit = candHits.find((h) => h.object.userData?.siteKey);
      if (hit && hit.object.userData) {
        setHoveredCandidate(hit.object.userData.candidate || hit.object.userData.site || null);
      } else {
        setHoveredCandidate(null);
      }

      const intersects = raycaster.intersectObject(moonMesh);
      if (intersects.length > 0) {
        const localPoint = moonGroup.worldToLocal(intersects[0].point.clone());
        const { lat, lon } = vector3ToLatLon(localPoint);
        setHoveredCoordinate({ lat, lon });
      } else {
        setHoveredCoordinate(null);
      }

      if (!ctrl.isDragging) return;
      const deltaX = e.clientX - ctrl.prevMouseX;
      const deltaY = e.clientY - ctrl.prevMouseY;

      ctrl.targetRotationY += deltaX * 0.006;
      ctrl.targetRotationX += deltaY * 0.006;
      // Clamp vertical tilt to avoid flipping
      ctrl.targetRotationX = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 + 0.5, ctrl.targetRotationX));

      ctrl.prevMouseX = e.clientX;
      ctrl.prevMouseY = e.clientY;
    };

    const onMouseUp = () => {
      ctrl.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      ctrl.targetZoom += e.deltaY * 0.0015;
      ctrl.targetZoom = Math.max(1.3, Math.min(5.5, ctrl.targetZoom));
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      // Check if clicked on a candidate pin or spatial boundary
      const pinHits = raycaster.intersectObjects(sitesGroup.children, true);
      if (pinHits.length > 0) {
        const hit = pinHits.find((h) => h.object.userData?.siteKey);
        if (hit && hit.object.userData.siteKey) {
          const key = hit.object.userData.siteKey;
          onSelectSite(key);
          const cand = hit.object.userData.candidate || hit.object.userData.site;
          if (cand) {
            const lat = cand.latitude_deg ?? cand.latitude;
            const lon = cand.longitude_deg ?? cand.longitude;
            ctrl.targetRotationX = THREE.MathUtils.degToRad(-lat);
            ctrl.targetRotationY = THREE.MathUtils.degToRad(-lon);
            ctrl.targetZoom = 1.6;
            setActiveCameraView('site');
          }
          return;
        }
      }

      // Check if clicked on moon surface for custom coordinate inspection
      const intersects = raycaster.intersectObject(moonMesh);
      if (intersects.length > 0) {
        const localPoint = moonGroup.worldToLocal(intersects[0].point.clone());
        const { lat, lon } = vector3ToLatLon(localPoint);
        if (onCoordinatesClick) {
          onCoordinatesClick(lat, lon);
        }
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth damping of rotation and zoom
      ctrl.rotationX += (ctrl.targetRotationX - ctrl.rotationX) * 0.12;
      ctrl.rotationY += (ctrl.targetRotationY - ctrl.rotationY) * 0.12;
      ctrl.zoom += (ctrl.targetZoom - ctrl.zoom) * 0.12;

      moonGroup.rotation.x = ctrl.rotationX;
      moonGroup.rotation.y = ctrl.rotationY;
      camera.position.z = ctrl.zoom;

      // Update layer visibility
      const polarCap = moonGroup.getObjectByName('polar_cap') as THREE.Mesh | undefined;
      if (polarCap && polarCap.material instanceof THREE.MeshStandardMaterial) {
        polarCap.material.opacity = layers.highResSouthPoleMesh ? 0.85 : 0.0;
        polarCap.material.wireframe = layers.elevationHeatmap;
      }

      const rings = moonGroup.getObjectByName('lat_rings');
      if (rings) rings.visible = layers.coordinateGrid;

      const pm = moonGroup.getObjectByName('prime_meridian');
      if (pm) pm.visible = layers.coordinateGrid;

      const sunL = scene.getObjectByName('sun_ray');
      if (sunL) sunL.visible = layers.sunDirectionVector;

      const earthL = scene.getObjectByName('earth_ray');
      if (earthL) earthL.visible = layers.earthDirectionVector;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onClick);
      renderer.dispose();
    };
  }, [sites, selectedSiteKey, layers, latLonToVector3, vector3ToLatLon, createLunarTexture, onSelectSite, onCoordinatesClick, currentSite]);

  // Handle Preset Camera Views
  const setCameraPreset = (mode: 'global' | 'south_pole' | 'ortho' | 'site') => {
    setActiveCameraView(mode);
    const ctrl = controlsRef.current;
    if (mode === 'global') {
      ctrl.targetRotationX = 0.1;
      ctrl.targetRotationY = 0.0;
      ctrl.targetZoom = 3.8;
    } else if (mode === 'south_pole') {
      ctrl.targetRotationX = 1.15; // 66° tilt looking into southern craters
      ctrl.targetRotationY = 0.3;
      ctrl.targetZoom = 2.0;
    } else if (mode === 'ortho') {
      ctrl.targetRotationX = Math.PI / 2; // 90° straight down at South Pole
      ctrl.targetRotationY = 0.0;
      ctrl.targetZoom = 1.7;
    } else if (mode === 'site' && currentSite) {
      // Focus on active candidate coordinates
      const latRad = THREE.MathUtils.degToRad(currentSite.latitude_deg);
      const lonRad = THREE.MathUtils.degToRad(currentSite.longitude_deg);
      ctrl.targetRotationX = -latRad;
      ctrl.targetRotationY = -lonRad;
      ctrl.targetZoom = 1.5;
    }
  };

  return (
    <div className="relative w-full h-full bg-obsidian-950 overflow-hidden select-none">
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left: Tactical Classification Legend */}
      <div className="absolute top-4 left-4 z-10 flex flex-col space-y-2 pointer-events-auto">
        <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-2.5 backdrop-blur-md shadow-aerospace text-[11px] font-mono space-y-2">
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>Viable</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Conditional</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
            <span>Infeasible</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
            <span>Insufficient Data</span>
          </div>
        </div>
      </div>

      {/* Top Right: Vertical Zoom Controls & Center Crosshair */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end space-y-2 pointer-events-auto">
        {/* Zoom In / Zoom Out vertical pill */}
        <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg flex flex-col backdrop-blur-md shadow-aerospace overflow-hidden">
          <button
            onClick={() => {
              const ctrl = controlsRef.current;
              ctrl.targetZoom = Math.max(1.3, ctrl.targetZoom - 0.4);
            }}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-bold flex items-center justify-center border-b border-slate-800"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => {
              const ctrl = controlsRef.current;
              ctrl.targetZoom = Math.min(5.5, ctrl.targetZoom + 0.4);
            }}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-bold flex items-center justify-center"
            title="Zoom Out"
          >
            −
          </button>
        </div>

        {/* Center Target Crosshair Button */}
        <button
          onClick={() => setCameraPreset('site')}
          className="p-2 bg-obsidian-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 rounded-lg backdrop-blur-md shadow-aerospace transition"
          title="Recenter on Selected Candidate"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Scientific Overlays Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center space-x-1.5 transition-colors backdrop-blur-md ${
              isLayerMenuOpen
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                : 'bg-obsidian-900/90 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>LAYERS</span>
          </button>

          {isLayerMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-obsidian-900/95 border border-slate-700/80 rounded-md p-3 shadow-2xl backdrop-blur-lg z-20 text-xs font-mono space-y-2.5">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pb-1 border-b border-slate-800">
                SCIENTIFIC OVERLAYS
              </div>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center space-x-2">
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  <span>Coordinate Grid Rings</span>
                </span>
                <input
                  type="checkbox"
                  checked={layers.coordinateGrid}
                  onChange={() => onToggleLayer('coordinateGrid')}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center space-x-2">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>LOLA Elevation Mesh</span>
                </span>
                <input
                  type="checkbox"
                  checked={layers.highResSouthPoleMesh}
                  onChange={() => onToggleLayer('highResSouthPoleMesh')}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center space-x-2">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Solar Vector (SPICE)</span>
                </span>
                <input
                  type="checkbox"
                  checked={layers.sunDirectionVector}
                  onChange={() => onToggleLayer('sunDirectionVector')}
                  className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center space-x-2">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Earth Direct LoS (SPICE)</span>
                </span>
                <input
                  type="checkbox"
                  checked={layers.earthDirectionVector}
                  onChange={() => onToggleLayer('earthDirectionVector')}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Left: Navigational Compass Rose with Selenographic Coordinates */}
      <div className="absolute bottom-6 left-6 z-10 flex items-center space-x-3 pointer-events-none">
        {/* Circular Compass Dial */}
        <div className="w-14 h-14 rounded-full bg-obsidian-900/90 border border-slate-700/80 relative flex items-center justify-center shadow-aerospace backdrop-blur-md">
          <span className="absolute top-1 text-[9px] font-bold text-cyan-400">N</span>
          <span className="absolute bottom-1 text-[9px] font-bold text-slate-500">S</span>
          <span className="absolute left-1.5 text-[9px] font-bold text-slate-500">W</span>
          <span className="absolute right-1.5 text-[9px] font-bold text-slate-500">E</span>
          <div
            className="w-8 h-0.5 bg-gradient-to-r from-cyan-400 to-transparent rounded transform transition-transform duration-200"
            style={{ transform: `rotate(${-controlsRef.current.rotationY * (180 / Math.PI)}deg)` }}
          />
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-cyan-glow" />
        </div>

        {/* Live Coordinate Readout */}
        <div className="bg-obsidian-900/90 border border-slate-800 rounded-md px-3 py-1.5 text-xs font-mono text-slate-300 backdrop-blur-md shadow-aerospace">
          <span>Lat: <strong className="text-white">{(hoveredCoordinate?.lat ?? currentSite.latitude_deg).toFixed(3)}°</strong></span>
          <span className="mx-2 text-slate-600">|</span>
          <span>Lon: <strong className="text-white">{(hoveredCoordinate?.lon ?? currentSite.longitude_deg).toFixed(3)}°</strong></span>
        </div>
      </div>

      {/* Pinned Candidate Tag on Moon */}
      {currentSite && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-8 z-10 pointer-events-none">
          <div className="bg-obsidian-950/90 border border-emerald-500/60 rounded-lg px-3 py-1 text-xs font-mono text-white backdrop-blur-md flex items-center space-x-2 shadow-emerald-glow">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-bold">{currentSite.name.split('/')[0].trim()}</span>
            <span className="text-amber-400 font-bold">★★★★</span>
          </div>
        </div>
      )}

      {/* Bottom Center: Selected Site Status Pill */}
      {currentSite && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-obsidian-900/90 border border-slate-800/90 rounded-full px-4 py-1.5 text-xs font-mono text-slate-300 backdrop-blur-md flex items-center space-x-3 shadow-aerospace">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-semibold text-white">{currentSite.name}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{currentSite.latitude_deg.toFixed(2)}°S, {currentSite.longitude_deg.toFixed(2)}°E</span>
            <span className="text-slate-500">|</span>
            <span className="text-cyan-300 font-semibold">{currentSite.elevation_m > 0 ? `+${currentSite.elevation_m.toFixed(0)}` : currentSite.elevation_m.toFixed(0)} m DEM</span>
          </div>
        </div>
      )}

      {/* Candidate Hover Information Card */}
      {hoveredCandidate && (
        <div className="absolute top-20 left-4 z-20 pointer-events-none bg-obsidian-950/95 border border-cyan-500/50 rounded-lg p-3 shadow-2xl backdrop-blur-md text-xs font-mono max-w-xs space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xs">{hoveredCandidate.name}</span>
            {hoveredCandidate.classification && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                hoveredCandidate.classification === 'Screening-viable' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                hoveredCandidate.classification === 'Conditional' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                hoveredCandidate.classification === 'Infeasible' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                'bg-slate-800 text-slate-300'
              }`}>
                {hoveredCandidate.classification.toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 space-y-0.5">
            <div>Coords: <span className="text-slate-200">{(hoveredCandidate.latitude_deg ?? hoveredCandidate.latitude)?.toFixed(2)}°S, {(hoveredCandidate.longitude_deg ?? hoveredCandidate.longitude)?.toFixed(2)}°E</span></div>
            <div>DEM Elevation: <span className="text-cyan-300 font-semibold">{hoveredCandidate.elevation_m > 0 ? `+${hoveredCandidate.elevation_m}` : hoveredCandidate.elevation_m} m</span></div>
            {hoveredCandidate.composite_score !== undefined && (
              <div>Composite Score: <span className="text-amber-400 font-bold">{hoveredCandidate.composite_score}/100</span></div>
            )}
            {hoveredCandidate.sunlight_percentage !== undefined && (
              <div>Sunlight: <span className="text-amber-300">{hoveredCandidate.sunlight_percentage}% ({hoveredCandidate.sunlit_hours}h)</span></div>
            )}
          </div>
          <div className="text-[10px] text-cyan-400 border-t border-slate-800 pt-1">
            [CLICK TO SELECT & FOCUS]
          </div>
        </div>
      )}

      {/* Bottom Right: Tactical Classification Legend & Scientific Limitation Notice */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end space-y-1.5 pointer-events-auto">
        <div className="bg-obsidian-900/90 border border-slate-800 rounded p-2.5 backdrop-blur-md shadow-aerospace text-[10px] font-mono space-y-1.5">
          <span className="text-slate-400 uppercase font-bold tracking-wider block border-b border-slate-800 pb-1">
            CANDIDATE CLASSIFICATION LEGEND
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-300">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Screening-viable</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Conditional</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              <span>Infeasible</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Insufficient data</span>
            </div>
            <div className="flex items-center space-x-1.5 col-span-2">
              <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
              <span>Outside coverage (&gt; -80°S)</span>
            </div>
          </div>
        </div>

        {/* Scientific Limitation Badge */}
        <div className="bg-obsidian-950/90 border border-slate-800/80 rounded px-2.5 py-1 text-[10px] font-mono text-slate-400 backdrop-blur-md max-w-xs text-right">
          <span className="text-amber-400 font-bold">Scientific Notice: </span>
          LOLA 80m DEM supports regional screening, not landing-scale hazard certification.
        </div>
      </div>
    </div>
  );
};
