import * as d3 from 'd3';
import { jsPDF } from 'jspdf';
import {
  angularDistanceDeg,
  BRIGHT_STARS,
  CONSTELLATION_DATA,
  DSO_CATALOG,
  getVisibleStars,
  MILKY_WAY_CONTOURS,
} from '../data/astronomyData';
import {
  AtlasGeneratorOptions,
  AtlasPresetId,
  AtlasSheet,
  ChartColorScheme,
  FChart3Config,
  ProjectionMode,
} from '../types/astronomy';

/**
 * Convert Equatorial J2000 [raDeg, decDeg] to D3 spherical coordinates [lon, lat].
 * Astronomical sky charts look from inside the celestial sphere upward, so RA increases to the LEFT (East = Left).
 * Mapping lon = -raDeg makes D3 projections naturally place East on the left and North at top.
 */
export function celestialToLonLat(raDeg: number, decDeg: number): [number, number] {
  let lon = -raDeg;
  while (lon <= -180) lon += 360;
  while (lon > 180) lon -= 360;
  return [lon, Math.max(-89.99, Math.min(89.99, decDeg))];
}

/**
 * Format Right Ascension in hours to "05h 35.3m" or "05h 35m"
 */
export function formatRaHours(raHours: number, compact = false): string {
  const norm = ((raHours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = (norm - h) * 60;
  if (compact) {
    return `${String(h).padStart(2, '0')}h${String(Math.round(m)).padStart(2, '0')}m`;
  }
  return `${String(h).padStart(2, '0')}h ${m.toFixed(1).padStart(4, '0')}m`;
}

/**
 * Format Declination in degrees to "+24° 07'" or "-05° 23'"
 */
export function formatDecDeg(decDeg: number, compact = false): string {
  const sign = decDeg >= 0 ? '+' : '-';
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const m = Math.round((abs - d) * 60);
  if (compact) {
    return `${sign}${String(d).padStart(2, '0')}°`;
  }
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′`;
}

/**
 * Compute star disc radius in pixels/points using fchart3's magnitude power-law formula
 */
export function computeStarRadius(
  mag: number,
  limitStarMag: number,
  scaleFactor = 1.0,
  baseSize = 1.0
): number {
  const delta = Math.max(0, limitStarMag - mag + 0.6);
  // Nonlinear power curve mimicking fchart3's magnitude disc appearance
  const r = (0.45 + Math.pow(delta, 1.42) * 0.34) * scaleFactor * baseSize;
  return Math.max(0.45 * baseSize, Math.min(8.5 * baseSize, r));
}

/**
 * Convert B-V color index to subtle astronomical star color
 */
export function bvToStarColor(bv: number, scheme: ChartColorScheme): string {
  if (scheme === 'paper') {
    return '#0F172A';
  }
  if (scheme === 'nightvision') {
    return '#F87171';
  }
  // Observatory dark mode: authentic subtle Planck B-V colors
  if (bv < -0.05) return '#BAE6FD'; // O/B blue-white
  if (bv < 0.25) return '#F8FAFC'; // A white
  if (bv < 0.55) return '#FEF9C3'; // F yellow-white
  if (bv < 0.90) return '#FDE047'; // G yellow
  if (bv < 1.35) return '#FDBA74'; // K orange
  return '#FCA5A5'; // M red giant
}

/**
 * Create configured D3 GeoProjection for a given viewport width, height, center, and FOV
 */
export function createCelestialProjection(
  projectionMode: ProjectionMode,
  width: number,
  height: number,
  centerRaHours: number,
  centerDecDeg: number,
  fovDeg: number,
  mirrorHorizontal = false,
  mirrorVertical = false
): d3.GeoProjection {
  const minDim = Math.min(width, height);
  const fovRad = (Math.max(4, Math.min(165, fovDeg)) * Math.PI) / 180;

  let proj: d3.GeoProjection;
  if (projectionMode === 'orthographic') {
    proj = d3.geoOrthographic().clipAngle(89.5);
    const sinHalf = Math.sin(Math.min(Math.PI / 2 - 0.02, fovRad / 2));
    proj.scale(minDim / (2 * sinHalf));
  } else if (projectionMode === 'equidistant') {
    proj = d3.geoAzimuthalEquidistant().clipAngle(172);
    proj.scale(minDim / fovRad);
  } else {
    // Default fchart3 stereographic projection
    proj = d3.geoStereographic().clipAngle(155);
    const tanHalf = Math.tan(fovRad / 4);
    proj.scale(minDim / (4 * tanHalf));
  }

  const centerLon = ((centerRaHours * 15) % 360 + 360) % 360;
  // Rotate so celestial [raDeg, decDeg] mapped to [-raDeg, decDeg] is centered at [0, 0]
  proj
    .rotate([centerLon, -centerDecDeg, 0])
    .translate([width / 2, height / 2])
    .precision(0.3);

  if (mirrorHorizontal || mirrorVertical) {
    const rawStream = proj.stream;
    proj.stream = function (output) {
      return rawStream({
        point(x, y) {
          const mx = mirrorHorizontal ? width - x : x;
          const my = mirrorVertical ? height - y : y;
          output.point(mx, my);
        },
        sphere() {
          output.sphere?.();
        },
        lineStart() {
          output.lineStart();
        },
        lineEnd() {
          output.lineEnd();
        },
        polygonStart() {
          output.polygonStart?.();
        },
        polygonEnd() {
          output.polygonEnd?.();
        },
      });
    };
  }

  return proj;
}

/**
 * Presets for fchart3-atlas Multi-Page Sky Atlas Partitioning
 */
export const ATLAS_PRESETS: Record<
  AtlasPresetId,
  {
    nameKo: string;
    nameEn: string;
    subtitleKo: string;
    decMinDeg: number;
    decMaxDeg: number;
    fovPerSheetDeg: number;
    overlapPercent: number;
    limitStarMag: number;
    limitDsoMag: number;
  }
> = {
  binocular_14: {
    nameKo: '광시야 쌍안경 전천 성도집 (14매)',
    nameEn: 'Wide-Field Binocular All-Sky Atlas (14 Charts)',
    subtitleKo: '7×50 쌍안경 및 육안 관측용 · 한계등급 6.5 · 화각 48°',
    decMinDeg: -90,
    decMaxDeg: 90,
    fovPerSheetDeg: 48,
    overlapPercent: 18,
    limitStarMag: 6.5,
    limitDsoMag: 9.0,
  },
  tirion_26: {
    nameKo: '표준 아마추어 전천 성도집 (26매)',
    nameEn: 'Tirion / SkyAtlas 2000 Standard (26 Charts)',
    subtitleKo: '표준 대구경 파인더 및 소형 망원경용 · 한계등급 8.2 · 화각 32°',
    decMinDeg: -90,
    decMaxDeg: 90,
    fovPerSheetDeg: 32,
    overlapPercent: 16,
    limitStarMag: 8.2,
    limitDsoMag: 11.2,
  },
  korean_seasonal_18: {
    nameKo: '한반도 중위도 관측 성도집 (18매)',
    nameEn: 'Mid-Latitude Northern Observatory Atlas (-35° ~ +90°)',
    subtitleKo: '북위 37° 기준 관측 가능 영역 집중 분할 · 한계등급 8.8 · 화각 28°',
    decMinDeg: -35,
    decMaxDeg: 90,
    fovPerSheetDeg: 28,
    overlapPercent: 15,
    limitStarMag: 8.8,
    limitDsoMag: 11.8,
  },
  messier_deep_44: {
    nameKo: '딥스카이 정밀 탐색 성도집 (38매)',
    nameEn: 'Deep-Sky Messier/NGC Precision Atlas',
    subtitleKo: '성운·은하 윤곽선 정밀 탐색 · 한계등급 9.8 · 화각 22°',
    decMinDeg: -45,
    decMaxDeg: 90,
    fovPerSheetDeg: 22,
    overlapPercent: 15,
    limitStarMag: 9.8,
    limitDsoMag: 12.5,
  },
  custom_grid: {
    nameKo: '사용자 정의 분할 성도집 (Custom Grid)',
    nameEn: 'Custom fchart3-atlas Partition',
    subtitleKo: '원하는 적위 범위, 화각(FOV), 중첩률, 한계등급 직접 설정',
    decMinDeg: -30,
    decMaxDeg: 90,
    fovPerSheetDeg: 30,
    overlapPercent: 15,
    limitStarMag: 8.5,
    limitDsoMag: 11.5,
  },
};

/**
 * Partition the sky into multi-page AtlasSheets using spherical declination bands
 * (authentic fchart3-atlas tessellation algorithm)
 */
export function generateAtlasSheets(options: AtlasGeneratorOptions): AtlasSheet[] {
  const {
    decMinDeg,
    decMaxDeg,
    fovPerSheetDeg,
    overlapPercent,
    limitStarMag,
    limitDsoMag,
  } = options;

  const effectiveStepDeg = Math.max(
    8,
    fovPerSheetDeg * (1 - Math.min(0.4, Math.max(0.05, overlapPercent / 100)))
  );

  // Build declination zone centers from North to South (like SkyAtlas 2000 / Uranometria)
  const decZones: Array<{ decCenter: number; raCount: number; zoneLabel: string }> = [];

  let currentDec = Math.min(89, decMaxDeg);
  if (decMaxDeg >= 78) {
    decZones.push({
      decCenter: 88.5,
      raCount: 1,
      zoneLabel: '북천극 영역 (North Polar Cap)',
    });
    currentDec = 88.5 - effectiveStepDeg * 0.85;
  }

  while (currentDec >= decMinDeg + effectiveStepDeg * 0.35) {
    if (currentDec <= -78) break;
    const cosDec = Math.max(0.18, Math.cos((currentDec * Math.PI) / 180));
    const raCount = Math.max(
      3,
      Math.min(18, Math.round((360 * cosDec) / effectiveStepDeg))
    );
    const sign = currentDec >= 0 ? '+' : '';
    decZones.push({
      decCenter: Number(currentDec.toFixed(1)),
      raCount,
      zoneLabel: `적위 ${sign}${Math.round(currentDec)}° 띠 (Dec ${sign}${Math.round(currentDec)}° Band)`,
    });
    currentDec -= effectiveStepDeg * 0.85;
  }

  if (decMinDeg <= -78) {
    decZones.push({
      decCenter: -88.5,
      raCount: 1,
      zoneLabel: '남천극 영역 (South Polar Cap)',
    });
  }

  const rawSheets: Omit<AtlasSheet, 'totalSheets'>[] = [];
  const bandSheetIndices: number[][] = [];

  decZones.forEach((zone, bandIdx) => {
    const indicesInBand: number[] = [];
    const raStepHours = 24 / zone.raCount;

    for (let i = 0; i < zone.raCount; i++) {
      const sheetNumber = rawSheets.length + 1;
      indicesInBand.push(sheetNumber);

      const centerRaHours =
        zone.raCount === 1 ? 0 : Number(((i * raStepHours + raStepHours * 0.5) % 24).toFixed(2));
      const centerRaDeg = centerRaHours * 15;
      const centerDecDeg = zone.decCenter;

      // Find constellations and DSOs inside this sheet
      const radiusDeg = fovPerSheetDeg * 0.58;
      const featuredConstellations = CONSTELLATION_DATA.filter(
        (c) =>
          angularDistanceDeg(
            centerRaDeg,
            centerDecDeg,
            c.raCenterHours * 15,
            c.decCenterDeg
          ) <= radiusDeg + 8
      ).map((c) => c.nameKo);

      const visibleDsos = DSO_CATALOG.filter(
        (d) =>
          d.mag <= limitDsoMag &&
          angularDistanceDeg(centerRaDeg, centerDecDeg, d.raDeg, d.decDeg) <= radiusDeg
      );

      const starCountEstimate = getVisibleStars(
        centerRaDeg,
        centerDecDeg,
        fovPerSheetDeg,
        limitStarMag
      ).length;

      const titleKo =
        zone.raCount === 1
          ? zone.decCenter > 0
            ? '북천극 성도 (폴라리스·작은곰자리)'
            : '남천극 성도 (남십자·카리나)'
          : featuredConstellations.length > 0
          ? `${featuredConstellations.slice(0, 2).join(' · ')} 영역`
          : `RA ${formatRaHours(centerRaHours, true)} / Dec ${formatDecDeg(centerDecDeg, true)}`;

      rawSheets.push({
        sheetNumber,
        zoneLabel: zone.zoneLabel,
        titleKo,
        titleEn: `Chart #${sheetNumber} (${formatRaHours(centerRaHours, true)}, ${formatDecDeg(centerDecDeg, true)})`,
        centerRaHours,
        centerRaDeg,
        centerDecDeg,
        fovDeg: fovPerSheetDeg,
        raSpanHours: Number(raStepHours.toFixed(2)),
        decSpanDeg: Number(effectiveStepDeg.toFixed(1)),
        limitStarMag,
        limitDsoMag,
        featuredConstellations:
          featuredConstellations.length > 0 ? featuredConstellations : ['일반 성야'],
        featuredDsos: visibleDsos.map((d) => `${d.id} ${d.nameKo}`),
        starCountEstimate,
        dsoCount: visibleDsos.length,
      });
    }

    bandSheetIndices.push(indicesInBand);
  });

  const totalSheets = rawSheets.length;

  // Populate adjacent North/South/East/West chart navigation numbers
  return rawSheets.map((sh, globalIdx) => {
    let myBand = 0;
    let posInBand = 0;
    for (let b = 0; b < bandSheetIndices.length; b++) {
      const idx = bandSheetIndices[b].indexOf(sh.sheetNumber);
      if (idx !== -1) {
        myBand = b;
        posInBand = idx;
        break;
      }
    }

    const band = bandSheetIndices[myBand];
    const adjacentEast =
      band.length > 1 ? band[(posInBand + 1) % band.length] : undefined;
    const adjacentWest =
      band.length > 1
        ? band[(posInBand - 1 + band.length) % band.length]
        : undefined;

    let adjacentNorth: number | undefined;
    if (myBand > 0) {
      const nBand = bandSheetIndices[myBand - 1];
      const mapped = Math.min(
        nBand.length - 1,
        Math.floor((posInBand / band.length) * nBand.length)
      );
      adjacentNorth = nBand[mapped];
    }

    let adjacentSouth: number | undefined;
    if (myBand < bandSheetIndices.length - 1) {
      const sBand = bandSheetIndices[myBand + 1];
      const mapped = Math.min(
        sBand.length - 1,
        Math.floor((posInBand / band.length) * sBand.length)
      );
      adjacentSouth = sBand[mapped];
    }

    return {
      ...sh,
      totalSheets,
      adjacentNorth,
      adjacentSouth,
      adjacentEast,
      adjacentWest,
      starCountEstimate: rawSheets[globalIdx].starCountEstimate,
    };
  });
}

