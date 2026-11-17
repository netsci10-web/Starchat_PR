import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Check,
  ChevronDown,
  Compass,
  Crosshair,
  Download,
  FastForward,
  FileDown,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  Sliders,
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
  ChartColorScheme,
  DSORecord,
  FChart3Config,
  SelectedSkyObject,
  SolarSystemBodyRecord,
  StarRecord,
} from '../types/astronomy';
import {
  bvToStarColor,
  celestialToLonLat,
  computeLinkedLimitingMags,
  computeLstDeg,
  computeStarRadius,
  createCelestialProjection,
  equatorialToHorizontal,
  exportSingleChartPdf,
  formatAltDeg,
  formatAzDeg,
  formatDecDeg,
  formatExactDecDms,
  formatExactRaHms,
  formatRaHours,
  horizontalToEquatorial,
  horizontalToLonLat,
  lonToAz,
} from '../utils/atlasGenerator';
import { computeSolarSystemBodies } from '../utils/solarSystemEphemeris';
import { cancelActiveSkySlew, startSkySlew } from '../utils/skySlew';
import {
  CelestialLabelInput,
  isSatelliteSufficientlySeparated,
  layoutCelestialLabels,
} from '../utils/celestialLabelLayout';

function roundFovDeg(raw: number): number {
  const clamped = Math.max(0.02, Math.min(135.0, raw));
  if (clamped < 0.2) return Number(clamped.toFixed(3));
  if (clamped < 2) return Number(clamped.toFixed(2));
  return Number(clamped.toFixed(1));
}

function buildPhaseShadowPath(radius: number, phasePercent: number): string | null {
  const k = Math.max(0, Math.min(1, phasePercent / 100));
  if (k >= 0.995) return null;
  if (k <= 0.005) {
    return `M 0 ${-radius} A ${radius} ${radius} 0 1 0 0 ${radius} A ${radius} ${radius} 0 1 0 0 ${-radius} Z`;
  }
  const rxT = Math.max(0.01, Math.abs(2 * k - 1) * radius);
  const sweepT = k < 0.5 ? 0 : 1;
  return `M 0 ${-radius} A ${radius} ${radius} 0 0 0 0 ${radius} A ${rxT} ${radius} 0 0 ${sweepT} 0 ${-radius} Z`;
}

const SOL_DEG2RAD = Math.PI / 180;

