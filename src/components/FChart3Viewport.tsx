import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Compass,
  Crosshair,
  Download,
  FileDown,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  angularDistanceDeg,
  CONSTELLATION_DATA,
  DSO_CATALOG,
  equatorialToGalacticLat,
  galacticToEquatorial,
  getVisibleStars,
  MILKY_WAY_CONTOURS,
} from '../data/astronomyData';
import {
  AtlasSheet,
  DSORecord,
  FChart3Config,
  StarRecord,
} from '../types/astronomy';
import {
  bvToStarColor,
  celestialToLonLat,
  computeLstDeg,
  computeStarRadius,
  createCelestialProjection,
  equatorialToHorizontal,
  exportSingleChartPdf,
  formatAltDeg,
  formatAzDeg,
  formatDecDeg,
  formatRaHours,
  horizontalToEquatorial,
  horizontalToLonLat,
  lonToAz,
} from '../utils/atlasGenerator';

interface FChart3ViewportProps {
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  activeSheet: AtlasSheet | null;
  allSheets: AtlasSheet[];
  onSelectSheet: (sheet: AtlasSheet) => void;
  selectedObject: { type: 'star' | 'dso'; data: StarRecord | DSORecord } | null;
  onSelectObject: (obj: { type: 'star' | 'dso'; data: StarRecord | DSORecord } | null) => void;
}

const CARDINAL_POINTS: Array<{ az: number; short: string; labelKo: string; major: boolean }> = [
  { az: 0, short: 'N', labelKo: '북(N)', major: true },
  { az: 45, short: 'NE', labelKo: '북동(NE)', major: false },
  { az: 90, short: 'E', labelKo: '동(E)', major: true },
  { az: 135, short: 'SE', labelKo: '남동(SE)', major: false },
  { az: 180, short: 'S', labelKo: '남(S)', major: true },
  { az: 225, short: 'SW', labelKo: '남서(SW)', major: false },
  { az: 270, short: 'W', labelKo: '서(W)', major: true },
  { az: 315, short: 'NW', labelKo: '북서(NW)', major: false },
];