/**
 * Generate equivalent Python `fchart3` and `fchart3-atlas` CLI commands
 */
export function buildFchart3CliCommand(
  config: FChart3Config,
  atlasOptions?: AtlasGeneratorOptions
): { singleChartCmd: string; atlasCmd: string } {
  const flags: string[] = [
    `fchart3`,
    `-ra ${config.centerRaHours.toFixed(3)}`,
    `-dec ${config.centerDecDeg.toFixed(2)}`,
    `-width 180`,
    `-fov ${config.fovDeg.toFixed(1)}`,
    `-limit-star ${config.limitStarMag.toFixed(1)}`,
    `-limit-dso ${config.limitDsoMag.toFixed(1)}`,
    `-projection ${config.projection}`,
  ];

  if (config.showMilkyWayContours) flags.push(`--show-enhanced-milky-way`);
  if (config.showConstellationBoundaries) flags.push(`--show-constellation-borders`);
  if (config.showConstellationLines) flags.push(`--show-constellation-shapes`);
  if (config.showNebulaOutlines) flags.push(`--show-nebula-outlines`);
  if (config.showMessierObjects) flags.push(`--show-messier`);
  if (config.showCaldwellObjects) flags.push(`--show-caldwell`);
  if (config.showEquatorialGrid) flags.push(`--show-equatorial-grid`);
  if (config.reticleMode === 'telrad') flags.push(`--show-telrad`);
  if (config.mirrorHorizontal) flags.push(`--mirror-x`);
  if (config.mirrorVertical) flags.push(`--mirror-y`);
  flags.push(`-o chart_${formatRaHours(config.centerRaHours, true)}_${formatDecDeg(config.centerDecDeg, true)}.pdf`);

  const opt = atlasOptions || {
    decMinDeg: -90,
    decMaxDeg: 90,
    fovPerSheetDeg: config.fovDeg,
    overlapPercent: 15,
    limitStarMag: config.limitStarMag,
    limitDsoMag: config.limitDsoMag,
  };

  const atlasFlags: string[] = [
    `fchart3-atlas`,
    `--dec-min ${opt.decMinDeg}`,
    `--dec-max ${opt.decMaxDeg}`,
    `--fov ${opt.fovPerSheetDeg}`,
    `--overlap ${opt.overlapPercent}`,
    `--limit-star ${opt.limitStarMag.toFixed(1)}`,
    `--limit-dso ${opt.limitDsoMag.toFixed(1)}`,
    `--show-constellation-borders`,
    `--show-enhanced-milky-way`,
    `--show-nebula-outlines`,
    `--output fchart3_custom_sky_atlas.pdf`,
  ];

  return {
    singleChartCmd: flags.join(' \\\n  '),
    atlasCmd: atlasFlags.join(' \\\n  '),
  };
}