interface ProjectedSurfaceFeature {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

/**
 * Project a planetocentric (latDeg, westLonDeg) coordinate onto the apparent 2D disc
 * in local (North = -Y, Celestial West = +X) coordinates.
 */
function projectSurfacePoint(
  latDeg: number,
  westLonDeg: number,
  rX: number,
  rY: number,
  subEarthLatDeg: number,
  centralMeridianDeg: number
): ProjectedSurfaceFeature {
  const lat = latDeg * SOL_DEG2RAD;
  const be = subEarthLatDeg * SOL_DEG2RAD;
  const dLon = (((westLonDeg - centralMeridianDeg + 540) % 360) - 180) * SOL_DEG2RAD;

  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const cosBe = Math.cos(be);
  const sinBe = Math.sin(be);
  const cosDL = Math.cos(dLon);
  const sinDL = Math.sin(dLon);

  const z = cosLat * cosDL * cosBe + sinLat * sinBe;
  const x = -rX * cosLat * sinDL;
  const y = -rY * (sinLat * cosBe - cosLat * cosDL * sinBe);

  return { x, y, z, visible: z > -0.12 };
}

/**
 * Build a clipped elliptical patch path for a circular/elliptical surface feature at (latDeg, westLonDeg)
 * with realistic limb foreshortening along the local normal.
 */
function renderSpherePatch(
  key: string,
  latDeg: number,
  westLonDeg: number,
  angRadiusDeg: number,
  aspectRatio: number,
  rX: number,
  rY: number,
  subEarthLatDeg: number,
  centralMeridianDeg: number,
  fill: string,
  opacity: number,
  stroke?: string,
  strokeWidth?: number
): React.ReactNode {
  const p = projectSurfacePoint(
    latDeg,
    westLonDeg,
    rX,
    rY,
    subEarthLatDeg,
    centralMeridianDeg
  );
  if (!p.visible || p.z <= 0.02) return null;
  const baseR = (angRadiusDeg * SOL_DEG2RAD) * rX;
  const foreshorten = Math.max(0.18, Math.min(1, p.z));
  const rx = Math.max(0.35, baseR * foreshorten);
  const ry = Math.max(0.35, baseR * aspectRatio * Math.max(0.45, Math.sqrt(foreshorten)));
  const radialAngle = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  return (
    <ellipse
      key={key}
      cx={p.x}
      cy={p.y}
      rx={rx}
      ry={ry}
      transform={`rotate(${radialAngle}, ${p.x}, ${p.y})`}
      fill={fill}
      opacity={opacity * Math.min(1, p.z * 2.2)}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

/**
 * Build a curved latitude belt polyline across the visible hemisphere of an oblate tilted sphere.
 */
function buildLatitudeBeltPath(
  latDeg: number,
  rX: number,
  rY: number,
  subEarthLatDeg: number
): string | null {
  const pts: Array<[number, number]> = [];
  for (let dLonDeg = -88; dLonDeg <= 88; dLonDeg += 8) {
    const p = projectSurfacePoint(latDeg, dLonDeg, rX, rY, subEarthLatDeg, 0);
    if (p.z >= -0.02) {
      pts.push([p.x, p.y]);
    }
  }
  if (pts.length < 2) return null;
  return pts
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`)
    .join(' ');
}

function buildLatitudeBandPolygon(
  latNorthDeg: number,
  latSouthDeg: number,
  rX: number,
  rY: number,
  subEarthLatDeg: number
): string | null {
  const topPts: Array<[number, number]> = [];
  const botPts: Array<[number, number]> = [];
  for (let dLonDeg = -90; dLonDeg <= 90; dLonDeg += 10) {
    const ptN = projectSurfacePoint(latNorthDeg, dLonDeg, rX, rY, subEarthLatDeg, 0);
    const ptS = projectSurfacePoint(latSouthDeg, dLonDeg, rX, rY, subEarthLatDeg, 0);
    topPts.push([ptN.x, ptN.y]);
    botPts.push([ptS.x, ptS.y]);
  }
  if (topPts.length < 2) return null;
  const all = [...topPts, ...botPts.reverse()];
  return (
    all
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

const SolarBodyDetailedDisc: React.FC<{
  body: SolarSystemBodyRecord;
  discR: number;
  litAngleDeg: number;
  poleScreenAngleDeg: number;
  eastWestFlip: number;
  bodyColor: string;
  haloColor: string;
  isNightVision: boolean;
  isPaper: boolean;
  showDetails: boolean;
}> = ({
  body,
  discR,
  litAngleDeg,
  poleScreenAngleDeg,
  eastWestFlip,
  bodyColor,
  haloColor,
  isNightVision,
  isPaper,
  showDetails,
}) => {
  const clipId = `clip-solar-disc-${body.id}`;
  const gradId = `grad-solar-disc-${body.id}`;
  const phasePercent = body.phasePercent ?? 100;
  const subEarthLat = body.subEarthLatDeg ?? 0;
  const subSolarLat = body.subSolarLatDeg ?? subEarthLat;
  const cmDeg = body.centralMeridianDeg ?? 0;
  const flattening = body.flattening ?? 0;
  const cosBe = Math.cos(subEarthLat * SOL_DEG2RAD);
  const discRy = Math.max(
    discR * 0.86,
    discR * (1 - flattening * cosBe * cosBe)
  );

  // Rotate local -Y (0, -R) onto projected true celestial North Pole of this body
  const poleRotDeg = poleScreenAngleDeg + 90;

  const shadowPath =
    showDetails && body.id !== 'sun'
      ? buildPhaseShadowPath(discR, phasePercent)
      : null;

  const nightOverlayColor = isNightVision
    ? 'rgba(18, 2, 2, 0.92)'
    : isPaper
    ? 'rgba(15, 23, 42, 0.80)'
    : 'rgba(3, 6, 16, 0.90)';

  // True physical ring tilt factor |sin(B_e)|
  const absSinBe = Math.abs(Math.sin(subEarthLat * SOL_DEG2RAD));
  const ringTiltRatio = Math.max(0.025, absSinBe);
  const isSouthRingFace = subEarthLat < 0;
  const backRingSweep = isSouthRingFace ? 0 : 1;
  const frontRingSweep = isSouthRingFace ? 1 : 0;
  const ringSameSunSide = subEarthLat * subSolarLat >= -0.3;

  const uranusRing = body.id === 'uranus' && showDetails && discR >= 5.0;
  const saturnDetailedRings = body.id === 'saturn' && showDetails && discR >= 4.5;

  const ringStrokeA = isNightVision
    ? '#F87171'
    : ringSameSunSide
    ? '#E7CFA0'
    : '#94836B';
  const ringStrokeB = isNightVision
    ? '#FCA5A5'
    : ringSameSunSide
    ? '#FDE68A'
    : '#B8A689';
  const ringStrokeC = isNightVision
    ? '#B91C1C'
    : ringSameSunSide
    ? '#A89678'
    : '#645A4A';
  const ringGapStroke = isPaper ? '#E2E8F0' : isNightVision ? '#2A0505' : '#090D16';
  const ringOpacityScale = ringSameSunSide ? 1 : 0.45;

  const detailedSurface = showDetails && discR >= 4.0;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <ellipse rx={discR} ry={discRy} />
        </clipPath>
        <radialGradient id={gradId} cx="42%" cy="38%" r="65%">
          {body.id === 'sun' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FFFBEB'} />
              <stop offset="55%" stopColor={isNightVision ? '#EF4444' : '#FDE047'} />
              <stop offset="88%" stopColor={isNightVision ? '#DC2626' : '#F59E0B'} />
              <stop offset="100%" stopColor={isNightVision ? '#991B1B' : '#D97706'} />
            </>
          ) : body.id === 'moon' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#F8FAFC'} />
              <stop offset="70%" stopColor={isNightVision ? '#EF4444' : '#E2E8F0'} />
              <stop offset="100%" stopColor={isNightVision ? '#7F1D1D' : '#94A3B8'} />
            </>
          ) : body.id === 'mars' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#F87171' : '#FB923C'} />
              <stop offset="72%" stopColor={isNightVision ? '#DC2626' : '#EA580C'} />
              <stop offset="100%" stopColor={isNightVision ? '#7F1D1D' : '#9A3412'} />
            </>
          ) : body.id === 'jupiter' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FEF3C7'} />
              <stop offset="72%" stopColor={isNightVision ? '#EF4444' : '#F3D2A2'} />
              <stop offset="100%" stopColor={isNightVision ? '#991B1B' : '#B47B48'} />
            </>
          ) : body.id === 'saturn' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FEF9C3'} />
              <stop offset="75%" stopColor={isNightVision ? '#EF4444' : '#EAD59B'} />
              <stop offset="100%" stopColor={isNightVision ? '#991B1B' : '#A68B5B'} />
            </>
          ) : body.id === 'venus' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FFFDF0'} />
              <stop offset="80%" stopColor={isNightVision ? '#F87171' : '#FDE68A'} />
              <stop offset="100%" stopColor={isNightVision ? '#B91C1C' : '#D9B86C'} />
            </>
          ) : body.id === 'uranus' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#CFFAFE'} />
              <stop offset="80%" stopColor={isNightVision ? '#EF4444' : '#67E8F9'} />
              <stop offset="100%" stopColor={isNightVision ? '#991B1B' : '#0891B2'} />
            </>
          ) : body.id === 'neptune' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#93C5FD'} />
              <stop offset="78%" stopColor={isNightVision ? '#EF4444' : '#3B82F6'} />
              <stop offset="100%" stopColor={isNightVision ? '#7F1D1D' : '#1D4ED8'} />
            </>
          ) : body.id === 'io' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FEF08A'} />
              <stop offset="75%" stopColor={isNightVision ? '#EF4444' : '#FACC15'} />
              <stop offset="100%" stopColor={isNightVision ? '#991B1B' : '#CA8A04'} />
            </>
          ) : body.id === 'titan' ? (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#FED7AA'} />
              <stop offset="75%" stopColor={isNightVision ? '#EF4444' : '#F97316'} />
              <stop offset="100%" stopColor={isNightVision ? '#7F1D1D' : '#C2410C'} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={isNightVision ? '#FCA5A5' : '#F1F5F9'} />
              <stop offset="75%" stopColor={bodyColor} />
              <stop offset="100%" stopColor={isNightVision ? '#7F1D1D' : '#64748B'} />
            </>
          )}
        </radialGradient>
      </defs>

      {/* Sun outer corona glow */}
      {body.kind === 'sun' && (
        <circle
          r={discR + Math.min(8, Math.max(3, discR * 0.22))}
          fill="none"
          stroke={isNightVision ? '#EF4444' : '#FDE047'}
          strokeWidth="1.2"
          opacity="0.55"
        />
      )}

      {/* Pole-Aligned Group: aligns North Pole (-Y), true oblateness, and true ring tilt */}
      <g transform={`rotate(${poleRotDeg})`}>
        {/* Separation halo (keeps bright limb crisp against dense Milky Way / starfield) */}
        <ellipse rx={discR + 1.2} ry={discRy + 1.2} fill={haloColor} />

        {/* BACK RING HALF (behind planet globe, dynamically curved for North/South ring face) */}
        {saturnDetailedRings && (
          <g opacity={ringOpacityScale}>
            {/* A-ring */}
            <path
              d={`M ${-discR * 2.27} 0 A ${discR * 2.27} ${discR * 2.27 * ringTiltRatio} 0 0 ${backRingSweep} ${discR * 2.27} 0`}
              fill="none"
              stroke={ringStrokeA}
              strokeWidth={Math.max(1.1, discR * 0.20)}
              opacity="0.82"
            />
            {/* Cassini Division */}
            <path
              d={`M ${-discR * 1.97} 0 A ${discR * 1.97} ${discR * 1.97 * ringTiltRatio} 0 0 ${backRingSweep} ${discR * 1.97} 0`}
              fill="none"
              stroke={ringGapStroke}
              strokeWidth={Math.max(0.7, discR * 0.08)}
              opacity="0.92"
            />
            {/* B-ring */}
            <path
              d={`M ${-discR * 1.72} 0 A ${discR * 1.72} ${discR * 1.72 * ringTiltRatio} 0 0 ${backRingSweep} ${discR * 1.72} 0`}
              fill="none"
              stroke={ringStrokeB}
              strokeWidth={Math.max(1.3, discR * 0.26)}
              opacity="0.92"
            />
            {/* C-ring (Crepe inner) */}
            <path
              d={`M ${-discR * 1.40} 0 A ${discR * 1.40} ${discR * 1.40 * ringTiltRatio} 0 0 ${backRingSweep} ${discR * 1.40} 0`}
              fill="none"
              stroke={ringStrokeC}
              strokeWidth={Math.max(0.8, discR * 0.14)}
              opacity="0.45"
            />
          </g>
        )}
        {uranusRing && (
          <ellipse
            rx={discR * 1.66}
            ry={discR * 1.66 * Math.max(0.04, absSinBe)}
            fill="none"
            stroke={isNightVision ? '#F87171' : '#A5F3FC'}
            strokeWidth="0.95"
            opacity="0.48"
          />
        )}

        {/* Globe & Surface Details Clipped to True Oblate Planetary Limb */}
        <g clipPath={`url(#${clipId})`}>
          <ellipse
            rx={discR}
            ry={discRy}
            fill={detailedSurface ? `url(#${gradId})` : bodyColor}
          />

          {/* Mirror-aware surface feature coordinates: -X = Celestial East, +X = Celestial West */}
          <g transform={`scale(${eastWestFlip}, 1)`}>
            {/* SUN: Rotating solar active sunspot belts tilted by B0 */}
            {detailedSurface && body.id === 'sun' && (
              <g opacity="0.88">
                {[
                  { lat: 18, lon: 65, r: 4.5 },
                  { lat: 16, lon: 71, r: 2.8 },
                  { lat: -19, lon: 185, r: 4.0 },
                  { lat: -21, lon: 192, r: 2.4 },
                  { lat: 23, lon: 295, r: 3.4 },
                  { lat: -14, lon: 340, r: 3.0 },
                ].map((spot, idx) =>
                  renderSpherePatch(
                    `sunspot-${idx}`,
                    spot.lat,
                    spot.lon,
                    spot.r,
                    1,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg,
                    isNightVision ? '#450A0A' : '#451A03',
                    0.92,
                    isNightVision ? '#991B1B' : '#92400E',
                    Math.max(0.5, discR * 0.018)
                  )
                )}
              </g>
            )}

            {/* MOON: Real Near-Side Selenographic Maria & Ray Craters with Libration */}
            {detailedSurface && body.id === 'moon' && (
              <g>
                {[
                  // Eastern Maria (IAU East = negative westLon -> right side +X in unmirrored sky!)
                  { id: 'crisium', lat: 17, lonW: -59, rad: 12, aspect: 1.15, col: '#64748B', op: 0.62 },
                  { id: 'fecunditatis', lat: -8, lonW: -51, rad: 18, aspect: 0.88, col: '#64748B', op: 0.54 },
                  { id: 'tranquillitatis', lat: 9, lonW: -31, rad: 19, aspect: 0.9, col: '#475569', op: 0.58 },
                  { id: 'serenitatis', lat: 28, lonW: -18, rad: 18, aspect: 0.95, col: '#475569', op: 0.58 },
                  { id: 'nectaris', lat: -15, lonW: -35, rad: 12, aspect: 1.0, col: '#64748B', op: 0.54 },
                  { id: 'vaporum', lat: 13, lonW: -4, rad: 10, aspect: 1.1, col: '#64748B', op: 0.45 },
                  // Western Maria (IAU West = positive westLon -> left side -X in unmirrored sky!)
                  { id: 'imbrium', lat: 33, lonW: 16, rad: 24, aspect: 0.95, col: '#475569', op: 0.60 },
                  { id: 'frigoris', lat: 56, lonW: 5, rad: 20, aspect: 0.38, col: '#64748B', op: 0.48 },
                  { id: 'procellarum-n', lat: 22, lonW: 44, rad: 25, aspect: 1.1, col: '#64748B', op: 0.54 },
                  { id: 'procellarum-s', lat: -4, lonW: 40, rad: 22, aspect: 1.1, col: '#64748B', op: 0.50 },
                  { id: 'nubium', lat: -21, lonW: 17, rad: 17, aspect: 0.9, col: '#64748B', op: 0.52 },
                  { id: 'humorum', lat: -24, lonW: 39, rad: 12, aspect: 0.95, col: '#475569', op: 0.56 },
                ].map((mare) =>
                  renderSpherePatch(
                    mare.id,
                    mare.lat,
                    mare.lonW,
                    mare.rad,
                    mare.aspect,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg,
                    isNightVision ? '#7F1D1D' : mare.col,
                    isNightVision ? mare.op * 0.9 : mare.op
                  )
                )}

                {/* Plato dark floor crater */}
                {renderSpherePatch(
                  'plato',
                  51.6,
                  9.3,
                  4.0,
                  1.0,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  isNightVision ? '#450A0A' : '#334155',
                  0.65
                )}

                {/* Tycho, Copernicus, Aristarchus bright crater rims & ejecta rays */}
                {[
                  { id: 'tycho', lat: -43.3, lonW: 11.2, rad: 4.2, rays: true },
                  { id: 'copernicus', lat: 9.7, lonW: 20.0, rad: 3.8, rays: true },
                  { id: 'kepler', lat: 8.1, lonW: 38.0, rad: 2.5, rays: false },
                  { id: 'aristarchus', lat: 23.7, lonW: 47.4, rad: 2.6, rays: false },
                ].map((crater) => {
                  const pt = projectSurfacePoint(
                    crater.lat,
                    crater.lonW,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg
                  );
                  if (!pt.visible || pt.z <= 0.1) return null;
                  const crR = Math.max(0.85, (crater.rad * SOL_DEG2RAD) * discR * pt.z);
                  return (
                    <g key={crater.id} opacity={0.78}>
                      {crater.rays && discR >= 12 && (
                        <g
                          stroke={isNightVision ? '#FCA5A5' : '#F8FAFC'}
                          strokeWidth={Math.max(0.4, discR * 0.015)}
                          opacity="0.42"
                        >
                          <line x1={pt.x - crR * 3.5} y1={pt.y - crR * 2.2} x2={pt.x + crR * 3.2} y2={pt.y + crR * 2.0} />
                          <line x1={pt.x + crR * 2.8} y1={pt.y - crR * 3.1} x2={pt.x - crR * 2.4} y2={pt.y + crR * 2.6} />
                        </g>
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={crR}
                        fill="none"
                        stroke={isNightVision ? '#FECACA' : '#FFFFFF'}
                        strokeWidth={Math.max(0.5, discR * 0.022)}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* MERCURY: Rotating Caloris Basin & bright ray craters */}
            {detailedSurface && body.id === 'mercury' && (
              <g>
                {renderSpherePatch(
                  'caloris',
                  30.5,
                  189.8,
                  20,
                  1.0,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  isNightVision ? '#7F1D1D' : '#6B7280',
                  0.45
                )}
                {renderSpherePatch(
                  'rachmaninoff',
                  27.6,
                  302.4,
                  10,
                  1.0,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  isNightVision ? '#991B1B' : '#9CA3AF',
                  0.42
                )}
                {renderSpherePatch(
                  'kuiper',
                  -11.3,
                  31.1,
                  5.5,
                  1.0,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  'none',
                  0.65,
                  isNightVision ? '#FCA5A5' : '#E5E7EB',
                  Math.max(0.5, discR * 0.025)
                )}
              </g>
            )}

            {/* VENUS: Subtle golden-cream sulfuric cloud chevrons */}
            {detailedSurface && body.id === 'venus' && (
              <g opacity="0.34">
                <path
                  d={`M ${-discR * 0.85} ${-discR * 0.24} Q 0 ${-discR * 0.04} ${discR * 0.85} ${-discR * 0.24}`}
                  fill="none"
                  stroke={isNightVision ? '#991B1B' : '#B45309'}
                  strokeWidth={Math.max(0.9, discR * 0.11)}
                />
                <path
                  d={`M ${-discR * 0.85} ${discR * 0.22} Q 0 ${discR * 0.05} ${discR * 0.85} ${discR * 0.22}`}
                  fill="none"
                  stroke={isNightVision ? '#991B1B' : '#D97706'}
                  strokeWidth={Math.max(0.9, discR * 0.11)}
                />
              </g>
            )}

            {/* MARS: Real-time Rotating Martian Albedo Map (Syrtis Major, Hellas, Acidalia, Solis Lacus, Polar Caps) */}
            {detailedSurface && body.id === 'mars' && (
              <g>
                {[
                  // Syrtis Major (290°W, +10°N)
                  { id: 'syrtis', lat: 10, lonW: 290, rad: 22, aspect: 1.5, col: '#5C1D0C', op: 0.62 },
                  // Hellas Planitia bright basin (292°W, -42°S)
                  { id: 'hellas', lat: -42, lonW: 292, rad: 18, aspect: 0.85, col: '#FDBA74', op: 0.45 },
                  // Acidalia Planitia (22°W, +48°N)
                  { id: 'acidalia', lat: 48, lonW: 22, rad: 24, aspect: 0.8, col: '#7C2D12', op: 0.56 },
                  // Sinus Meridiani / Sabaeus (0°W, -8°S)
                  { id: 'meridiani', lat: -8, lonW: 0, rad: 17, aspect: 0.55, col: '#5C1D0C', op: 0.55 },
                  // Mare Erythraeum (32°W, -25°S)
                  { id: 'erythraeum', lat: -25, lonW: 32, rad: 22, aspect: 0.68, col: '#7C2D12', op: 0.52 },
                  // Solis Lacus (90°W, -28°S)
                  { id: 'solis', lat: -28, lonW: 90, rad: 14, aspect: 0.72, col: '#5C1D0C', op: 0.55 },
                  // Tharsis / Olympus Mons bright ochre plateau (130°W, +16°N)
                  { id: 'tharsis', lat: 16, lonW: 130, rad: 18, aspect: 1.0, col: '#FDBA74', op: 0.36 },
                  // Mare Sirenum / Cimmerium (190°W, -25°S)
                  { id: 'cimmerium', lat: -25, lonW: 195, rad: 28, aspect: 0.45, col: '#7C2D12', op: 0.52 },
                  // Utopia Planitia (245°W, +46°N)
                  { id: 'utopia', lat: 46, lonW: 245, rad: 20, aspect: 0.75, col: '#9A3412', op: 0.44 },
                ].map((feat) =>
                  renderSpherePatch(
                    feat.id,
                    feat.lat,
                    feat.lonW,
                    feat.rad,
                    feat.aspect,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg,
                    isNightVision
                      ? feat.col === '#FDBA74'
                        ? '#FCA5A5'
                        : '#7F1D1D'
                      : feat.col,
                    feat.op
                  )
                )}

                {/* North & South Polar Ice Caps (seasonal & tilted by subEarthLat) */}
                {subEarthLat > -35 &&
                  renderSpherePatch(
                    'mars-npc',
                    85,
                    cmDeg,
                    subSolarLat > 0 ? 18 : 24,
                    0.52,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg,
                    isNightVision ? '#FEE2E2' : '#FFFFFF',
                    0.92
                  )}
                {subEarthLat < 35 &&
                  renderSpherePatch(
                    'mars-spc',
                    -85,
                    cmDeg,
                    subSolarLat < 0 ? 15 : 22,
                    0.52,
                    discR,
                    discRy,
                    subEarthLat,
                    cmDeg,
                    isNightVision ? '#FECACA' : '#F8FAFC',
                    0.88
                  )}
              </g>
            )}

            {/* JUPITER: Curved Cloud Belts (tilted by B_e) & Real-Time Rotating Great Red Spot (System II) */}
            {detailedSurface && body.id === 'jupiter' && (
              <g>
                {/* Polar dusky hoods */}
                {(() => {
                  const nHood = buildLatitudeBandPolygon(90, 56, discR, discRy, subEarthLat);
                  const sHood = buildLatitudeBandPolygon(-56, -90, discR, discRy, subEarthLat);
                  const ntb = buildLatitudeBandPolygon(35, 25, discR, discRy, subEarthLat);
                  const neb = buildLatitudeBandPolygon(18, 7, discR, discRy, subEarthLat);
                  const ez = buildLatitudeBandPolygon(6, -6, discR, discRy, subEarthLat);
                  const seb = buildLatitudeBandPolygon(-7, -20, discR, discRy, subEarthLat);
                  const stb = buildLatitudeBandPolygon(-28, -37, discR, discRy, subEarthLat);
                  return (
                    <>
                      {nHood && <path d={nHood} fill={isNightVision ? '#7F1D1D' : '#8D6E52'} opacity="0.52" />}
                      {sHood && <path d={sHood} fill={isNightVision ? '#7F1D1D' : '#8D6E52'} opacity="0.52" />}
                      {ntb && <path d={ntb} fill={isNightVision ? '#991B1B' : '#A47148'} opacity="0.68" />}
                      {stb && <path d={stb} fill={isNightVision ? '#991B1B' : '#A47148'} opacity="0.68" />}
                      {neb && <path d={neb} fill={isNightVision ? '#B91C1C' : '#9C4221'} opacity="0.84" />}
                      {seb && <path d={seb} fill={isNightVision ? '#B91C1C' : '#9C4221'} opacity="0.82" />}
                      {ez && <path d={ez} fill={isNightVision ? '#FECACA' : '#FFFBEB'} opacity="0.46" />}
                    </>
                  );
                })()}

                {/* Great Red Spot (lat ~22° S, System II ~72° W) + Oval BA (~33° S, ~215° W) */}
                {renderSpherePatch(
                  'jup-grs',
                  -22,
                  72,
                  13.5,
                  0.62,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  isNightVision ? '#DC2626' : '#C2410C',
                  0.95,
                  isNightVision ? '#FCA5A5' : '#FDE68A',
                  Math.max(0.45, discR * 0.025)
                )}
                {renderSpherePatch(
                  'jup-oval-ba',
                  -33,
                  215,
                  6.5,
                  0.72,
                  discR,
                  discRy,
                  subEarthLat,
                  cmDeg,
                  isNightVision ? '#FCA5A5' : '#FED7AA',
                  0.82
                )}
              </g>
            )}

            {/* SATURN: Curved Golden Cloud Bands & Polar Hood aligned with B_e */}
            {detailedSurface && body.id === 'saturn' && (
              <g opacity="0.62">
                {(() => {
                  const nHood = buildLatitudeBandPolygon(90, 62, discR, discRy, subEarthLat);
                  const neb = buildLatitudeBandPolygon(22, 8, discR, discRy, subEarthLat);
                  const seb = buildLatitudeBandPolygon(-8, -22, discR, discRy, subEarthLat);
                  const eqLine = buildLatitudeBeltPath(0, discR, discRy, subEarthLat);
                  return (
                    <>
                      {nHood && <path d={nHood} fill={isNightVision ? '#7F1D1D' : '#8B7355'} opacity="0.65" />}
                      {neb && <path d={neb} fill={isNightVision ? '#991B1B' : '#B48E56'} opacity="0.72" />}
                      {seb && <path d={seb} fill={isNightVision ? '#991B1B' : '#B48E56'} opacity="0.72" />}
                      {eqLine && (
                        <path
                          d={eqLine}
                          fill="none"
                          stroke={isNightVision ? '#FECACA' : '#FEF9C3'}
                          strokeWidth={Math.max(0.6, discR * 0.08)}
                          opacity="0.38"
                        />
                      )}
                    </>
                  );
                })()}
              </g>
            )}

            {/* URANUS: Polar Hood oriented toward true subSolarLat/subEarthLat */}
            {detailedSurface && body.id === 'uranus' &&
              renderSpherePatch(
                'uranus-hood',
                subSolarLat >= 0 ? 74 : -74,
                cmDeg,
                32,
                0.78,
                discR,
                discRy,
                subEarthLat,
                cmDeg,
                isNightVision ? '#FEE2E2' : '#ECFEFF',
                0.32
              )}

            {/* NEPTUNE: Subtle Azure Bands & Methane Cirrus */}
            {detailedSurface && body.id === 'neptune' && (
              <g>
                {(() => {
                  const eqBand = buildLatitudeBandPolygon(18, -4, discR, discRy, subEarthLat);
                  const cirrus = buildLatitudeBeltPath(-16, discR, discRy, subEarthLat);
                  return (
                    <>
                      {eqBand && <path d={eqBand} fill={isNightVision ? '#7F1D1D' : '#1E3A8A'} opacity="0.42" />}
                      {cirrus && (
                        <path
                          d={cirrus}
                          fill="none"
                          stroke={isNightVision ? '#FECACA' : '#DBEAFE'}
                          strokeWidth={Math.max(0.5, discR * 0.04)}
                          opacity="0.65"
                        />
                      )}
                    </>
                  );
                })()}
              </g>
            )}

            {/* PLANETARY SATELLITES: Authentic Surface Features when zoomed in */}
            {detailedSurface && body.kind === 'satellite' && (
              <g>
                {body.id === 'io' && (
                  <>
                    <circle cx={-discR * 0.25} cy={-discR * 0.18} r={discR * 0.22} fill={isNightVision ? '#B91C1C' : '#EA580C'} opacity="0.75" />
                    <circle cx={discR * 0.28} cy={discR * 0.24} r={discR * 0.16} fill={isNightVision ? '#991B1B' : '#9A3412'} opacity="0.7" />
                    <circle cx={discR * 0.05} cy={-discR * 0.35} r={discR * 0.12} fill={isNightVision ? '#FEE2E2' : '#FEF9C3'} opacity="0.6" />
                  </>
                )}
                {body.id === 'europa' && (
                  <g stroke={isNightVision ? '#991B1B' : '#B45309'} strokeWidth={Math.max(0.45, discR * 0.05)} opacity="0.52" fill="none">
                    <path d={`M ${-discR * 0.8} ${-discR * 0.3} Q 0 ${discR * 0.1} ${discR * 0.8} ${-discR * 0.2}`} />
                    <path d={`M ${-discR * 0.6} ${discR * 0.5} Q ${discR * 0.1} ${-discR * 0.1} ${discR * 0.7} ${discR * 0.4}`} />
                  </g>
                )}
                {body.id === 'ganymede' && (
                  <>
                    <ellipse cx={-discR * 0.22} cy={-discR * 0.2} rx={discR * 0.38} ry={discR * 0.3} fill={isNightVision ? '#7F1D1D' : '#64748B'} opacity="0.52" />
                    <circle cx={discR * 0.3} cy={discR * 0.26} r={discR * 0.14} fill={isNightVision ? '#FECACA' : '#F8FAFC'} opacity="0.55" />
                  </>
                )}
                {body.id === 'callisto' && (
                  <g opacity="0.72">
                    <circle r={discR} fill={isNightVision ? '#7F1D1D' : '#475569'} opacity="0.45" />
                    <circle cx={-discR * 0.3} cy={-discR * 0.25} r={Math.max(0.6, discR * 0.08)} fill={isNightVision ? '#FECACA' : '#E2E8F0'} />
                    <circle cx={discR * 0.28} cy={discR * 0.12} r={Math.max(0.5, discR * 0.07)} fill={isNightVision ? '#FECACA' : '#E2E8F0'} />
                    <circle cx={-discR * 0.08} cy={discR * 0.38} r={Math.max(0.5, discR * 0.06)} fill={isNightVision ? '#FECACA' : '#E2E8F0'} />
                  </g>
                )}
                {body.id === 'titan' && (
                  <ellipse
                    cx={0}
                    cy={-discR * 0.68}
                    rx={discR * 0.55}
                    ry={discR * 0.22}
                    fill={isNightVision ? '#7F1D1D' : '#9A3412'}
                    opacity="0.48"
                  />
                )}
                {body.id === 'iapetus' && (
                  <ellipse
                    cx={-discR * 0.35}
                    cy={0}
                    rx={discR * 0.52}
                    ry={discR * 0.9}
                    fill={isNightVision ? '#450A0A' : '#334155'}
                    opacity="0.72"
                  />
                )}
              </g>
            )}
          </g>

          {/* Eclipse darkening when a satellite passes inside its parent planet's umbra */}
          {body.inEclipse && (
            <ellipse
              rx={discR}
              ry={discRy}
              fill={isNightVision ? 'rgba(69, 10, 10, 0.82)' : 'rgba(60, 18, 10, 0.78)'}
            />
          )}

          {/* REALISTIC ILLUMINATION PHASE TERMINATOR SHADOW (aligned to true Sun PA on sky) */}
          {shadowPath && (
            <g transform={`rotate(${litAngleDeg - poleRotDeg})`}>
              <path d={shadowPath} fill={nightOverlayColor} />
            </g>
          )}
        </g>

        {/* Limb outline for sharp paper/contrast clarity when zoomed */}
        {detailedSurface && (
          <ellipse
            rx={discR}
            ry={discRy}
            fill="none"
            stroke={
              isPaper
                ? 'rgba(15,23,42,0.35)'
                : isNightVision
                ? 'rgba(248,113,113,0.4)'
                : 'rgba(255,255,255,0.22)'
            }
            strokeWidth="0.75"
          />
        )}

        {/* FRONT RING HALF (crosses in front of Saturn's globe) */}
        {saturnDetailedRings ? (
          <g opacity={ringOpacityScale}>
            <path
              d={`M ${-discR * 2.27} 0 A ${discR * 2.27} ${discR * 2.27 * ringTiltRatio} 0 0 ${frontRingSweep} ${discR * 2.27} 0`}
              fill="none"
              stroke={ringStrokeA}
              strokeWidth={Math.max(1.1, discR * 0.20)}
              opacity="0.92"
            />
            <path
              d={`M ${-discR * 1.97} 0 A ${discR * 1.97} ${discR * 1.97 * ringTiltRatio} 0 0 ${frontRingSweep} ${discR * 1.97} 0`}
              fill="none"
              stroke={ringGapStroke}
              strokeWidth={Math.max(0.7, discR * 0.08)}
              opacity="0.95"
            />
            <path
              d={`M ${-discR * 1.72} 0 A ${discR * 1.72} ${discR * 1.72 * ringTiltRatio} 0 0 ${frontRingSweep} ${discR * 1.72} 0`}
              fill="none"
              stroke={ringStrokeB}
              strokeWidth={Math.max(1.3, discR * 0.26)}
              opacity="0.96"
            />
            <path
              d={`M ${-discR * 1.40} 0 A ${discR * 1.40} ${discR * 1.40 * ringTiltRatio} 0 0 ${frontRingSweep} ${discR * 1.40} 0`}
              fill="none"
              stroke={ringStrokeC}
              strokeWidth={Math.max(0.8, discR * 0.14)}
              opacity="0.52"
            />
          </g>
        ) : (
          body.hasRings && (
            <ellipse
              rx={discR * 2.2}
              ry={Math.max(0.8, discR * 2.2 * ringTiltRatio)}
              fill="none"
              stroke={bodyColor}
              strokeWidth="1.25"
              opacity={0.9 * ringOpacityScale}
            />
          )
        )}
      </g>
    </g>
  );
};

interface FChart3ViewportProps {
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  activeSheet: AtlasSheet | null;
  allSheets: AtlasSheet[];
  onSelectSheet: (sheet: AtlasSheet) => void;
  selectedObject: SelectedSkyObject | null;
  onSelectObject: (obj: SelectedSkyObject | null) => void;
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

  const isChartSelectedRef = useRef<boolean>(true);
  const isMouseOverChartRef = useRef<boolean>(false);
  const configRef = useRef<FChart3Config>(config);
  configRef.current = config;
  const [showEyepiecePopover, setShowEyepiecePopover] = useState(false);
  const eyepiecePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showReticleMenu, setShowReticleMenu] = useState(false);
  const reticleMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      cancelActiveSkySlew();
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        eyepiecePopoverRef.current &&
        !eyepiecePopoverRef.current.contains(e.target as Node)
      ) {
        setShowEyepiecePopover(false);
      }
      if (
        reticleMenuRef.current &&
        !reticleMenuRef.current.contains(e.target as Node)
      ) {
        setShowReticleMenu(false);
      }
    };
    if (showEyepiecePopover || showReticleMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showEyepiecePopover, showReticleMenu]);

  const activeReticles = useMemo<Array<'telrad' | 'binoculars_7x50' | 'eyepiece_afov'>>(() => {
    if (Array.isArray(config.activeReticles)) {
      return config.activeReticles;
    }
    if (config.reticleMode !== 'none' && config.reticleMode !== 'ccd_sensor') {
      return [config.reticleMode];
    }
    return [];
  }, [config.activeReticles, config.reticleMode]);

  const toggleReticleOption = (id: 'telrad' | 'binoculars_7x50' | 'eyepiece_afov') => {
    onChangeConfig((prev) => {
      const current: Array<'telrad' | 'binoculars_7x50' | 'eyepiece_afov'> = Array.isArray(
        prev.activeReticles
      )
        ? prev.activeReticles
        : prev.reticleMode !== 'none' && prev.reticleMode !== 'ccd_sensor'
        ? [prev.reticleMode]
        : [];
      const exists = current.includes(id);
      const next = exists ? current.filter((item) => item !== id) : [...current, id];
      return {
        ...prev,
        activeReticles: next,
        reticleMode: next[0] ?? 'none',
      };
    });
  };

  // Measure pure star chart canvas container dynamically to fill window
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 60 && rect.height > 60) {
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

  const orientCapRing = useCallback(
    (coordsRaDec: Array<[number, number]>): Array<[number, number]> => {
      const ring = coordsRaDec.map(([ra, dec]) => skyCoordToLonLat(ra, dec));
      if (ring.length > 0) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-6) {
          ring.push([first[0], first[1]]);
        }
      }
      const capPoly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] };
      return d3.geoArea(capPoly) > 2 * Math.PI ? [...ring].reverse() : ring;
    },
    [skyCoordToLonLat]
  );

  const toSkyPolygon = useCallback(
    (coordsRaDec: Array<[number, number]>): GeoJSON.Polygon => ({
      type: 'Polygon',
      coordinates: [orientCapRing(coordsRaDec)],
    }),
    [orientCapRing]
  );

  const toSkyBandPolygon = useCallback(
    (
      northEdgeRaDec: Array<[number, number]>,
      southEdgeRaDec: Array<[number, number]>
    ): GeoJSON.Polygon => {
      const nCap = orientCapRing(northEdgeRaDec);
      const sCap = orientCapRing(southEdgeRaDec);
      return {
        type: 'Polygon',
        coordinates: [[...nCap].reverse(), [...sCap].reverse()],
      };
    },
    [orientCapRing]
  );

  // Lowering the horizon position slider ('지평선 위치' 0° down to -85°) tilts the viewing
  // elevation upward so the ENTIRE sky chart + true 0° horizon shifts downward toward the bottom
  // of the screen, revealing more sky & stars above the horizon.
  const horizonShiftDeg =
    isHorizontal && config.showHorizonGround
      ? Math.max(0, Math.min(85, -(config.horizonAltDeg ?? 0)))
      : 0;
  const effectiveCenterAltDeg = Math.max(
    -89.5,
    Math.min(89.5, config.centerAltDeg + horizonShiftDeg)
  );

  // Build D3 Celestial Projection (supports both Equatorial and Horizontal coordinate systems, down to 0.02° FOV)
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
      effectiveCenterAltDeg
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
    effectiveCenterAltDeg,
  ]);

