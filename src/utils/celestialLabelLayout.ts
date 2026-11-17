export type CelestialLabelCategory =
  | 'solar_major'
  | 'solar_satellite'
  | 'solar_minor'
  | 'dso'
  | 'star';

export interface CelestialLabelInput {
  id: string;
  category: CelestialLabelCategory;
  parentId?: string;
  x: number;
  y: number;
  discR: number;
  /** Horizontal half-extent for obstacle avoidance & primary anchor offset (px) */
  halfW: number;
  /** Vertical half-extent for obstacle avoidance & primary anchor offset (px) */
  halfH: number;
  /** Lower values are placed earlier within the same tier */
  priorityKey: number;
  text: string;
  fontSize: number;
  fontWeight: string;
  fontFamily?: string;
  fill: string;
  opacity: number;
  isSelected: boolean;
  showLabel: boolean;
}

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedCelestialLabel {
  id: string;
  category: CelestialLabelCategory;
  text: string;
  fontSize: number;
  fontWeight: string;
  fontFamily?: string;
  fill: string;
  opacity: number;
  textX: number;
  textY: number;
  textAnchor: 'start' | 'middle' | 'end';
  box: LabelRect;
  needsLeader: boolean;
  leaderX1: number;
  leaderY1: number;
  leaderX2: number;
  leaderY2: number;
}

/**
 * Determines whether a planetary satellite is visually separated enough from its
 * parent planet's globe and tilted ring system for its label to appear cleanly.
 */
export function isSatelliteSufficientlySeparated(
  satX: number,
  satY: number,
  parentX: number,
  parentY: number,
  parentDiscR: number,
  parentHasRings: boolean,
  parentPoleScreenAngleDeg: number,
  parentSubEarthLatDeg: number
): boolean {
  const dx = satX - parentX;
  const dy = satY - parentY;
  const distFromParent = Math.hypot(dx, dy);

  let parentEdgeRadius = parentDiscR;
  if (parentHasRings) {
    const poleRotRad = ((parentPoleScreenAngleDeg + 90) * Math.PI) / 180;
    const ringRx = parentDiscR * 2.3;
    const absSinBe = Math.abs(Math.sin(parentSubEarthLatDeg * (Math.PI / 180)));
    const ringRy = Math.max(parentDiscR, ringRx * Math.max(0.08, absSinBe));
    const satAngle = Math.atan2(dy, dx);
    const relAngle = satAngle - poleRotRad;
    const denom = Math.hypot(ringRy * Math.cos(relAngle), ringRx * Math.sin(relAngle));
    if (denom > 1e-6) {
      parentEdgeRadius = Math.max(parentDiscR, (ringRx * ringRy) / denom);
    }
  }

  const clearance = distFromParent - parentEdgeRadius;
  return distFromParent >= 24 && clearance >= 18;
}

/**
 * Estimates the rendered pixel bounding box of mixed Korean/ASCII celestial labels.
 */
export function estimateLabelSize(
  text: string,
  fontSize: number,
  isMonospace = false
): { w: number; h: number } {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      width += fontSize * 0.98;
    } else if (
      text[i] === ' ' ||
      text[i] === '.' ||
      text[i] === '·' ||
      text[i] === '(' ||
      text[i] === ')' ||
      text[i] === '[' ||
      text[i] === ']'
    ) {
      width += fontSize * (isMonospace ? 0.56 : 0.44);
    } else {
      width += fontSize * (isMonospace ? 0.64 : 0.6);
    }
  }
  return {
    w: Math.ceil(width + 6),
    h: Math.ceil(fontSize + 4),
  };
}

function rectsOverlap(a: LabelRect, b: LabelRect, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

function rectOverlapArea(a: LabelRect, b: LabelRect, pad = 0): number {
  const ox = Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y));
  return ox * oy;
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: LabelRect
): boolean {
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;

  if (Math.max(x1, x2) < minX || Math.min(x1, x2) > maxX) return false;
  if (Math.max(y1, y2) < minY || Math.min(y1, y2) > maxY) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const checks: [number, number][] = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const ccw = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  return (
    ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
    ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
  );
}

function computeLeaderEndpoints(
  cx: number,
  cy: number,
  discR: number,
  box: LabelRect
): { x1: number; y1: number; x2: number; y2: number } {
  const pad = 2.5;
  const targetX = Math.max(box.x - pad, Math.min(box.x + box.w + pad, cx));
  const targetY = Math.max(box.y - pad, Math.min(box.y + box.h + pad, cy));

  const dx = targetX - cx;
  const dy = targetY - cy;
  const dist = Math.hypot(dx, dy);
  const startOffset = discR + 2.5;

  if (dist <= startOffset + 1) {
    return { x1: cx, y1: cy, x2: targetX, y2: targetY };
  }

  return {
    x1: cx + (dx / dist) * startOffset,
    y1: cy + (dy / dist) * startOffset,
    x2: targetX,
    y2: targetY,
  };
}

