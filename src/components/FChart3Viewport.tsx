import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
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
  computeStarRadius,
  createCelestialProjection,
  exportSingleChartPdf,
  formatDecDeg,
  formatRaHours,
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

/**
 * Convert an array of [raDeg, decDeg] vertices into a D3 GeoJSON LineString
 * Note: D3 expects coordinates in [lon, lat], where lon = -raDeg.
 */
function toGeoLineString(coordsRaDec: Array<[number, number]>): GeoJSON.LineString {
  return {
    type: 'LineString',
    coordinates: coordsRaDec.map(([ra, dec]) => celestialToLonLat(ra, dec)),
  };
}

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
    galLat: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    raHours: number;
    decDeg: number;
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

  // Build D3 Celestial Projection
  const projection = useMemo(() => {
    return createCelestialProjection(
      config.projection,
      width,
      height,
      config.centerRaHours,
      config.centerDecDeg,
      config.fovDeg,
      config.mirrorHorizontal,
      config.mirrorVertical
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
  ]);

  const geoPath = useMemo(() => d3.geoPath(projection), [projection]);

  // Visible Stars for current field of view and limiting magnitude
  const visibleStars = useMemo(() => {
    const centerRaDeg = ((config.centerRaHours * 15) % 360 + 360) % 360;
    return getVisibleStars(
      centerRaDeg,
      config.centerDecDeg,
      config.fovDeg,
      config.limitStarMag
    ).sort((a, b) => b.mag - a.mag); // Faint stars first, bright stars on top
  }, [config.centerRaHours, config.centerDecDeg, config.fovDeg, config.limitStarMag]);

  // Visible Deep-Sky Objects (Messier, Caldwell, and Extended Nebulae)
  const visibleDsos = useMemo(() => {
    const centerRaDeg = ((config.centerRaHours * 15) % 360 + 360) % 360;
    const maxAngle = Math.min(180, config.fovDeg * 0.85 + 15);
    return DSO_CATALOG.filter((d) => {
      const isSelected = selectedObject?.type === 'dso' && selectedObject.data.id === d.id;
      if (!isSelected && d.mag > config.limitDsoMag) return false;
      if (angularDistanceDeg(centerRaDeg, config.centerDecDeg, d.raDeg, d.decDeg) > maxAngle) {
        return false;
      }
      if (isSelected) return true;
      if (d.messierId) return config.showMessierObjects;
      if (d.caldwellId) return config.showCaldwellObjects;
      return config.showNebulaOutlines;
    });
  }, [
    config.centerRaHours,
    config.centerDecDeg,
    config.fovDeg,
    config.limitDsoMag,
    config.showMessierObjects,
    config.showCaldwellObjects,
    config.showNebulaOutlines,
    selectedObject,
  ]);

  // Precompute Equatorial Graticule Lines
  const graticuleLines = useMemo(() => {
    if (!config.showEquatorialGrid) return { parallels: [], meridians: [] };
    const decStep = config.fovDeg <= 18 ? 2 : config.fovDeg <= 40 ? 5 : 10;
    const raStepHours = config.fovDeg <= 18 ? 0.5 : config.fovDeg <= 40 ? 1 : 2;

    const parallels: Array<{ dec: number; path: string | null; labelPt: [number, number] | null }> = [];
    for (let dec = -80; dec <= 80; dec += decStep) {
      if (Math.abs(dec - config.centerDecDeg) > config.fovDeg * 0.95 + 15) continue;
      const coords: Array<[number, number]> = [];
      for (let ra = 0; ra <= 360; ra += 3) {
        coords.push([ra, dec]);
      }
      const dPath = geoPath(toGeoLineString(coords));
      const [lon, lat] = celestialToLonLat(config.centerRaHours * 15, dec);
      const labelPt = projection([lon, lat]);
      parallels.push({ dec, path: dPath, labelPt });
    }

    const meridians: Array<{ raH: number; path: string | null; labelPt: [number, number] | null }> = [];
    for (let raH = 0; raH < 24; raH += raStepHours) {
      const raDeg = raH * 15;
      const coords: Array<[number, number]> = [];
      for (let dec = -85; dec <= 85; dec += 2.5) {
        coords.push([raDeg, dec]);
      }
      const dPath = geoPath(toGeoLineString(coords));
      const [lon, lat] = celestialToLonLat(raDeg, config.centerDecDeg);
      const labelPt = projection([lon, lat]);
      meridians.push({ raH, path: dPath, labelPt });
    }

    return { parallels, meridians };
  }, [
    config.showEquatorialGrid,
    config.fovDeg,
    config.centerDecDeg,
    config.centerRaHours,
    geoPath,
    projection,
  ]);

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
      eclipticPath: geoPath(toGeoLineString(eclCoords)),
      galacticPath: geoPath(toGeoLineString(galCoords)),
    };
  }, [config.showEclipticAndGalactic, geoPath]);

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
    };
  }, [config.colorScheme]);

  // Pointer handlers for interactive celestial pan & coordinate probing
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      raHours: config.centerRaHours,
      decDeg: config.centerDecDeg,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Update live equatorial coordinate probe
    if (projection.invert) {
      const inv = projection.invert([mx, my]);
      if (inv && !Number.isNaN(inv[0]) && !Number.isNaN(inv[1])) {
        const raDeg = ((-inv[0] % 360) + 360) % 360;
        const decDeg = Math.max(-90, Math.min(90, inv[1]));
        setCursorCoords({
          raHours: raDeg / 15,
          decDeg,
          galLat: equatorialToGalacticLat(raDeg, decDeg),
        });
      }
    }

    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const degPerPx = config.fovDeg / Math.min(width, height);
    const cosDec = Math.max(0.2, Math.cos((dragStartRef.current.decDeg * Math.PI) / 180));
    const mirrorSignX = config.mirrorHorizontal ? -1 : 1;
    const mirrorSignY = config.mirrorVertical ? -1 : 1;

    const dRaHours = (dx * degPerPx * mirrorSignX) / (15 * cosDec);
    const dDecDeg = dy * degPerPx * mirrorSignY;

    const nextRa = ((dragStartRef.current.raHours + dRaHours) % 24 + 24) % 24;
    const nextDec = Math.max(-89.5, Math.min(89.5, dragStartRef.current.decDeg + dDecDeg));

    onChangeConfig((prev) => ({
      ...prev,
      centerRaHours: Number(nextRa.toFixed(3)),
      centerDecDeg: Number(nextDec.toFixed(2)),
    }));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Wheel handler for smooth FOV zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    onChangeConfig((prev) => ({
      ...prev,
      fovDeg: Number(Math.max(4, Math.min(145, prev.fovDeg * factor)).toFixed(1)),
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
    )}_Dec${formatDecDeg(config.centerDecDeg, true)}_FOV${config.fovDeg.toFixed(0)}.svg`;
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
      : 1;
  const barPx = Math.min(150, Math.max(40, barDeg * pxPerDeg));

  return (
    <div className="flex-1 flex flex-col h-full min-h-[620px] select-none overflow-hidden bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800">
      {/* =====================================================================
          1. TOP INSTRUMENT BAR (성도 바깥 상단: 좌표 제원 · 커서 프로브 · 줌 및 벡터 출력 버튼)
         ===================================================================== */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: J2000 Coordinates, FOV, Star Count & Cursor Probe */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>J2000.0</span>
            <span aria-hidden="true">·</span>
            <span>{config.projection.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>FOV {config.fovDeg.toFixed(1)}°</span>
            <span aria-hidden="true">·</span>
            <span>Stars: {visibleStars.length.toLocaleString()}</span>
          </div>

          <div className="flex items-baseline gap-3 font-mono tabular-nums text-xs">
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
            ) : (
              <span>성도 위에 마우스를 올리면 적경·적위·은하위도를 표시합니다</span>
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

        {/* Right: Zoom, Reset, SVG Vector & Single PDF Export Buttons (Outside the Star Chart) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({
                ...prev,
                fovDeg: Number(Math.max(4, prev.fovDeg * 0.75).toFixed(1)),
              }))
            }
            className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="화각 확대 (Narrower FOV)"
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
          2. PURE UNOBSTRUCTED STAR CHART CANVAS (성도 내부에는 오직 천체와 격자만 렌더링)
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
                        const dPath = geoPath(toGeoLineString(poly));
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

            {/* LAYER 2: Equatorial Coordinate Grid */}
            {config.showEquatorialGrid && (
              <g id="layer-equatorial-grid">
                {graticuleLines.parallels.map(({ dec, path, labelPt }) => (
                  <React.Fragment key={`dec-${dec}`}>
                    {path && (
                      <path
                        d={path}
                        fill="none"
                        stroke={palette.gridStroke}
                        strokeWidth={dec === 0 ? 1.1 : 0.65}
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
                          {dec > 0 ? `+${dec}°` : `${dec}°`}
                        </text>
                      )}
                  </React.Fragment>
                ))}
                {graticuleLines.meridians.map(({ raH, path, labelPt }) => (
                  <React.Fragment key={`ra-${raH}`}>
                    {path && (
                      <path
                        d={path}
                        fill="none"
                        stroke={palette.gridStroke}
                        strokeWidth={raH === 0 ? 1.1 : 0.65}
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
                          {Number.isInteger(raH)
                            ? `${raH}h`
                            : `${Math.floor(raH)}h30m`}
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
                  const dPath = geoPath(toGeoLineString(con.boundaryPolygon));
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
                  const [lon, lat] = celestialToLonLat(
                    con.raCenterHours * 15,
                    con.decCenterDeg
                  );
                  const centerPt = projection([lon, lat]);

                  // Collect visible projected segments and on-screen points for fallback label positioning
                  const visiblePts: Array<[number, number]> = [];
                  const maxAllowedJump = Math.max(width, height) * 0.9;

                  const renderedSegments = con.lines.map(([p1, p2], idx) => {
                    const pt1 = projection(celestialToLonLat(p1[0], p1[1]));
                    const pt2 = projection(celestialToLonLat(p2[0], p2[1]));

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

                      // Skip if both endpoints are far outside viewport on the same side
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

                    // Fallback to D3 geoPath if spherical clipping applies
                    const dPath = geoPath(toGeoLineString([p1, p2]));
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

                  // Determine best on-screen label position: nominal center if inside viewport, otherwise centroid of visible stick vertices
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
                  const [lon, lat] = celestialToLonLat(dso.raDeg, dso.decDeg);
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
                          const dPath = geoPath(toGeoLineString(poly));
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
                              dso.type === 'supernova_remnant') &&
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
                const [lon, lat] = celestialToLonLat(st.raDeg, st.decDeg);
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
                        r={r + 6}
                        fill="none"
                        stroke="#06B6D4"
                        strokeWidth="1.5"
                      />
                    )}

                    {st.mag < 5.5 && (
                      <circle r={r + 1.3} fill={palette.starHalo} />
                    )}

                    {st.isDouble && (
                      <line
                        x1={-(r + 3.2)}
                        y1={0}
                        x2={r + 3.2}
                        y2={0}
                        stroke={color}
                        strokeWidth="1.15"
                      />
                    )}

                    {st.isVariable && st.mag < 5.2 && (
                      <circle
                        r={r + 2.4}
                        fill="none"
                        stroke={color}
                        strokeWidth="0.95"
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

            {/* LAYER 7: Optional Telrad / Eyepiece Reticle Overlay */}
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
              onClick={() =>
                onChangeConfig((prev) => ({
                  ...prev,
                  centerRaHours: selectedObject.data.raHours,
                  centerDecDeg: selectedObject.data.decDeg,
                  fovDeg: selectedObject.type === 'dso' ? 14 : 20,
                  limitStarMag: Math.max(prev.limitStarMag, 8.8),
                }))
              }
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
