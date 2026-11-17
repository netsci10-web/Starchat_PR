import * as d3 from 'd3';
import { angularDistanceDeg } from '../data/astronomyData';
import { FChart3Config } from '../types/astronomy';
import {
  celestialToLonLat,
  computeLinkedLimitingMags,
  computeLstDeg,
  equatorialToHorizontal,
  horizontalToEquatorial,
  horizontalToLonLat,
  lonToAz,
} from './atlasGenerator';

let activeSlewRaf: number | null = null;

function roundFovDeg(raw: number): number {
  const clamped = Math.max(0.02, Math.min(135.0, raw));
  if (clamped < 0.2) return Number(clamped.toFixed(3));
  if (clamped < 2) return Number(clamped.toFixed(2));
  return Number(clamped.toFixed(1));
}

export function cancelActiveSkySlew(): void {
  if (activeSlewRaf !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(activeSlewRaf);
    activeSlewRaf = null;
  }
}

export interface SkySlewOptions {
  currentConfig: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  targetRaHours: number;
  targetDecDeg: number;
  targetFovDeg?: number;
  extraInitialPatch?: Partial<FChart3Config>;
  extraFinalPatch?: Partial<FChart3Config>;
}

/**
 * Smoothly slews the celestial viewport along a spherical great-circle arc (D3 geoInterpolate + easeCubicInOut)
 * from the current viewing center to the target object, optionally animating FOV logarithmically.
 */