interface CandidatePlacement {
  box: LabelRect;
  textX: number;
  textY: number;
  textAnchor: 'start' | 'middle' | 'end';
  needsLeader: boolean;
  leaderX1: number;
  leaderY1: number;
  leaderX2: number;
  leaderY2: number;
  cost: number;
}

function buildDirectionalBox(
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  distX: number,
  distY: number,
  bw: number,
  bh: number
): { box: LabelRect; textX: number; textY: number; textAnchor: 'start' | 'middle' | 'end' } {
  const ax = cx + ux * distX;
  const ay = cy + uy * distY;

  let textAnchor: 'start' | 'middle' | 'end';
  let boxX: number;
  let textX: number;

  if (ux > 0.36) {
    textAnchor = 'start';
    boxX = ax;
    textX = ax + 2;
  } else if (ux < -0.36) {
    textAnchor = 'end';
    boxX = ax - bw;
    textX = ax - 2;
  } else {
    textAnchor = 'middle';
    boxX = ax - bw / 2;
    textX = ax;
  }

  let boxY: number;
  if (uy < -0.55 && Math.abs(ux) <= 0.36) {
    boxY = ay - bh;
  } else if (uy > 0.55 && Math.abs(ux) <= 0.36) {
    boxY = ay;
  } else {
    boxY = ay - bh / 2 + uy * (bh * 0.25);
  }

  const textY = boxY + bh / 2;
  return {
    box: { x: boxX, y: boxY, w: bw, h: bh },
    textX,
    textY,
    textAnchor,
  };
}

/**
 * Unified collision-free label layout engine across ALL celestial objects
 * (Solar System planets, satellites, DSOs, and Stars).
 *
 * Placement hierarchy:
 * - Tier 0 (`solar_major`: Planets, Sun, Moon) ALWAYS claim central anchor spots first.
 * - Tier 1 (`solar_satellite`) adjust around parent planet/rings/labels and other satellites.
 * - Tier 2 (`solar_minor`, `dso`, `star`) adjust direction/position around all placed labels and discs.
 *
 * Whenever close directional placement still collides, extends along a clean leader line (보조선).
 */