  const geoPath = useMemo(() => d3.geoPath(projection), [projection]);

  // Effective Equatorial Center [raDeg, decDeg] of current viewport for catalog filtering
  const effectiveEqCenter = useMemo<[number, number]>(() => {
    if (isHorizontal) {
      return horizontalToEquatorial(
        config.centerAzDeg,
        effectiveCenterAltDeg,
        config.observerLatDeg,
        lstDeg
      );
    }
    return [((config.centerRaHours * 15) % 360 + 360) % 360, config.centerDecDeg];
  }, [
    isHorizontal,
    config.centerAzDeg,
    effectiveCenterAltDeg,
    config.observerLatDeg,
    lstDeg,
    config.centerRaHours,
    config.centerDecDeg,
  ]);

  // Diagonal aspect ratio factor from center to viewport corner so stars/DSOs fill the entire screen
  const aspectDiagonalFactor = useMemo(() => {
    const minDim = Math.max(1, Math.min(width, height));
    return Math.max(2.6, Math.hypot(width, height) / minDim);
  }, [width, height]);

  // Visible Stars for current field of view and limiting magnitude across the entire viewport
  const visibleStars = useMemo(() => {
    const [centerRaDeg, centerDecDeg] = effectiveEqCenter;
    return getVisibleStars(
      centerRaDeg,
      centerDecDeg,
      config.fovDeg,
      config.limitStarMag,
      aspectDiagonalFactor
    ).sort((a, b) => b.mag - a.mag); // Faint stars first, bright stars on top
  }, [effectiveEqCenter, config.fovDeg, config.limitStarMag, aspectDiagonalFactor]);

  // Visible Solar System Bodies (Sun, Moon, Planets, Satellites, Dwarf Planets, Asteroids)
  const solarSystemBodies = useMemo<SolarSystemBodyRecord[]>(() => {
    if (!config.showSolarSystem) return [];
    return computeSolarSystemBodies(config.observationDateTime);
  }, [config.showSolarSystem, config.observationDateTime]);

  // Visible Deep-Sky Objects (Messier, Caldwell, and Extended Nebulae) across the entire viewport
  const visibleDsos = useMemo(() => {
    const [centerRaDeg, centerDecDeg] = effectiveEqCenter;
    const fovRad = (Math.max(0.015, Math.min(165, config.fovDeg)) * Math.PI) / 180;
    const stereographicCornerDeg =
      ((2 * Math.atan(2 * aspectDiagonalFactor * Math.tan(fovRad / 4))) * 180) / Math.PI;
    const maxAngle = Math.min(
      180,
      Math.max(config.fovDeg * aspectDiagonalFactor + 24, stereographicCornerDeg + 20)
    );
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
    aspectDiagonalFactor,
  ]);

