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
  epochGeometry?: any | null;
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

/**
 * Generates an instant high-fidelity procedural canvas texture of the Moon.
 * Used as an immediate guarantee so the Moon never renders black under texture loading delays.
 */
function createFallbackLunarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base lunar highland regolith (realistic cool grey)
    ctx.fillStyle = '#b8bec8';
    ctx.fillRect(0, 0, 1024, 512);

    // Lunar maria (dark basaltic volcanic plains)
    ctx.fillStyle = '#5c6470';
    ctx.beginPath();
    ctx.ellipse(320, 220, 120, 80, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(450, 200, 70, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(540, 240, 60, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(600, 270, 45, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(640, 200, 40, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // South polar crater relief stippling
    ctx.fillStyle = '#8e96a4';
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 1024;
      const y = 340 + Math.random() * 172;
      const r = 2 + Math.random() * 8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
  epochGeometry,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const moonGroupRef = useRef<THREE.Group | null>(null);
  const sitesGroupRef = useRef<THREE.Group | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunRayRef = useRef<THREE.Line | null>(null);
  const earthRayRef = useRef<THREE.Line | null>(null);

  // Keep latest mutable props in refs so callbacks & loops never tear down the WebGL canvas
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;
  const onCoordinatesClickRef = useRef(onCoordinatesClick);
  onCoordinatesClickRef.current = onCoordinatesClick;

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
    rotationX: 1.15, // Tilt to look into the South Pole craters by default
    rotationY: 0.2,
    targetRotationX: 1.15,
    targetRotationY: 0.2,
    zoom: 2.1,
    targetZoom: 2.1,
  });

  const [activeCameraView, setActiveCameraView] = useState<'global' | 'south_pole' | 'ortho' | 'site'>('south_pole');
  const [hoveredCoordinate, setHoveredCoordinate] = useState<{ lat: number; lon: number } | null>(null);
  const [hoveredCandidate, setHoveredCandidate] = useState<any | null>(null);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  // Convert Selenographic (lat, lon) on unit sphere to 3D Cartesian
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

  // ---------------------------------------------------------------------------
  // 1. One-Time Three.js Mount Lifecycle (Runs once; never tears down canvas)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    camera.position.set(0, 0, 2.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

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

    // Group holding the Moon and attached surface geometries
    const moonGroup = new THREE.Group();
    moonGroupRef.current = moonGroup;
    scene.add(moonGroup);

    // 1. Lunar Globe Sphere with authentic NASA LRO/LOLA photographic & bump texture
    const fallbackTex = createFallbackLunarTexture();
    const textureLoader = new THREE.TextureLoader();

    const moonGeo = new THREE.SphereGeometry(1.0, 128, 128);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      map: fallbackTex,
      bumpMap: fallbackTex,
      bumpScale: 0.006, // Realistic tactile crater depth and mountain relief
      roughness: 0.82,
      metalness: 0.02,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.name = 'moon_sphere';
    moonMeshRef.current = moonMesh;
    moonGroup.add(moonMesh);

    // Load authentic NASA 2K photographic texture asynchronously
    textureLoader.load(
      '/textures/moon_2k.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        moonMat.map = tex;
        moonMat.bumpMap = tex;
        moonMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('LRO 2K texture load notice, using high-res fallback regolith texture:', err);
      }
    );

    // 2. Polar Latitude Rings (-80°, -84°, -87°, -89°)
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

    // 3. Prime Meridian Marker (Sub-Earth Meridian 0°)
    const primeMeridianCurve = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      primeMeridianCurve.push(latLonToVector3(lat, 0, 1.003));
    }
    const pmGeo = new THREE.BufferGeometry().setFromPoints(primeMeridianCurve);
    const pmMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.4 });
    const pmLine = new THREE.Line(pmGeo, pmMat);
    pmLine.name = 'prime_meridian';
    moonGroup.add(pmLine);

    // 4. Sun Direction Vector Ray & Solar Directional Light
    const sunDir = new THREE.Vector3(1.2, 0.45, 0.85).normalize();
    const sunLight = new THREE.DirectionalLight(0xfffdf2, 2.6);
    sunLight.position.copy(sunDir.clone().multiplyScalar(15));
    sunLightRef.current = sunLight;
    scene.add(sunLight);

    // Realistic Lunar Illumination:
    // A. Ambient light provides realistic base visibility so the dark side is never crushed to pitch black
    const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.42);
    scene.add(ambientLight);

    // B. Hemisphere light gives soft directional gradient between sky and space ground
    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.65);
    scene.add(hemiLight);

    // C. Earthshine fill light (simulating Earth's albedo reflection onto lunar near-side and pole)
    const earthshineLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    earthshineLight.position.set(-10, -5, 8);
    scene.add(earthshineLight);

    const sunRayGeo = new THREE.BufferGeometry().setFromPoints([
      sunDir.clone().multiplyScalar(1.05),
      sunDir.clone().multiplyScalar(3.0),
    ]);
    const sunRayMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });
    const sunRayLine = new THREE.Line(sunRayGeo, sunRayMat);
    sunRayLine.name = 'sun_ray';
    sunRayRef.current = sunRayLine;
    scene.add(sunRayLine);

    // 5. Earth Direction Vector Ray
    const earthDir = new THREE.Vector3(0.08, 0.05, 1.0).normalize();
    const earthRayGeo = new THREE.BufferGeometry().setFromPoints([
      earthDir.clone().multiplyScalar(1.05),
      earthDir.clone().multiplyScalar(3.0),
    ]);
    const earthRayMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.75 });
    const earthRayLine = new THREE.Line(earthRayGeo, earthRayMat);
    earthRayLine.name = 'earth_ray';
    earthRayRef.current = earthRayLine;
    scene.add(earthRayLine);

    // 6. Sites Group attached to moonGroup
    const sitesGroup = new THREE.Group();
    sitesGroup.name = 'sites_group';
    sitesGroupRef.current = sitesGroup;
    moonGroup.add(sitesGroup);

    // Event Handlers for Drag, Orbit, Zoom and Clicks
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

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      if (sitesGroupRef.current) {
        const candHits = raycaster.intersectObjects(sitesGroupRef.current.children, true);
        const hit = candHits.find((h) => h.object.userData?.siteKey);
        if (hit && hit.object.userData) {
          setHoveredCandidate(hit.object.userData.candidate || hit.object.userData.site || null);
        } else {
          setHoveredCandidate(null);
        }
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

      if (sitesGroupRef.current) {
        const pinHits = raycaster.intersectObjects(sitesGroupRef.current.children, true);
        if (pinHits.length > 0) {
          const hit = pinHits.find((h) => h.object.userData?.siteKey);
          if (hit && hit.object.userData.siteKey) {
            const key = hit.object.userData.siteKey;
            onSelectSiteRef.current(key);
            const cand = hit.object.userData.candidate || hit.object.userData.site;
            if (cand) {
              const lat = cand.latitude_deg ?? cand.latitude;
              const lon = cand.longitude_deg ?? cand.longitude;
              ctrl.targetRotationX = THREE.MathUtils.degToRad(-lat);
              ctrl.targetRotationY = THREE.MathUtils.degToRad(-lon);
              ctrl.targetZoom = 1.65;
              setActiveCameraView('site');
            }
            return;
          }
        }
      }

      const intersects = raycaster.intersectObject(moonMesh);
      if (intersects.length > 0) {
        const localPoint = moonGroup.worldToLocal(intersects[0].point.clone());
        const { lat, lon } = vector3ToLatLon(localPoint);
        if (onCoordinatesClickRef.current) {
          onCoordinatesClickRef.current(lat, lon);
        }
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Continuous 60 FPS Animation Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera damping
      ctrl.rotationX += (ctrl.targetRotationX - ctrl.rotationX) * 0.12;
      ctrl.rotationY += (ctrl.targetRotationY - ctrl.rotationY) * 0.12;
      ctrl.zoom += (ctrl.targetZoom - ctrl.zoom) * 0.12;

      moonGroup.rotation.x = ctrl.rotationX;
      moonGroup.rotation.y = ctrl.rotationY;
      camera.position.z = ctrl.zoom;

      // Dynamic Layer visibility checks (read from layersRef, zero DOM updates)
      const curLayers = layersRef.current;
      const rings = moonGroup.getObjectByName('lat_rings');
      if (rings) rings.visible = curLayers.coordinateGrid;

      const pm = moonGroup.getObjectByName('prime_meridian');
      if (pm) pm.visible = curLayers.coordinateGrid;

      if (sunRayRef.current) sunRayRef.current.visible = curLayers.sunDirectionVector;
      if (earthRayRef.current) earthRayRef.current.visible = curLayers.earthDirectionVector;
      if (sitesGroupRef.current) sitesGroupRef.current.visible = curLayers.candidateRegions;

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
  }, [latLonToVector3, vector3ToLatLon]);

  // ---------------------------------------------------------------------------
  // 2. Candidate Markers & Spatial Boundaries Rebuild (Updates in-place, NO blinking)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sitesGroup = sitesGroupRef.current;
    if (!sitesGroup) return;

    // Remove existing markers without touching the WebGL scene or moon sphere
    while (sitesGroup.children.length > 0) {
      const child = sitesGroup.children[0];
      sitesGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
    }

    if (discoveredCandidates && discoveredCandidates.length > 0) {
      discoveredCandidates.forEach((cand: DiscoveredCandidate) => {
        const isSelected = cand.key === selectedSiteKey;
        const color = getClassificationColor(cand.classification);
        const centerPos = latLonToVector3(cand.latitude_deg, cand.longitude_deg, 1.008);

        // A. Boundary contour line and filled translucent surface cap
        if (cand.boundary_polygon && cand.boundary_polygon.length >= 3) {
          const boundaryPts = cand.boundary_polygon.map((pt: number[]) =>
            latLonToVector3(pt[0], pt[1], isSelected ? 1.009 : 1.006)
          );
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

          // Translucent filled surface patch
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
            opacity: isSelected ? 0.35 : 0.18,
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
      // Fallback to configured sites catalog
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
  }, [sites, discoveredCandidates, selectedSiteKey, latLonToVector3]);

  // ---------------------------------------------------------------------------
  // 3. Smooth Camera Auto-Focus when selected site updates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentSite) {
      const latRad = THREE.MathUtils.degToRad(currentSite.latitude_deg);
      const lonRad = THREE.MathUtils.degToRad(currentSite.longitude_deg);
      const ctrl = controlsRef.current;
      ctrl.targetRotationX = -latRad;
      ctrl.targetRotationY = -lonRad;
      ctrl.targetZoom = 1.65;
      setActiveCameraView('site');
    }
  }, [selectedSiteKey, currentSite]);

  // ---------------------------------------------------------------------------
  // 4. Camera View Presets
  // ---------------------------------------------------------------------------
  const setCameraPreset = (mode: 'global' | 'south_pole' | 'ortho' | 'site') => {
    setActiveCameraView(mode);
    const ctrl = controlsRef.current;
    if (mode === 'global') {
      ctrl.targetRotationX = 0.1;
      ctrl.targetRotationY = 0.0;
      ctrl.targetZoom = 3.6;
    } else if (mode === 'south_pole') {
      ctrl.targetRotationX = 1.15; // 66° tilt looking into southern craters
      ctrl.targetRotationY = 0.3;
      ctrl.targetZoom = 2.0;
    } else if (mode === 'ortho') {
      ctrl.targetRotationX = Math.PI / 2; // 90° straight down at South Pole
      ctrl.targetRotationY = 0.0;
      ctrl.targetZoom = 1.65;
    } else if (mode === 'site' && currentSite) {
      const latRad = THREE.MathUtils.degToRad(currentSite.latitude_deg);
      const lonRad = THREE.MathUtils.degToRad(currentSite.longitude_deg);
      ctrl.targetRotationX = -latRad;
      ctrl.targetRotationY = -lonRad;
      ctrl.targetZoom = 1.65;
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
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
            <span>Insufficient Data</span>
          </div>
        </div>
      </div>

      {/* Top Right: Camera Zoom & Recenter HUD Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col space-y-1.5 pointer-events-auto">
        <button
          onClick={() => {
            const ctrl = controlsRef.current;
            ctrl.targetZoom = Math.max(1.3, ctrl.targetZoom - 0.35);
          }}
          className="w-8 h-8 rounded bg-obsidian-900/90 border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-sm shadow-aerospace transition"
          title="Zoom In (+)"
        >
          +
        </button>
        <button
          onClick={() => {
            const ctrl = controlsRef.current;
            ctrl.targetZoom = Math.min(5.5, ctrl.targetZoom + 0.35);
          }}
          className="w-8 h-8 rounded bg-obsidian-900/90 border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-sm shadow-aerospace transition"
          title="Zoom Out (−)"
        >
          −
        </button>
        <button
          onClick={() => setCameraPreset('south_pole')}
          className="w-8 h-8 rounded bg-obsidian-900/90 border border-slate-800 text-slate-200 hover:text-cyan-400 hover:bg-slate-800 flex items-center justify-center shadow-aerospace transition"
          title="Reset South Pole View"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Pinned Candidate Tag on the Moon */}
      {currentSite && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-16 pointer-events-none z-10">
          <div className="px-3 py-1 rounded bg-obsidian-900/90 border border-cyan-500/50 text-cyan-300 font-mono text-xs flex items-center space-x-1.5 shadow-cyan-glow backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="font-bold">{currentSite.name.split('/')[0].trim()}</span>
            <span className="text-amber-400 text-[10px]">★★★★</span>
          </div>
        </div>
      )}

      {/* Bottom Left: Navigational Compass Rose & Coordinate Readout */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center space-x-3 pointer-events-auto">
        <div className="bg-obsidian-900/90 border border-slate-800 rounded-lg p-2 flex items-center space-x-3 backdrop-blur-md shadow-aerospace">
          {/* Compass Rose */}
          <div className="relative w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center bg-obsidian-950">
            <span className="absolute top-0.5 text-[8px] font-bold text-cyan-400">N</span>
            <span className="absolute bottom-0.5 text-[8px] font-bold text-slate-500">S</span>
            <span className="absolute left-1 text-[8px] font-bold text-slate-500">W</span>
            <span className="absolute right-1 text-[8px] font-bold text-slate-500">E</span>
            <div
              className="w-6 h-6 flex items-center justify-center transition-transform duration-75"
              style={{
                transform: `rotate(${Math.round(THREE.MathUtils.radToDeg(-controlsRef.current.rotationY))}deg)`,
              }}
            >
              <Compass className="w-4 h-4 text-cyan-400" />
            </div>
          </div>

          {/* Coordinate Readout */}
          <div className="font-mono text-[11px] leading-tight">
            <div className="text-slate-400">
              Lat:{' '}
              <strong className="text-white">
                {hoveredCoordinate ? hoveredCoordinate.lat.toFixed(3) : currentSite.latitude_deg.toFixed(3)}°
              </strong>
            </div>
            <div className="text-slate-400">
              Lon:{' '}
              <strong className="text-white">
                {hoveredCoordinate ? hoveredCoordinate.lon.toFixed(3) : currentSite.longitude_deg.toFixed(3)}°
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