export function layoutCelestialLabels(
  inputs: CelestialLabelInput[],
  viewportWidth: number,
  viewportHeight: number
): PlacedCelestialLabel[] {
  const byId = new Map<string, CelestialLabelInput>();
  for (const item of inputs) {
    byId.set(item.id, item);
  }

  const majorObstacles: { id: string; rect: LabelRect }[] = [];
  const satelliteObstacles: { id: string; rect: LabelRect }[] = [];

  for (const item of inputs) {
    if (item.category === 'solar_satellite') {
      const r = Math.max(item.discR + 3, 5);
      satelliteObstacles.push({
        id: item.id,
        rect: { x: item.x - r, y: item.y - r, w: r * 2, h: r * 2 },
      });
    } else {
      const pad = item.category === 'solar_major' ? 3 : 2;
      majorObstacles.push({
        id: item.id,
        rect: {
          x: item.x - item.halfW - pad,
          y: item.y - item.halfH - pad,
          w: (item.halfW + pad) * 2,
          h: (item.halfH + pad) * 2,
        },
      });
    }
  }

  const getTier = (cat: CelestialLabelCategory) => {
    if (cat === 'solar_major') return 0;
    if (cat === 'solar_satellite') return 1;
    return 2;
  };

  const sortedForPlacement = inputs
    .filter((item) => item.showLabel)
    .sort((a, b) => {
      const ta = getTier(a.category);
      const tb = getTier(b.category);
      if (ta !== tb) return ta - tb;
      if (ta > 0 && a.isSelected !== b.isSelected) {
        return a.isSelected ? -1 : 1;
      }
      return a.priorityKey - b.priorityKey;
    });

  const placedLabels: PlacedCelestialLabel[] = [];
  const placedBoxes: { id: string; rect: LabelRect }[] = [];
  const placedLeaders: { x1: number; y1: number; x2: number; y2: number }[] = [];

  const margin = 6;
  const isInsideViewport = (rect: LabelRect) =>
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.w <= viewportWidth - margin &&
    rect.y + rect.h <= viewportHeight - margin;

  const outOfViewportPenalty = (rect: LabelRect) => {
    const overflowL = Math.max(0, margin - rect.x);
    const overflowT = Math.max(0, margin - rect.y);
    const overflowR = Math.max(0, rect.x + rect.w - (viewportWidth - margin));
    const overflowB = Math.max(0, rect.y + rect.h - (viewportHeight - margin));
    return (overflowL + overflowT + overflowR + overflowB) * 160;
  };

  const evaluateCandidate = (
    item: CelestialLabelInput,
    cand: Omit<CandidatePlacement, 'cost'>,
    includeSatDiscs: boolean,
    directionPenalty: number
  ): { clean: boolean; cost: number } => {
    let overlapArea = 0;

    for (const pb of placedBoxes) {
      if (rectsOverlap(cand.box, pb.rect, 3.5)) {
        overlapArea += rectOverlapArea(cand.box, pb.rect, 3.5) + 220;
      }
    }

    for (const obs of majorObstacles) {
      if (obs.id === item.id) continue;
      if (rectsOverlap(cand.box, obs.rect, 2)) {
        overlapArea += rectOverlapArea(cand.box, obs.rect, 2) + 240;
      }
    }

    if (includeSatDiscs) {
      for (const obs of satelliteObstacles) {
        if (obs.id === item.id) continue;
        if (rectsOverlap(cand.box, obs.rect, 2)) {
          overlapArea += rectOverlapArea(cand.box, obs.rect, 2) + 180;
        }
      }
    }

    let leaderPenalty = 0;
    if (cand.needsLeader) {
      const len = Math.hypot(cand.leaderX2 - cand.leaderX1, cand.leaderY2 - cand.leaderY1);
      leaderPenalty += len * 0.45;

      for (const pb of placedBoxes) {
        if (segmentIntersectsRect(cand.leaderX1, cand.leaderY1, cand.leaderX2, cand.leaderY2, pb.rect)) {
          leaderPenalty += 500;
        }
      }
      for (const obs of majorObstacles) {
        if (obs.id === item.id) continue;
        if (segmentIntersectsRect(cand.leaderX1, cand.leaderY1, cand.leaderX2, cand.leaderY2, obs.rect)) {
          leaderPenalty += 380;
        }
      }
      for (const ld of placedLeaders) {
        if (
          segmentsIntersect(
            cand.leaderX1,
            cand.leaderY1,
            cand.leaderX2,
            cand.leaderY2,
            ld.x1,
            ld.y1,
            ld.x2,
            ld.y2
          )
        ) {
          leaderPenalty += 260;
        }
      }
    }

    const vpPenalty = outOfViewportPenalty(cand.box);
    const clean = overlapArea === 0 && vpPenalty === 0;
    return {
      clean,
      cost: overlapArea * 12 + vpPenalty + leaderPenalty + directionPenalty,
    };
  };

  for (const item of sortedForPlacement) {
    const isMono = Boolean(item.fontFamily && item.fontFamily.includes('Mono'));
    const { w: bw, h: bh } = estimateLabelSize(item.text, item.fontSize, isMono);
    const tier = getTier(item.category);
    const includeSatDiscs = tier > 0;

    // Direction bias:
    // - Satellites favor outward/perpendicular away from parent planet
    // - Planets, DSOs, Stars favor classic Right (0°), then Top-Right, Bottom-Right, Top, Bottom, Left
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    const dxParent = parent ? item.x - parent.x : 1;
    const dyParent = parent ? item.y - parent.y : 0;
    const distFromParent = Math.hypot(dxParent, dyParent);
    const outAngle = distFromParent > 2 ? Math.atan2(dyParent, dxParent) : 0;
    const outUx = Math.cos(outAngle);
    const outUy = Math.sin(outAngle);

    const localAnglesDeg =
      item.category === 'solar_satellite'
        ? [0, -45, 45, -90, 90, -135, 135, 180, -68, 68, -112, 112]
        : [0, -34, 34, -90, 90, 180, -146, 146, -62, 62, -118, 118];

    const baseRx = item.halfW + (item.category === 'solar_major' ? 6 : 4.5);
    const baseRy = item.halfH + (item.category === 'solar_major' ? 6 : 4.5);

    const computeDirPenalty = (ux: number, uy: number, idx: number) => {
      if (item.category === 'solar_satellite') {
        const dotOut = ux * outUx + uy * outUy;
        const crossOut = Math.abs(ux * outUy - uy * outUx);
        let p = (1 - dotOut) * 6;
        if (crossOut > 0.7) p -= 3;
        if (dotOut < -0.45) p += 16;
        return p;
      }
      return idx * 7;
    };

    let bestLocalClean: CandidatePlacement | null = null;
    let bestFallback: CandidatePlacement | null = null;

    // Pass A: Direct position & direction adjustment without leader lines
    for (let idx = 0; idx < localAnglesDeg.length; idx++) {
      const rad = (localAnglesDeg[idx] * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const built = buildDirectionalBox(item.x, item.y, ux, uy, baseRx, baseRy, bw, bh);
      const baseCand = {
        ...built,
        needsLeader: false,
        leaderX1: item.x,
        leaderY1: item.y,
        leaderX2: item.x,
        leaderY2: item.y,
      };
      const dirPenalty = computeDirPenalty(ux, uy, idx);
      const evalRes = evaluateCandidate(item, baseCand, includeSatDiscs, dirPenalty);

      if (evalRes.clean && isInsideViewport(baseCand.box)) {
        if (item.category !== 'solar_satellite') {
          // For Planets, DSOs, and Stars, pick the highest-priority clean local angle immediately
          bestLocalClean = { ...baseCand, cost: evalRes.cost };
          break;
        }
        if (!bestLocalClean || evalRes.cost < bestLocalClean.cost) {
          bestLocalClean = { ...baseCand, cost: evalRes.cost };
        }
      }
      if (!bestFallback || evalRes.cost < bestFallback.cost) {
        bestFallback = { ...baseCand, cost: evalRes.cost };
      }
    }

    if (bestLocalClean) {
      placedLabels.push({
        id: item.id,
        category: item.category,
        text: item.text,
        fontSize: item.fontSize,
        fontWeight: item.fontWeight,
        fontFamily: item.fontFamily,
        fill: item.fill,
        opacity: item.opacity,
        textX: bestLocalClean.textX,
        textY: bestLocalClean.textY,
        textAnchor: bestLocalClean.textAnchor,
        box: bestLocalClean.box,
        needsLeader: false,
        leaderX1: bestLocalClean.leaderX1,
        leaderY1: bestLocalClean.leaderY1,
        leaderX2: bestLocalClean.leaderX2,
        leaderY2: bestLocalClean.leaderY2,
      });
      placedBoxes.push({ id: item.id, rect: bestLocalClean.box });
      continue;
    }

    // Pass B: Extend along a clean leader line (보조선) when all close positions overlap
    const leaderAnglesDeg = [
      -90, 90, -67.5, 67.5, -112.5, 112.5, -45, 45, -135, 135, -22.5, 22.5, -157.5, 157.5, 0, 180,
    ];
    const startDist = Math.max(20, Math.round(Math.max(baseRx, baseRy) + 12));
    const leaderDists = [
      startDist,
      startDist + 12,
      startDist + 26,
      startDist + 44,
      startDist + 66,
      startDist + 92,
      startDist + 124,
    ];
    if (
      item.category === 'solar_satellite' &&
      parent &&
      distFromParent < Math.max(parent.halfW, parent.halfH) + 25
    ) {
      const parentReach = Math.round(Math.max(parent.halfW, parent.halfH) + 24);
      leaderDists.push(parentReach, parentReach + 28);
    }

    let bestLeaderClean: CandidatePlacement | null = null;

    for (const dist of leaderDists) {
      for (let idx = 0; idx < leaderAnglesDeg.length; idx++) {
        const rad = (leaderAnglesDeg[idx] * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uy = Math.sin(rad);
        const built = buildDirectionalBox(
          item.x,
          item.y,
          ux,
          uy,
          dist,
          dist * (baseRy / Math.max(1, baseRx)),
          bw,
          bh
        );
        const ep = computeLeaderEndpoints(item.x, item.y, item.discR, built.box);
        const baseCand = {
          ...built,
          needsLeader: true,
          leaderX1: ep.x1,
          leaderY1: ep.y1,
          leaderX2: ep.x2,
          leaderY2: ep.y2,
        };
        const dirPenalty = computeDirPenalty(ux, uy, idx);
        const evalRes = evaluateCandidate(item, baseCand, includeSatDiscs, dirPenalty);

        if (evalRes.clean && (!bestLeaderClean || evalRes.cost < bestLeaderClean.cost)) {
          bestLeaderClean = { ...baseCand, cost: evalRes.cost };
        }
        if (!bestFallback || evalRes.cost < bestFallback.cost) {
          bestFallback = { ...baseCand, cost: evalRes.cost };
        }
      }
      if (bestLeaderClean) break;
    }

    const winner = bestLeaderClean ?? bestFallback!;
    placedLabels.push({
      id: item.id,
      category: item.category,
      text: item.text,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      fontFamily: item.fontFamily,
      fill: item.fill,
      opacity: item.opacity,
      textX: winner.textX,
      textY: winner.textY,
      textAnchor: winner.textAnchor,
      box: winner.box,
      needsLeader: winner.needsLeader,
      leaderX1: winner.leaderX1,
      leaderY1: winner.leaderY1,
      leaderX2: winner.leaderX2,
      leaderY2: winner.leaderY2,
    });
    placedBoxes.push({ id: item.id, rect: winner.box });
    if (winner.needsLeader) {
      placedLeaders.push({
        x1: winner.leaderX1,
        y1: winner.leaderY1,
        x2: winner.leaderX2,
        y2: winner.leaderY2,
      });
    }
  }

  return placedLabels;
}