  // Precompute Coordinate Graticule Lines (Equatorial RA/Dec OR Horizontal Alt/Az)
  // Windowed dynamically so even sub-arcminute grids at 0.02° FOV render smoothly with minimal geometry.
  const graticuleLines = useMemo(() => {
    if (!config.showEquatorialGrid) return { parallels: [], meridians: [] };
    const gridReachDeg = Math.min(88, Math.max(config.fovDeg <= 4 ? config.fovDeg * aspectDiagonalFactor + 1 : 85, config.fovDeg * aspectDiagonalFactor + 20));

    if (isHorizontal) {
      const altStep =
        config.fovDeg <= 0.1
          ? 0.02
          : config.fovDeg <= 0.4
          ? 0.05
          : config.fovDeg <= 1.2
          ? 0.2
          : config.fovDeg <= 4
          ? 0.5
          : config.fovDeg <= 10
          ? 1
          : config.fovDeg <= 22
          ? 2
          : config.fovDeg <= 45
          ? 5
          : 10;
      const azStep =
        config.fovDeg <= 0.1
          ? 0.02
          : config.fovDeg <= 0.4
          ? 0.05
          : config.fovDeg <= 1.2
          ? 0.2
          : config.fovDeg <= 4
          ? 0.5
          : config.fovDeg <= 10
          ? 1
          : config.fovDeg <= 22
          ? 5
          : config.fovDeg <= 45
          ? 10
          : 15;

      const azSpanHalf = Math.min(
        180,
        gridReachDeg / Math.max(0.15, Math.cos((config.centerAltDeg * Math.PI) / 180))
      );
      const azSampleStep = Math.max(0.01, Math.min(3, azSpanHalf / 12));
      const altSampleStep = Math.max(0.01, Math.min(2.5, gridReachDeg / 14));

      const parallels: Array<{
        val: number;
        label: string;
        path: string | null;
        labelPt: [number, number] | null;
      }> = [];

      const altMin = Math.max(-85, Math.floor((config.centerAltDeg - gridReachDeg) / altStep) * altStep);
      const altMax = Math.min(85, Math.ceil((config.centerAltDeg + gridReachDeg) / altStep) * altStep);

      const azStartLoop = azSpanHalf >= 175 ? 0 : config.centerAzDeg - azSpanHalf;
      const azEndLoop = azSpanHalf >= 175 ? 360 : config.centerAzDeg + azSpanHalf;

      for (let alt = altMin; alt <= altMax + 1e-6; alt = Number((alt + altStep).toFixed(4))) {
        const coords: Array<[number, number]> = [];
        for (let az = azStartLoop; az <= azEndLoop + 1e-6; az += azSampleStep) {
          coords.push(horizontalToLonLat(((az % 360) + 360) % 360, alt));
        }
        const dPath = geoPath({ type: 'LineString', coordinates: coords });
        const labelPt = projection(horizontalToLonLat(config.centerAzDeg, alt));
        const absAlt = Math.abs(alt);
        const degLabel =
          absAlt < 1 && altStep < 1
            ? `${alt >= 0 ? '+' : '-'}${(absAlt * 60).toFixed(0)}′`
            : `${alt > 0 ? `+${Number(alt.toFixed(2))}` : Number(alt.toFixed(2))}°`;
        parallels.push({
          val: alt,
          label: `Alt ${degLabel}`,
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

      const azIdxStart =
        azSpanHalf >= 175 ? 0 : Math.floor((config.centerAzDeg - azSpanHalf) / azStep);
      const azIdxEnd =
        azSpanHalf >= 175
          ? Math.round(360 / azStep) - 1
          : Math.ceil((config.centerAzDeg + azSpanHalf) / azStep);

      const altStartLoop = Math.max(-85, config.centerAltDeg - gridReachDeg);
      const altEndLoop = Math.min(85, config.centerAltDeg + gridReachDeg);

      for (let k = azIdxStart; k <= azIdxEnd; k++) {
        const az = Number((((k * azStep) % 360 + 360) % 360).toFixed(4));
        const coords: Array<[number, number]> = [];
        for (let alt = altStartLoop; alt <= altEndLoop + 1e-6; alt += altSampleStep) {
          coords.push(horizontalToLonLat(az, alt));
        }
        const dPath = geoPath({ type: 'LineString', coordinates: coords });
        const labelPt = projection(horizontalToLonLat(az, config.centerAltDeg));
        meridians.push({
          val: az,
          label: `Az ${Number(az.toFixed(2))}°`,
          path: dPath,
          labelPt,
        });
      }

      return { parallels, meridians };
    }

    // Equatorial RA/Dec Grid
    const decStep =
      config.fovDeg <= 0.1
        ? 0.02
        : config.fovDeg <= 0.4
        ? 0.05
        : config.fovDeg <= 1.2
        ? 0.2
        : config.fovDeg <= 4
        ? 0.5
        : config.fovDeg <= 10
        ? 1
        : config.fovDeg <= 18
        ? 2
        : config.fovDeg <= 40
        ? 5
        : 10;
    const raStepHours =
      config.fovDeg <= 0.1
        ? 1 / 720
        : config.fovDeg <= 0.4
        ? 1 / 300
        : config.fovDeg <= 1.2
        ? 1 / 60
        : config.fovDeg <= 4
        ? 1 / 12
        : config.fovDeg <= 10
        ? 0.25
        : config.fovDeg <= 18
        ? 0.5
        : config.fovDeg <= 40
        ? 1
        : 2;

    const raSpanHours = Math.min(
      12,
      gridReachDeg / (15 * Math.max(0.15, Math.cos((config.centerDecDeg * Math.PI) / 180)))
    );
    const raSampleDeg = Math.max(0.01, Math.min(3, (raSpanHours * 15) / 12));
    const decSampleDeg = Math.max(0.01, Math.min(2.5, gridReachDeg / 14));

    const parallels: Array<{
      val: number;
      label: string;
      path: string | null;
      labelPt: [number, number] | null;
    }> = [];

    const decMin = Math.max(-85, Math.floor((config.centerDecDeg - gridReachDeg) / decStep) * decStep);
    const decMax = Math.min(85, Math.ceil((config.centerDecDeg + gridReachDeg) / decStep) * decStep);

    const raStartDeg = raSpanHours >= 11.5 ? 0 : config.centerRaHours * 15 - raSpanHours * 15;
    const raEndDeg = raSpanHours >= 11.5 ? 360 : config.centerRaHours * 15 + raSpanHours * 15;

    for (let dec = decMin; dec <= decMax + 1e-6; dec = Number((dec + decStep).toFixed(4))) {
      const coords: Array<[number, number]> = [];
      for (let ra = raStartDeg; ra <= raEndDeg + 1e-6; ra += raSampleDeg) {
        coords.push(celestialToLonLat(((ra % 360) + 360) % 360, dec));
      }
      const dPath = geoPath({ type: 'LineString', coordinates: coords });
      const labelPt = projection(celestialToLonLat(config.centerRaHours * 15, dec));
      const signStr = dec > 0 ? '+' : dec < 0 ? '-' : '';
      const absD = Math.abs(dec);
      const dDeg = Math.floor(absD + 1e-6);
      const dArcmin = Number(((absD - dDeg) * 60).toFixed(1));
      const labelStr =
        decStep < 1
          ? `${signStr}${dDeg}°${String(Math.floor(dArcmin)).padStart(2, '0')}′`
          : `${dec > 0 ? `+${Number(dec.toFixed(1))}` : Number(dec.toFixed(1))}°`;
      parallels.push({
        val: dec,
        label: labelStr,
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
    const raIdxStart =
      raSpanHours >= 11.5 ? 0 : Math.floor((config.centerRaHours - raSpanHours) / raStepHours);
    const raIdxEnd =
      raSpanHours >= 11.5 ? totalSteps - 1 : Math.ceil((config.centerRaHours + raSpanHours) / raStepHours);
    const decStartLoop = Math.max(-85, config.centerDecDeg - gridReachDeg);
    const decEndLoop = Math.min(85, config.centerDecDeg + gridReachDeg);

    for (let k = raIdxStart; k <= raIdxEnd; k++) {
      const raH = ((k * raStepHours) % 24 + 24) % 24;
      const raDeg = raH * 15;
      const coords: Array<[number, number]> = [];
      for (let dec = decStartLoop; dec <= decEndLoop + 1e-6; dec += decSampleDeg) {
        coords.push(celestialToLonLat(raDeg, dec));
      }
      const dPath = geoPath({ type: 'LineString', coordinates: coords });
      const labelPt = projection(celestialToLonLat(raDeg, config.centerDecDeg));
      const totalSec = Math.round(raH * 3600);
      const hInt = Math.floor(totalSec / 3600) % 24;
      const mInt = Math.floor((totalSec % 3600) / 60);
      const sInt = totalSec % 60;
      const raLabel =
        sInt !== 0
          ? `${hInt}h${String(mInt).padStart(2, '0')}m${String(sInt).padStart(2, '0')}s`
          : mInt === 0
          ? `${hInt}h`
          : `${hInt}h${String(mInt).padStart(2, '0')}m`;
      meridians.push({
        val: raH,
        label: raLabel,
        path: dPath,
        labelPt,
      });
    }

    return { parallels, meridians };
  }, [
    config.showEquatorialGrid,
    isHorizontal,
    config.fovDeg,
    effectiveCenterAltDeg,
    config.centerAzDeg,
    config.centerDecDeg,
    config.centerRaHours,
    geoPath,
    projection,
  ]);

  // Horizon & Ground Mask Geometry for Horizontal Coordinate System
  // True physical horizon is fixed at Alt = 0°, so ground below 0° never leaks underground stars;
  // lowering the '지평선 위치' slider shifts the whole viewport sky downward toward the bottom.
  const horizonAlt = 0;
  const horizonGroundGeometry = useMemo(() => {
    if (!isHorizontal || !config.showHorizonGround) {
      return {
        groundQuadPaths: [] as string[],
        horizonLinePath: null as string | null,
        groundContours: [] as string[],
      };
    }

    const groundQuadPaths: string[] = [];
    const azStep = 4;
    const baseBands = [-5, -12, -22, -35, -52, -70, -89.5];
    const altBands = [horizonAlt, ...baseBands.filter((a) => a < horizonAlt - 0.5)];
    if (altBands[altBands.length - 1] > -89.5) {
      altBands.push(-89.5);
    }
    const maxJump = Math.max(width, height) * 0.75;

    for (let b = 0; b < altBands.length - 1; b++) {
      const altTop = altBands[b];
      const altBot = altBands[b + 1];
      for (let az = 0; az < 360; az += azStep) {
        const azNext = az + azStep;
        const p1 = projection(horizontalToLonLat(az, altTop));
        const p2 = projection(horizontalToLonLat(azNext, altTop));
        const p3 = projection(horizontalToLonLat(azNext, altBot));
        const p4 = projection(horizontalToLonLat(az, altBot));
        if (!p1 || !p2 || !p3 || !p4) continue;

        const minX = Math.min(p1[0], p2[0], p3[0], p4[0]);
        const maxX = Math.max(p1[0], p2[0], p3[0], p4[0]);
        const minY = Math.min(p1[1], p2[1], p3[1], p4[1]);
        const maxY = Math.max(p1[1], p2[1], p3[1], p4[1]);
        if (maxX < -40 || minX > width + 40 || maxY < -40 || minY > height + 40) {
          continue;
        }

        if (
          Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > maxJump ||
          Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) > maxJump ||
          Math.hypot(p4[0] - p3[0], p4[1] - p3[1]) > maxJump ||
          Math.hypot(p1[0] - p4[0], p1[1] - p4[1]) > maxJump
        ) {
          continue;
        }

        groundQuadPaths.push(
          `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}L${p2[0].toFixed(1)},${p2[1].toFixed(1)}L${p3[0].toFixed(1)},${p3[1].toFixed(1)}L${p4[0].toFixed(1)},${p4[1].toFixed(1)}Z`
        );
      }
    }

    // Horizon Great/Small Circle (Alt = horizonAlt)
    const horizonCoords: Array<[number, number]> = [];
    for (let az = 0; az <= 360; az += 2) {
      horizonCoords.push(horizontalToLonLat(az, horizonAlt));
    }
    const horizonLinePath = geoPath({
      type: 'LineString',
      coordinates: horizonCoords,
    });

    // Subtle below-horizon ground depression contours
    const groundContours: string[] = [];
    [horizonAlt - 10, horizonAlt - 20, horizonAlt - 30]
      .filter((alt) => alt >= -89.5)
      .forEach((alt) => {
        const c: Array<[number, number]> = [];
        for (let az = 0; az <= 360; az += 3) {
          c.push(horizontalToLonLat(az, alt));
        }
        const p = geoPath({ type: 'LineString', coordinates: c });
        if (p) groundContours.push(p);
      });

    return { groundQuadPaths, horizonLinePath, groundContours };
  }, [isHorizontal, config.showHorizonGround, horizonAlt, projection, geoPath, width, height]);

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
        dsoLabel: '#1E293B',
        selectionBracket: '#0284C7',
        starHalo: '#FFFFFF',
        starLabel: '#0F172A',
        eclipticStroke: '#DC2626',
        galacticEqStroke: '#0284C7',
        borderStroke: '#0F172A',
        groundSolid: '#E2E8F0',
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
        dsoLabel: '#FCA5A5',
        selectionBracket: '#EF4444',
        starHalo: '#090202',
        starLabel: '#FCA5A5',
        eclipticStroke: '#DC2626',
        galacticEqStroke: '#991B1B',
        borderStroke: '#991B1B',
        groundSolid: '#1F0606',
        horizonStroke: '#EF4444',
        cardinalBg: '#450A0A',
        cardinalText: '#FCA5A5',
        crosshairStroke: '#EF4444',
      };
    }
    // Observatory Dark Mode (Planetarium Vector Chart Style)
    return {
      bg: '#030508',
      gridStroke: 'rgba(68, 108, 130, 0.34)',
      gridText: 'rgba(116, 148, 168, 0.72)',
      mwLevel1Fill: 'rgba(72, 118, 158, 0.13)',
      mwLevel1Stroke: 'rgba(95, 145, 188, 0.24)',
      mwLevel2Fill: 'rgba(95, 145, 188, 0.16)',
      mwLevel2Stroke: 'rgba(120, 170, 212, 0.35)',
      mwLevel3Fill: 'rgba(130, 180, 220, 0.18)',
      mwLevel3Stroke: 'rgba(155, 202, 238, 0.48)',
      boundaryStroke: 'rgba(175, 155, 55, 0.42)',
      stickStroke: 'rgba(65, 145, 168, 0.65)',
      conLabel: 'rgba(148, 163, 184, 0.56)',
      nebulaStroke: '#22C55E',
      nebulaFill: 'rgba(34, 197, 94, 0.06)',
      galaxyStroke: '#D4B828',
      galaxyFill: 'rgba(212, 184, 40, 0.08)',
      clusterStroke: '#B8CC26',
      dsoLabel: '#CBD5E1',
      selectionBracket: '#B8CC26',
      starHalo: '#030508',
      starLabel: '#CBD5E1',
      eclipticStroke: '#F43F5E',
      galacticEqStroke: '#06B6D4',
      borderStroke: '#1E293B',
      groundSolid: '#071712',
      horizonStroke: '#10B981',
      cardinalBg: '#064E3B',
      cardinalText: '#A7F3D0',
      crosshairStroke: 'rgba(148, 163, 184, 0.45)',
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

  // Update Observation Date & Time and sync celestial coordinates across Equatorial / Horizontal modes
  const applyObservationDateTime = useCallback(
    (nextDateTime: string) => {
      if (!nextDateTime) return;
      onChangeConfig((prev) => {
        const prevLst = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
        const nextLst = computeLstDeg(nextDateTime, prev.observerLonDeg);
        if (prev.coordinateSystem === 'horizontal') {
          const [raDeg, decDeg] = horizontalToEquatorial(
            prev.centerAzDeg,
            prev.centerAltDeg,
            prev.observerLatDeg,
            nextLst
          );
          return {
            ...prev,
            observationDateTime: nextDateTime,
            centerRaHours: Number((raDeg / 15).toFixed(6)),
            centerDecDeg: Number(Math.max(-89.5, Math.min(89.5, decDeg)).toFixed(4)),
          };
        } else {
          const dLstHours = (nextLst - prevLst) / 15;
          const nextRaHours = ((prev.centerRaHours + dLstHours) % 24 + 24) % 24;
          const [az, alt] = equatorialToHorizontal(
            nextRaHours * 15,
            prev.centerDecDeg,
            prev.observerLatDeg,
            nextLst
          );
          return {
            ...prev,
            observationDateTime: nextDateTime,
            centerRaHours: Number(nextRaHours.toFixed(6)),
            centerAzDeg: Number(az.toFixed(2)),
            centerAltDeg: Number(alt.toFixed(2)),
          };
        }
      });
    },
    [onChangeConfig]
  );

  // Real-time / Accelerated Time Simulation State (0 = paused, 1 = 1x normal speed, >1 = fast-forward, <0 = rewind)
  const [simSpeed, setSimSpeed] = useState<number>(0);
  const simTimeMsRef = useRef<number>(
    (() => {
      const parsed = config.observationDateTime ? new Date(config.observationDateTime) : new Date();
      return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
    })()
  );

  // Keep simTimeMsRef synced when observationDateTime is changed externally
  useEffect(() => {
    const parsed = config.observationDateTime ? new Date(config.observationDateTime) : new Date();
    if (!Number.isNaN(parsed.getTime())) {
      if (Math.abs(parsed.getTime() - simTimeMsRef.current) > 1500) {
        simTimeMsRef.current = parsed.getTime();
      }
    }
  }, [config.observationDateTime]);

  const formatLocalIsoDateTime = (epochMs: number, includeSeconds = true): string => {
    const dt = new Date(epochMs);
    const tzOffsetMs = dt.getTimezoneOffset() * 60000;
    const localIso = new Date(dt.getTime() - tzOffsetMs).toISOString();
    return includeSeconds ? localIso.slice(0, 19) : localIso.slice(0, 16);
  };

  useEffect(() => {
    if (simSpeed === 0) return;
    let lastPerf = performance.now();
    const timer = window.setInterval(() => {
      const nowPerf = performance.now();
      const dtSec = (nowPerf - lastPerf) / 1000;
      lastPerf = nowPerf;
      simTimeMsRef.current += dtSec * 1000 * simSpeed;
      applyObservationDateTime(formatLocalIsoDateTime(simTimeMsRef.current, true));
    }, 100);
    return () => window.clearInterval(timer);
  }, [simSpeed, applyObservationDateTime]);

  const FAST_SPEED_STEPS = [1, 10, 60, 300, 900, 3600, 14400, 86400];

  const handleTogglePlayPause = () => {
    setSimSpeed((prev) => (prev === 0 ? 1 : 0));
  };

  const handleFastForward = () => {
    setSimSpeed((prev) => {
      if (prev <= 0) return 10;
      const idx = FAST_SPEED_STEPS.findIndex((s) => s > prev);
      return idx !== -1 ? FAST_SPEED_STEPS[idx] : FAST_SPEED_STEPS[FAST_SPEED_STEPS.length - 1];
    });
  };

  const handleRewind = () => {
    setSimSpeed((prev) => {
      if (prev >= 0) return -10;
      const absPrev = Math.abs(prev);
      const idx = FAST_SPEED_STEPS.findIndex((s) => s > absPrev);
      return idx !== -1 ? -FAST_SPEED_STEPS[idx] : -FAST_SPEED_STEPS[FAST_SPEED_STEPS.length - 1];
    });
  };

  const formatSimSpeedLabel = (speed: number): string => {
    if (speed === 0) return '정지';
    if (speed === 1) return '1× (실시간)';
    const sign = speed > 0 ? '+' : '-';
    const abs = Math.abs(speed);
    if (abs === 10) return `${sign}10× (10초/초)`;
    if (abs === 60) return `${sign}60× (1분/초)`;
    if (abs === 300) return `${sign}300× (5분/초)`;
    if (abs === 900) return `${sign}900× (15분/초)`;
    if (abs === 3600) return `${sign}3600× (1시간/초)`;
    if (abs === 14400) return `${sign}14400× (4시간/초)`;
    if (abs === 86400) return `${sign}86400× (1일/초)`;
    return `${sign}${abs}×`;
  };

  const handleSetNowDateTime = () => {
    const nowMs = Date.now();
    simTimeMsRef.current = nowMs;
    applyObservationDateTime(formatLocalIsoDateTime(nowMs, true));
  };

  const handleStepMinutes = (deltaMinutes: number) => {
    const base = config.observationDateTime ? new Date(config.observationDateTime) : new Date();
    const validMs = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
    const shiftedMs = validMs + deltaMinutes * 60000;
    simTimeMsRef.current = shiftedMs;
    applyObservationDateTime(formatLocalIsoDateTime(shiftedMs, true));
  };

  const formattedBarDateTime = useMemo(() => {
    const parsed = config.observationDateTime ? new Date(config.observationDateTime) : new Date();
    const dt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(
      dt.getHours()
    )}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }, [config.observationDateTime]);

  // Pointer handlers for interactive celestial pan & coordinate probing
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    isChartSelectedRef.current = true;
    chartContainerRef.current?.focus({ preventScroll: true });
    if (e.button !== 0) return;
    cancelActiveSkySlew();
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
    if (Math.hypot(dx, dy) < 2) return;

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
        centerAzDeg: Number(nextAz.toFixed(4)),
        centerAltDeg: Number(nextAlt.toFixed(4)),
        centerRaHours: Number((eqRaDeg / 15).toFixed(6)),
        centerDecDeg: Number(eqDecDeg.toFixed(5)),
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
        centerRaHours: Number(nextRa.toFixed(6)),
        centerDecDeg: Number(nextDec.toFixed(5)),
        centerAzDeg: Number(az.toFixed(4)),
        centerAltDeg: Number(alt.toFixed(4)),
      }));
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Smooth logarithmic FOV zoom helper (0.02° ~ 135.0°)
  const applyWheelZoom = useCallback(
    (deltaY: number) => {
      if (deltaY === 0) return;
      cancelActiveSkySlew();
      onChangeConfig((prev) => {
        const factor = deltaY > 0 ? 1.13 : 1 / 1.13;
        const nextFov = roundFovDeg(prev.fovDeg * factor);
        const linked = computeLinkedLimitingMags(nextFov, prev);
        return {
          ...prev,
          fovDeg: nextFov,
          ...linked,
        };
      });
    },
    [onChangeConfig]
  );