/**
 * Draw a projected GeoJSON ring/line onto a jsPDF document within a clipping rectangle
 */
function drawProjectedRingOnPdf(
  doc: jsPDF,
  proj: d3.GeoProjection,
  coordsRaDec: Array<[number, number]>,
  box: { x: number; y: number; w: number; h: number },
  closed = false
) {
  const projected: Array<[number, number]> = [];

  for (let i = 0; i < coordsRaDec.length; i++) {
    const [ra, dec] = coordsRaDec[i];
    const [lon, lat] = celestialToLonLat(ra, dec);
    const pt = proj([lon, lat]);
    if (pt && !Number.isNaN(pt[0]) && !Number.isNaN(pt[1])) {
      const px = box.x + pt[0];
      const py = box.y + pt[1];
      projected.push([px, py]);
    } else {
      // Break polyline segment if outside clipAngle
      if (projected.length >= 2) {
        strokeClippedPolylinePdf(doc, projected, box);
      }
      projected.length = 0;
    }
  }

  if (projected.length >= 2) {
    if (closed) {
      projected.push([...projected[0]]);
    }
    strokeClippedPolylinePdf(doc, projected, box);
  }
}

function clipSegmentToBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: { x: number; y: number; w: number; h: number }
): [number, number, number, number] | null {
  const xmin = box.x;
  const xmax = box.x + box.w;
  const ymin = box.y;
  const ymax = box.y + box.h;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }

  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function strokeClippedPolylinePdf(
  doc: jsPDF,
  pts: Array<[number, number]>,
  box: { x: number; y: number; w: number; h: number }
) {
  const maxJumpSq = Math.pow(Math.max(box.w, box.h) * 0.85, 2);

  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const distSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (distSq < maxJumpSq) {
      const clipped = clipSegmentToBox(x1, y1, x2, y2, box);
      if (clipped) {
        doc.line(clipped[0], clipped[1], clipped[2], clipped[3]);
      }
    }
  }
}