export function startSkySlew({
  currentConfig,
  onChangeConfig,
  targetRaHours,
  targetDecDeg,
  targetFovDeg,
  extraInitialPatch,
  extraFinalPatch,
}: SkySlewOptions): void {
  cancelActiveSkySlew();

  const startSnap = currentConfig;
  const normalizedTargetRaHours = ((targetRaHours % 24) + 24) % 24;
  const targetRaDeg = normalizedTargetRaHours * 15;
  const clampedTargetDec = Math.max(-89.5, Math.min(89.5, targetDecDeg));

  const startLstDeg = computeLstDeg(
    startSnap.observationDateTime,
    startSnap.observerLonDeg
  );
  const [targetAzDeg, targetAltDeg] = equatorialToHorizontal(
    targetRaDeg,
    clampedTargetDec,
    startSnap.observerLatDeg,
    startLstDeg
  );

  const distDeg = angularDistanceDeg(
    startSnap.centerRaHours * 15,
    startSnap.centerDecDeg,
    targetRaDeg,
    clampedTargetDec
  );

  const startFov = Math.max(0.02, Math.min(135.0, startSnap.fovDeg));
  const hasTargetFov =
    typeof targetFovDeg === 'number' && Number.isFinite(targetFovDeg);
  const endFov = hasTargetFov ? roundFovDeg(targetFovDeg!) : startFov;
  const fovChanged = hasTargetFov && Math.abs(endFov - startFov) > 1e-4;

  const horizonShiftDeg =
    startSnap.coordinateSystem === 'horizontal' && startSnap.showHorizonGround
      ? Math.max(0, Math.min(85, -(startSnap.horizonAltDeg ?? 0)))
      : 0;
  const effectiveStartAlt = Math.max(
    -89.5,
    Math.min(89.5, startSnap.centerAltDeg + horizonShiftDeg)
  );
  const clampedStartAltForStorage = Math.max(
    -89.5,
    Math.min(89.5, targetAltDeg - horizonShiftDeg)
  );

  // Already centered and no FOV change needed
  if (
    (distDeg < 0.001 && !fovChanged) ||
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    onChangeConfig((prev) => {
      const lst = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
      const [az, alt] = equatorialToHorizontal(
        targetRaDeg,
        clampedTargetDec,
        prev.observerLatDeg,
        lst
      );
      const shift =
        prev.coordinateSystem === 'horizontal' && prev.showHorizonGround
          ? Math.max(0, Math.min(85, -(prev.horizonAltDeg ?? 0)))
          : 0;
      const storedAlt = Math.max(-89.5, Math.min(89.5, alt - shift));
      const linked = hasTargetFov
        ? computeLinkedLimitingMags(endFov, prev)
        : undefined;
      return {
        ...prev,
        ...extraInitialPatch,
        centerRaHours: normalizedTargetRaHours,
        centerDecDeg: clampedTargetDec,
        centerAzDeg: Number(az.toFixed(4)),
        centerAltDeg: Number(storedAlt.toFixed(4)),
        ...(hasTargetFov ? { fovDeg: endFov, ...linked } : {}),
        ...extraFinalPatch,
      };
    });
    return;
  }

  if (extraInitialPatch && Object.keys(extraInitialPatch).length > 0) {
    onChangeConfig((prev) => ({
      ...prev,
      ...extraInitialPatch,
    }));
  }

  const slewInHorizontal = startSnap.coordinateSystem === 'horizontal';
  const startPt: [number, number] = slewInHorizontal
    ? horizontalToLonLat(startSnap.centerAzDeg, effectiveStartAlt)
    : celestialToLonLat(startSnap.centerRaHours * 15, startSnap.centerDecDeg);
  const endPt: [number, number] = slewInHorizontal
    ? horizontalToLonLat(targetAzDeg, targetAltDeg)
    : celestialToLonLat(targetRaDeg, clampedTargetDec);

  const geoInterp = d3.geoInterpolate(startPt, endPt);
  const fovLogDelta = hasTargetFov ? Math.abs(Math.log(endFov / startFov)) : 0;
  const durationMs = Math.round(
    Math.max(460, Math.min(950, Math.max(420 + distDeg * 4.5, 420 + fovLogDelta * 150)))
  );

  let startTime: number | null = null;

  const step = (now: number) => {
    if (startTime === null) {
      startTime = now;
    }
    const rawT = Math.min(1, Math.max(0, (now - startTime) / durationMs));
    const eased = d3.easeCubicInOut(rawT);

    if (rawT >= 1) {
      activeSlewRaf = null;
      onChangeConfig((prev) => {
        const lst = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
        const [finalAz, finalAlt] = equatorialToHorizontal(
          targetRaDeg,
          clampedTargetDec,
          prev.observerLatDeg,
          lst
        );
        const shift =
          prev.coordinateSystem === 'horizontal' && prev.showHorizonGround
            ? Math.max(0, Math.min(85, -(prev.horizonAltDeg ?? 0)))
            : 0;
        const storedFinalAlt =
          shift > 0 ? clampedStartAltForStorage : Math.max(-89.5, Math.min(89.5, finalAlt));
        const linked = hasTargetFov
          ? computeLinkedLimitingMags(endFov, prev)
          : undefined;
        return {
          ...prev,
          centerRaHours: normalizedTargetRaHours,
          centerDecDeg: clampedTargetDec,
          centerAzDeg: Number(finalAz.toFixed(4)),
          centerAltDeg: Number(
            (shift > 0 ? Math.max(-89.5, Math.min(89.5, finalAlt - shift)) : storedFinalAlt).toFixed(4)
          ),
          ...(hasTargetFov ? { fovDeg: endFov, ...linked } : {}),
          ...extraFinalPatch,
        };
      });
      return;
    }

    const [lon, lat] = geoInterp(eased);
    const frameFov = hasTargetFov
      ? Number((startFov * Math.pow(endFov / startFov, eased)).toFixed(3))
      : null;

    onChangeConfig((prev) => {
      const lst = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
      const linked =
        frameFov !== null
          ? computeLinkedLimitingMags(frameFov, prev)
          : undefined;

      if (slewInHorizontal) {
        const az = lonToAz(lon);
        const alt = Math.max(-89.5, Math.min(89.5, lat));
        const [raDeg, decDeg] = horizontalToEquatorial(
          az,
          alt,
          prev.observerLatDeg,
          lst
        );
        const shift =
          prev.showHorizonGround
            ? Math.max(0, Math.min(85, -(prev.horizonAltDeg ?? 0)))
            : 0;
        const storedAlt = Math.max(-89.5, Math.min(89.5, alt - shift));
        return {
          ...prev,
          centerAzDeg: Number(az.toFixed(4)),
          centerAltDeg: Number(storedAlt.toFixed(4)),
          centerRaHours: Number((((raDeg / 15) % 24 + 24) % 24).toFixed(6)),
          centerDecDeg: Number(Math.max(-89.5, Math.min(89.5, decDeg)).toFixed(5)),
          ...(frameFov !== null ? { fovDeg: frameFov, ...linked } : {}),
        };
      } else {
        const raDeg = ((-lon) % 360 + 360) % 360;
        const decDeg = Math.max(-89.5, Math.min(89.5, lat));
        const [az, alt] = equatorialToHorizontal(
          raDeg,
          decDeg,
          prev.observerLatDeg,
          lst
        );
        return {
          ...prev,
          centerRaHours: Number((raDeg / 15).toFixed(6)),
          centerDecDeg: Number(decDeg.toFixed(5)),
          centerAzDeg: Number(az.toFixed(4)),
          centerAltDeg: Number(alt.toFixed(4)),
          ...(frameFov !== null ? { fovDeg: frameFov, ...linked } : {}),
        };
      }
    });

    activeSlewRaf = window.requestAnimationFrame(step);
  };

  activeSlewRaf = window.requestAnimationFrame(step);
}