  const slewToSkyObject = useCallback(
    (obj: SelectedSkyObject, targetFovDeg?: number) => {
      onSelectObject(obj);
      startSkySlew({
        currentConfig: configRef.current,
        onChangeConfig,
        targetRaHours: obj.data.raHours,
        targetDecDeg: obj.data.decDeg,
        targetFovDeg,
      });
    },
    [onSelectObject, onChangeConfig]
  );

  const centerSkyObject = useCallback(
    (obj: SelectedSkyObject) => {
      slewToSkyObject(obj);
    },
    [slewToSkyObject]
  );

  // Track chart selection vs sidebar clicks and handle mouse wheel zoom when hovered or selected
  useEffect(() => {
    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const chartEl = chartContainerRef.current;
      if (!target || !chartEl) return;
      if (chartEl.contains(target)) {
        isChartSelectedRef.current = true;
      } else if ((target as HTMLElement).closest?.('aside, input, select, textarea')) {
        isChartSelectedRef.current = false;
      }
    };

    const handleGlobalWheel = (e: WheelEvent) => {
      const chartEl = chartContainerRef.current;
      if (!chartEl) return;
      const target = e.target as HTMLElement | null;
      const isInsideChart = Boolean(target && chartEl.contains(target));
      const isInsideScrollableSidebar = Boolean(target?.closest?.('aside'));

      if (
        isInsideChart ||
        isMouseOverChartRef.current ||
        (isChartSelectedRef.current && !isInsideScrollableSidebar)
      ) {
        e.preventDefault();
        e.stopPropagation();
        applyWheelZoom(e.deltaY);
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, { passive: true });
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [applyWheelZoom]);

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

  // Pixels per degree at chart center for Telrad, Scale Bar & DSO/Planet sizing
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
      : config.fovDeg >= 1.8
      ? 0.5
      : config.fovDeg >= 0.7
      ? 0.2
      : config.fovDeg >= 0.25
      ? 0.1
      : config.fovDeg >= 0.08
      ? 0.05
      : config.fovDeg >= 0.035
      ? 1 / 60
      : 0.5 / 60;
  const barPx = Math.min(150, Math.max(36, barDeg * pxPerDeg));
  const barLabel =
    barDeg >= 1
      ? `${barDeg}°`
      : barDeg * 60 >= 0.99
      ? `${Number((barDeg * 60).toFixed(1))}′`
      : `${Math.round(barDeg * 3600)}″`;

  return (
    <div className="flex-1 min-w-0 min-h-0 h-full flex flex-col select-none overflow-hidden bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800">
      {/* =====================================================================
          1. TOP INSTRUMENT BAR (성도 상단: 좌표 입력 · 화각/광학계 · 줌 및 벡터 출력 버튼)
         ===================================================================== */}
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Left: Header spacer or left instrument actions */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5" />

        {/* Right: 1-line Center Coordinates (RA/DEC or Az/Alt), Ground, Finder Ring (with Eyepiece Optics), 1-line Optical Mirror, Zoom, Reset, SVG & PDF */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Center Coordinates Input on 1 Single Line */}
          {isHorizontal ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Az
              </span>
              <input
                type="number"
                min={0}
                max={360}
                step={5}
                value={Number(config.centerAzDeg.toFixed(2))}
                onChange={(e) => {
                  const nextAz = ((Number(e.target.value) % 360) + 360) % 360;
                  const [raDeg, decDeg] = horizontalToEquatorial(
                    nextAz,
                    config.centerAltDeg,
                    config.observerLatDeg,
                    lstDeg
                  );
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerAzDeg: nextAz,
                    centerRaHours: Number((raDeg / 15).toFixed(5)),
                    centerDecDeg: Number(decDeg.toFixed(4)),
                  }));
                }}
                className="w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                title="Az"
              />
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap ml-0.5">
                Alt
              </span>
              <input
                type="number"
                min={-90}
                max={90}
                step={2}
                value={Number(config.centerAltDeg.toFixed(2))}
                onChange={(e) => {
                  const nextAlt = Math.max(-89.5, Math.min(89.5, Number(e.target.value)));
                  const [raDeg, decDeg] = horizontalToEquatorial(
                    config.centerAzDeg,
                    nextAlt,
                    config.observerLatDeg,
                    lstDeg
                  );
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerAltDeg: nextAlt,
                    centerRaHours: Number((raDeg / 15).toFixed(5)),
                    centerDecDeg: Number(decDeg.toFixed(4)),
                  }));
                }}
                className="w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                title="Alt"
              />
              <div
                className="flex items-center gap-1 pl-2 ml-0.5 border-l border-slate-200 dark:border-slate-700 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                title="중앙 십자선 정밀 좌표 (적경 · 적위 / 방위 · 고도)"
              >
                <Crosshair className="w-3 h-3 shrink-0 opacity-85" />
                <span>{formatExactRaHms(effectiveEqCenter[0] / 15)}</span>
                <span className="opacity-60">·</span>
                <span>{formatExactDecDms(effectiveEqCenter[1])}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                RA
              </span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={Number(config.centerRaHours.toFixed(3))}
                onChange={(e) => {
                  const nextRa = ((Number(e.target.value) % 24) + 24) % 24;
                  const [az, alt] = equatorialToHorizontal(
                    nextRa * 15,
                    config.centerDecDeg,
                    config.observerLatDeg,
                    lstDeg
                  );
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerRaHours: nextRa,
                    centerAzDeg: Number(az.toFixed(2)),
                    centerAltDeg: Number(alt.toFixed(2)),
                  }));
                }}
                className="w-18 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                title="RA"
              />
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap ml-0.5">
                DEC
              </span>
              <input
                type="number"
                min={-90}
                max={90}
                step={2}
                value={Number(config.centerDecDeg.toFixed(2))}
                onChange={(e) => {
                  const nextDec = Math.max(-89.5, Math.min(89.5, Number(e.target.value)));
                  const [az, alt] = equatorialToHorizontal(
                    config.centerRaHours * 15,
                    nextDec,
                    config.observerLatDeg,
                    lstDeg
                  );
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerDecDeg: nextDec,
                    centerAzDeg: Number(az.toFixed(2)),
                    centerAltDeg: Number(alt.toFixed(2)),
                  }));
                }}
                className="w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                title="DEC"
              />
              <div
                className="flex items-center gap-1 pl-2 ml-0.5 border-l border-slate-200 dark:border-slate-700 font-mono text-[11px] tabular-nums text-cyan-600 dark:text-cyan-400 whitespace-nowrap"
                title="중앙 십자선 정밀 좌표 (적경 · 적위)"
              >
                <Crosshair className="w-3 h-3 shrink-0 opacity-85" />
                <span>{formatExactRaHms(effectiveEqCenter[0] / 15)}</span>
                <span className="opacity-60">·</span>
                <span>{formatExactDecDms(effectiveEqCenter[1])}</span>
              </div>
            </div>
          )}

          {/* Finder FOV Ring ('시야 링' 누적 선택 & 중앙 십자선 / 아이피스 광학계 설정) */}
          <div className="relative flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
            <div ref={reticleMenuRef} className="relative">
              {(() => {
                const activeCount =
                  activeReticles.length + (config.showCenterCrosshair ? 1 : 0);
                return (
                  <button
                    type="button"
                    onClick={() => setShowReticleMenu((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      activeCount > 0
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title="파인더·아이피스 시야 링 및 중앙 십자선 선택"
                  >
                    <span>시야 링</span>
                    {activeCount > 0 && (
                      <span className="font-mono text-[10px] tabular-nums opacity-90">
                        ({activeCount})
                      </span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                  </button>
                );
              })()}

              {showReticleMenu && (
                <div className="absolute top-full left-0 mt-1.5 z-50 w-64 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl text-slate-900 dark:text-slate-100 space-y-1">
                  <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-200 dark:border-slate-800 text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      시야 링 (중복 표시 가능)
                    </span>
                    {(activeReticles.length > 0 || config.showCenterCrosshair) && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((p) => ({
                            ...p,
                            activeReticles: [],
                            reticleMode: 'none',
                            showCenterCrosshair: false,
                          }))
                        }
                        className="text-[10px] text-slate-400 hover:text-cyan-400 cursor-pointer"
                      >
                        모두 해제
                      </button>
                    )}
                  </div>

                  <div className="pb-1 mb-1 border-b border-slate-200/80 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeConfig((p) => ({
                          ...p,
                          showCenterCrosshair: !p.showCenterCrosshair,
                        }))
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                        config.showCenterCrosshair
                          ? 'bg-cyan-50/80 dark:bg-cyan-950/50 text-slate-900 dark:text-white font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Crosshair className="w-3 h-3 text-cyan-500 shrink-0" />
                        <span>중앙 십자선</span>
                      </span>
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          config.showCenterCrosshair
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'border-slate-300 dark:border-slate-600 bg-transparent'
                        }`}
                      >
                        {config.showCenterCrosshair && (
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        )}
                      </span>
                    </button>
                  </div>

                  {(
                    [
                      {
                        id: 'telrad',
                        label: 'Telrad (0.5°·2°·4°)',
                        dotColor: '#EF4444',
                      },
                      {
                        id: 'binoculars_7x50',
                        label: '7×50 쌍안경 (7.0°)',
                        dotColor:
                          config.colorScheme === 'nightvision' ? '#F87171' : '#06B6D4',
                      },
                      {
                        id: 'eyepiece_afov',
                        label: `망원경 아이피스 (${config.customEyepieceFovDeg.toFixed(2)}°)`,
                        dotColor:
                          config.colorScheme === 'nightvision' ? '#FCA5A5' : '#F59E0B',
                      },
                    ] as Array<{
                      id: 'telrad' | 'binoculars_7x50' | 'eyepiece_afov';
                      label: string;
                      dotColor: string;
                    }>
                  ).map((item) => {
                    const checked = activeReticles.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleReticleOption(item.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                          checked
                            ? 'bg-cyan-50/80 dark:bg-cyan-950/50 text-slate-900 dark:text-white font-medium'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border"
                            style={{
                              borderColor: item.dotColor,
                              backgroundColor: checked ? item.dotColor : 'transparent',
                            }}
                          />
                          <span>{item.label}</span>
                        </span>
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                            checked
                              ? 'bg-cyan-600 border-cyan-500 text-white'
                              : 'border-slate-300 dark:border-slate-600 bg-transparent'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {activeReticles.includes('eyepiece_afov') && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={config.customEyepieceFovDeg}
                  onChange={(e) =>
                    onChangeConfig((p) => ({
                      ...p,
                      customEyepieceFovDeg: Math.max(
                        0.1,
                        Math.min(20, Number(e.target.value) || 1.0)
                      ),
                    }))
                  }
                  className="w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums rounded border border-amber-500/60 bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400"
                  title="아이피스 실화각(TFOV, °)"
                />
                <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  °
                </span>
                <button
                  type="button"
                  onClick={() => setShowEyepiecePopover(!showEyepiecePopover)}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    showEyepiecePopover
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-500 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title="망원경·아이피스 광학계 설정 및 계산"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>

                {/* Eyepiece Optics Settings Popover */}
                {showEyepiecePopover && (
                  <div
                    ref={eyepiecePopoverRef}
                    className="absolute top-full right-0 mt-2 z-50 w-72 p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl text-slate-900 dark:text-slate-100 text-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-amber-500 flex items-center gap-1">
                        <Sliders className="w-3.5 h-3.5" />
                        아이피스 시야각 설정
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowEyepiecePopover(false)}
                        className="text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((p) => ({ ...p, eyepieceInputMode: 'direct' }))
                        }
                        className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                          config.eyepieceInputMode !== 'telescope'
                            ? 'bg-amber-500 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        시야각 직접 입력
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const fTel = config.telescopeFocalLengthMm || 1000;
                          const fEye = config.eyepieceFocalLengthMm || 25;
                          const afov = config.eyepieceAfovDeg || 68;
                          const tfov = Number(((afov * fEye) / fTel).toFixed(2));
                          onChangeConfig((p) => ({
                            ...p,
                            eyepieceInputMode: 'telescope',
                            telescopeFocalLengthMm: fTel,
                            eyepieceFocalLengthMm: fEye,
                            eyepieceAfovDeg: afov,
                            customEyepieceFovDeg: tfov,
                          }));
                        }}
                        className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                          config.eyepieceInputMode === 'telescope'
                            ? 'bg-amber-500 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        망원경+아이피스 계산
                      </button>
                    </div>

                    {config.eyepieceInputMode === 'telescope' ? (
                      <div className="space-y-2 pt-1">
                        <div>
                          <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                            망원경 초점거리 (mm)
                          </label>
                          <input
                            type="number"
                            min={50}
                            max={5000}
                            step={50}
                            value={config.telescopeFocalLengthMm || 1000}
                            onChange={(e) => {
                              const fTel = Math.max(50, Number(e.target.value) || 1000);
                              const fEye = config.eyepieceFocalLengthMm || 25;
                              const afov = config.eyepieceAfovDeg || 68;
                              const tfov = Number(((afov * fEye) / fTel).toFixed(2));
                              onChangeConfig((p) => ({
                                ...p,
                                telescopeFocalLengthMm: fTel,
                                customEyepieceFovDeg: tfov,
                              }));
                            }}
                            className="w-full px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                            아이피스 초점거리 (mm)
                          </label>
                          <input
                            type="number"
                            min={2}
                            max={60}
                            step={1}
                            value={config.eyepieceFocalLengthMm || 25}
                            onChange={(e) => {
                              const fEye = Math.max(1, Number(e.target.value) || 25);
                              const fTel = config.telescopeFocalLengthMm || 1000;
                              const afov = config.eyepieceAfovDeg || 68;
                              const tfov = Number(((afov * fEye) / fTel).toFixed(2));
                              onChangeConfig((p) => ({
                                ...p,
                                eyepieceFocalLengthMm: fEye,
                                customEyepieceFovDeg: tfov,
                              }));
                            }}
                            className="w-full px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                            아이피스 겉보기 시야각 (AFOV, °)
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={30}
                              max={120}
                              step={1}
                              value={config.eyepieceAfovDeg || 68}
                              onChange={(e) => {
                                const afov = Math.max(10, Math.min(130, Number(e.target.value) || 68));
                                const fTel = config.telescopeFocalLengthMm || 1000;
                                const fEye = config.eyepieceFocalLengthMm || 25;
                                const tfov = Number(((afov * fEye) / fTel).toFixed(2));
                                onChangeConfig((p) => ({
                                  ...p,
                                  eyepieceAfovDeg: afov,
                                  customEyepieceFovDeg: tfov,
                                }));
                              }}
                              className="flex-1 px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            />
                            {[50, 68, 82, 100].map((deg) => (
                              <button
                                key={`tb-afov-${deg}`}
                                type="button"
                                onClick={() => {
                                  const fTel = config.telescopeFocalLengthMm || 1000;
                                  const fEye = config.eyepieceFocalLengthMm || 25;
                                  const tfov = Number(((deg * fEye) / fTel).toFixed(2));
                                  onChangeConfig((p) => ({
                                    ...p,
                                    eyepieceAfovDeg: deg,
                                    customEyepieceFovDeg: tfov,
                                  }));
                                }}
                                className={`px-1.5 py-1 text-[10px] rounded border cursor-pointer ${
                                  (config.eyepieceAfovDeg || 68) === deg
                                    ? 'bg-amber-500 text-white border-amber-600 font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {deg}°
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Calculation summary */}
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-500/40 text-[11px] font-mono space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">배율:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {((config.telescopeFocalLengthMm || 1000) / (config.eyepieceFocalLengthMm || 25)).toFixed(1)}×
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">실시야각(TFOV):</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {config.customEyepieceFovDeg.toFixed(2)}°
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <div>
                          <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                            아이피스 실시야각 직접 입력 (TFOV, °)
                          </label>
                          <input
                            type="number"
                            min={0.1}
                            max={20}
                            step={0.1}
                            value={config.customEyepieceFovDeg}
                            onChange={(e) =>
                              onChangeConfig((p) => ({
                                ...p,
                                customEyepieceFovDeg: Math.max(
                                  0.1,
                                  Math.min(20, Number(e.target.value) || 1.0)
                                ),
                              }))
                            }
                            className="w-full px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Optical Mirror Icon Toggle Buttons (좌우 반전 / 상하 반전 아이콘 활성화) */}
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
            <button
              type="button"
              aria-pressed={config.mirrorHorizontal}
              aria-label="좌우 반전"
              onClick={() =>
                onChangeConfig((p) => ({
                  ...p,
                  mirrorHorizontal: !p.mirrorHorizontal,
                }))
              }
              className={`relative w-7 h-7 rounded-md overflow-hidden border transition-all cursor-pointer shrink-0 ${
                config.mirrorHorizontal
                  ? config.colorScheme === 'nightvision'
                    ? 'border-red-400 ring-2 ring-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.55)] opacity-100 scale-105'
                    : 'border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.45)] opacity-100 scale-105'
                  : 'border-slate-300 dark:border-slate-700 opacity-55 hover:opacity-95'
              }`}
              title={`좌우 반전 · 천정미러 (${config.mirrorHorizontal ? '켜짐' : '꺼짐'})`}
            >
              <img
                src="/assets/aistudio/image_854c490d.png"
                alt="좌우 반전"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {config.mirrorHorizontal && (
                <span
                  className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
                    config.colorScheme === 'nightvision'
                      ? 'bg-red-400 shadow-[0_0_4px_#ef4444]'
                      : 'bg-cyan-400 shadow-[0_0_4px_#22d3ee]'
                  }`}
                />
              )}
            </button>
            <button
              type="button"
              aria-pressed={config.mirrorVertical}
              aria-label="상하 반전"
              onClick={() =>
                onChangeConfig((p) => ({
                  ...p,
                  mirrorVertical: !p.mirrorVertical,
                }))
              }
              className={`relative w-7 h-7 rounded-md overflow-hidden border transition-all cursor-pointer shrink-0 ${
                config.mirrorVertical
                  ? config.colorScheme === 'nightvision'
                    ? 'border-red-400 ring-2 ring-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.55)] opacity-100 scale-105'
                    : 'border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.45)] opacity-100 scale-105'
                  : 'border-slate-300 dark:border-slate-700 opacity-55 hover:opacity-95'
              }`}
              title={`상하 반전 · 직초점/뉴턴식 (${config.mirrorVertical ? '켜짐' : '꺼짐'})`}
            >
              <img
                src="/assets/aistudio/image_19146037.png"
                alt="상하 반전"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {config.mirrorVertical && (
                <span
                  className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
                    config.colorScheme === 'nightvision'
                      ? 'bg-red-400 shadow-[0_0_4px_#ef4444]'
                      : 'bg-cyan-400 shadow-[0_0_4px_#22d3ee]'
                  }`}
                />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                cancelActiveSkySlew();
                onChangeConfig((prev) => {
                  const nextFov = roundFovDeg(prev.fovDeg * 0.7);
                  const linked = computeLinkedLimitingMags(nextFov, prev);
                  return {
                    ...prev,
                    fovDeg: nextFov,
                    ...linked,
                  };
                });
              }}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="화각 확대 (최소 0.02°)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {/* Chart FoV Readout Placed Between + and - Zoom Buttons */}
            <div
              className="flex items-center justify-center px-2 py-1 rounded bg-black/90 text-white border border-slate-700/80 shadow-xs font-mono text-[11px] leading-none whitespace-nowrap"
              title="현재 성도 화각 (Field of View)"
            >
              <span className="tabular-nums">
                {config.fovDeg < 0.2
                  ? config.fovDeg.toFixed(3)
                  : config.fovDeg < 2
                  ? config.fovDeg.toFixed(2)
                  : Number.isInteger(config.fovDeg)
                  ? config.fovDeg.toFixed(0)
                  : config.fovDeg.toFixed(1)}
                °
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                cancelActiveSkySlew();
                onChangeConfig((prev) => {
                  const nextFov = roundFovDeg(prev.fovDeg * 1.38);
                  const linked = computeLinkedLimitingMags(nextFov, prev);
                  return {
                    ...prev,
                    fovDeg: nextFov,
                    ...linked,
                  };
                });
              }}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="화각 축소 (Wider FOV)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>

          {/* Limiting Magnitude Rectangular Number Readout (확대/축소 옆 한계등급 사각형 숫자) */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs tabular-nums shadow-2xs whitespace-nowrap"
            title={`현재 한계등급 · 별 ≤ ${config.limitStarMag.toFixed(1)}등급 / 성운·성단(DSO) ≤ ${config.limitDsoMag.toFixed(1)}등급`}
          >
            <span className="text-[10.5px] font-sans font-medium text-slate-500 dark:text-slate-400">
              한계등급
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 font-bold">
              ★ {config.limitStarMag.toFixed(1)}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 font-bold">
              DSO {config.limitDsoMag.toFixed(1)}
            </span>
          </div>

          {/* Chart Output Theme Circle Buttons (확대/축소 다음: 흰색 원 · 검정 원 · 빨간 원) */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70"
            role="group"
            aria-label="성도 출력 테마"
          >
            {(
              [
                {
                  id: 'paper',
                  title: '백색 출판 테마 (White Paper)',
                  circleClass: 'bg-white border-slate-400',
                  activeRingClass: 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-800 scale-110 shadow-sm',
                },
                {
                  id: 'observatory',
                  title: '다크 관측 테마 (Observatory Dark)',
                  circleClass: 'bg-[#070B14] border-slate-500',
                  activeRingClass: 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-800 scale-110 shadow-sm',
                },
                {
                  id: 'nightvision',
                  title: '적색 야간 테마 (Red Nightvision)',
                  circleClass: 'bg-red-600 border-red-400',
                  activeRingClass: 'ring-2 ring-red-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-800 scale-110 shadow-sm',
                },
              ] as Array<{
                id: ChartColorScheme;
                title: string;
                circleClass: string;
                activeRingClass: string;
              }>
            ).map((theme) => {
              const isActive = config.colorScheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  data-theme-swatch="true"
                  aria-pressed={isActive}
                  onClick={() =>
                    onChangeConfig((prev) => ({ ...prev, colorScheme: theme.id }))
                  }
                  title={theme.title}
                  className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${theme.circleClass} ${
                    isActive
                      ? theme.activeRingClass
                      : 'opacity-65 hover:opacity-100 hover:scale-105'
                  }`}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              cancelActiveSkySlew();
              onChangeConfig((prev) => ({
                ...prev,
                centerRaHours: 5.588,
                centerDecDeg: -2.5,
                centerAzDeg: 180,
                centerAltDeg: 40,
                fovDeg: 35,
                ...computeLinkedLimitingMags(35, {
                  magRefStarFovDeg: 32,
                  magRefStarMag: 9.8,
                  magRefDsoFovDeg: 32,
                  magRefDsoMag: 11.8,
                }),
              }));
            }}
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
          2. STAR CHART CANVAS (왼쪽 위: 클릭한 대상 정보 오버레이 / 오른쪽 위: 커서 위치 오버레이)
         ===================================================================== */}
      <div
        ref={chartContainerRef}
        tabIndex={0}
        onMouseEnter={() => {
          isMouseOverChartRef.current = true;
        }}
        onMouseLeave={() => {
          isMouseOverChartRef.current = false;
        }}
        onClick={() => {
          isChartSelectedRef.current = true;
        }}
        className="relative flex-1 min-h-0 w-full overflow-hidden outline-none"
      >
        {/* Top-Left of Star Chart: Clicked Object Info Bar (대상을 클릭하면 성도 왼쪽 위에 표시) */}
        {selectedObject && (
          <div className="absolute top-5 left-5 z-10 flex flex-wrap items-center gap-3 px-3.5 py-2 rounded-lg bg-slate-900/95 text-slate-100 border border-slate-700/90 shadow-sm text-xs">
            <span className="font-mono font-semibold text-cyan-400">
              {selectedObject.type === 'dso'
                ? (selectedObject.data as DSORecord).messierId
                  ? `메시에 ${(selectedObject.data as DSORecord).messierId}`
                  : (selectedObject.data as DSORecord).caldwellId
                  ? `콜드웰 ${(selectedObject.data as DSORecord).caldwellId}`
                  : (selectedObject.data as DSORecord).id
                : selectedObject.type === 'solar'
                ? (() => {
                    const sb = selectedObject.data as SolarSystemBodyRecord;
                    if (sb.kind === 'sun') return '태양';
                    if (sb.kind === 'moon') return '달';
                    if (sb.kind === 'planet') return '행성';
                    if (sb.kind === 'dwarf_planet') return '왜행성';
                    if (sb.kind === 'satellite') return `${sb.parentNameKo || ''} 위성`;
                    return '소행성';
                  })()
                : `${(selectedObject.data as StarRecord).constellation} ${(selectedObject.data as StarRecord).bayer || ''}`}
            </span>
            <span className="font-semibold text-white">
              {selectedObject.type === 'dso'
                ? (selectedObject.data as DSORecord).nameKo
                : selectedObject.type === 'solar'
                ? `${(selectedObject.data as SolarSystemBodyRecord).nameKo} (${(selectedObject.data as SolarSystemBodyRecord).nameEn})`
                : (selectedObject.data as StarRecord).nameKo ||
                  (selectedObject.data as StarRecord).nameEn ||
                  (selectedObject.data as StarRecord).id}
            </span>
            <span className="font-mono text-slate-300 tabular-nums">
              {formatRaHours(selectedObject.data.raHours, true)} · {formatDecDeg(selectedObject.data.decDeg, true)} · {selectedObject.data.mag.toFixed(1)}m
              {selectedObject.type === 'solar' && (() => {
                const sb = selectedObject.data as SolarSystemBodyRecord;
                const distLabel =
                  sb.distanceAu < 0.01
                    ? `${(sb.distanceAu * 149597870.7).toFixed(0)} km`
                    : `${sb.distanceAu.toFixed(2)} AU`;
                const extraParts = [distLabel];
                if (sb.angularDiameterArcsec >= 0.5) {
                  extraParts.push(`시직경 ${sb.angularDiameterArcsec.toFixed(1)}″`);
                }
                if (sb.phasePercent !== undefined && sb.id !== 'sun') {
                  extraParts.push(`위상 ${sb.phasePercent}%`);
                }
                return ` · ${extraParts.join(' · ')}`;
              })()}
            </span>
            <button
              type="button"
              onClick={() => centerSkyObject(selectedObject)}
              className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-100 border border-slate-600 hover:bg-slate-700 hover:border-cyan-500/70 transition-colors cursor-pointer"
              title="현재 화각을 유지한 채 선택한 대상을 화면 중앙으로 이동"
            >
              화면중앙
            </button>
            <button
              type="button"
              onClick={() => slewToSkyObject(selectedObject, 7)}
              className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-cyan-600 text-white hover:bg-cyan-500 transition-colors cursor-pointer"
              title="선택한 대상을 화면 중앙으로 이동하며 파인더 화각(7°)으로 확대"
            >
              파인더 확대
            </button>
            <button
              type="button"
              onClick={() => onSelectObject(null)}
              className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}

        {/* Top-Right of Star Chart: Live Cursor Coordinates Readout (설정에서 켜고 끌 수 있음) */}
        {config.showCursorCoords && (
          <div className="absolute top-5 right-5 z-10 pointer-events-none flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-200 bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-lg shadow-xs">
            <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
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
        )}

        <svg
          id="fchart3-svg"
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`absolute inset-0 block w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        >
          <defs>
            <filter id="mw-soft-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
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
            {/* LAYER 1: Milky Way Misty Band / Isophote Contours */}
            {config.showMilkyWayContours && (
              <g
                id="layer-milky-way"
                filter={config.milkyWayStyle === 'shaded_vector' ? 'url(#mw-soft-blur)' : undefined}
              >
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
                    config.milkyWayStyle === 'shaded_vector'
                      ? 'none'
                      : mw.level === 1
                      ? palette.mwLevel1Stroke
                      : mw.level === 2
                      ? palette.mwLevel2Stroke
                      : palette.mwLevel3Stroke;

                  const features: GeoJSON.Polygon[] = mw.bandRings
                    ? [toSkyBandPolygon(mw.bandRings[0], mw.bandRings[1])]
                    : mw.polygons.map((poly) => toSkyPolygon(poly));

                  return (
                    <g key={mw.id}>
                      {features.map((geom, idx) => {
                        const dPath = geoPath(geom);
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
                        strokeWidth={val === 0 ? 0.85 : 0.55}
                      />
                    )}
                    {labelPt &&
                      labelPt[1] > 24 &&
                      labelPt[1] < height - 24 && (
                        <text
                          x={20}
                          y={labelPt[1] - 4}
                          fill={palette.gridText}
                          fontSize="9.5"
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
                        strokeWidth={val === 0 ? 0.85 : 0.55}
                      />
                    )}
                    {labelPt &&
                      labelPt[0] > 32 &&
                      labelPt[0] < width - 32 && (
                        <text
                          x={labelPt[0] + 4}
                          y={26}
                          fill={palette.gridText}
                          fontSize="9.5"
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
                      strokeWidth={0.75}
                      strokeDasharray="3,3"
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
                            strokeWidth={0.95}
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
                        strokeWidth={0.95}
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
                          fontSize="9.5"
                          fontWeight="500"
                          letterSpacing="0.06em"
                          opacity="0.65"
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
                    3.8,
                    Math.min(54, ((dso.sizeMajorArcmin / 60) * pxPerDeg) / 2)
                  );
                  const minorPx = Math.max(
                    3.0,
                    Math.min(54, ((dso.sizeMinorArcmin / 60) * pxPerDeg) / 2)
                  );
                  const sqHalf = Math.max(3.6, Math.min(7, radiusPx * 0.45));
                  const bracketHalf = Math.max(radiusPx + 5, 11);
                  const bracketArm = 4.5;

                  return (
                    <g
                      key={dso.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectObject({ type: 'dso', data: dso });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        centerSkyObject({ type: 'dso', data: dso });
                      }}
                      className="cursor-pointer"
                    >
                      {config.showNebulaOutlines &&
                        dso.contourPolygons &&
                        dso.contourPolygons.map((poly, pIdx) => {
                          const dPath = geoPath(toSkyPolygon(poly));
                          if (!dPath) return null;
                          const isGal = dso.type.includes('galaxy');
                          return (
                            <path
                              key={`${dso.id}-contour-${pIdx}`}
                              d={dPath}
                              fill={isGal ? palette.galaxyFill : palette.nebulaFill}
                              stroke={isGal ? palette.galaxyStroke : palette.nebulaStroke}
                              strokeWidth={isSelected ? 1.6 : pIdx === 0 ? 1.05 : 0.75}
                              strokeDasharray={
                                dso.type === 'supernova_remnant' ? '3,2' : undefined
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
                              <g
                                stroke={palette.selectionBracket}
                                strokeWidth="1.35"
                                fill="none"
                              >
                                <path d={`M ${-bracketHalf} ${-bracketHalf + bracketArm} V ${-bracketHalf} H ${-bracketHalf + bracketArm}`} />
                                <path d={`M ${bracketHalf - bracketArm} ${-bracketHalf} H ${bracketHalf} V ${-bracketHalf + bracketArm}`} />
                                <path d={`M ${-bracketHalf} ${bracketHalf - bracketArm} V ${bracketHalf} H ${-bracketHalf + bracketArm}`} />
                                <path d={`M ${bracketHalf - bracketArm} ${bracketHalf} H ${bracketHalf} V ${bracketHalf - bracketArm}`} />
                              </g>
                            )}

                            {dso.type.includes('galaxy') && !dso.contourPolygons && (
                              <ellipse
                                rx={Math.max(4.5, radiusPx * 0.75)}
                                ry={Math.max(2.6, minorPx * 0.75)}
                                transform={`rotate(${
                                  (config.mirrorHorizontal !== config.mirrorVertical ? -1 : 1) *
                                  (dso.positionAngleDeg - 90)
                                })`}
                                fill={palette.galaxyFill}
                                stroke={palette.galaxyStroke}
                                strokeWidth="1.05"
                              />
                            )}

                            {dso.type === 'globular_cluster' && (() => {
                              const gr = Math.max(3.8, Math.min(8, radiusPx * 0.65));
                              return (
                                <g>
                                  <circle
                                    r={gr}
                                    fill="rgba(184, 204, 38, 0.08)"
                                    stroke={palette.clusterStroke}
                                    strokeWidth="1.05"
                                  />
                                  <line
                                    x1={-gr}
                                    y1={0}
                                    x2={gr}
                                    y2={0}
                                    stroke={palette.clusterStroke}
                                    strokeWidth="0.95"
                                  />
                                  <line
                                    x1={0}
                                    y1={-gr}
                                    x2={0}
                                    y2={gr}
                                    stroke={palette.clusterStroke}
                                    strokeWidth="0.95"
                                  />
                                </g>
                              );
                            })()}

                            {dso.type === 'open_cluster' && (
                              <circle
                                r={Math.max(4.0, Math.min(18, radiusPx * 0.68))}
                                fill="none"
                                stroke={palette.clusterStroke}
                                strokeWidth="1.0"
                                strokeDasharray="2.5,2"
                              />
                            )}

                            {dso.type === 'planetary_nebula' && (
                              <g>
                                <circle
                                  r={3.8}
                                  fill={palette.nebulaFill}
                                  stroke={palette.nebulaStroke}
                                  strokeWidth="1.05"
                                />
                                <line x1={-7} y1={0} x2={-3.8} y2={0} stroke={palette.nebulaStroke} strokeWidth="1.0" />
                                <line x1={3.8} y1={0} x2={7} y2={0} stroke={palette.nebulaStroke} strokeWidth="1.0" />
                                <line x1={0} y1={-7} x2={0} y2={-3.8} stroke={palette.nebulaStroke} strokeWidth="1.0" />
                                <line x1={0} y1={3.8} x2={0} y2={7} stroke={palette.nebulaStroke} strokeWidth="1.0" />
                              </g>
                            )}

                            {(dso.type === 'emission_nebula' ||
                              dso.type === 'reflection_nebula' ||
                              dso.type === 'supernova_remnant' ||
                              dso.type === 'dark_nebula') && (
                              <rect
                                x={-sqHalf}
                                y={-sqHalf}
                                width={sqHalf * 2}
                                height={sqHalf * 2}
                                fill={palette.nebulaFill}
                                stroke={palette.nebulaStroke}
                                strokeWidth="1.0"
                              />
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

                const starBracketHalf = Math.max(r + 6, 9);
                const starBracketArm = 3.8;

                return (
                  <g
                    key={st.id}
                    transform={`translate(${pt[0]}, ${pt[1]})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectObject({ type: 'star', data: st });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      centerSkyObject({ type: 'star', data: st });
                    }}
                    className="cursor-pointer"
                  >
                    {(!st.isProcedural || st.mag <= 10.5) && (
                      <circle r={Math.max(r + 3.5, 5)} fill="transparent" />
                    )}
                    {isSelected && (
                      <g
                        stroke={palette.selectionBracket}
                        strokeWidth="1.35"
                        fill="none"
                      >
                        <path d={`M ${-starBracketHalf} ${-starBracketHalf + starBracketArm} V ${-starBracketHalf} H ${-starBracketHalf + starBracketArm}`} />
                        <path d={`M ${starBracketHalf - starBracketArm} ${-starBracketHalf} H ${starBracketHalf} V ${-starBracketHalf + starBracketArm}`} />
                        <path d={`M ${-starBracketHalf} ${starBracketHalf - starBracketArm} V ${starBracketHalf} H ${-starBracketHalf + starBracketArm}`} />
                        <path d={`M ${starBracketHalf - starBracketArm} ${starBracketHalf} H ${starBracketHalf} V ${starBracketHalf - starBracketArm}`} />
                      </g>
                    )}

                    {st.mag < 5.5 && (
                      <circle r={r + 0.9} fill={palette.starHalo} />
                    )}

                    {st.isDouble && (
                      <line
                        x1={-(r + 2.5)}
                        y1={0}
                        x2={r + 2.5}
                        y2={0}
                        stroke={color}
                        strokeWidth="0.95"
                      />
                    )}

                    {st.isVariable && st.mag < 5.2 && (
                      <circle
                        r={r + 1.8}
                        fill="none"
                        stroke={color}
                        strokeWidth="0.8"
                      />
                    )}

                    <circle r={r} fill={color} />
                  </g>
                );
              })}
            </g>

            {/* LAYER 6A & 6A-LABELS: Solar System Bodies + Unified Non-Overlapping Celestial Labels */}
            {(() => {
              const sunBody = solarSystemBodies.find((b) => b.id === 'sun');
              const maxPlanetR = Math.min(width, height) * 0.36;
              const showDetails = config.showPlanetDetails ?? true;

              const projectSphereDir = (
                raDeg1: number,
                decDeg1: number,
                paRad: number
              ) => {
                const r1 = (raDeg1 * Math.PI) / 180;
                const d1 = (decDeg1 * Math.PI) / 180;
                const step = (0.08 * Math.PI) / 180;
                const dStep = Math.asin(
                  Math.sin(d1) * Math.cos(step) +
                    Math.cos(d1) * Math.sin(step) * Math.cos(paRad)
                );
                const rStep =
                  r1 +
                  Math.atan2(
                    Math.sin(paRad) * Math.sin(step) * Math.cos(d1),
                    Math.cos(step) - Math.sin(d1) * Math.sin(dStep)
                  );
                return projection(
                  skyCoordToLonLat(
                    (rStep * 180) / Math.PI,
                    (dStep * 180) / Math.PI
                  )
                );
              };

              const computePoleGeometry = (
                body: SolarSystemBodyRecord,
                pt: [number, number]
              ) => {
                let poleScreenAngleDeg = -90;
                let eastWestFlip =
                  config.mirrorHorizontal !== config.mirrorVertical ? -1 : 1;
                let paPole = 0;
                if (body.poleRaDeg !== undefined && body.poleDecDeg !== undefined) {
                  const pRa = (body.poleRaDeg * Math.PI) / 180;
                  const pDec = (body.poleDecDeg * Math.PI) / 180;
                  const bRa = (body.raDeg * Math.PI) / 180;
                  const bDec = (body.decDeg * Math.PI) / 180;
                  const pE = Math.cos(pDec) * Math.sin(pRa - bRa);
                  const pN =
                    Math.sin(pDec) * Math.cos(bDec) -
                    Math.cos(pDec) * Math.sin(bDec) * Math.cos(pRa - bRa);
                  if (Math.hypot(pE, pN) > 1e-6) {
                    paPole = Math.atan2(pE, pN);
                  }
                }
                const ptNorth = projectSphereDir(body.raDeg, body.decDeg, paPole);
                const ptWest = projectSphereDir(
                  body.raDeg,
                  body.decDeg,
                  paPole - Math.PI / 2
                );
                if (ptNorth && ptWest) {
                  const nx = ptNorth[0] - pt[0];
                  const ny = ptNorth[1] - pt[1];
                  const wx = ptWest[0] - pt[0];
                  const wy = ptWest[1] - pt[1];
                  if (Math.hypot(nx, ny) > 0.05 && Math.hypot(wx, wy) > 0.05) {
                    poleScreenAngleDeg = (Math.atan2(ny, nx) * 180) / Math.PI;
                    eastWestFlip = nx * wy - ny * wx >= 0 ? 1 : -1;
                  }
                }
                return { poleScreenAngleDeg, eastWestFlip };
              };

              const isAboveHorizonForLabel = (raDeg: number, decDeg: number) => {
                if (!isHorizontal || !config.showHorizonGround) return true;
                const [, altDeg] = equatorialToHorizontal(
                  raDeg,
                  decDeg,
                  config.observerLatDeg,
                  lstDeg
                );
                return altDeg >= horizonAlt - 0.3;
              };

              const preparedBodies: {
                body: SolarSystemBodyRecord;
                pt: [number, number];
                discR: number;
                isSelected: boolean;
                litAngleDeg: number;
                poleScreenAngleDeg: number;
                eastWestFlip: number;
                bodyColor: string;
                bracketHalf: number;
                bracketArm: number;
                halfW: number;
                halfH: number;
              }[] = [];

              const preparedSolarById = new Map<
                string,
                {
                  body: SolarSystemBodyRecord;
                  pt: [number, number];
                  discR: number;
                  poleScreenAngleDeg: number;
                }
              >();

              if (config.showSolarSystem) {
                // Sort farthest-first so satellites behind parent planet occlude naturally behind the globe/rings
                const depthSortedBodies = [...solarSystemBodies].sort(
                  (a, b) => b.distanceAu - a.distanceAu
                );

                for (const body of depthSortedBodies) {
                  const [lon, lat] = skyCoordToLonLat(body.raDeg, body.decDeg);
                  const pt = projection([lon, lat]);
                  if (!pt) continue;

                  const isSelected =
                    selectedObject?.type === 'solar' &&
                    selectedObject.data.id === body.id;
                  const isParentSelected =
                    selectedObject?.type === 'solar' &&
                    selectedObject.data.id === body.parentBodyId;

                  // Hide planetary moons at wide FOV unless zoomed in or selected / parent selected
                  if (
                    body.kind === 'satellite' &&
                    config.fovDeg > 12 &&
                    !isSelected &&
                    !isParentSelected
                  ) {
                    continue;
                  }

                  const trueAngularRadiusPx =
                    ((body.angularDiameterArcsec / 3600) * pxPerDeg) / 2;

                  let discR = 3.2;
                  if (body.kind === 'sun' || body.kind === 'moon') {
                    discR = Math.max(
                      body.kind === 'sun' ? 7.0 : 6.0,
                      Math.min(maxPlanetR, trueAngularRadiusPx)
                    );
                  } else if (body.kind === 'planet') {
                    discR = Math.max(
                      body.mag < 1 ? 4.4 : 3.4,
                      Math.min(maxPlanetR, trueAngularRadiusPx)
                    );
                  } else if (body.kind === 'dwarf_planet') {
                    discR = 2.8;
                  } else if (body.kind === 'asteroid') {
                    discR = 2.4;
                  } else if (body.kind === 'satellite') {
                    discR = Math.max(2.2, Math.min(28, trueAngularRadiusPx));
                  }

                  const margin = discR * (body.hasRings ? 2.4 : 1.2) + 20;
                  if (
                    pt[0] < -margin ||
                    pt[0] > width + margin ||
                    pt[1] < -margin ||
                    pt[1] > height + margin
                  ) {
                    continue;
                  }

                  // 1. Screen-space angle toward the Sun for true phase terminator orientation
                  let litAngleDeg = -25;
                  if (sunBody && body.id !== 'sun') {
                    const ra1 = (body.raDeg * Math.PI) / 180;
                    const dec1 = (body.decDeg * Math.PI) / 180;
                    const ra2 = (sunBody.raDeg * Math.PI) / 180;
                    const dec2 = (sunBody.decDeg * Math.PI) / 180;
                    const dRa = ra2 - ra1;
                    const sy = Math.sin(dRa) * Math.cos(dec2);
                    const sx =
                      Math.cos(dec1) * Math.sin(dec2) -
                      Math.sin(dec1) * Math.cos(dec2) * Math.cos(dRa);
                    const paSun = Math.atan2(sy, sx);
                    const ptSunDir = projectSphereDir(body.raDeg, body.decDeg, paSun);
                    if (
                      ptSunDir &&
                      Math.hypot(ptSunDir[0] - pt[0], ptSunDir[1] - pt[1]) > 0.05
                    ) {
                      litAngleDeg =
                        (Math.atan2(ptSunDir[1] - pt[1], ptSunDir[0] - pt[0]) * 180) /
                        Math.PI;
                    }
                  }

                  // 2. Screen-space North Pole angle & East/West mirror handedness of this body
                  const { poleScreenAngleDeg, eastWestFlip } = computePoleGeometry(
                    body,
                    pt
                  );

                  const bodyColor =
                    config.colorScheme === 'nightvision'
                      ? '#FCA5A5'
                      : config.colorScheme === 'paper' &&
                        (body.kind === 'asteroid' || body.kind === 'dwarf_planet')
                      ? '#0369A1'
                      : body.color;

                  const bracketHalf = Math.max(discR + 6, 10);
                  const bracketArm = Math.max(4.0, Math.min(12, discR * 0.25));

                  const poleRotRad = ((poleScreenAngleDeg + 90) * Math.PI) / 180;
                  const ringRx = body.hasRings ? discR * 2.3 : discR;
                  const absSinBe = Math.abs(
                    Math.sin((body.subEarthLatDeg ?? 0) * (Math.PI / 180))
                  );
                  const ringRy = body.hasRings
                    ? Math.max(discR, ringRx * Math.max(0.08, absSinBe))
                    : discR;
                  const halfW = Math.max(
                    discR,
                    Math.hypot(
                      ringRx * Math.cos(poleRotRad),
                      ringRy * Math.sin(poleRotRad)
                    )
                  );
                  const halfH = Math.max(
                    discR,
                    Math.hypot(
                      ringRx * Math.sin(poleRotRad),
                      ringRy * Math.cos(poleRotRad)
                    )
                  );

                  preparedBodies.push({
                    body,
                    pt,
                    discR,
                    isSelected,
                    litAngleDeg,
                    poleScreenAngleDeg,
                    eastWestFlip,
                    bodyColor,
                    bracketHalf,
                    bracketArm,
                    halfW,
                    halfH,
                  });
                  preparedSolarById.set(body.id, {
                    body,
                    pt,
                    discR,
                    poleScreenAngleDeg,
                  });
                }
              }

              // Collect ALL Celestial Label Inputs (Solar + DSO + Star) for unified non-overlapping placement
              const labelInputs: CelestialLabelInput[] = [];
              const labelTargetByKey = new Map<string, SelectedSkyObject>();

              // A. Solar System body labels
              for (const item of preparedBodies) {
                const { body, pt, discR, isSelected, halfW, halfH } = item;
                const isPrimaryBody =
                  body.kind === 'planet' ||
                  body.kind === 'sun' ||
                  body.kind === 'moon';
                const category = isPrimaryBody
                  ? 'solar_major'
                  : body.kind === 'satellite'
                  ? 'solar_satellite'
                  : 'solar_minor';

                let satSeparated = true;
                if (body.kind === 'satellite' && body.parentBodyId) {
                  const parentPrep = preparedSolarById.get(body.parentBodyId);
                  if (parentPrep) {
                    satSeparated = isSatelliteSufficientlySeparated(
                      pt[0],
                      pt[1],
                      parentPrep.pt[0],
                      parentPrep.pt[1],
                      parentPrep.discR,
                      Boolean(parentPrep.body.hasRings),
                      parentPrep.poleScreenAngleDeg,
                      parentPrep.body.subEarthLatDeg ?? 0
                    );
                  } else {
                    const parentRaw = solarSystemBodies.find(
                      (b) => b.id === body.parentBodyId
                    );
                    if (parentRaw) {
                      const pPt = projection(
                        skyCoordToLonLat(parentRaw.raDeg, parentRaw.decDeg)
                      );
                      if (pPt) {
                        const pAngR =
                          ((parentRaw.angularDiameterArcsec / 3600) * pxPerDeg) / 2;
                        const pDiscR = Math.max(
                          parentRaw.mag < 1 ? 4.4 : 3.4,
                          Math.min(maxPlanetR, pAngR)
                        );
                        const { poleScreenAngleDeg: pPole } = computePoleGeometry(
                          parentRaw,
                          pPt
                        );
                        satSeparated = isSatelliteSufficientlySeparated(
                          pt[0],
                          pt[1],
                          pPt[0],
                          pPt[1],
                          pDiscR,
                          Boolean(parentRaw.hasRings),
                          pPole,
                          parentRaw.subEarthLatDeg ?? 0
                        );
                      }
                    }
                  }
                }

                const showThisLabel =
                  config.showSolarSystemLabels &&
                  (body.kind !== 'satellite' || satSeparated) &&
                  isAboveHorizonForLabel(body.raDeg, body.decDeg) &&
                  pt[0] >= -discR * 0.5 &&
                  pt[0] <= width + discR * 0.5 &&
                  pt[1] >= -discR * 0.5 &&
                  pt[1] <= height + discR * 0.5;

                const labelText = `${body.nameKo} (${body.nameEn})${
                  body.inEclipse ? ' [식]' : ''
                }${
                  config.fovDeg <= 1.5 &&
                  body.phasePercent !== undefined &&
                  (body.kind === 'planet' || body.kind === 'moon')
                    ? ` · ${body.phasePercent}%`
                    : ''
                }`;

                const key = `solar:${body.id}`;
                labelTargetByKey.set(key, { type: 'solar', data: body });
                labelInputs.push({
                  id: key,
                  category,
                  parentId: body.parentBodyId ? `solar:${body.parentBodyId}` : undefined,
                  x: pt[0],
                  y: pt[1],
                  discR,
                  halfW,
                  halfH,
                  priorityKey: body.mag,
                  text: labelText,
                  fontSize: isPrimaryBody ? 10.5 : 9.5,
                  fontWeight: isPrimaryBody ? '600' : '400',
                  fill:
                    config.colorScheme === 'paper'
                      ? '#0F172A'
                      : config.colorScheme === 'nightvision'
                      ? '#FCA5A5'
                      : body.kind === 'satellite'
                      ? '#E2E8F0'
                      : '#F8FAFC',
                  opacity: body.inEclipse ? 0.65 : 1,
                  isSelected,
                  showLabel: showThisLabel,
                });
              }

              // B. Deep-Sky Objects (Messier / Caldwell / Nebulae) labels & obstacles
              if (
                config.showNebulaOutlines ||
                config.showMessierObjects ||
                config.showCaldwellObjects
              ) {
                for (const dso of visibleDsos) {
                  const [lon, lat] = skyCoordToLonLat(dso.raDeg, dso.decDeg);
                  const pt = projection([lon, lat]);
                  if (
                    !pt ||
                    pt[0] <= 14 ||
                    pt[0] >= width - 14 ||
                    pt[1] <= 14 ||
                    pt[1] >= height - 14
                  ) {
                    continue;
                  }

                  const radiusPx = Math.max(
                    3.8,
                    Math.min(54, ((dso.sizeMajorArcmin / 60) * pxPerDeg) / 2)
                  );
                  const coreR = Math.max(4.5, Math.min(13, radiusPx * 0.5));
                  const formattedDsoId = dso.id.replace(/^([MC])(\d+)/, '$1 $2');
                  const isSelected =
                    selectedObject?.type === 'dso' &&
                    selectedObject.data.id === dso.id;
                  const showDsoText =
                    config.showDsoLabels &&
                    isAboveHorizonForLabel(dso.raDeg, dso.decDeg);

                  const key = `dso:${dso.id}`;
                  labelTargetByKey.set(key, { type: 'dso', data: dso });
                  labelInputs.push({
                    id: key,
                    category: 'dso',
                    x: pt[0],
                    y: pt[1],
                    discR: coreR,
                    halfW: coreR,
                    halfH: coreR,
                    priorityKey: dso.mag - 2.0,
                    text: `${formattedDsoId}${config.fovDeg <= 20 ? ` ${dso.nameKo}` : ''}`,
                    fontSize: 10,
                    fontWeight: '400',
                    fontFamily: 'JetBrains Mono, monospace',
                    fill: palette.dsoLabel,
                    opacity: 1,
                    isSelected,
                    showLabel: showDsoText,
                  });
                }
              }

              // C. Star labels & bright-star dot obstacles
              for (const st of visibleStars) {
                const showStarText =
                  !st.isProcedural &&
                  config.showStarLabels !== 'none' &&
                  ((config.showStarLabels === 'bright_only' && st.mag <= 2.2) ||
                    (config.showStarLabels === 'all_named' &&
                      Boolean(st.nameKo || st.nameEn)) ||
                    (config.showStarLabels === 'bayer_and_named' &&
                      (Boolean(st.nameKo) || st.mag <= 3.5)));

                // Only feed labeled stars and bright stars (<= 4.5m) into obstacle/label layout
                if (!showStarText && st.mag > 4.5) continue;

                const [lon, lat] = skyCoordToLonLat(st.raDeg, st.decDeg);
                const pt = projection([lon, lat]);
                if (
                  !pt ||
                  pt[0] < 14 ||
                  pt[0] > width - 14 ||
                  pt[1] < 14 ||
                  pt[1] > height - 14
                ) {
                  continue;
                }

                const r = computeStarRadius(
                  st.mag,
                  config.limitStarMag,
                  config.starScaleFactor,
                  1.0
                );
                const isSelected =
                  selectedObject?.type === 'star' &&
                  selectedObject.data.id === st.id;
                const key = `star:${st.id}`;
                labelTargetByKey.set(key, { type: 'star', data: st });

                labelInputs.push({
                  id: key,
                  category: 'star',
                  x: pt[0],
                  y: pt[1],
                  discR: r,
                  halfW: r,
                  halfH: r,
                  priorityKey: st.mag,
                  text: `${st.bayer ? `${st.bayer} ` : ''}${st.nameKo || st.nameEn || ''}`,
                  fontSize: st.mag <= 1.8 ? 10.5 : 9.5,
                  fontWeight: st.mag <= 1.8 ? '500' : '400',
                  fill: palette.starLabel,
                  opacity: 0.92,
                  isSelected,
                  showLabel:
                    showStarText && isAboveHorizonForLabel(st.raDeg, st.decDeg),
                });
              }

              const placedLabels = layoutCelestialLabels(
                labelInputs,
                width,
                height
              );

              return (
                <>
                  {config.showSolarSystem && (
                    <g id="layer-solar-system">
                      {preparedBodies.map(
                        ({
                          body,
                          pt,
                          discR,
                          isSelected,
                          litAngleDeg,
                          poleScreenAngleDeg,
                          eastWestFlip,
                          bodyColor,
                          bracketHalf,
                          bracketArm,
                        }) => (
                          <g
                            key={`solar-${body.id}`}
                            transform={`translate(${pt[0]}, ${pt[1]})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectObject({ type: 'solar', data: body });
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              centerSkyObject({ type: 'solar', data: body });
                            }}
                            className="cursor-pointer"
                          >
                            {isSelected && (
                              <g
                                stroke={palette.selectionBracket}
                                strokeWidth="1.35"
                                fill="none"
                              >
                                <path
                                  d={`M ${-bracketHalf} ${
                                    -bracketHalf + bracketArm
                                  } V ${-bracketHalf} H ${
                                    -bracketHalf + bracketArm
                                  }`}
                                />
                                <path
                                  d={`M ${
                                    bracketHalf - bracketArm
                                  } ${-bracketHalf} H ${bracketHalf} V ${
                                    -bracketHalf + bracketArm
                                  }`}
                                />
                                <path
                                  d={`M ${-bracketHalf} ${
                                    bracketHalf - bracketArm
                                  } V ${bracketHalf} H ${
                                    -bracketHalf + bracketArm
                                  }`}
                                />
                                <path
                                  d={`M ${
                                    bracketHalf - bracketArm
                                  } ${bracketHalf} H ${bracketHalf} V ${
                                    bracketHalf - bracketArm
                                  }`}
                                />
                              </g>
                            )}

                            {body.kind === 'asteroid' ||
                            body.kind === 'dwarf_planet' ? (
                              <g>
                                <circle r={discR + 1.2} fill={palette.starHalo} />
                                <polygon
                                  points={`0,${-discR - 1.5} ${discR + 1.5},0 0,${
                                    discR + 1.5
                                  } ${-discR - 1.5},0`}
                                  fill="none"
                                  stroke={
                                    config.colorScheme === 'nightvision'
                                      ? '#F87171'
                                      : '#38BDF8'
                                  }
                                  strokeWidth="0.95"
                                  opacity="0.85"
                                />
                                <circle r={1.8} fill={bodyColor} />
                              </g>
                            ) : (
                              <SolarBodyDetailedDisc
                                body={body}
                                discR={discR}
                                litAngleDeg={litAngleDeg}
                                poleScreenAngleDeg={poleScreenAngleDeg}
                                eastWestFlip={eastWestFlip}
                                bodyColor={bodyColor}
                                haloColor={palette.starHalo}
                                isNightVision={
                                  config.colorScheme === 'nightvision'
                                }
                                isPaper={config.colorScheme === 'paper'}
                                showDetails={showDetails}
                              />
                            )}
                          </g>
                        )
                      )}
                    </g>
                  )}

                  {placedLabels.length > 0 && (
                    <g id="layer-celestial-labels">
                      {placedLabels.map((lbl) => {
                        const target = labelTargetByKey.get(lbl.id);
                        return (
                          <g
                            key={`lbl-${lbl.id}`}
                            onClick={(e) => {
                              if (!target) return;
                              e.stopPropagation();
                              onSelectObject(target);
                            }}
                            onDoubleClick={(e) => {
                              if (!target) return;
                              e.stopPropagation();
                              centerSkyObject(target);
                            }}
                            className="cursor-pointer"
                          >
                            {lbl.needsLeader && (
                              <line
                                x1={lbl.leaderX1}
                                y1={lbl.leaderY1}
                                x2={lbl.leaderX2}
                                y2={lbl.leaderY2}
                                stroke={lbl.fill}
                                strokeWidth="0.85"
                                opacity={Math.min(0.72, lbl.opacity * 0.72)}
                                pointerEvents="none"
                              />
                            )}
                            <text
                              x={lbl.textX}
                              y={lbl.textY}
                              textAnchor={lbl.textAnchor}
                              dominantBaseline="central"
                              fill={lbl.fill}
                              fontSize={lbl.fontSize}
                              fontFamily={lbl.fontFamily}
                              fontWeight={lbl.fontWeight}
                              opacity={lbl.opacity}
                              style={{
                                paintOrder: 'stroke',
                                stroke: palette.bg,
                                strokeWidth: '2.5px',
                                strokeLinejoin: 'round',
                              }}
                            >
                              {lbl.text}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}
                </>
              );
            })()}

            {/* LAYER 6B: Horizontal Coordinate Ground Mask, Horizon Line & Cardinal Compass Markers */}
            {isHorizontal && config.showHorizonGround && (
              <g id="layer-horizon-ground" pointerEvents="none">
                <g opacity="0.88">
                  {horizonGroundGeometry.groundQuadPaths.map((dPath, idx) => (
                    <path
                      key={`ground-quad-${idx}`}
                      d={dPath}
                      fill={palette.groundSolid}
                      stroke={palette.groundSolid}
                      strokeWidth="0.9"
                    />
                  ))}
                </g>

                {horizonGroundGeometry.groundContours.map((dPath, idx) => (
                  <path
                    key={`ground-contour-${idx}`}
                    d={dPath}
                    fill="none"
                    stroke={palette.horizonStroke}
                    strokeWidth="0.65"
                    strokeDasharray="3,5"
                    opacity="0.4"
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
                  const pt = projection(horizontalToLonLat(cp.az, horizonAlt));
                  if (
                    !pt ||
                    pt[0] < 24 ||
                    pt[0] > width - 24 ||
                    pt[1] < 12 ||
                    pt[1] > height - 10
                  ) {
                    return null;
                  }
                  const badgeAbove = config.mirrorVertical || pt[1] > height - 32;
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
                        y={badgeAbove ? -26 : 8}
                        width={cp.major ? 48 : 44}
                        height={18}
                        rx="4"
                        fill={palette.cardinalBg}
                        stroke={palette.horizonStroke}
                        strokeWidth="1"
                      />
                      <text
                        x={0}
                        y={badgeAbove ? -14 : 20}
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

            {/* LAYER 8: Cumulative Telrad / Binocular / Eyepiece Reticle Overlay */}
            {activeReticles.length > 0 && (
              <g
                id="layer-reticle"
                transform={`translate(${width / 2}, ${height / 2})`}
                pointerEvents="none"
              >
                {activeReticles.includes('telrad') && (
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

                {activeReticles.includes('binoculars_7x50') && (
                  <circle
                    r={(7.0 * pxPerDeg) / 2}
                    fill="none"
                    stroke={
                      config.colorScheme === 'nightvision' ? '#F87171' : '#06B6D4'
                    }
                    strokeWidth="1.4"
                    strokeDasharray="6,3"
                  />
                )}

                {activeReticles.includes('eyepiece_afov') && (
                  <circle
                    r={(config.customEyepieceFovDeg * pxPerDeg) / 2}
                    fill="none"
                    stroke={
                      config.colorScheme === 'nightvision' ? '#FCA5A5' : '#F59E0B'
                    }
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

        {/* Bottom of Star Chart: Angular Scale Bar & Magnitude Scale Legend (성도 속아래에 배치) */}
        {(config.showScaleBar || config.showMagnitudeScale) && (
          <div className="absolute bottom-4 left-5 right-5 z-10 pointer-events-none flex flex-wrap items-center justify-between gap-3">
            {/* Left: Angular Scale Bar (성도 속 좌측 하단) */}
            {config.showScaleBar ? (
              <div className="pointer-events-auto flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/85 backdrop-blur-xs text-slate-100 border border-slate-700/80 shadow-md">
                <span className="text-[11px] font-mono font-semibold text-cyan-400 whitespace-nowrap">
                  {barLabel} ANGULAR SCALE
                </span>
                <div className="flex items-center">
                  <div data-nv-bright="true" className="w-0.5 h-3 bg-white" />
                  <div
                    data-nv-bright="true"
                    className="h-0.5 bg-white transition-all duration-150"
                    style={{ width: `${Math.round(barPx)}px` }}
                  />
                  <div data-nv-bright="true" className="w-0.5 h-3 bg-white" />
                </div>
              </div>
            ) : (
              <div />
            )}

            {/* Right: Compact MAG Legend Box */}
            {config.showMagnitudeScale && (
              <div className="pointer-events-auto flex items-center gap-1.5">
                <div className="flex items-center gap-2.5 px-2.5 py-1 bg-black/90 text-white border border-slate-700/70 shadow-md font-mono text-[11px] leading-none">
                  <span className="tracking-tight">MAG:</span>
                  {[
                    { mag: 6, fallbackPx: 2.5 },
                    { mag: 4, fallbackPx: 3.8 },
                    { mag: 2, fallbackPx: 5.5 },
                    { mag: 0, fallbackPx: 7.5 },
                  ].map(({ mag, fallbackPx }) => {
                    const computed = computeStarRadius(
                      mag,
                      Math.max(config.limitStarMag, 8.0),
                      config.starScaleFactor,
                      0.82
                    ) * 2;
                    const dPx = Math.max(fallbackPx, Math.min(8.5, computed));
                    return (
                      <div key={`in-chart-leg-${mag}`} className="flex items-center gap-1">
                        <span
                          data-nv-bright="true"
                          className="inline-block rounded-full bg-white shrink-0"
                          style={{ width: `${dPx}px`, height: `${dPx}px` }}
                        />
                        <span className="tabular-nums">{mag}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          3. OBSERVATION DATE & TIME BAR ([-1D][-1H][-1M] + 날짜표시/트랜스포트 상자 + [+1M][+1H][+1D])
         ===================================================================== */}
      <div className="px-4 py-1.5 bg-[#0B1120] text-slate-100 border-t border-slate-800 shrink-0">
        <div className="flex flex-wrap items-end justify-center gap-2">
          {/* Time Step & Stellarium-Style Transport Controls: [-1D] [-1H] [-1M] [Date + Transport] [+1M] [+1H] [+1D] */}
          <div className="flex flex-wrap items-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleStepMinutes(-1440)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1일 전 (-1 Day)"
            >
              -1D
            </button>
            <button
              type="button"
              onClick={() => handleStepMinutes(-60)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1시간 전 (-1 Hour)"
            >
              -1H
            </button>
            <button
              type="button"
              onClick={() => handleStepMinutes(-1)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1분 전 (-1 Minute)"
            >
              -1M
            </button>

            {/* Rewind / Play-Pause / Now / Fast-Forward Cluster with Compact Date/Time Above */}
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="text-[10.5px] font-mono font-medium tabular-nums text-cyan-300/95 leading-none tracking-tight select-text"
                title="현재 기준 날짜 및 시각"
              >
                {formattedBarDateTime}
              </div>
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/90">
                <button
                  type="button"
                  onClick={handleRewind}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    simSpeed < 0
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="시간 되감기 (여러 번 누르면 되감기 속도 증가)"
                >
                  <Rewind className="w-3.5 h-3.5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    simSpeed !== 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                  }`}
                  title={simSpeed !== 0 ? '일시정지 (다시 누르면 정지)' : '정상 시간 속도로 재생 (1×)'}
                >
                  {simSpeed !== 0 ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>정지</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>재생</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSetNowDateTime}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-cyan-950/90 hover:bg-cyan-900 text-cyan-400 border border-cyan-500/70 transition-colors cursor-pointer"
                  title="현재 시각으로 즉시 이동"
                >
                  현재 시각
                </button>

                <button
                  type="button"
                  onClick={handleFastForward}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    simSpeed > 1
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="시간 빨리감기 (여러 번 누르면 빨리감기 속도 증가)"
                >
                  <FastForward className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleStepMinutes(1)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1분 후 (+1 Minute)"
            >
              +1M
            </button>
            <button
              type="button"
              onClick={() => handleStepMinutes(60)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1시간 후 (+1 Hour)"
            >
              +1H
            </button>
            <button
              type="button"
              onClick={() => handleStepMinutes(1440)}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
              title="1일 후 (+1 Day)"
            >
              +1D
            </button>

            {/* Active Simulation Speed Indicator */}
            {simSpeed !== 0 && (
              <span
                className={`ml-1 mb-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                  simSpeed < 0
                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                }`}
              >
                {formatSimSpeedLabel(simSpeed)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