/**
 * Render a single vector Star Chart page inside a jsPDF document
 */
function renderVectorChartPageOnPdf(
  doc: jsPDF,
  sheet: AtlasSheet,
  config: FChart3Config,
  pageW: number,
  pageH: number
) {
  const isDark = config.colorScheme === 'observatory';
  const isNight = config.colorScheme === 'nightvision';

  // Background fill
  if (isDark) {
    doc.setFillColor(10, 14, 23);
    doc.rect(0, 0, pageW, pageH, 'F');
  } else if (isNight) {
    doc.setFillColor(12, 3, 3);
    doc.rect(0, 0, pageW, pageH, 'F');
  } else {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');
  }

  const marginX = 14;
  const headerH = 18;
  const footerH = 12;
  const box = {
    x: marginX,
    y: headerH,
    w: pageW - marginX * 2,
    h: pageH - headerH - footerH,
  };

  // Top Header Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  if (isDark) doc.setTextColor(241, 245, 249);
  else if (isNight) doc.setTextColor(239, 68, 68);
  else doc.setTextColor(15, 23, 42);

  doc.text(
    `FCHART3 ATLAS  |  CHART #${String(sheet.sheetNumber).padStart(2, '0')} OF ${sheet.totalSheets}`,
    box.x,
    11
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (isDark) doc.setTextColor(148, 163, 184);
  else if (isNight) doc.setTextColor(185, 28, 28);
  else doc.setTextColor(71, 85, 105);

  const metaRight = `J2000.0  ·  RA ${formatRaHours(sheet.centerRaHours)}  ·  Dec ${formatDecDeg(sheet.centerDecDeg)}  ·  FOV ${sheet.fovDeg.toFixed(0)}°  ·  Lim Mag ${sheet.limitStarMag.toFixed(1)}`;
  doc.text(metaRight, box.x + box.w, 11, { align: 'right' });

  // Create D3 projection for this sheet's box
  const proj = createCelestialProjection(
    config.projection,
    box.w,
    box.h,
    sheet.centerRaHours,
    sheet.centerDecDeg,
    sheet.fovDeg,
    config.mirrorHorizontal,
    config.mirrorVertical
  );

  // 1. Milky Way Isophote Contours (은하수 등고선)
  if (config.showMilkyWayContours) {
    MILKY_WAY_CONTOURS.forEach((mw) => {
      if (isDark) {
        if (mw.level === 1) doc.setDrawColor(14, 116, 144);
        else if (mw.level === 2) doc.setDrawColor(6, 182, 212);
        else doc.setDrawColor(103, 232, 249);
      } else if (isNight) {
        doc.setDrawColor(127, 29, 29);
      } else {
        if (mw.level === 1) doc.setDrawColor(186, 230, 253);
        else if (mw.level === 2) doc.setDrawColor(56, 189, 248);
        else doc.setDrawColor(2, 132, 199);
      }
      doc.setLineWidth(mw.level === 3 ? 0.35 : 0.22);
      mw.polygons.forEach((poly) => {
        drawProjectedRingOnPdf(doc, proj, poly, box, true);
      });
    });
  }

  // 2. Equatorial Coordinate Grid (J2000 RA / Dec Graticule)
  if (config.showEquatorialGrid) {
    if (isDark) doc.setDrawColor(30, 41, 59);
    else if (isNight) doc.setDrawColor(69, 10, 10);
    else doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);

    const decStep = sheet.fovDeg <= 25 ? 5 : 10;
    const raStepDeg = sheet.fovDeg <= 25 ? 10 : 15;

    // Parallels of Declination
    for (let dec = -80; dec <= 80; dec += decStep) {
      if (Math.abs(dec - sheet.centerDecDeg) > sheet.fovDeg * 0.9) continue;
      const line: Array<[number, number]> = [];
      for (let ra = 0; ra <= 360; ra += 4) {
        line.push([ra, dec]);
      }
      drawProjectedRingOnPdf(doc, proj, line, box, false);
    }

    // Meridians of Right Ascension
    for (let ra = 0; ra < 360; ra += raStepDeg) {
      const line: Array<[number, number]> = [];
      for (let dec = -85; dec <= 85; dec += 3) {
        line.push([ra, dec]);
      }
      drawProjectedRingOnPdf(doc, proj, line, box, false);
    }
  }

  // 3. Official IAU Constellation Boundaries (별자리 경계선)
  if (config.showConstellationBoundaries) {
    if (isDark) doc.setDrawColor(71, 85, 105);
    else if (isNight) doc.setDrawColor(153, 27, 27);
    else doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([1.2, 1.0], 0);

    CONSTELLATION_DATA.forEach((con) => {
      if (
        angularDistanceDeg(
          sheet.centerRaDeg,
          sheet.centerDecDeg,
          con.raCenterHours * 15,
          con.decCenterDeg
        ) <=
        sheet.fovDeg * 0.95 + 25
      ) {
        drawProjectedRingOnPdf(doc, proj, con.boundaryPolygon, box, true);
      }
    });
    doc.setLineDashPattern([], 0);
  }

  // 4. Constellation Stick Figures (별자리 연결선)
  if (config.showConstellationLines) {
    if (isDark) doc.setDrawColor(56, 189, 248);
    else if (isNight) doc.setDrawColor(185, 28, 28);
    else doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.32);

    CONSTELLATION_DATA.forEach((con) => {
      con.lines.forEach(([p1, p2]) => {
        drawProjectedRingOnPdf(doc, proj, [p1, p2], box, false);
      });

      // Constellation IAU 3-letter label
      const [lon, lat] = celestialToLonLat(con.raCenterHours * 15, con.decCenterDeg);
      const pt = proj([lon, lat]);
      if (pt) {
        const px = box.x + pt[0];
        const py = box.y + pt[1];
        if (px > box.x + 8 && px < box.x + box.w - 8 && py > box.y + 6 && py < box.y + box.h - 6) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          if (isDark) doc.setTextColor(148, 163, 184);
          else if (isNight) doc.setTextColor(220, 38, 38);
          else doc.setTextColor(100, 116, 139);
          doc.text(con.constellation.toUpperCase(), px, py);
        }
      }
    });
  }

  // 5. Nebula Outlines, Messier & Caldwell Deep-Sky Objects (성운 윤곽선 및 메시에/콜드웰 천체)
  if (
    config.showNebulaOutlines ||
    config.showMessierObjects ||
    config.showCaldwellObjects
  ) {
    const visibleDsos = DSO_CATALOG.filter((d) => {
      if (d.mag > sheet.limitDsoMag) return false;
      if (
        angularDistanceDeg(sheet.centerRaDeg, sheet.centerDecDeg, d.raDeg, d.decDeg) >
        sheet.fovDeg * 0.8
      ) {
        return false;
      }
      if (d.messierId) return config.showMessierObjects;
      if (d.caldwellId) return config.showCaldwellObjects;
      return config.showNebulaOutlines;
    });

    visibleDsos.forEach((dso) => {
      // Extended multi-vertex nebula contour polygon
      if (
        config.showNebulaOutlines &&
        dso.contourPolygons &&
        dso.contourPolygons.length > 0
      ) {
        if (isDark) doc.setDrawColor(52, 211, 153);
        else if (isNight) doc.setDrawColor(239, 68, 68);
        else doc.setDrawColor(5, 150, 105);
        doc.setLineWidth(0.38);
        dso.contourPolygons.forEach((poly) => {
          drawProjectedRingOnPdf(doc, proj, poly, box, true);
        });
      }

      const [lon, lat] = celestialToLonLat(dso.raDeg, dso.decDeg);
      const pt = proj([lon, lat]);
      if (!pt) return;
      const px = box.x + pt[0];
      const py = box.y + pt[1];
      if (px < box.x + 3 || px > box.x + box.w - 3 || py < box.y + 3 || py > box.y + box.h - 3) {
        return;
      }

      // Draw standard fchart3 cartographic symbol at DSO center
      const rSym = Math.max(1.4, Math.min(4.8, (dso.sizeMajorArcmin / 60) * (box.w / sheet.fovDeg) * 0.5));
      if (dso.type.includes('galaxy')) {
        if (isDark) doc.setDrawColor(251, 191, 36);
        else if (isNight) doc.setDrawColor(239, 68, 68);
        else doc.setDrawColor(217, 119, 6);
        doc.setLineWidth(0.3);
        doc.ellipse(px, py, rSym * 1.3, rSym * 0.65, 'S');
      } else if (dso.type === 'globular_cluster') {
        if (isDark) doc.setDrawColor(250, 204, 21);
        else if (isNight) doc.setDrawColor(239, 68, 68);
        else doc.setDrawColor(180, 83, 9);
        doc.setLineWidth(0.3);
        doc.circle(px, py, rSym, 'S');
        doc.line(px - rSym, py, px + rSym, py);
        doc.line(px, py - rSym, px, py + rSym);
      } else if (dso.type === 'open_cluster') {
        if (isDark) doc.setDrawColor(56, 189, 248);
        else if (isNight) doc.setDrawColor(239, 68, 68);
        else doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.28);
        doc.setLineDashPattern([0.7, 0.7], 0);
        doc.circle(px, py, rSym, 'S');
        doc.setLineDashPattern([], 0);
      } else if (!dso.contourPolygons) {
        if (isDark) doc.setDrawColor(52, 211, 153);
        else if (isNight) doc.setDrawColor(239, 68, 68);
        else doc.setDrawColor(5, 150, 105);
        doc.setLineWidth(0.3);
        doc.rect(px - rSym, py - rSym, rSym * 2, rSym * 2, 'S');
      }

      if (config.showDsoLabels) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        if (isDark) doc.setTextColor(110, 231, 183);
        else if (isNight) doc.setTextColor(248, 113, 113);
        else doc.setTextColor(4, 120, 87);
        doc.text(dso.id, px + rSym + 1.2, py + 0.8);
      }
    });
  }

  // 6. Stars with fchart3 White Separation Halos (항성 벡터 출력)
  const stars = getVisibleStars(
    sheet.centerRaDeg,
    sheet.centerDecDeg,
    sheet.fovDeg,
    sheet.limitStarMag
  ).sort((a, b) => b.mag - a.mag); // Draw faint stars first, bright stars on top

  stars.forEach((st) => {
    const [lon, lat] = celestialToLonLat(st.raDeg, st.decDeg);
    const pt = proj([lon, lat]);
    if (!pt) return;
    const px = box.x + pt[0];
    const py = box.y + pt[1];
    if (px < box.x + 1 || px > box.x + box.w - 1 || py < box.y + 1 || py > box.y + box.h - 1) {
      return;
    }

    const rMm = computeStarRadius(st.mag, sheet.limitStarMag, config.starScaleFactor, 0.34);

    // fchart3 halo around bright stars to separate overlapping lines/stars
    if (st.mag < 5.5) {
      if (isDark) doc.setFillColor(10, 14, 23);
      else if (isNight) doc.setFillColor(12, 3, 3);
      else doc.setFillColor(255, 255, 255);
      doc.circle(px, py, rMm + 0.32, 'F');
    }

    // Double star horizontal bar
    if (st.isDouble) {
      if (isDark) doc.setDrawColor(248, 250, 252);
      else if (isNight) doc.setDrawColor(248, 113, 113);
      else doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.22);
      doc.line(px - rMm * 1.75, py, px + rMm * 1.75, py);
    }

    // Star solid core
    if (isDark) doc.setFillColor(248, 250, 252);
    else if (isNight) doc.setFillColor(239, 68, 68);
    else doc.setFillColor(15, 23, 42);
    doc.circle(px, py, rMm, 'F');

    // Variable star outer ring
    if (st.isVariable && st.mag < 5.0) {
      if (isDark) doc.setDrawColor(248, 250, 252);
      else if (isNight) doc.setDrawColor(239, 68, 68);
      else doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.18);
      doc.circle(px, py, rMm + 0.55, 'S');
    }

    // Star labels
    if (config.showStarLabels !== 'none' && !st.isProcedural) {
      const shouldLabel =
        (config.showStarLabels === 'bright_only' && st.mag <= 2.3) ||
        (config.showStarLabels === 'all_named' && Boolean(st.nameEn)) ||
        (config.showStarLabels === 'bayer_and_named' && (Boolean(st.nameEn) || st.mag <= 3.6));

      if (shouldLabel) {
        doc.setFont('helvetica', st.mag <= 2.0 ? 'bold' : 'normal');
        doc.setFontSize(st.mag <= 2.0 ? 6.8 : 5.8);
        if (isDark) doc.setTextColor(226, 232, 240);
        else if (isNight) doc.setTextColor(252, 165, 165);
        else doc.setTextColor(30, 41, 59);

        const labelText = st.nameEn ? st.nameEn : st.bayer || '';
        if (labelText) {
          doc.text(labelText, px + rMm + 0.9, py - 0.3);
        }
      }
    }
  });

  // 7. Outer Border & Adjacent Sheet Navigation Pointers
  if (isDark) doc.setDrawColor(71, 85, 105);
  else if (isNight) doc.setDrawColor(153, 27, 27);
  else doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.45);
  doc.rect(box.x, box.y, box.w, box.h, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  if (isDark) doc.setTextColor(148, 163, 184);
  else if (isNight) doc.setTextColor(220, 38, 38);
  else doc.setTextColor(71, 85, 105);

  if (sheet.adjacentNorth) {
    doc.text(`▲ N: CHART #${sheet.adjacentNorth}`, box.x + box.w / 2, box.y - 1.8, {
      align: 'center',
    });
  }
  if (sheet.adjacentSouth) {
    doc.text(`▼ S: CHART #${sheet.adjacentSouth}`, box.x + box.w / 2, box.y + box.h + 4.2, {
      align: 'center',
    });
  }
  if (sheet.adjacentEast) {
    doc.text(`◀ E #${sheet.adjacentEast}`, box.x + 2, box.y + box.h + 4.2);
  }
  if (sheet.adjacentWest) {
    doc.text(`W #${sheet.adjacentWest} ▶`, box.x + box.w - 2, box.y + box.h + 4.2, {
      align: 'right',
    });
  }

  // Footer Magnitude Legend & Scale Bar
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `Vector Output: Milky Way Contours · IAU Boundaries · Nebula Outlines  |  Projection: ${config.projection.toUpperCase()}`,
    box.x,
    pageH - 4
  );
}