export const FChart3Viewport: React.FC<FChart3ViewportProps> = ({
  config,
  onChangeConfig,
  activeSheet,
  allSheets,
  onSelectSheet,
  selectedObject,
  onSelectObject,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 600 });
  const [cursorCoords, setCursorCoords] = useState<{
    raHours: number;
    decDeg: number;
    azDeg: number;
    altDeg: number;
    galLat: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    raHours: number;
    decDeg: number;
    azDeg: number;
    altDeg: number;
  } | null>(null);

  // Measure pure star chart canvas container
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        setDimensions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = dimensions;
  const isHorizontal = config.coordinateSystem === 'horizontal';

  // Local Sidereal Time (degrees) from observationDateTime and observerLonDeg
  const lstDeg = useMemo(
    () => computeLstDeg(config.observationDateTime, config.observerLonDeg),
    [config.observationDateTime, config.observerLonDeg]
  );

  // Convert any celestial [raDeg, decDeg] into active projection [lon, lat]
  const skyCoordToLonLat = useCallback(
    (raDeg: number, decDeg: number): [number, number] => {
      if (isHorizontal) {
        const [az, alt] = equatorialToHorizontal(
          raDeg,
          decDeg,
          config.observerLatDeg,
          lstDeg
        );
        return horizontalToLonLat(az, alt);
      }
      return celestialToLonLat(raDeg, decDeg);
    },
    [isHorizontal, config.observerLatDeg, lstDeg]
  );

  const toSkyLineString = useCallback(
    (coordsRaDec: Array<[number, number]>): GeoJSON.LineString => ({
      type: 'LineString',
      coordinates: coordsRaDec.map(([ra, dec]) => skyCoordToLonLat(ra, dec)),
    }),
    [skyCoordToLonLat]
  );

  // Build D3 Celestial Projection (supports both Equatorial and Horizontal coordinate systems, min FOV = 1.0°)
  const projection = useMemo(() => {
    return createCelestialProjection(
      config.projection,
      width,
      height,
      config.centerRaHours,
      config.centerDecDeg,
      config.fovDeg,
      config.mirrorHorizontal,
      config.mirrorVertical,
      config.coordinateSystem,
      config.centerAzDeg,
      config.centerAltDeg
    );
  }, [
    config.projection,
    width,
    height,
    config.centerRaHours,
    config.centerDecDeg,
    config.fovDeg,
    config.mirrorHorizontal,
    config.mirrorVertical,
    config.coordinateSystem,
    config.centerAzDeg,
    config.centerAltDeg,
  ]);

  const geoPath = useMemo(() => d3.geoPath(projection), [projection]);

  // Effective Equatorial Center [raDeg, decDeg] of current viewport for catalog filtering
  const effectiveEqCenter = useMemo<[number, number]>(() => {
    if (isHorizontal) {
      return horizontalToEquatorial(
        config.centerAzDeg,
        config.centerAltDeg,
        config.observerLatDeg,
        lstDeg
      );
    }
    return [((config.centerRaHours * 15) % 360 + 360) % 360, config.centerDecDeg];
  }, [
    isHorizontal,
    config.centerAzDeg,
    config.centerAltDeg,
    config.observerLatDeg,
    lstDeg,
    config.centerRaHours,
    config.centerDecDeg,
  ]);

  // Visible Stars for current field of view and limiting magnitude
  const visibleStars = useMemo(() => {
    const [centerRaDeg, centerDecDeg] = effectiveEqCenter;
    return getVisibleStars(
      centerRaDeg,
      centerDecDeg,
      config.fovDeg,
      config.limitStarMag
    ).sort((a, b) => b.mag - a.mag); // Faint stars first, bright stars on top
  }, [effectiveEqCenter, config.fovDeg, config.limitStarMag]);

  // Visible Deep-Sky Objects (Messier, Caldwell, and Extended Nebulae)
  const visibleDsos = useMemo(() => {
    const [centerRaDeg, centerDecDeg] = effectiveEqCenter;
    const maxAngle = Math.min(180, config.fovDeg * 0.85 + 15);
    return DSO_CATALOG.filter((d) => {
      const isSelected = selectedObject?.type === 'dso' && selectedObject.data.id === d.id;
      if (!isSelected && d.mag > config.limitDsoMag) return false;
      if (angularDistanceDeg(centerRaDeg, centerDecDeg, d.raDeg, d.decDeg) > maxAngle) {
        return false;
      }
      if (isSelected) return true;
      if (d.messierId) return config.showMessierObjects;
      if (d.caldwellId) return config.showCaldwellObjects;
      return config.showNebulaOutlines;
    });
  }, [
    effectiveEqCenter,
    config.fovDeg,
    config.limitDsoMag,
    config.showMessierObjects,
    config.showCaldwellObjects,
    config.showNebulaOutlines,
    selectedObject,
  ]);

  // Precompute Coordinate Graticule Lines (Equatorial RA/Dec OR Horizontal Alt/Az)
  const graticuleLines = useMemo(() => {
    if (!config.showEquatorialGrid) return { parallels: [], meridians: [] };

    if (isHorizontal) {
      const altStep =
        config.fovDeg <= 4
          ? 0.5
          : config.fovDeg <= 10
          ? 1
          : config.fovDeg <= 22
          ? 2
          : config.fovDeg <= 45
          ? 5
          : 10;
      const azStep =
        config.fovDeg <= 4
          ? 0.5
          : config.fovDeg <= 10
          ? 1
          : config.fovDeg <= 22
          ? 5
          : config.fovDeg <= 45
          ? 10
          : 15;

      const parallels: Array<{
        val: number;
        label: string;
        path: string | null;
        labelPt: [number, number] | null;
      }> = [];

      const altMin = Math.max(-85, Math.floor((config.centerAltDeg - config.fovDeg) / altStep) * altStep);
      const altMax = Math.min(85, Math.ceil((config.centerAltDeg + config.fovDeg) / altStep) * altStep);

      for (let alt = altMin; alt <= altMax; alt = Number((alt + altStep).toFixed(2))) {
        const coords: Array<[number, number]> = [];
        for (let az = 0; az <= 360; az += 3) {
          coords.push(horizontalToLonLat(az, alt));
        }
        const dPath = geoPath({ type: 'LineString', coordinates: coords });
        const labelPt = projection(horizontalToLonLat(config.centerAzDeg, alt));
        parallels.push({
          val: alt,
          label: `Alt ${alt > 0 ? `+${alt}` : alt}°`,
          path: dPath,
          labelPt,
        });
      }

      const meridians: Array<{
        val: number;
        label: string;
        path: string | null;
        labelPt: [number, number] | null;
      }> = [];

      for (let az = 0; az < 360; az = Number((az + azStep).toFixed(2))) {
        const coords: Array<[number, number]> = [];
        for (let alt = -85; alt <= 85; alt += 2.5) {
          coords.push(horizontalToLonLat(az, alt));
        }
        const dPath = geoPath({ type: 'LineString', coordinates: coords });
        const labelPt = projection(horizontalToLonLat(az, config.centerAltDeg));
        meridians.push({
          val: az,
          label: `Az ${az}°`,
          path: dPath,
          labelPt,
        });
      }

      return { parallels, meridians };
    }

    // Equatorial RA/Dec Grid
    const decStep =
      config.fovDeg <= 4
        ? 0.5
        : config.fovDeg <= 10
        ? 1
        : config.fovDeg <= 18
        ? 2
        : config.fovDeg <= 40
        ? 5
        : 10;
    const raStepHours =
      config.fovDeg <= 4
        ? 1 / 12
        : config.fovDeg <= 10
        ? 0.25
        : config.fovDeg <= 18
        ? 0.5
        : config.fovDeg <= 40
        ? 1
        : 2;

    const parallels: Array<{
      val: number;
      label: string;
      path: string | null;
      labelPt: [number, number] | null;
    }> = [];

    const decMin = Math.max(-85, Math.floor((config.centerDecDeg - config.fovDeg) / decStep) * decStep);
    const decMax = Math.min(85, Math.ceil((config.centerDecDeg + config.fovDeg) / decStep) * decStep);

    for (let dec = decMin; dec <= decMax; dec = Number((dec + decStep).toFixed(2))) {
      const coords: Array<[number, number]> = [];
      for (let ra = 0; ra <= 360; ra += 3) {
        coords.push(celestialToLonLat(ra, dec));
      }
      const dPath = geoPath({ type: 'LineString', coordinates: coords });
      const labelPt = projection(celestialToLonLat(config.centerRaHours * 15, dec));
      parallels.push({
        val: dec,
        label: dec > 0 ? `+${dec}°` : `${dec}°`,
        path: dPath,
        labelPt,
      });
    }

    const meridians: Array<{
      val: number;
      label: string;
      path: string | null;
      labelPt: [number, number] | null;
    }> = [];

    const totalSteps = Math.round(24 / raStepHours);
    for (let i = 0; i < totalSteps; i++) {
      const raH = i * raStepHours;
      const raDeg = raH * 15;
      const coords: Array<[number, number]> = [];
      for (let dec = -85; dec <= 85; dec += 2.5) {
        coords.push(celestialToLonLat(raDeg, dec));
      }
      const dPath = geoPath({ type: 'LineString', coordinates: coords });
      const labelPt = projection(celestialToLonLat(raDeg, config.centerDecDeg));
      const hInt = Math.floor(raH + 1e-6);
      const mInt = Math.round((raH - hInt) * 60);
      meridians.push({
        val: raH,
        label: mInt === 0 ? `${hInt}h` : `${hInt}h${String(mInt).padStart(2, '0')}m`,
        path: dPath,
        labelPt,
      });
    }

    return { parallels, meridians };
  }, [
    config.showEquatorialGrid,
    isHorizontal,
    config.fovDeg,
    config.centerAltDeg,
    config.centerAzDeg,
    config.centerDecDeg,
    config.centerRaHours,
    geoPath,
    projection,
  ]);

  // Horizon & Ground Mask Geometry for Horizontal Coordinate System
  const horizonGroundGeometry = useMemo(() => {
    if (!isHorizontal || !config.showHorizonGround) {
      return {
        sectorPaths: [] as string[],
        horizonLinePath: null as string | null,
        groundContours: [] as string[],
      };
    }

    // 8 convex spherical sectors covering Alt <= 0° (0..45, 45..90, ..., 315..360)
    const sectorPaths: string[] = [];
    for (let s = 0; s < 8; s++) {
      const az1 = s * 45;
      const az2 = (s + 1) * 45;
      const ring: Array<[number, number]> = [];
      // Top edge along horizon (Alt = 0°) from az2 down to az1 so interior (Alt < 0) is on the left
      for (let az = az2; az >= az1; az -= 3) {
        ring.push(horizontalToLonLat(az, 0));
      }
      // Left edge down to Alt = -89.5°
      for (let alt = -5; alt >= -89.5; alt -= 10) {
        ring.push(horizontalToLonLat(az1, alt));
      }
      // Bottom edge near nadir
      for (let az = az1; az <= az2; az += 9) {
        ring.push(horizontalToLonLat(az, -89.5));
      }
      // Right edge back up to horizon
      for (let alt = -80; alt <= 0; alt += 10) {
        ring.push(horizontalToLonLat(az2, alt));
      }
      ring.push(horizontalToLonLat(az2, 0));

      const p = geoPath({
        type: 'Polygon',
        coordinates: [ring],
      });
      if (p) sectorPaths.push(p);
    }

    // Horizon Great Circle (Alt = 0°)
    const horizonCoords: Array<[number, number]> = [];
    for (let az = 0; az <= 360; az += 2) {
      horizonCoords.push(horizontalToLonLat(az, 0));
    }
    const horizonLinePath = geoPath({
      type: 'LineString',
      coordinates: horizonCoords,
    });

    // Subtle below-horizon ground depression contours (-10°, -20°, -30°)
    const groundContours: string[] = [];
    [-10, -20, -30].forEach((alt) => {
      const c: Array<[number, number]> = [];
      for (let az = 0; az <= 360; az += 3) {
        c.push(horizontalToLonLat(az, alt));
      }
      const p = geoPath({ type: 'LineString', coordinates: c });
      if (p) groundContours.push(p);
    });

    return { sectorPaths, horizonLinePath, groundContours };
  }, [isHorizontal, config.showHorizonGround, geoPath]);

  // Ecliptic & Galactic Equator paths
  const referenceCircles = useMemo(() => {
    if (!config.showEclipticAndGalactic) return { eclipticPath: null, galacticPath: null };
    const obliquity = 23.43928 * (Math.PI / 180);
    const eclCoords: Array<[number, number]> = [];
    for (let lam = 0; lam <= 360; lam += 3) {
      const lRad = (lam * Math.PI) / 180;
      const sinDec = Math.sin(lRad) * Math.sin(obliquity);
      const dec = (Math.asin(sinDec) * 180) / Math.PI;
      const y = Math.sin(lRad) * Math.cos(obliquity);
      const x = Math.cos(lRad);
      const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      eclCoords.push([ra, dec]);
    }

    const galCoords: Array<[number, number]> = [];
    for (let l = 0; l <= 360; l += 3) {
      galCoords.push(galacticToEquatorial(l, 0));
    }

    return {
      eclipticPath: geoPath(toSkyLineString(eclCoords)),
      galacticPath: geoPath(toSkyLineString(galCoords)),
    };
  }, [config.showEclipticAndGalactic, geoPath, toSkyLineString]);

  // Palette definitions for the 3 cartographic themes
  const palette = useMemo(() => {
    if (config.colorScheme === 'paper') {
      return {
        bg: '#FFFFFF',
        gridStroke: '#E2E8F0',
        gridText: '#64748B',
        mwLevel1Fill: 'rgba(186, 230, 253, 0.24)',
        mwLevel1Stroke: '#38BDF8',
        mwLevel2Fill: 'rgba(125, 211, 252, 0.28)',
        mwLevel2Stroke: '#0284C7',
        mwLevel3Fill: 'rgba(56, 189, 248, 0.32)',
        mwLevel3Stroke: '#0369A1',
        boundaryStroke: '#94A3B8',
        stickStroke: '#475569',
        conLabel: '#334155',
        nebulaStroke: '#059669',
        nebulaFill: 'rgba(16, 185, 129, 0.09)',
        galaxyStroke: '#D97706',
        galaxyFill: 'rgba(245, 158, 11, 0.10)',
        clusterStroke: '#2563EB',
        starHalo: '#FFFFFF',
        starLabel: '#0F172A',
        eclipticStroke: '#DC2626',
        galacticEqStroke: '#0284C7',
        borderStroke: '#0F172A',
        groundFill: 'rgba(226, 232, 240, 0.90)',
        horizonStroke: '#15803D',
        cardinalBg: '#0F172A',
        cardinalText: '#FFFFFF',
        crosshairStroke: '#0284C7',
      };
    }
    if (config.colorScheme === 'nightvision') {
      return {
        bg: '#090202',
        gridStroke: '#3B0808',
        gridText: '#991B1B',
        mwLevel1Fill: 'rgba(127, 29, 29, 0.14)',
        mwLevel1Stroke: '#7F1D1D',
        mwLevel2Fill: 'rgba(153, 27, 27, 0.18)',
        mwLevel2Stroke: '#991B1B',
        mwLevel3Fill: 'rgba(185, 28, 28, 0.22)',
        mwLevel3Stroke: '#DC2626',
        boundaryStroke: '#7F1D1D',
        stickStroke: '#B91C1C',
        conLabel: '#EF4444',
        nebulaStroke: '#F87171',
        nebulaFill: 'rgba(239, 68, 68, 0.10)',
        galaxyStroke: '#EF4444',
        galaxyFill: 'rgba(220, 38, 38, 0.12)',
        clusterStroke: '#FCA5A5',
        starHalo: '#090202',
        starLabel: '#FCA5A5',
        eclipticStroke: '#DC2626',
        galacticEqStroke: '#991B1B',
        borderStroke: '#991B1B',
        groundFill: 'rgba(28, 6, 6, 0.92)',
        horizonStroke: '#EF4444',
        cardinalBg: '#450A0A',
        cardinalText: '#FCA5A5',
        crosshairStroke: '#EF4444',
      };
    }
    // Observatory Dark Mode
    return {
      bg: '#070A12',
      gridStroke: '#162032',
      gridText: '#64748B',
      mwLevel1Fill: 'rgba(14, 116, 144, 0.11)',
      mwLevel1Stroke: 'rgba(6, 182, 212, 0.42)',
      mwLevel2Fill: 'rgba(6, 182, 212, 0.14)',
      mwLevel2Stroke: 'rgba(34, 211, 238, 0.62)',
      mwLevel3Fill: 'rgba(34, 211, 238, 0.18)',
      mwLevel3Stroke: 'rgba(103, 232, 249, 0.85)',
      boundaryStroke: '#334155',
      stickStroke: 'rgba(56, 189, 248, 0.78)',
      conLabel: '#94A3B8',
      nebulaStroke: '#34D399',
      nebulaFill: 'rgba(16, 185, 129, 0.12)',
      galaxyStroke: '#FBBF24',
      galaxyFill: 'rgba(245, 158, 11, 0.14)',
      clusterStroke: '#38BDF8',
      starHalo: '#070A12',
      starLabel: '#E2E8F0',
      eclipticStroke: '#F43F5E',
      galacticEqStroke: '#06B6D4',
      borderStroke: '#334155',
      groundFill: 'rgba(8, 22, 18, 0.91)',
      horizonStroke: '#10B981',
      cardinalBg: '#064E3B',
      cardinalText: '#A7F3D0',
      crosshairStroke: '#22D3EE',
    };
  }, [config.colorScheme]);

  // Switch between Equatorial and Horizontal while preserving current view center
  const handleToggleCoordinateSystem = (targetMode: 'equatorial' | 'horizontal') => {
    if (targetMode === config.coordinateSystem) return;
    if (targetMode === 'horizontal') {
      const [az, alt] = equatorialToHorizontal(
        config.centerRaHours * 15,
        config.centerDecDeg,
        config.observerLatDeg,
        lstDeg
      );
      onChangeConfig((prev) => ({
        ...prev,
        coordinateSystem: 'horizontal',
        centerAzDeg: Number(az.toFixed(1)),
        centerAltDeg: Number(Math.max(-85, Math.min(89, alt)).toFixed(1)),
      }));
    } else {
      const [raDeg, decDeg] = horizontalToEquatorial(
        config.centerAzDeg,
        config.centerAltDeg,
        config.observerLatDeg,
        lstDeg
      );
      onChangeConfig((prev) => ({
        ...prev,
        coordinateSystem: 'equatorial',
        centerRaHours: Number((raDeg / 15).toFixed(3)),
        centerDecDeg: Number(Math.max(-89.5, Math.min(89.5, decDeg)).toFixed(2)),
      }));
    }
  };

  // Pointer handlers for interactive celestial pan & coordinate probing
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      raHours: config.centerRaHours,
      decDeg: config.centerDecDeg,
      azDeg: config.centerAzDeg,
      altDeg: config.centerAltDeg,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Update live coordinate probe
    if (projection.invert) {
      const inv = projection.invert([mx, my]);
      if (inv && !Number.isNaN(inv[0]) && !Number.isNaN(inv[1])) {
        if (isHorizontal) {
          const azDeg = lonToAz(inv[0]);
          const altDeg = Math.max(-90, Math.min(90, inv[1]));
          const [raDeg, decDeg] = horizontalToEquatorial(
            azDeg,
            altDeg,
            config.observerLatDeg,
            lstDeg
          );
          setCursorCoords({
            raHours: raDeg / 15,
            decDeg,
            azDeg,
            altDeg,
            galLat: equatorialToGalacticLat(raDeg, decDeg),
          });
        } else {
          const raDeg = ((-inv[0] % 360) + 360) % 360;
          const decDeg = Math.max(-90, Math.min(90, inv[1]));
          const [azDeg, altDeg] = equatorialToHorizontal(
            raDeg,
            decDeg,
            config.observerLatDeg,
            lstDeg
          );
          setCursorCoords({
            raHours: raDeg / 15,
            decDeg,
            azDeg,
            altDeg,
            galLat: equatorialToGalacticLat(raDeg, decDeg),
          });
        }
      }
    }

    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const degPerPx = config.fovDeg / Math.min(width, height);
    const mirrorSignX = config.mirrorHorizontal ? -1 : 1;
    const mirrorSignY = config.mirrorVertical ? -1 : 1;

    if (isHorizontal) {
      const cosAlt = Math.max(0.2, Math.cos((dragStartRef.current.altDeg * Math.PI) / 180));
      const dAzDeg = -(dx * degPerPx * mirrorSignX) / cosAlt;
      const dAltDeg = dy * degPerPx * mirrorSignY;
      const nextAz = ((dragStartRef.current.azDeg + dAzDeg) % 360 + 360) % 360;
      const nextAlt = Math.max(-89.5, Math.min(89.5, dragStartRef.current.altDeg + dAltDeg));
      const [eqRaDeg, eqDecDeg] = horizontalToEquatorial(
        nextAz,
        nextAlt,
        config.observerLatDeg,
        lstDeg
      );

      onChangeConfig((prev) => ({
        ...prev,
        centerAzDeg: Number(nextAz.toFixed(2)),
        centerAltDeg: Number(nextAlt.toFixed(2)),
        centerRaHours: Number((eqRaDeg / 15).toFixed(3)),
        centerDecDeg: Number(eqDecDeg.toFixed(2)),
      }));
    } else {
      const cosDec = Math.max(0.2, Math.cos((dragStartRef.current.decDeg * Math.PI) / 180));
      const dRaHours = (dx * degPerPx * mirrorSignX) / (15 * cosDec);
      const dDecDeg = dy * degPerPx * mirrorSignY;

      const nextRa = ((dragStartRef.current.raHours + dRaHours) % 24 + 24) % 24;
      const nextDec = Math.max(-89.5, Math.min(89.5, dragStartRef.current.decDeg + dDecDeg));
      const [az, alt] = equatorialToHorizontal(
        nextRa * 15,
        nextDec,
        config.observerLatDeg,
        lstDeg
      );

      onChangeConfig((prev) => ({
        ...prev,
        centerRaHours: Number(nextRa.toFixed(3)),
        centerDecDeg: Number(nextDec.toFixed(2)),
        centerAzDeg: Number(az.toFixed(1)),
        centerAltDeg: Number(alt.toFixed(1)),
      }));
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Wheel handler for smooth FOV zoom (min FOV = 1.0°)
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    onChangeConfig((prev) => ({
      ...prev,
      fovDeg: Number(Math.max(1.0, Math.min(145, prev.fovDeg * factor)).toFixed(1)),
    }));
  };

  // Download standalone vector SVG file (pure star chart without UI boxes)
  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgRef.current);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fchart3_vector_RA${formatRaHours(
      config.centerRaHours,
      true
    )}_Dec${formatDecDeg(config.centerDecDeg, true)}_FOV${config.fovDeg.toFixed(1)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Pixels per degree at chart center for Telrad, Scale Bar & DSO sizing
  const pxPerDeg = Math.min(width, height) / config.fovDeg;
  const barDeg =
    config.fovDeg >= 60
      ? 10
      : config.fovDeg >= 25
      ? 5
      : config.fovDeg >= 10
      ? 2
      : config.fovDeg >= 4
      ? 1
      : config.fovDeg >= 2
      ? 0.5
      : 0.2;
  const barPx = Math.min(150, Math.max(36, barDeg * pxPerDeg));

  return (
    <div className="flex-1 flex flex-col h-full min-h-[620px] select-none overflow-hidden bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800">
      {/* =====================================================================
          1. TOP INSTRUMENT BAR (성도 바깥 상단: 좌표계 전환 · 좌표 제원 · 커서 프로브 · 줌 및 벡터 출력 버튼)
         ===================================================================== */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Coordinate System Badge, J2000/Alt-Az Coordinates, FOV, Star Count & Cursor Probe */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          {/* Quick Coordinate System Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => handleToggleCoordinateSystem('equatorial')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                !isHorizontal
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              적도좌표계 (RA/Dec)
            </button>
            <button
              type="button"
              onClick={() => handleToggleCoordinateSystem('horizontal')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                isHorizontal
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              지평좌표계 (Az/Alt)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>{isHorizontal ? config.observerLocationName : 'J2000.0'}</span>
            <span aria-hidden="true">·</span>
            <span>{config.projection.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>FOV {config.fovDeg.toFixed(1)}°</span>
            <span aria-hidden="true">·</span>
            <span>Stars: {visibleStars.length.toLocaleString()}</span>
          </div>

          <div className="flex items-baseline gap-3 font-mono tabular-nums text-xs">
            {isHorizontal ? (
              <>
                <div>
                  <span className="text-[11px] text-slate-400 mr-1">AZ</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatAzDeg(config.centerAzDeg)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 mr-1">ALT</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatAltDeg(config.centerAltDeg)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[11px] text-slate-400 mr-1">RA</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatRaHours(config.centerRaHours)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 mr-1">DEC</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatDecDeg(config.centerDecDeg)}
                  </span>
                </div>
              </>
            )}
            <div>
              <span className="text-[11px] text-slate-400 mr-1">MAG</span>
              <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                ≤ {config.limitStarMag.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Cursor Probe Readout (Outside the Star Chart) */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded">
            <Crosshair className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            {cursorCoords ? (
              isHorizontal ? (
                <>
                  <span>커서 방위각 {formatAzDeg(cursorCoords.azDeg)}</span>
                  <span aria-hidden="true">·</span>
                  <span>고도 {formatAltDeg(cursorCoords.altDeg)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ({formatRaHours(cursorCoords.raHours, true)}{' '}
                    {formatDecDeg(cursorCoords.decDeg, true)})
                  </span>
                </>
              ) : (
                <>
                  <span>커서: {formatRaHours(cursorCoords.raHours)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDecDeg(cursorCoords.decDeg)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    은하위도 b={cursorCoords.galLat >= 0 ? '+' : ''}
                    {cursorCoords.galLat.toFixed(1)}°
                  </span>
                </>
              )
            ) : (
              <span>성도 위에 마우스를 올리면 실시간 천구 좌표를 표시합니다</span>
            )}
          </div>

          {/* Active Atlas Sheet Pointers if viewing an Atlas Sheet */}
          {activeSheet && (
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
                Chart #{activeSheet.sheetNumber}/{activeSheet.totalSheets}
              </span>
              {activeSheet.adjacentNorth && (
                <button
                  type="button"
                  onClick={() => {
                    const next = allSheets.find(
                      (s) => s.sheetNumber === activeSheet.adjacentNorth
                    );
                    if (next) onSelectSheet(next);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  N#{activeSheet.adjacentNorth}
                </button>
              )}
              {activeSheet.adjacentSouth && (
                <button
                  type="button"
                  onClick={() => {
                    const next = allSheets.find(
                      (s) => s.sheetNumber === activeSheet.adjacentSouth
                    );
                    if (next) onSelectSheet(next);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  S#{activeSheet.adjacentSouth}
                </button>
              )}
              {activeSheet.adjacentEast && (
                <button
                  type="button"
                  onClick={() => {
                    const next = allSheets.find(
                      (s) => s.sheetNumber === activeSheet.adjacentEast
                    );
                    if (next) onSelectSheet(next);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  E#{activeSheet.adjacentEast}
                </button>
              )}
              {activeSheet.adjacentWest && (
                <button
                  type="button"
                  onClick={() => {
                    const next = allSheets.find(
                      (s) => s.sheetNumber === activeSheet.adjacentWest
                    );
                    if (next) onSelectSheet(next);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  W#{activeSheet.adjacentWest}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Crosshair toggle, Ground toggle (if horizontal), Zoom, Reset, SVG Vector & Single PDF Export Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({
                ...prev,
                showCenterCrosshair: !prev.showCenterCrosshair,
              }))
            }
            className={`px-2 py-1.5 rounded border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              config.showCenterCrosshair
                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="중심 십자선 표시 전환"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>십자선</span>
          </button>

          {isHorizontal && (
            <button
              type="button"
              onClick={() =>
                onChangeConfig((prev) => ({
                  ...prev,
                  showHorizonGround: !prev.showHorizonGround,
                }))
              }
              className={`px-2 py-1.5 rounded border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                config.showHorizonGround
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="지평좌표계 지상 및 지평선 표시 전환"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>지상</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({
                ...prev,
                fovDeg: Number(Math.max(1.0, prev.fovDeg * 0.75).toFixed(1)),
              }))
            }
            className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="화각 확대 (최소 1.0°)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({
                ...prev,
                fovDeg: Number(Math.min(140, prev.fovDeg * 1.3).toFixed(1)),
              }))
            }
            className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="화각 축소 (Wider FOV)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({
                ...prev,
                centerRaHours: 5.588,
                centerDecDeg: -2.5,
                centerAzDeg: 180,
                centerAltDeg: 40,
                fovDeg: 35,
              }))
            }
            className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="기본 시야 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="px-2.5 py-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="현재 성도를 순수 벡터 SVG로 저장"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SVG 벡터</span>
          </button>
          <button
            type="button"
            onClick={() => exportSingleChartPdf(config)}
            className="px-2.5 py-1.5 rounded text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="현재 단일 성도를 출판용 벡터 PDF로 저장"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>단일 PDF</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. PURE UNOBSTRUCTED STAR CHART CANVAS (성도 내부에는 오직 천체·격자·십자선·지평선만 렌더링)
         ===================================================================== */}
      <div
        ref={chartContainerRef}
        className="relative flex-1 w-full min-h-[460px] overflow-hidden"
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          className={`block w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        >
          <defs>
            <pattern
              id="mw-stipple-pattern"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="0.65" fill={palette.mwLevel2Stroke} opacity="0.55" />
              <circle cx="6" cy="5" r="0.5" fill={palette.mwLevel3Stroke} opacity="0.45" />
            </pattern>
            <clipPath id="chart-frame-clip">
              <rect x="12" y="12" width={width - 24} height={height - 24} />
            </clipPath>
          </defs>

          {/* Chart Sky Background */}
          <rect x="0" y="0" width={width} height={height} fill={palette.bg} />

          {/* Clipped Celestial Cartography Layers */}
          <g clipPath="url(#chart-frame-clip)">
            {/* LAYER 1: Milky Way Isophote Contours */}
            {config.showMilkyWayContours && (
              <g id="layer-milky-way">
                {MILKY_WAY_CONTOURS.map((mw) => {
                  const fillStyle =
                    config.milkyWayStyle === 'stippled'
                      ? 'url(#mw-stipple-pattern)'
                      : config.milkyWayStyle === 'isophote_contour'
                      ? mw.level === 3
                        ? palette.mwLevel2Fill
                        : 'none'
                      : mw.level === 1
                      ? palette.mwLevel1Fill
                      : mw.level === 2
                      ? palette.mwLevel2Fill
                      : palette.mwLevel3Fill;

                  const strokeColor =
                    mw.level === 1
                      ? palette.mwLevel1Stroke
                      : mw.level === 2
                      ? palette.mwLevel2Stroke
                      : palette.mwLevel3Stroke;

                  return (
                    <g key={mw.id}>
                      {mw.polygons.map((poly, idx) => {
                        const dPath = geoPath(toSkyLineString(poly));
                        if (!dPath) return null;
                        return (
                          <path
                            key={`${mw.id}-${idx}`}
                            d={dPath}
                            fill={fillStyle}
                            stroke={strokeColor}
                            strokeWidth={mw.level === 3 ? 1.15 : mw.level === 2 ? 0.85 : 0.65}
                            strokeDasharray={
                              mw.level === 1 && config.milkyWayStyle === 'isophote_contour'
                                ? '4,3'
                                : undefined
                            }
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            )}

            {/* LAYER 2: Coordinate Grid (Equatorial RA/Dec or Horizontal Alt/Az) */}
            {config.showEquatorialGrid && (
              <g id="layer-coordinate-grid">
                {graticuleLines.parallels.map(({ val, label, path, labelPt }) => (
                  <React.Fragment key={`par-${val}`}>
                    {path && (
                      <path
                        d={path}
                        fill="none"
                        stroke={palette.gridStroke}
                        strokeWidth={val === 0 ? 1.1 : 0.65}
                      />
                    )}
                    {labelPt &&
                      labelPt[1] > 24 &&
                      labelPt[1] < height - 24 && (
                        <text
                          x={20}
                          y={labelPt[1] - 4}
                          fill={palette.gridText}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {label}
                        </text>
                      )}
                  </React.Fragment>
                ))}
                {graticuleLines.meridians.map(({ val, label, path, labelPt }) => (
                  <React.Fragment key={`mer-${val}`}>
                    {path && (
                      <path
                        d={path}
                        fill="none"
                        stroke={palette.gridStroke}
                        strokeWidth={val === 0 ? 1.1 : 0.65}
                      />
                    )}
                    {labelPt &&
                      labelPt[0] > 32 &&
                      labelPt[0] < width - 32 && (
                        <text
                          x={labelPt[0] + 4}
                          y={26}
                          fill={palette.gridText}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {label}
                        </text>
                      )}
                  </React.Fragment>
                ))}
              </g>
            )}

            {/* LAYER 2B: Ecliptic & Galactic Equator */}
            {config.showEclipticAndGalactic && (
              <g id="layer-reference-circles">
                {referenceCircles.eclipticPath && (
                  <path
                    d={referenceCircles.eclipticPath}
                    fill="none"
                    stroke={palette.eclipticStroke}
                    strokeWidth={1.0}
                    strokeDasharray="6,4"
                    opacity={0.75}
                  />
                )}
                {referenceCircles.galacticPath && (
                  <path
                    d={referenceCircles.galacticPath}
                    fill="none"
                    stroke={palette.galacticEqStroke}
                    strokeWidth={0.9}
                    strokeDasharray="2,4"
                    opacity={0.7}
                  />
                )}
              </g>
            )}

            {/* LAYER 3: Official IAU Constellation Boundaries */}
            {config.showConstellationBoundaries && (
              <g id="layer-constellation-boundaries">
                {CONSTELLATION_DATA.map((con) => {
                  const dPath = geoPath(toSkyLineString(con.boundaryPolygon));
                  if (!dPath) return null;
                  return (
                    <path
                      key={`bound-${con.constellation}`}
                      d={dPath}
                      fill="none"
                      stroke={palette.boundaryStroke}
                      strokeWidth={0.9}
                      strokeDasharray="5,4"
                    />
                  );
                })}
              </g>
            )}

            {/* LAYER 4: Constellation Stick Figures & Labels (All 88 Official IAU Constellations) */}
            {config.showConstellationLines && (
              <g id="layer-constellation-sticks">
                {CONSTELLATION_DATA.map((con) => {
                  const [lon, lat] = skyCoordToLonLat(
                    con.raCenterHours * 15,
                    con.decCenterDeg
                  );
                  const centerPt = projection([lon, lat]);

                  const visiblePts: Array<[number, number]> = [];
                  const maxAllowedJump = Math.max(width, height) * 0.9;

                  const renderedSegments = con.lines.map(([p1, p2], idx) => {
                    const pt1 = projection(skyCoordToLonLat(p1[0], p1[1]));
                    const pt2 = projection(skyCoordToLonLat(p2[0], p2[1]));

                    if (pt1 && pt2) {
                      const dx = pt2[0] - pt1[0];
                      const dy = pt2[1] - pt1[1];
                      const dist = Math.hypot(dx, dy);

                      if (
                        pt1[0] > 42 &&
                        pt1[0] < width - 42 &&
                        pt1[1] > 42 &&
                        pt1[1] < height - 42
                      ) {
                        visiblePts.push(pt1);
                      }
                      if (
                        pt2[0] > 42 &&
                        pt2[0] < width - 42 &&
                        pt2[1] > 42 &&
                        pt2[1] < height - 42
                      ) {
                        visiblePts.push(pt2);
                      }

                      const minX = Math.min(pt1[0], pt2[0]);
                      const maxX = Math.max(pt1[0], pt2[0]);
                      const minY = Math.min(pt1[1], pt2[1]);
                      const maxY = Math.max(pt1[1], pt2[1]);
                      const intersectsViewport =
                        maxX >= -80 &&
                        minX <= width + 80 &&
                        maxY >= -80 &&
                        minY <= height + 80;

                      if (intersectsViewport && dist > 0.1 && dist < maxAllowedJump) {
                        return (
                          <line
                            key={`line-${con.constellation}-${idx}`}
                            x1={pt1[0]}
                            y1={pt1[1]}
                            x2={pt2[0]}
                            y2={pt2[1]}
                            stroke={palette.stickStroke}
                            strokeWidth={1.35}
                            strokeLinecap="round"
                          />
                        );
                      }
                    }

                    const dPath = geoPath(toSkyLineString([p1, p2]));
                    if (!dPath) return null;
                    return (
                      <path
                        key={`line-${con.constellation}-${idx}`}
                        d={dPath}
                        fill="none"
                        stroke={palette.stickStroke}
                        strokeWidth={1.35}
                        strokeLinecap="round"
                      />
                    );
                  });

                  let labelPos: [number, number] | null = null;
                  if (
                    centerPt &&
                    centerPt[0] > 40 &&
                    centerPt[0] < width - 40 &&
                    centerPt[1] > 40 &&
                    centerPt[1] < height - 40
                  ) {
                    labelPos = centerPt;
                  } else if (visiblePts.length > 0) {
                    const avgX =
                      visiblePts.reduce((acc, p) => acc + p[0], 0) / visiblePts.length;
                    const avgY =
                      visiblePts.reduce((acc, p) => acc + p[1], 0) / visiblePts.length;
                    labelPos = [avgX, Math.max(28, avgY - 14)];
                  }

                  return (
                    <g key={`con-${con.constellation}`}>
                      {renderedSegments}
                      {labelPos && (
                        <text
                          x={labelPos[0]}
                          y={labelPos[1]}
                          textAnchor="middle"
                          fill={palette.conLabel}
                          fontSize="11"
                          fontWeight="600"
                          letterSpacing="0.06em"
                          opacity="0.92"
                        >
                          {con.constellation.toUpperCase()} · {con.nameKo}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* LAYER 5: Nebula Outlines, Messier & Caldwell Deep-Sky Objects */}
            {(config.showNebulaOutlines ||
              config.showMessierObjects ||
              config.showCaldwellObjects) && (
              <g id="layer-nebula-outlines">
                {visibleDsos.map((dso) => {
                  const [lon, lat] = skyCoordToLonLat(dso.raDeg, dso.decDeg);
                  const pt = projection([lon, lat]);
                  const isSelected =
                    selectedObject?.type === 'dso' && selectedObject.data.id === dso.id;

                  const radiusPx = Math.max(
                    5,
                    Math.min(72, ((dso.sizeMajorArcmin / 60) * pxPerDeg) / 2)
                  );
                  const minorPx = Math.max(
                    3.5,
                    Math.min(72, ((dso.sizeMinorArcmin / 60) * pxPerDeg) / 2)
                  );

                  return (
                    <g
                      key={dso.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectObject({ type: 'dso', data: dso });
                      }}
                      className="cursor-pointer"
                    >
                      {config.showNebulaOutlines &&
                        dso.contourPolygons &&
                        dso.contourPolygons.map((poly, pIdx) => {
                          const dPath = geoPath(toSkyLineString(poly));
                          if (!dPath) return null;
                          const isGal = dso.type.includes('galaxy');
                          return (
                            <path
                              key={`${dso.id}-contour-${pIdx}`}
                              d={dPath}
                              fill={isGal ? palette.galaxyFill : palette.nebulaFill}
                              stroke={isGal ? palette.galaxyStroke : palette.nebulaStroke}
                              strokeWidth={isSelected ? 2.0 : pIdx === 0 ? 1.35 : 0.95}
                              strokeDasharray={
                                dso.type === 'supernova_remnant' ? '4,2' : undefined
                              }
                            />
                          );
                        })}

                      {pt &&
                        pt[0] > 14 &&
                        pt[0] < width - 14 &&
                        pt[1] > 14 &&
                        pt[1] < height - 14 && (
                          <g transform={`translate(${pt[0]}, ${pt[1]})`}>
                            {isSelected && (
                              <circle
                                r={Math.max(radiusPx + 6, 14)}
                                fill="none"
                                stroke="#06B6D4"
                                strokeWidth="1.6"
                                strokeDasharray="3,3"
                              />
                            )}

                            {dso.type.includes('galaxy') && !dso.contourPolygons && (
                              <ellipse
                                rx={radiusPx}
                                ry={minorPx}
                                transform={`rotate(${dso.positionAngleDeg - 90})`}
                                fill={palette.galaxyFill}
                                stroke={palette.galaxyStroke}
                                strokeWidth="1.3"
                              />
                            )}

                            {dso.type === 'globular_cluster' && (
                              <g>
                                <circle
                                  r={Math.max(6, radiusPx)}
                                  fill="rgba(245, 158, 11, 0.10)"
                                  stroke={palette.galaxyStroke}
                                  strokeWidth="1.3"
                                />
                                <line
                                  x1={-Math.max(6, radiusPx)}
                                  y1={0}
                                  x2={Math.max(6, radiusPx)}
                                  y2={0}
                                  stroke={palette.galaxyStroke}
                                  strokeWidth="1.1"
                                />
                                <line
                                  x1={0}
                                  y1={-Math.max(6, radiusPx)}
                                  x2={0}
                                  y2={Math.max(6, radiusPx)}
                                  stroke={palette.galaxyStroke}
                                  strokeWidth="1.1"
                                />
                              </g>
                            )}

                            {dso.type === 'open_cluster' && (
                              <circle
                                r={Math.max(6.5, radiusPx * 0.7)}
                                fill="none"
                                stroke={palette.clusterStroke}
                                strokeWidth="1.35"
                                strokeDasharray="3,2.5"
                              />
                            )}

                            {dso.type === 'planetary_nebula' && (
                              <g>
                                <circle
                                  r={5.5}
                                  fill={palette.nebulaFill}
                                  stroke={palette.nebulaStroke}
                                  strokeWidth="1.3"
                                />
                                <line x1={-9} y1={0} x2={-5.5} y2={0} stroke={palette.nebulaStroke} strokeWidth="1.2" />
                                <line x1={5.5} y1={0} x2={9} y2={0} stroke={palette.nebulaStroke} strokeWidth="1.2" />
                                <line x1={0} y1={-9} x2={0} y2={-5.5} stroke={palette.nebulaStroke} strokeWidth="1.2" />
                                <line x1={0} y1={5.5} x2={0} y2={9} stroke={palette.nebulaStroke} strokeWidth="1.2" />
                              </g>
                            )}

                            {(dso.type === 'emission_nebula' ||
                              dso.type === 'reflection_nebula' ||
                              dso.type === 'supernova_remnant' ||
                              dso.type === 'dark_nebula') &&
                              !dso.contourPolygons && (
                                <rect
                                  x={-radiusPx}
                                  y={-minorPx}
                                  width={radiusPx * 2}
                                  height={minorPx * 2}
                                  rx="2"
                                  fill={palette.nebulaFill}
                                  stroke={palette.nebulaStroke}
                                  strokeWidth="1.25"
                                />
                              )}

                            {config.showDsoLabels && (
                              <text
                                x={Math.max(8, radiusPx * 0.65 + 5)}
                                y={3}
                                fill={
                                  dso.type.includes('galaxy')
                                    ? palette.galaxyStroke
                                    : dso.type === 'open_cluster'
                                    ? palette.clusterStroke
                                    : palette.nebulaStroke
                                }
                                fontSize="10.5"
                                fontFamily="JetBrains Mono, monospace"
                                fontWeight="600"
                              >
                                {dso.id} {config.fovDeg <= 45 ? dso.nameKo : ''}
                              </text>
                            )}
                          </g>
                        )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* LAYER 6: Stars with fchart3 Separation Halos, Double Bars & Variable Rings */}
            <g id="layer-stars">
              {visibleStars.map((st) => {
                const [lon, lat] = skyCoordToLonLat(st.raDeg, st.decDeg);
                const pt = projection([lon, lat]);
                if (
                  !pt ||
                  pt[0] < 14 ||
                  pt[0] > width - 14 ||
                  pt[1] < 14 ||
                  pt[1] > height - 14
                ) {
                  return null;
                }

                const r = computeStarRadius(
                  st.mag,
                  config.limitStarMag,
                  config.starScaleFactor,
                  1.0
                );
                const color = bvToStarColor(st.bv, config.colorScheme);
                const isSelected =
                  selectedObject?.type === 'star' && selectedObject.data.id === st.id;

                const showLabel =
                  !st.isProcedural &&
                  config.showStarLabels !== 'none' &&
                  ((config.showStarLabels === 'bright_only' && st.mag <= 2.2) ||
                    (config.showStarLabels === 'all_named' && Boolean(st.nameKo || st.nameEn)) ||
                    (config.showStarLabels === 'bayer_and_named' &&
                      (Boolean(st.nameKo) || st.mag <= 3.8)));

                return (
                  <g
                    key={st.id}
                    transform={`translate(${pt[0]}, ${pt[1]})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectObject({ type: 'star', data: st });
                    }}
                    className="cursor-pointer"
                  >
                    {isSelected && (
                      <circle
                        r={r + 5}
                        fill="none"
                        stroke="#06B6D4"
                        strokeWidth="1.5"
                      />
                    )}

                    {st.mag < 5.5 && (
                      <circle r={r + 1.1} fill={palette.starHalo} />
                    )}

                    {st.isDouble && (
                      <line
                        x1={-(r + 2.8)}
                        y1={0}
                        x2={r + 2.8}
                        y2={0}
                        stroke={color}
                        strokeWidth="1.1"
                      />
                    )}

                    {st.isVariable && st.mag < 5.2 && (
                      <circle
                        r={r + 2.0}
                        fill="none"
                        stroke={color}
                        strokeWidth="0.9"
                      />
                    )}

                    <circle r={r} fill={color} />

                    {showLabel && (
                      <text
                        x={r + 4}
                        y={3}
                        fill={palette.starLabel}
                        fontSize={st.mag <= 1.8 ? '11' : '9.5'}
                        fontWeight={st.mag <= 1.8 ? '600' : '400'}
                      >
                        {st.bayer ? `${st.bayer} ` : ''}
                        {st.nameKo || st.nameEn || ''}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* LAYER 6B: Horizontal Coordinate Ground Mask, Horizon Line & Cardinal Compass Markers */}
            {isHorizontal && config.showHorizonGround && (
              <g id="layer-horizon-ground" pointerEvents="none">
                {horizonGroundGeometry.sectorPaths.map((dPath, idx) => (
                  <path
                    key={`ground-sec-${idx}`}
                    d={dPath}
                    fill={palette.groundFill}
                    stroke="none"
                  />
                ))}

                {horizonGroundGeometry.groundContours.map((dPath, idx) => (
                  <path
                    key={`ground-contour-${idx}`}
                    d={dPath}
                    fill="none"
                    stroke={palette.horizonStroke}
                    strokeWidth="0.6"
                    strokeDasharray="3,5"
                    opacity="0.35"
                  />
                ))}

                {horizonGroundGeometry.horizonLinePath && (
                  <path
                    d={horizonGroundGeometry.horizonLinePath}
                    fill="none"
                    stroke={palette.horizonStroke}
                    strokeWidth="2.0"
                  />
                )}

                {/* Cardinal & Intercardinal Compass Points along the Horizon (Alt = 0°) */}
                {CARDINAL_POINTS.map((cp) => {
                  const pt = projection(horizontalToLonLat(cp.az, 0));
                  if (
                    !pt ||
                    pt[0] < 24 ||
                    pt[0] > width - 24 ||
                    pt[1] < 24 ||
                    pt[1] > height - 24
                  ) {
                    return null;
                  }
                  return (
                    <g key={`cardinal-${cp.short}`} transform={`translate(${pt[0]}, ${pt[1]})`}>
                      <line
                        x1={0}
                        y1={-6}
                        x2={0}
                        y2={6}
                        stroke={palette.horizonStroke}
                        strokeWidth={cp.major ? 2.0 : 1.2}
                      />
                      <rect
                        x={cp.major ? -24 : -22}
                        y={8}
                        width={cp.major ? 48 : 44}
                        height={18}
                        rx="4"
                        fill={palette.cardinalBg}
                        stroke={palette.horizonStroke}
                        strokeWidth="1"
                      />
                      <text
                        x={0}
                        y={20}
                        textAnchor="middle"
                        fill={palette.cardinalText}
                        fontSize={cp.major ? '10.5' : '9.5'}
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {cp.labelKo}
                      </text>
                    </g>
                  );
                })}

                {/* Zenith Marker (Alt = +90°) */}
                {(() => {
                  const zPt = projection(horizontalToLonLat(0, 89.9));
                  if (
                    !zPt ||
                    zPt[0] < 24 ||
                    zPt[0] > width - 24 ||
                    zPt[1] < 24 ||
                    zPt[1] > height - 24
                  ) {
                    return null;
                  }
                  return (
                    <g transform={`translate(${zPt[0]}, ${zPt[1]})`}>
                      <circle
                        r={5}
                        fill="none"
                        stroke={palette.horizonStroke}
                        strokeWidth="1.2"
                      />
                      <text
                        x={8}
                        y={4}
                        fill={palette.horizonStroke}
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                      >
                        Z 천정 (+90°)
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* LAYER 7: Center Crosshair (중심 십자선) */}
            {config.showCenterCrosshair && (
              <g
                id="layer-center-crosshair"
                transform={`translate(${width / 2}, ${height / 2})`}
                pointerEvents="none"
              >
                <line
                  x1={-22}
                  y1={0}
                  x2={-5}
                  y2={0}
                  stroke={palette.crosshairStroke}
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <line
                  x1={5}
                  y1={0}
                  x2={22}
                  y2={0}
                  stroke={palette.crosshairStroke}
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <line
                  x1={0}
                  y1={-22}
                  x2={0}
                  y2={-5}
                  stroke={palette.crosshairStroke}
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <line
                  x1={0}
                  y1={5}
                  x2={0}
                  y2={22}
                  stroke={palette.crosshairStroke}
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <circle
                  r={7}
                  fill="none"
                  stroke={palette.crosshairStroke}
                  strokeWidth="1.1"
                  opacity="0.75"
                />
              </g>
            )}

            {/* LAYER 8: Optional Telrad / Eyepiece Reticle Overlay */}
            {config.reticleMode !== 'none' && (
              <g
                id="layer-reticle"
                transform={`translate(${width / 2}, ${height / 2})`}
                pointerEvents="none"
              >
                {config.reticleMode === 'telrad' && (
                  <>
                    {[0.5, 2.0, 4.0].map((deg) => {
                      const rPx = (deg * pxPerDeg) / 2;
                      return (
                        <circle
                          key={`telrad-${deg}`}
                          r={rPx}
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth="1.25"
                          opacity="0.85"
                        />
                      );
                    })}
                    <line x1={-width * 0.08} y1={0} x2={-6} y2={0} stroke="#EF4444" strokeWidth="1" opacity="0.7" />
                    <line x1={6} y1={0} x2={width * 0.08} y2={0} stroke="#EF4444" strokeWidth="1" opacity="0.7" />
                    <line x1={0} y1={-width * 0.08} x2={0} y2={-6} stroke="#EF4444" strokeWidth="1" opacity="0.7" />
                    <line x1={0} y1={6} x2={0} y2={width * 0.08} stroke="#EF4444" strokeWidth="1" opacity="0.7" />
                  </>
                )}

                {config.reticleMode === 'binoculars_7x50' && (
                  <circle
                    r={(7.0 * pxPerDeg) / 2}
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="1.4"
                    strokeDasharray="6,3"
                  />
                )}

                {config.reticleMode === 'eyepiece_afov' && (
                  <circle
                    r={(config.customEyepieceFovDeg * pxPerDeg) / 2}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="1.4"
                  />
                )}
              </g>
            )}
          </g>

          {/* Outer Cartographic Double Frame */}
          <rect
            x="12"
            y="12"
            width={width - 24}
            height={height - 24}
            fill="none"
            stroke={palette.borderStroke}
            strokeWidth="1.5"
          />
          <rect
            x="8"
            y="8"
            width={width - 16}
            height={height - 16}
            fill="none"
            stroke={palette.borderStroke}
            strokeWidth="0.6"
          />
        </svg>
      </div>

      {/* =====================================================================
          3. BOTTOM LEGEND & OBJECT INFO BAR (성도 바깥 하단: 각거리 축척 · 선택 천체 정보 · 등급 스케일 범례)
         ===================================================================== */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Left: Angular Scale Bar (Outside the Star Chart) */}
        {config.showScaleBar ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {barDeg}° ANGULAR SCALE
            </span>
            <div className="flex items-center">
              <div className="w-0.5 h-3 bg-slate-800 dark:bg-slate-200" />
              <div
                className="h-0.5 bg-slate-800 dark:bg-slate-200 transition-all duration-150"
                style={{ width: `${Math.round(barPx)}px` }}
              />
              <div className="w-0.5 h-3 bg-slate-800 dark:bg-slate-200" />
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Center: Selected Star / Messier / Caldwell Object Summary Bar (Outside the Star Chart) */}
        {selectedObject ? (
          <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
              {selectedObject.type === 'dso'
                ? (selectedObject.data as DSORecord).messierId
                  ? `메시에 ${(selectedObject.data as DSORecord).messierId}`
                  : (selectedObject.data as DSORecord).caldwellId
                  ? `콜드웰 ${(selectedObject.data as DSORecord).caldwellId}`
                  : (selectedObject.data as DSORecord).id
                : `${(selectedObject.data as StarRecord).constellation} ${(selectedObject.data as StarRecord).bayer || ''}`}
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedObject.type === 'dso'
                ? (selectedObject.data as DSORecord).nameKo
                : (selectedObject.data as StarRecord).nameKo ||
                  (selectedObject.data as StarRecord).nameEn ||
                  (selectedObject.data as StarRecord).id}
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {formatRaHours(selectedObject.data.raHours, true)} · {formatDecDeg(selectedObject.data.decDeg, true)} · {selectedObject.data.mag.toFixed(1)}m
            </span>
            <button
              type="button"
              onClick={() => {
                const [az, alt] = equatorialToHorizontal(
                  selectedObject.data.raDeg,
                  selectedObject.data.decDeg,
                  config.observerLatDeg,
                  lstDeg
                );
                onChangeConfig((prev) => ({
                  ...prev,
                  centerRaHours: selectedObject.data.raHours,
                  centerDecDeg: selectedObject.data.decDeg,
                  centerAzDeg: Number(az.toFixed(1)),
                  centerAltDeg: Number(alt.toFixed(1)),
                  fovDeg: selectedObject.type === 'dso' ? 14 : 20,
                  limitStarMag: Math.max(prev.limitStarMag, 8.8),
                }));
              }}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors cursor-pointer"
            >
              파인더 확대
            </button>
            <button
              type="button"
              onClick={() => onSelectObject(null)}
              className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-mono hidden xl:block">
            성도 위의 항성이나 메시에·콜드웰 성운을 클릭하면 상세 제원이 표시됩니다
          </div>
        )}

        {/* Right: Magnitude Scale Legend (Outside the Star Chart) */}
        {config.showMagnitudeScale && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              MAGNITUDE SCALE (한계등급 {config.limitStarMag.toFixed(1)})
            </span>
            <div className="flex items-center gap-2.5">
              {[0, 1, 2, 3, 4, 5, 6, 8].map((m) => {
                const r = computeStarRadius(
                  m,
                  config.limitStarMag,
                  config.starScaleFactor,
                  0.82
                );
                const dPx = Math.max(2, Math.min(13, r * 2));
                return (
                  <div key={`ext-leg-${m}`} className="flex items-center gap-1">
                    <span
                      className="inline-block rounded-full bg-slate-900 dark:bg-slate-100"
                      style={{ width: `${dPx}px`, height: `${dPx}px` }}
                    />
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {m}m
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