/**
 * Generate & Download Complete Multi-Page Vector PDF Sky Atlas (`fchart3-atlas`)
 */
export async function exportMultiPageAtlasPdf(
  options: AtlasGeneratorOptions,
  sheets: AtlasSheet[],
  baseConfig: FChart3Config,
  onProgress?: (current: number, total: number, stage: string) => void
): Promise<void> {
  const isLandscape = options.paperSize !== 'A4_PORTRAIT';
  const format = options.paperSize === 'A3_LANDSCAPE' ? 'a3' : 'a4';

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const effectiveConfig: FChart3Config = {
    ...baseConfig,
    colorScheme: options.colorScheme,
    limitStarMag: options.limitStarMag,
    limitDsoMag: options.limitDsoMag,
  };

  let pageNumber = 0;
  const totalSteps =
    (options.includeCoverPage ? 1 : 0) +
    (options.includeIndexMapPage ? 1 : 0) +
    sheets.length;

  // 1. Cover Page
  if (options.includeCoverPage) {
    pageNumber++;
    onProgress?.(pageNumber, totalSteps, '성도집 표지 및 범례 벡터 생성 중...');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, pageH, 'F');

    // Decorative vector celestial grid ring on cover
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.3);
    const cx = pageW * 0.72;
    const cy = pageH * 0.5;
    [22, 38, 54, 70].forEach((r) => doc.circle(cx, cy, r, 'S'));
    doc.line(cx - 78, cy, cx + 78, cy);
    doc.line(cx, cy - 78, cx, cy + 78);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(56, 189, 248);
    doc.text('FCHART3-ATLAS VECTOR CARTOGRAPHY ENGINE  ·  EPOCH J2000.0', 22, 32);

    doc.setFontSize(26);
    doc.setTextColor(248, 250, 252);
    doc.text(options.atlasTitle || 'FCHART3 SKY ATLAS 2000.0', 22, 48);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Partitioned Multi-Page Vector Star Atlas  |  ${sheets.length} Charts  |  FOV ${options.fovPerSheetDeg}°  |  Mag Limit ${options.limitStarMag.toFixed(1)}`,
      22,
      58
    );

    // Specification Box
    doc.setDrawColor(51, 65, 85);
    doc.setFillColor(17, 24, 39);
    doc.rect(22, 72, 145, 76, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(226, 232, 240);
    doc.text('ATLAS CARTOGRAPHIC SPECIFICATIONS', 28, 83);

    const specs = [
      ['Total Partitioned Sheets', `${sheets.length} Pages (Overlap ${options.overlapPercent}%)`],
      ['Declination Coverage', `${formatDecDeg(options.decMinDeg, true)} to ${formatDecDeg(options.decMaxDeg, true)}`],
      ['Field of View per Sheet', `${options.fovPerSheetDeg.toFixed(1)}° (${effectiveConfig.projection.toUpperCase()})`],
      ['Stellar Limiting Magnitude', `V <= ${options.limitStarMag.toFixed(1)} mag (Hipparcos / Tycho-2)`],
      ['Deep-Sky Limiting Magnitude', `V <= ${options.limitDsoMag.toFixed(1)} mag (Messier / NGC / IC)`],
      ['Vector Layers Included', 'IAU Boundaries · Milky Way Isophotes · Nebula Contours'],
      ['Prepared By / Observatory', options.authorOrObservatory || 'FChart3 Studio Automated Cartography'],
    ];

    doc.setFontSize(8.5);
    specs.forEach(([k, v], idx) => {
      const y = 93 + idx * 7.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(k, 28, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(241, 245, 249);
      doc.text(v, 88, y);
    });
  }

  // 2. All-Sky Index Chart Page
  if (options.includeIndexMapPage) {
    if (pageNumber > 0) doc.addPage();
    pageNumber++;
    onProgress?.(pageNumber, totalSteps, '전천 분할 색인도(Index Chart) 생성 중...');

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('ALL-SKY ATLAS SHEET INDEX & PARTITION TABLE', 16, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Equatorial Rectangular Tessellation  ·  ${sheets.length} Partitioned Charts  ·  Numbers correspond to Atlas Chart Pages`,
      16,
      21
    );

    // Draw Rectangular All-Sky RA/Dec Map showing each sheet's bounding box
    const mapX = 16;
    const mapY = 27;
    const mapW = pageW - 32;
    const mapH = pageH - 42;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.rect(mapX, mapY, mapW, mapH, 'S');

    // Grid lines
    for (let h = 0; h <= 24; h += 2) {
      const x = mapX + ((24 - h) / 24) * mapW;
      doc.line(x, mapY, x, mapY + mapH);
      doc.setFontSize(6.5);
      doc.text(`${h}h`, x - 2, mapY + mapH + 4);
    }
    for (let d = -90; d <= 90; d += 30) {
      const y = mapY + ((90 - d) / 180) * mapH;
      doc.line(mapX, y, mapX + mapW, y);
      doc.setFontSize(6.5);
      doc.text(`${d > 0 ? '+' : ''}${d}°`, mapX - 7, y + 1);
    }

    // Draw sheet boxes
    sheets.forEach((sh) => {
      const cx = mapX + ((24 - sh.centerRaHours) / 24) * mapW;
      const cy = mapY + ((90 - sh.centerDecDeg) / 180) * mapH;
      const bw = Math.min(mapW * 0.9, (sh.raSpanHours / 24) * mapW);
      const bh = (sh.decSpanDeg / 180) * mapH;

      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.25);
      doc.rect(
        Math.max(mapX, cx - bw / 2),
        Math.max(mapY, cy - bh / 2),
        Math.min(bw, mapX + mapW - Math.max(mapX, cx - bw / 2)),
        Math.min(bh, mapY + mapH - Math.max(mapY, cy - bh / 2)),
        'S'
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 64, 175);
      doc.text(`#${sh.sheetNumber}`, cx, cy + 1, { align: 'center' });
    });
  }

  // 3. Individual Vector Star Chart Pages
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (pageNumber > 0) doc.addPage();
    pageNumber++;
    onProgress?.(
      pageNumber,
      totalSteps,
      `벡터 성도 렌더링 중: Chart #${sh.sheetNumber}/${sheets.length} (${sh.titleKo})`
    );

    // Yield briefly to keep UI progress bar responsive
    await new Promise((r) => setTimeout(r, 12));
    renderVectorChartPageOnPdf(doc, sh, effectiveConfig, pageW, pageH);
  }

  const safeFilename =
    (options.atlasTitle || 'fchart3_sky_atlas')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_') + `_${sheets.length}pages.pdf`;

  doc.save(safeFilename);
}

/**
 * Export Single Currently Viewed Star Chart as a High-Precision Vector PDF
 */
export function exportSingleChartPdf(config: FChart3Config): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const singleSheet: AtlasSheet = {
    sheetNumber: 1,
    totalSheets: 1,
    zoneLabel: 'Custom Single Finder Chart',
    titleKo: `RA ${formatRaHours(config.centerRaHours)} / Dec ${formatDecDeg(config.centerDecDeg)}`,
    titleEn: `Single Finder Chart`,
    centerRaHours: config.centerRaHours,
    centerRaDeg: config.centerRaHours * 15,
    centerDecDeg: config.centerDecDeg,
    fovDeg: config.fovDeg,
    raSpanHours: 2,
    decSpanDeg: config.fovDeg,
    limitStarMag: config.limitStarMag,
    limitDsoMag: config.limitDsoMag,
    featuredConstellations: [],
    featuredDsos: [],
    starCountEstimate: 0,
    dsoCount: 0,
  };

  renderVectorChartPageOnPdf(doc, singleSheet, config, pageW, pageH);
  doc.save(
    `fchart3_chart_RA${formatRaHours(config.centerRaHours, true)}_Dec${formatDecDeg(
      config.centerDecDeg,
      true
    )}_FOV${config.fovDeg.toFixed(0)}.pdf`
  );
}
