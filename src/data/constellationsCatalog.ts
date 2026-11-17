import { ConstellationStick, StarRecord } from '../types/astronomy';

/**
 * Subdivide a celestial line segment [[ra1Deg, dec1Deg], [ra2Deg, dec2Deg]]
 * along a true spherical Great Circle (3D unit-vector Slerp) so D3 projections
 * and jsPDF never bend circumpolar lines (e.g. Polaris -> Yildun) into arcs.
 */
export function subdivideStickSegment(
  p1: [number, number],
  p2: [number, number],
  steps = 8
): Array<[number, number]> {
  const [ra1Deg, dec1] = p1;
  const [ra2Deg, dec2] = p2;
  const r1 = (ra1Deg * Math.PI) / 180;
  const d1 = (dec1 * Math.PI) / 180;
  const r2 = (ra2Deg * Math.PI) / 180;
  const d2 = (dec2 * Math.PI) / 180;

  const v1x = Math.cos(d1) * Math.cos(r1);
  const v1y = Math.cos(d1) * Math.sin(r1);
  const v1z = Math.sin(d1);

  const v2x = Math.cos(d2) * Math.cos(r2);
  const v2y = Math.cos(d2) * Math.sin(r2);
  const v2z = Math.sin(d2);

  const dot = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y + v1z * v2z));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    if (i === 0) {
      pts.push([Number((((ra1Deg % 360) + 360) % 360).toFixed(4)), Number(dec1.toFixed(4))]);
      continue;
    }
    if (i === steps) {
      pts.push([Number((((ra2Deg % 360) + 360) % 360).toFixed(4)), Number(dec2.toFixed(4))]);
      continue;
    }
    const t = i / steps;
    let x: number;
    let y: number;
    let z: number;
    if (omega < 1e-6 || sinOmega < 1e-6) {
      x = v1x * (1 - t) + v2x * t;
      y = v1y * (1 - t) + v2y * t;
      z = v1z * (1 - t) + v2z * t;
    } else {
      const w1 = Math.sin((1 - t) * omega) / sinOmega;
      const w2 = Math.sin(t * omega) / sinOmega;
      x = w1 * v1x + w2 * v2x;
      y = w1 * v1y + w2 * v2y;
      z = w1 * v1z + w2 * v2z;
    }
    const len = Math.hypot(x, y, z) || 1;
    const decOut = (Math.asin(Math.max(-1, Math.min(1, z / len))) * 180) / Math.PI;
    const raOut = (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
    pts.push([
      Number(raOut.toFixed(4)),
      Number(Math.max(-89.99, Math.min(89.99, decOut)).toFixed(4)),
    ]);
  }
  return pts;
}

/**
 * Build an IAU equatorial boundary box along constant RA meridians and Dec parallels
 */
export function buildEquatorialBoundaryBox(
  raMinHours: number,
  raMaxHours: number,
  decMinDeg: number,
  decMaxDeg: number,
  steps = 10
): Array<[number, number]> {
  const spanH =
    raMaxHours >= raMinHours
      ? raMaxHours - raMinHours
      : 24 - raMinHours + raMaxHours;
  const pts: Array<[number, number]> = [];

  // Bottom parallel: raMin -> raMax at decMin
  for (let i = 0; i <= steps; i++) {
    const rH = (raMinHours + (spanH * i) / steps) % 24;
    pts.push([Number((rH * 15).toFixed(3)), decMinDeg]);
  }
  // Right meridian: decMin -> decMax at raMax
  for (let i = 1; i <= steps; i++) {
    const d = decMinDeg + ((decMaxDeg - decMinDeg) * i) / steps;
    pts.push([Number(((raMaxHours % 24) * 15).toFixed(3)), Number(d.toFixed(3))]);
  }
  // Top parallel: raMax -> raMin at decMax
  for (let i = 1; i <= steps; i++) {
    const rH = (raMinHours + (spanH * (steps - i)) / steps) % 24;
    pts.push([Number((rH * 15).toFixed(3)), decMaxDeg]);
  }
  // Left meridian: decMax -> decMin at raMin
  for (let i = 1; i <= steps; i++) {
    const d = decMaxDeg - ((decMaxDeg - decMinDeg) * i) / steps;
    pts.push([Number(((raMinHours % 24) * 15).toFixed(3)), Number(d.toFixed(3))]);
  }
  return pts;
}

/**
 * Build a multi-vertex stepped IAU boundary polygon (sampling along constant Dec parallels
 * and constant RA meridians cleanly across the 0h/24h wrap-around).
 */
function buildSteppedEquatorialBoundary(
  vertices: Array<[number, number]>
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < vertices.length; i++) {
    const [ra1, dec1] = vertices[i];
    const [ra2, dec2] = vertices[(i + 1) % vertices.length];
    let dRa = ra2 - ra1;
    if (dRa > 12) dRa -= 24;
    if (dRa < -12) dRa += 24;
    const dDec = dec2 - dec1;
    const steps = Math.max(2, Math.ceil(Math.max(Math.abs(dRa) / 0.25, Math.abs(dDec) / 1.5)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const raH = (((ra1 + dRa * t) % 24) + 24) % 24;
      const decD = dec1 + dDec * t;
      pts.push([Number((raH * 15).toFixed(3)), Number(decD.toFixed(3))]);
    }
  }
  if (pts.length > 0) {
    pts.push([...pts[0]]);
  }
  return pts;
}

/**
 * Compact helper to define a constellation from polylines of [raHours, decDeg] star vertices.
 * Every polyline `[v0, v1, v2, ...]` is expanded into pairs `[v0, v1], [v1, v2], ...`
 * AND every vertex is automatically registered in `CONSTELLATION_VERTEX_STARS` so
 * a star dot is always rendered at every constellation stick vertex.
 */
interface RawConstellationDef {
  code: string;
  nameEn: string;
  nameKo: string;
  raCenterHours: number;
  decCenterDeg: number;
  chains: Array<Array<[number, number]>>; // Each chain is an array of [raHours, decDeg]
  box?: [number, number, number, number]; // [raMinH, raMaxH, decMinDeg, decMaxDeg]
  boundary?: Array<[number, number]>; // Optional stepped IAU boundary vertices [raHours, decDeg]
}

const RAW_88_CONSTELLATIONS: RawConstellationDef[] = [
  // 1. Andromeda (안드로메다자리)
  {
    code: 'And',
    nameEn: 'Andromeda',
    nameKo: '안드로메다자리',
    raCenterHours: 1.1,
    decCenterDeg: 38.0,
    chains: [
      [[0.140, 29.090], [0.655, 30.861], [1.163, 35.621], [2.065, 42.330]],
      [[1.163, 35.621], [0.946, 38.499], [0.830, 41.079], [1.633, 48.628]],
      [[0.655, 30.861], [0.620, 33.719]],
    ],
    box: [23.3, 2.6, 22.0, 52.0],
  },
  // 2. Antlia (공기펌프자리)
  {
    code: 'Ant',
    nameEn: 'Antlia',
    nameKo: '공기펌프자리',
    raCenterHours: 10.2,
    decCenterDeg: -33.0,
    chains: [
      [[9.495, -35.951], [10.453, -31.068], [10.945, -37.137], [9.910, -35.891], [9.495, -35.951]],
    ],
    box: [9.4, 11.1, -40.0, -24.5],
  },
  // 3. Apus (극락조자리)
  {
    code: 'Aps',
    nameEn: 'Apus',
    nameKo: '극락조자리',
    raCenterHours: 16.0,
    decCenterDeg: -76.0,
    chains: [
      [[14.798, -79.045], [16.338, -78.696], [16.724, -77.517], [16.205, -71.334]],
    ],
    box: [13.8, 18.2, -83.0, -67.5],
  },
  // 4. Aquarius (물병자리)
  {
    code: 'Aqr',
    nameEn: 'Aquarius',
    nameKo: '물병자리',
    raCenterHours: 22.3,
    decCenterDeg: -10.0,
    chains: [
      [[20.794, -9.496], [21.526, -5.571], [22.096, -0.320], [22.481, -0.020], [22.589, -0.117], [22.877, -7.580], [22.911, -15.821]],
      [[22.096, -0.320], [22.280, -7.783], [22.488, -10.678], [22.826, -13.592]],
      [[21.526, -5.571], [22.093, -13.870]],
    ],
    box: [20.6, 23.9, -24.5, 3.0],
  },
  // 5. Aquila (독수리자리)
  {
    code: 'Aql',
    nameEn: 'Aquila',
    nameKo: '독수리자리',
    raCenterHours: 19.7,
    decCenterDeg: 5.0,
    chains: [
      [[19.771, 10.613], [19.846, 8.868], [19.922, 6.407]],
      [[19.090, 13.863], [19.425, 3.115], [19.846, 8.868]],
      [[19.090, 13.863], [19.060, 15.070]],
      [[19.425, 3.115], [19.104, -4.882], [19.874, 1.006], [20.188, -0.821], [19.846, 8.868]],
    ],
    box: [18.7, 20.6, -11.5, 18.5],
  },
  // 6. Ara (제단자리)
  {
    code: 'Ara',
    nameEn: 'Ara',
    nameKo: '제단자리',
    raCenterHours: 17.4,
    decCenterDeg: -55.0,
    chains: [
      [[17.531, -49.876], [17.422, -55.530], [17.421, -56.378], [16.977, -55.990], [16.830, -59.041], [16.629, -58.953], [16.840, -53.160], [17.531, -49.876]],
      [[17.531, -49.876], [18.110, -50.091]],
    ],
    box: [16.5, 18.2, -67.5, -45.5],
  },
  // 7. Aries (양자리)
  {
    code: 'Ari',
    nameEn: 'Aries',
    nameKo: '양자리',
    raCenterHours: 2.5,
    decCenterDeg: 21.0,
    chains: [
      [[1.892, 19.294], [1.911, 20.808], [2.120, 23.462], [2.833, 27.260], [3.194, 19.727]],
    ],
    box: [1.7, 3.5, 10.5, 31.0],
  },
  // 8. Auriga (마차부자리)
  {
    code: 'Aur',
    nameEn: 'Auriga',
    nameKo: '마차부자리',
    raCenterHours: 5.6,
    decCenterDeg: 41.0,
    chains: [
      [[5.278, 45.998], [5.992, 44.947], [5.995, 37.213], [5.438, 28.608], [4.950, 33.166], [5.033, 43.823], [5.278, 45.998]],
      [[5.033, 43.823], [5.108, 41.234], [5.040, 41.076], [5.033, 43.823]],
    ],
    box: [4.6, 7.5, 28.0, 56.0],
  },
  // 9. Boötes (목동자리)
  {
    code: 'Boo',
    nameEn: 'Boötes',
    nameKo: '목동자리',
    raCenterHours: 14.65,
    decCenterDeg: 30.0,
    chains: [
      [[14.261, 19.182], [13.911, 18.398]],
      [[14.261, 19.182], [14.750, 27.074], [15.258, 33.315], [15.032, 40.391], [14.535, 38.308], [14.495, 30.371], [14.261, 19.182]],
      [[14.535, 38.308], [14.419, 51.851]],
      [[14.261, 19.182], [14.686, 13.728]],
    ],
    box: [13.6, 15.8, 7.5, 55.0],
  },
  // 10. Caelum (조각칼자리)
  {
    code: 'Cae',
    nameEn: 'Caelum',
    nameKo: '조각칼자리',
    raCenterHours: 4.7,
    decCenterDeg: -38.0,
    chains: [
      [[5.073, -35.483], [4.702, -37.144], [4.676, -41.864], [4.506, -44.953]],
    ],
    box: [4.3, 5.1, -48.5, -27.0],
  },
  // 11. Camelopardalis (기린자리)
  {
    code: 'Cam',
    nameEn: 'Camelopardalis',
    nameKo: '기린자리',
    raCenterHours: 5.5,
    decCenterDeg: 68.0,
    chains: [
      [[4.901, 66.343], [4.821, 53.752], [3.488, 59.940]],
      [[4.901, 66.343], [5.057, 60.442]],
      [[4.901, 66.343], [6.038, 69.336], [11.981, 81.201]],
    ],
    box: [3.2, 14.0, 52.5, 86.0],
  },
  // 12. Cancer (게자리)
  {
    code: 'Cnc',
    nameEn: 'Cancer',
    nameKo: '게자리',
    raCenterHours: 8.65,
    decCenterDeg: 20.0,
    chains: [
      [[8.745, 28.760], [8.721, 21.469], [8.778, 18.154], [8.975, 11.858]],
      [[8.778, 18.154], [8.275, 9.186]],
    ],
    box: [7.9, 9.3, 6.5, 33.0],
  },
  // 13. Canes Venatici (사냥개자리)
  {
    code: 'CVn',
    nameEn: 'Canes Venatici',
    nameKo: '사냥개자리',
    raCenterHours: 13.0,
    decCenterDeg: 40.0,
    chains: [
      [[12.934, 38.318], [12.562, 41.357]],
    ],
    box: [12.1, 14.1, 28.0, 52.5],
  },
  // 14. Canis Major (큰개자리)
  {
    code: 'CMa',
    nameEn: 'Canis Major',
    nameKo: '큰개자리',
    raCenterHours: 6.85,
    decCenterDeg: -22.5,
    chains: [
      [[6.378, -17.956], [6.752, -16.716], [7.063, -15.633], [7.049, -17.054], [6.752, -16.716]],
      [[6.752, -16.716], [6.999, -24.060], [7.140, -26.393], [6.977, -28.972], [6.338, -30.063]],
      [[7.140, -26.393], [7.401, -29.303]],
    ],
    box: [6.2, 7.5, -33.0, -11.0],
  },
  // 15. Canis Minor (작은개자리)
  {
    code: 'CMi',
    nameEn: 'Canis Minor',
    nameKo: '작은개자리',
    raCenterHours: 7.55,
    decCenterDeg: 6.5,
    chains: [
      [[7.655, 5.225], [7.453, 8.289]],
    ],
    box: [7.1, 8.1, 0.0, 13.0],
  },
  // 16. Capricornus (염소자리)
  {
    code: 'Cap',
    nameEn: 'Capricornus',
    nameKo: '염소자리',
    raCenterHours: 21.1,
    decCenterDeg: -18.0,
    chains: [
      [[20.294, -12.508], [20.350, -14.781], [20.768, -25.271], [21.444, -22.411], [21.784, -16.127], [21.669, -16.662], [21.100, -17.233], [20.294, -12.508]],
    ],
    box: [20.1, 21.9, -27.5, -8.5],
  },
  // 17. Carina (용골자리)
  {
    code: 'Car',
    nameEn: 'Carina',
    nameKo: '용골자리',
    raCenterHours: 8.8,
    decCenterDeg: -62.0,
    chains: [
      [[6.399, -52.696], [7.947, -52.982], [8.375, -59.510], [9.285, -59.275], [9.785, -62.507], [10.229, -70.038], [9.220, -69.717]],
      [[9.785, -62.507], [10.562, -61.685], [10.716, -64.394], [10.229, -70.038]],
    ],
    box: [6.0, 11.3, -75.0, -51.0],
  },
  // 18. Cassiopeia (카시오페이아자리)
  {
    code: 'Cas',
    nameEn: 'Cassiopeia',
    nameKo: '카시오페이아자리',
    raCenterHours: 1.0,
    decCenterDeg: 60.5,
    chains: [
      [[0.153, 59.150], [0.675, 56.537], [0.945, 60.717], [1.430, 60.235], [1.907, 63.670]],
    ],
    box: [23.0, 3.5, 46.5, 77.5],
  },
  // 19. Centaurus (센타우루스자리)
  {
    code: 'Cen',
    nameEn: 'Centaurus',
    nameKo: '센타우루스자리',
    raCenterHours: 13.4,
    decCenterDeg: -48.0,
    chains: [
      [[14.660, -60.834], [14.064, -60.373], [13.665, -53.466], [12.692, -48.960], [12.140, -50.722], [11.612, -63.019]],
      [[13.665, -53.466], [13.926, -47.288], [14.592, -42.158], [14.986, -42.104]],
      [[13.926, -47.288], [14.111, -36.370], [13.340, -36.712], [12.692, -48.960]],
    ],
    box: [11.1, 15.0, -64.5, -30.0],
  },
  // 20. Cepheus (세페우스자리)
  {
    code: 'Cep',
    nameEn: 'Cepheus',
    nameKo: '세페우스자리',
    raCenterHours: 22.2,
    decCenterDeg: 67.0,
    chains: [
      [[21.310, 62.585], [21.478, 70.561], [23.656, 77.632], [22.828, 66.200], [22.181, 58.201], [21.310, 62.585]],
      [[21.478, 70.561], [22.828, 66.200]],
    ],
    box: [20.0, 8.0, 53.5, 86.4],
  },
  // 21. Cetus (고래자리)
  {
    code: 'Cet',
    nameEn: 'Cetus',
    nameKo: '고래자리',
    raCenterHours: 1.7,
    decCenterDeg: -8.0,
    chains: [
      [[3.038, 4.090], [2.722, 3.236], [2.492, 8.460], [2.715, 10.114], [3.059, 8.907], [3.038, 4.090]],
      [[2.722, 3.236], [2.322, -2.978], [1.858, -10.335], [1.390, -8.183], [0.727, -17.987], [0.323, -8.824], [1.143, -10.182], [1.390, -8.183]],
    ],
    box: [23.9, 3.4, -25.0, 10.5],
  },
  // 22. Chamaeleon (카멜레온자리)
  {
    code: 'Cha',
    nameEn: 'Chamaeleon',
    nameKo: '카멜레온자리',
    raCenterHours: 10.7,
    decCenterDeg: -79.0,
    chains: [
      [[8.309, -76.920], [10.596, -78.608], [12.306, -79.312], [10.764, -80.541], [8.309, -76.920]],
    ],
    box: [7.5, 13.9, -83.0, -75.0],
  },
  // 23. Circinus (컴퍼스자리)
  {
    code: 'Cir',
    nameEn: 'Circinus',
    nameKo: '컴퍼스자리',
    raCenterHours: 14.9,
    decCenterDeg: -63.0,
    chains: [
      [[15.292, -58.801], [14.708, -64.975], [15.390, -66.316]],
    ],
    box: [13.6, 15.5, -70.5, -54.5],
  },
  // 24. Columba (비둘기자리)
  {
    code: 'Col',
    nameEn: 'Columba',
    nameKo: '비둘기자리',
    raCenterHours: 5.85,
    decCenterDeg: -35.5,
    chains: [
      [[5.293, -35.816], [5.661, -34.074], [5.849, -35.768], [6.369, -33.436]],
      [[5.849, -35.768], [5.993, -42.815]],
    ],
    box: [5.0, 6.7, -43.0, -27.0],
  },
  // 25. Coma Berenices (머리털자리)
  {
    code: 'Com',
    nameEn: 'Coma Berenices',
    nameKo: '머리털자리',
    raCenterHours: 12.8,
    decCenterDeg: 23.0,
    chains: [
      [[13.167, 17.529], [13.197, 27.878], [12.449, 28.268]],
    ],
    box: [11.9, 13.6, 14.0, 33.5],
  },
  // 26. Corona Australis (남쪽왕관자리)
  {
    code: 'CrA',
    nameEn: 'Corona Australis',
    nameKo: '남쪽왕관자리',
    raCenterHours: 18.9,
    decCenterDeg: -40.0,
    chains: [
      [[18.565, -39.704], [18.979, -37.107], [19.108, -37.063], [19.167, -37.904], [19.167, -39.507], [19.110, -40.499], [18.867, -42.306]],
    ],
    box: [17.9, 19.3, -45.5, -37.0],
  },
  // 27. Corona Borealis (북쪽왕관자리)
  {
    code: 'CrB',
    nameEn: 'Corona Borealis',
    nameKo: '북쪽왕관자리',
    raCenterHours: 15.7,
    decCenterDeg: 29.0,
    chains: [
      [[15.549, 31.359], [15.464, 29.106], [15.578, 26.715], [15.712, 26.296], [15.849, 26.068], [15.959, 26.878], [16.017, 29.851]],
    ],
    box: [15.2, 16.4, 25.5, 39.5],
  },
  // 28. Corvus (까마귀자리)
  {
    code: 'Crv',
    nameEn: 'Corvus',
    nameKo: '까마귀자리',
    raCenterHours: 12.35,
    decCenterDeg: -18.5,
    chains: [
      [[12.263, -17.542], [12.498, -16.515], [12.573, -23.397], [12.169, -22.620], [12.263, -17.542]],
      [[12.169, -22.620], [12.140, -24.729]],
    ],
    box: [11.9, 12.9, -25.5, -11.5],
  },
  // 29. Crater (컵자리)
  {
    code: 'Crt',
    nameEn: 'Crater',
    nameKo: '컵자리',
    raCenterHours: 11.4,
    decCenterDeg: -15.5,
    chains: [
      [[10.996, -18.299], [11.194, -22.826], [11.415, -17.684], [10.996, -18.299]],
      [[11.415, -17.684], [11.322, -14.779], [11.662, -9.803], [11.938, -17.150], [11.415, -17.684]],
    ],
    box: [10.8, 12.0, -25.5, -6.5],
  },
  // 30. Crux (남십자자리)
  {
    code: 'Cru',
    nameEn: 'Crux',
    nameKo: '남십자자리',
    raCenterHours: 12.5,
    decCenterDeg: -60.0,
    chains: [
      [[12.443, -63.099], [12.519, -57.113]],
      [[12.795, -59.689], [12.252, -58.749]],
    ],
    box: [11.9, 12.95, -64.5, -55.5],
  },
  // 31. Cygnus (백조자리)
  {
    code: 'Cyg',
    nameEn: 'Cygnus',
    nameKo: '백조자리',
    raCenterHours: 20.4,
    decCenterDeg: 40.0,
    chains: [
      [[20.691, 45.280], [20.370, 40.257], [19.938, 35.083], [19.512, 27.960]],
      [[19.496, 51.729], [19.749, 45.131], [20.370, 40.257], [20.770, 33.970], [21.216, 30.227]],
    ],
    box: [19.1, 22.0, 27.5, 61.0],
  },
  // 32. Delphinus (돌고래자리)
  {
    code: 'Del',
    nameEn: 'Delphinus',
    nameKo: '돌고래자리',
    raCenterHours: 20.65,
    decCenterDeg: 14.0,
    chains: [
      [[20.555, 11.303], [20.626, 14.595], [20.660, 15.912], [20.777, 16.124], [20.725, 15.075], [20.626, 14.595]],
    ],
    box: [20.2, 21.1, 2.5, 21.0],
  },
  // 33. Dorado (황새치자리)
  {
    code: 'Dor',
    nameEn: 'Dorado',
    nameKo: '황새치자리',
    raCenterHours: 5.1,
    decCenterDeg: -60.0,
    chains: [
      [[4.267, -51.487], [4.567, -55.045], [5.092, -57.473], [5.560, -62.489], [5.744, -65.736]],
      [[4.567, -55.045], [5.560, -62.489]],
    ],
    box: [3.8, 6.6, -70.0, -48.5],
  },
  // 34. Draco (용자리)
  {
    code: 'Dra',
    nameEn: 'Draco',
    nameKo: '용자리',
    raCenterHours: 17.0,
    decCenterDeg: 61.0,
    chains: [
      [[17.943, 51.489], [17.507, 52.301], [17.537, 55.173], [17.926, 56.873], [17.943, 51.489]],
      [[17.926, 56.873], [19.209, 67.662], [19.803, 70.268], [18.351, 72.733], [17.147, 65.715], [16.400, 61.514], [15.415, 58.966], [14.073, 64.376], [12.558, 69.788], [11.524, 69.331]],
    ],
    box: [9.3, 21.0, 47.5, 86.0],
  },
  // 35. Equuleus (조랑말자리)
  {
    code: 'Equ',
    nameEn: 'Equuleus',
    nameKo: '조랑말자리',
    raCenterHours: 21.25,
    decCenterDeg: 7.5,
    chains: [
      [[21.264, 5.248], [21.241, 10.007], [21.309, 6.811], [21.264, 5.248]],
    ],
    box: [20.9, 21.45, 2.5, 13.0],
  },
  // 36. Eridanus (에리다누스자리)
  {
    code: 'Eri',
    nameEn: 'Eridanus',
    nameKo: '에리다누스자리',
    raCenterHours: 3.5,
    decCenterDeg: -22.0,
    chains: [
      [[5.131, -5.086], [4.629, -8.596], [3.967, -13.509], [3.721, -23.249], [4.597, -30.563], [4.306, -33.796], [3.717, -37.620], [2.971, -40.305], [2.275, -51.512], [1.629, -57.237]],
      [[3.967, -13.509], [3.704, -9.763], [3.549, -9.458], [3.081, -8.986], [2.942, -8.898], [2.765, -13.859], [3.721, -23.249]],
    ],
    box: [1.4, 5.15, -58.0, 0.0],
  },
  // 37. Fornax (화로자리)
  {
    code: 'For',
    nameEn: 'Fornax',
    nameKo: '화로자리',
    raCenterHours: 2.8,
    decCenterDeg: -31.0,
    chains: [
      [[3.201, -28.988], [2.818, -32.406], [2.002, -29.297]],
    ],
    box: [1.75, 3.85, -39.5, -23.5],
  },
  // 38. Gemini (쌍둥이자리)
  {
    code: 'Gem',
    nameEn: 'Gemini',
    nameKo: '쌍둥이자리',
    raCenterHours: 7.1,
    decCenterDeg: 24.0,
    chains: [
      [[7.577, 31.888], [6.732, 25.131], [6.383, 22.514], [6.248, 22.507]],
      [[7.577, 31.888], [7.755, 28.026], [7.335, 21.982], [7.068, 20.570], [6.629, 16.399]],
      [[7.335, 21.982], [6.754, 12.896]],
    ],
    box: [6.0, 8.1, 10.0, 35.5],
  },
  // 39. Grus (두루미자리)
  {
    code: 'Gru',
    nameEn: 'Grus',
    nameKo: '두루미자리',
    raCenterHours: 22.4,
    decCenterDeg: -45.0,
    chains: [
      [[21.899, -37.365], [22.488, -43.496], [22.711, -46.885], [22.760, -51.317], [23.166, -45.247], [22.711, -46.885]],
      [[22.085, -46.961], [22.488, -43.496]],
    ],
    box: [21.4, 23.4, -56.5, -36.5],
  },
  // 40. Hercules (헤르쿨레스자리)
  {
    code: 'Her',
    nameEn: 'Hercules',
    nameKo: '헤르쿨레스자리',
    raCenterHours: 16.9,
    decCenterDeg: 30.0,
    chains: [
      [[16.688, 31.603], [16.715, 38.922], [17.251, 36.809], [17.005, 30.926], [16.688, 31.603]],
      [[16.688, 31.603], [16.504, 21.490], [16.365, 19.153]],
      [[17.005, 30.926], [17.251, 24.839], [17.244, 14.390]],
      [[16.715, 38.922], [16.329, 46.313], [16.146, 44.935]],
      [[17.251, 36.809], [17.938, 37.251], [18.125, 28.762]],
    ],
    box: [15.8, 18.9, 4.0, 51.0],
  },
  // 41. Horologium (시계자리)
  {
    code: 'Hor',
    nameEn: 'Horologium',
    nameKo: '시계자리',
    raCenterHours: 3.3,
    decCenterDeg: -53.0,
    chains: [
      [[4.233, -42.294], [3.787, -47.065], [3.060, -59.738], [2.981, -64.131]],
    ],
    box: [2.2, 4.3, -67.0, -39.5],
  },
  // 42. Hydra (바다뱀자리)
  {
    code: 'Hya',
    nameEn: 'Hydra',
    nameKo: '바다뱀자리',
    raCenterHours: 10.5,
    decCenterDeg: -18.0,
    chains: [
      [[8.628, 5.704], [8.646, 3.341], [8.726, 3.399], [8.923, 5.946], [8.780, 6.419], [8.628, 5.704]],
      [[8.923, 5.946], [9.239, 2.314], [9.460, -8.659], [9.847, -14.847], [10.176, -12.354], [10.493, -16.836], [10.827, -16.194], [11.550, -31.858], [11.883, -33.908], [13.316, -23.172], [14.106, -26.682]],
    ],
    box: [8.1, 15.0, -35.5, 6.8],
  },
  // 43. Hydrus (물뱀자리)
  {
    code: 'Hyi',
    nameEn: 'Hydrus',
    nameKo: '물뱀자리',
    raCenterHours: 2.2,
    decCenterDeg: -70.0,
    chains: [
      [[1.979, -61.570], [3.787, -74.239], [0.429, -77.254], [1.979, -61.570]],
    ],
    box: [0.1, 4.5, -82.0, -58.0],
  },
  // 44. Indus (인디언자리)
  {
    code: 'Ind',
    nameEn: 'Indus',
    nameKo: '인디언자리',
    raCenterHours: 21.2,
    decCenterDeg: -55.0,
    chains: [
      [[20.626, -47.292], [21.331, -53.449], [20.914, -58.454], [20.626, -47.292]],
    ],
    box: [20.4, 23.4, -74.5, -45.0],
  },
  // 45. Lacerta (도마뱀자리)
  {
    code: 'Lac',
    nameEn: 'Lacerta',
    nameKo: '도마뱀자리',
    raCenterHours: 22.5,
    decCenterDeg: 46.0,
    chains: [
      [[22.522, 50.282], [22.409, 52.229], [22.425, 49.476], [22.487, 47.707], [22.350, 46.537], [22.266, 37.749]],
    ],
    box: [21.9, 22.9, 35.0, 57.0],
  },
  // 46. Leo (사자자리)
  {
    code: 'Leo',
    nameEn: 'Leo',
    nameKo: '사자자리',
    raCenterHours: 10.8,
    decCenterDeg: 17.5,
    chains: [
      [[9.764, 23.774], [9.948, 26.007], [10.278, 23.417], [10.333, 19.841], [10.122, 16.763], [10.140, 11.967]],
      [[10.140, 11.967], [11.237, 15.430], [11.818, 14.572], [11.235, 20.524], [10.333, 19.841]],
    ],
    box: [9.3, 11.95, -6.5, 33.0],
  },
  // 47. Leo Minor (작은사자자리)
  {
    code: 'LMi',
    nameEn: 'Leo Minor',
    nameKo: '작은사자자리',
    raCenterHours: 10.35,
    decCenterDeg: 34.0,
    chains: [
      [[9.570, 36.398], [10.465, 36.707], [10.892, 34.215], [10.723, 30.682], [10.465, 36.707]],
    ],
    box: [9.3, 11.1, 23.0, 41.5],
  },
  // 48. Lepus (토끼자리)
  {
    code: 'Lep',
    nameEn: 'Lepus',
    nameKo: '토끼자리',
    raCenterHours: 5.55,
    decCenterDeg: -19.0,
    chains: [
      [[5.216, -16.205], [5.545, -17.822], [5.471, -20.759], [5.091, -22.371], [5.216, -16.205]],
      [[5.545, -17.822], [5.783, -14.822], [5.949, -14.168], [5.855, -20.879], [5.471, -20.759]],
    ],
    box: [4.9, 6.1, -27.0, -10.8],
  },
  // 49. Libra (천칭자리)
  {
    code: 'Lib',
    nameEn: 'Libra',
    nameKo: '천칭자리',
    raCenterHours: 15.2,
    decCenterDeg: -15.0,
    chains: [
      [[14.848, -16.042], [15.283, -9.383], [15.592, -14.790], [15.068, -25.282], [14.848, -16.042]],
      [[15.068, -25.282], [15.683, -28.135]],
    ],
    box: [14.3, 16.0, -30.0, 0.0],
  },
  // 50. Lupus (이리자리)
  {
    code: 'Lup',
    nameEn: 'Lupus',
    nameKo: '이리자리',
    raCenterHours: 15.25,
    decCenterDeg: -42.5,
    chains: [
      [[14.699, -47.388], [14.976, -43.134], [15.356, -40.648], [15.586, -41.167], [15.948, -38.397], [16.001, -36.802], [15.586, -41.167]],
      [[15.356, -40.648], [15.309, -44.689], [14.976, -43.134]],
    ],
    box: [14.2, 16.1, -55.0, -29.5],
  },
  // 51. Lynx (살쾼이자리)
  {
    code: 'Lyn',
    nameEn: 'Lynx',
    nameKo: '살쾼이자리',
    raCenterHours: 8.1,
    decCenterDeg: 47.0,
    chains: [
      [[6.298, 59.011], [6.955, 58.423], [7.434, 49.212], [8.046, 51.535], [8.382, 43.188], [9.017, 41.783], [9.314, 34.393]],
    ],
    box: [6.1, 9.7, 33.0, 62.0],
  },
  // 52. Lyra (거문고자리)
  {
    code: 'Lyr',
    nameEn: 'Lyra',
    nameKo: '거문고자리',
    raCenterHours: 18.8,
    decCenterDeg: 36.5,
    chains: [
      [[18.616, 38.784], [18.739, 39.668], [18.746, 37.605], [18.616, 38.784]],
      [[18.746, 37.605], [18.835, 33.363], [18.982, 32.690], [18.908, 36.898], [18.746, 37.605]],
    ],
    box: [18.2, 19.4, 25.5, 47.5],
  },
  // 53. Mensa (테이블산자리)
  {
    code: 'Men',
    nameEn: 'Mensa',
    nameKo: '테이블산자리',
    raCenterHours: 5.5,
    decCenterDeg: -77.5,
    chains: [
      [[6.171, -74.754], [5.545, -76.341], [5.045, -75.276], [4.756, -80.785]],
    ],
    box: [3.4, 7.6, -85.0, -70.5],
  },
  // 54. Microscopium (현미경자리)
  {
    code: 'Mic',
    nameEn: 'Microscopium',
    nameKo: '현미경자리',
    raCenterHours: 20.95,
    decCenterDeg: -36.0,
    chains: [
      [[20.833, -33.780], [21.022, -32.258], [21.299, -32.172], [21.124, -40.622], [20.833, -33.780]],
    ],
    box: [20.4, 21.4, -45.0, -27.5],
  },
  // 55. Monoceros (외뿔소자리)
  {
    code: 'Mon',
    nameEn: 'Monoceros',
    nameKo: '외뿔소자리',
    raCenterHours: 7.0,
    decCenterDeg: -3.0,
    chains: [
      [[6.249, -6.275], [6.481, -7.033], [7.187, -0.493], [6.753, 9.896]],
      [[6.481, -7.033], [7.688, -9.551], [8.143, -2.984], [7.187, -0.493]],
    ],
    box: [5.9, 8.2, -11.0, 12.0],
  },
  // 56. Musca (파리자리)
  {
    code: 'Mus',
    nameEn: 'Musca',
    nameKo: '파리자리',
    raCenterHours: 12.55,
    decCenterDeg: -70.0,
    chains: [
      [[11.787, -66.729], [12.290, -67.961], [12.620, -69.136], [12.771, -68.108], [13.038, -71.549], [12.541, -72.133], [12.620, -69.136]],
    ],
    box: [11.3, 13.8, -75.5, -64.5],
  },
  // 57. Norma (직각자자리)
  {
    code: 'Nor',
    nameEn: 'Norma',
    nameKo: '직각자자리',
    raCenterHours: 16.05,
    decCenterDeg: -51.0,
    chains: [
      [[16.331, -50.156], [16.055, -49.230], [16.453, -47.555], [16.120, -45.039]],
    ],
    box: [15.5, 16.6, -60.0, -42.0],
  },
  // 58. Octans (팔분의자리)
  {
    code: 'Oct',
    nameEn: 'Octans',
    nameKo: '팔분의자리',
    raCenterHours: 22.0,
    decCenterDeg: -82.0,
    chains: [
      [[21.691, -77.390], [22.768, -81.382], [14.449, -83.668], [21.691, -77.390]],
    ],
    box: [0.0, 24.0, -89.5, -74.5],
  },
  // 59. Ophiuchus (뱀주인자리)
  {
    code: 'Oph',
    nameEn: 'Ophiuchus',
    nameKo: '뱀주인자리',
    raCenterHours: 17.1,
    decCenterDeg: -3.0,
    chains: [
      [[17.582, 12.560], [17.724, 4.567], [17.173, -15.725], [16.619, -10.567], [16.239, -3.694], [16.961, 9.375], [17.582, 12.560]],
      [[17.173, -15.725], [17.367, -24.999]],
    ],
    box: [16.0, 18.7, -30.0, 14.5],
  },
  // 60. Orion (오리온자리)
  {
    code: 'Ori',
    nameEn: 'Orion',
    nameKo: '오리온자리',
    raCenterHours: 5.55,
    decCenterDeg: 2.0,
    chains: [
      [[5.919, 7.407], [5.586, 9.934], [5.419, 6.350], [5.919, 7.407]],
      [[5.919, 7.407], [5.679, -1.943], [5.603, -1.202], [5.533, -0.299], [5.419, 6.350]],
      [[5.679, -1.943], [5.796, -9.669], [5.242, -8.202], [5.533, -0.299]],
      [[5.419, 6.350], [4.831, 6.961], [4.853, 8.900], [4.817, 14.251]],
      [[5.919, 7.407], [6.033, 14.768], [6.199, 14.209]],
      [[5.603, -1.202], [5.590, -5.910]],
    ],
    box: [4.7, 6.4, -11.5, 22.5],
  },
  // 61. Pavo (공작자리)
  {
    code: 'Pav',
    nameEn: 'Pavo',
    nameKo: '공작자리',
    raCenterHours: 19.6,
    decCenterDeg: -64.0,
    chains: [
      [[20.427, -56.735], [20.749, -66.203], [20.145, -66.182], [18.884, -62.187], [18.718, -71.428]],
      [[20.749, -66.203], [21.440, -65.368]],
    ],
    box: [17.7, 21.5, -75.0, -56.5],
  },
  // 62. Pegasus (페가수스자리)
  {
    code: 'Peg',
    nameEn: 'Pegasus',
    nameKo: '페가수스자리',
    raCenterHours: 22.8,
    decCenterDeg: 20.0,
    chains: [
      [[0.140, 29.090], [23.063, 28.083], [23.079, 15.205], [0.220, 15.184], [0.140, 29.090]],
      [[23.063, 28.083], [22.717, 30.221], [22.167, 33.179]],
      [[23.063, 28.083], [22.833, 24.602], [22.117, 25.345]],
      [[23.079, 15.205], [22.691, 10.831], [22.170, 6.198], [21.736, 9.875]],
    ],
    box: [21.1, 0.3, 2.0, 36.5],
  },
  // 63. Perseus (페르세우스자리)
  {
    code: 'Per',
    nameEn: 'Perseus',
    nameKo: '페르세우스자리',
    raCenterHours: 3.5,
    decCenterDeg: 45.0,
    chains: [
      [[2.844, 55.896], [3.079, 53.506], [3.405, 49.861], [3.715, 47.788], [3.964, 40.010], [3.902, 31.884]],
      [[3.079, 53.506], [2.787, 50.068], [3.136, 40.956], [3.086, 38.840], [3.405, 49.861]],
      [[3.405, 49.861], [4.132, 47.712]],
    ],
    box: [1.5, 4.8, 31.0, 59.0],
  },
  // 64. Phoenix (봉황자리)
  {
    code: 'Phe',
    nameEn: 'Phoenix',
    nameKo: '봉황자리',
    raCenterHours: 0.75,
    decCenterDeg: -46.0,
    chains: [
      [[0.438, -42.306], [1.473, -43.318], [1.102, -46.718], [1.140, -55.245], [0.156, -45.747], [0.438, -42.306]],
      [[0.438, -42.306], [1.102, -46.718]],
    ],
    box: [23.4, 2.4, -58.0, -39.0],
  },
  // 65. Pictor (화가자리)
  {
    code: 'Pic',
    nameEn: 'Pictor',
    nameKo: '화가자리',
    raCenterHours: 5.8,
    decCenterDeg: -53.0,
    chains: [
      [[6.803, -61.941], [5.830, -56.166], [4.863, -53.461]],
    ],
    box: [4.5, 6.9, -64.0, -43.0],
  },
  // 66. Pisces (물고기자리)
  {
    code: 'Psc',
    nameEn: 'Pisces',
    nameKo: '물고기자리',
    raCenterHours: 0.7,
    decCenterDeg: 11.0,
    chains: [
      [[1.298, 27.265], [1.191, 24.584], [1.525, 15.346], [1.756, 9.158], [2.034, 2.764], [1.049, 7.890], [0.812, 7.585], [23.989, 6.863]],
      [[23.989, 6.863], [23.666, 5.626], [23.286, 3.282], [23.031, 3.820], [23.466, 6.380], [23.989, 6.863]],
    ],
    box: [22.9, 2.1, -6.5, 33.5],
  },
  // 67. Piscis Austrinus (남쪽물고기자리)
  {
    code: 'PsA',
    nameEn: 'Piscis Austrinus',
    nameKo: '남쪽물고기자리',
    raCenterHours: 22.3,
    decCenterDeg: -30.5,
    chains: [
      [[22.961, -29.622], [22.680, -27.044], [21.746, -33.026], [22.140, -32.988], [22.525, -32.346], [22.961, -29.622]],
    ],
    box: [21.4, 23.1, -36.5, -25.0],
  },
  // 68. Puppis (고물자리)
  {
    code: 'Pup',
    nameEn: 'Puppis',
    nameKo: '고물자리',
    raCenterHours: 7.6,
    decCenterDeg: -33.0,
    chains: [
      [[6.833, -50.615], [7.286, -37.097], [7.822, -24.860], [8.126, -24.304], [8.002, -39.993], [7.488, -43.301], [6.833, -50.615]],
    ],
    box: [6.0, 8.5, -51.0, -11.5],
  },
  // 69. Pyxis (나침반자리)
  {
    code: 'Pyx',
    nameEn: 'Pyxis',
    nameKo: '나침반자리',
    raCenterHours: 8.85,
    decCenterDeg: -30.0,
    chains: [
      [[8.662, -35.309], [8.727, -33.186], [8.845, -27.710]],
    ],
    box: [8.4, 9.4, -37.5, -19.0],
  },
  // 70. Reticulum (그물자리)
  {
    code: 'Ret',
    nameEn: 'Reticulum',
    nameKo: '그물자리',
    raCenterHours: 4.0,
    decCenterDeg: -61.5,
    chains: [
      [[4.240, -62.474], [3.738, -64.807], [3.979, -61.400], [4.276, -59.302], [4.240, -62.474]],
    ],
    box: [3.2, 4.6, -67.0, -53.0],
  },
  // 71. Sagitta (화살자리)
  {
    code: 'Sge',
    nameEn: 'Sagitta',
    nameKo: '화살자리',
    raCenterHours: 19.75,
    decCenterDeg: 18.5,
    chains: [
      [[19.667, 18.014], [19.790, 18.534], [19.979, 19.492]],
      [[19.684, 17.476], [19.790, 18.534]],
    ],
    box: [19.0, 20.35, 16.0, 21.5],
  },
  // 72. Sagittarius (궁수자리)
  {
    code: 'Sgr',
    nameEn: 'Sagittarius',
    nameKo: '궁수자리',
    raCenterHours: 18.8,
    decCenterDeg: -28.0,
    chains: [
      [[18.097, -30.424], [18.350, -29.828], [18.403, -34.385], [19.044, -29.880], [18.760, -26.991], [18.350, -29.828]],
      [[18.350, -29.828], [18.466, -25.422], [18.760, -26.991], [18.921, -26.297], [19.116, -27.670], [19.044, -29.880]],
      [[18.921, -26.297], [19.163, -21.024], [19.362, -17.847]],
      [[18.466, -25.422], [18.402, -21.059]],
    ],
    box: [17.7, 20.5, -45.0, -12.0],
  },
  // 73. Scorpius (전갈자리)
  {
    code: 'Sco',
    nameEn: 'Scorpius',
    nameKo: '전갈자리',
    raCenterHours: 16.9,
    decCenterDeg: -31.0,
    chains: [
      [[16.091, -19.805], [16.005, -22.622], [15.981, -26.114], [15.948, -29.214]],
      [[16.005, -22.622], [16.353, -25.593], [16.490, -26.432], [16.598, -28.216], [16.836, -34.293], [16.864, -38.047], [16.901, -42.362], [17.203, -43.239], [17.622, -42.998], [17.793, -40.127], [17.708, -39.030], [17.560, -37.104], [17.513, -37.296]],
    ],
    box: [15.8, 17.95, -45.5, -8.0],
  },
  // 74. Sculptor (조각가자리)
  {
    code: 'Scl',
    nameEn: 'Sculptor',
    nameKo: '조각가자리',
    raCenterHours: 0.4,
    decCenterDeg: -32.0,
    chains: [
      [[0.977, -29.357], [23.815, -28.130], [23.549, -37.818], [23.961, -35.963]],
    ],
    box: [23.1, 1.8, -39.5, -25.0],
  },
  // 75. Scutum (방패자리)
  {
    code: 'Sct',
    nameEn: 'Scutum',
    nameKo: '방패자리',
    raCenterHours: 18.7,
    decCenterDeg: -9.5,
    chains: [
      [[18.587, -8.244], [18.786, -4.749], [18.649, -9.054], [18.487, -14.566], [18.587, -8.244]],
    ],
    box: [18.35, 19.0, -16.0, -4.0],
  },
  // 76. Serpens (뱀자리 - 머리 & 꼬리)
  {
    code: 'Ser',
    nameEn: 'Serpens',
    nameKo: '뱀자리',
    raCenterHours: 15.75,
    decCenterDeg: 8.0,
    chains: [
      // Serpens Caput (뱀 머리)
      [[15.738, 15.422], [15.815, 18.141], [15.969, 15.665], [15.738, 15.422], [15.581, 10.539], [15.738, 6.426], [15.847, 4.478], [15.827, -3.430], [16.239, -3.694]],
      // Serpens Cauda (뱀 꼬리)
      [[17.626, -15.400], [17.992, -9.774], [18.355, -2.899], [18.938, 4.204]],
    ],
    box: [15.15, 18.95, -16.0, 25.5],
  },
  // 77. Sextans (육분의자리)
  {
    code: 'Sex',
    nameEn: 'Sextans',
    nameKo: '육분의자리',
    raCenterHours: 10.2,
    decCenterDeg: -2.0,
    chains: [
      [[9.878, 7.641], [10.132, -0.372], [10.505, -2.728], [10.814, -8.898]],
    ],
    box: [9.65, 10.85, -11.5, 6.5],
  },
  // 78. Taurus (황소자리)
  {
    code: 'Tau',
    nameEn: 'Taurus',
    nameKo: '황소자리',
    raCenterHours: 4.6,
    decCenterDeg: 19.5,
    chains: [
      [[5.438, 28.608], [4.477, 19.180], [4.330, 15.627], [4.478, 15.871], [4.599, 16.509], [5.627, 21.143]],
      [[4.330, 15.627], [4.011, 12.490], [3.474, 9.029]],
      [[4.477, 19.180], [3.791, 24.105]],
    ],
    box: [3.35, 6.0, 0.0, 31.0],
  },
  // 79. Telescopium (망원경자리)
  {
    code: 'Tel',
    nameEn: 'Telescopium',
    nameKo: '망원경자리',
    raCenterHours: 19.2,
    decCenterDeg: -50.0,
    chains: [
      [[18.350, -45.971], [18.481, -45.968], [18.449, -49.071], [20.078, -52.879]],
    ],
    box: [18.15, 20.5, -57.0, -45.5],
  },
  // 80. Triangulum (삼각형자리)
  {
    code: 'Tri',
    nameEn: 'Triangulum',
    nameKo: '삼각형자리',
    raCenterHours: 2.1,
    decCenterDeg: 32.0,
    chains: [
      [[1.885, 29.579], [2.159, 34.987], [2.289, 33.847], [1.885, 29.579]],
    ],
    box: [1.5, 2.85, 25.5, 37.5],
  },
  // 81. Triangulum Australe (남쪽삼각형자리)
  {
    code: 'TrA',
    nameEn: 'Triangulum Australe',
    nameKo: '남쪽삼각형자리',
    raCenterHours: 16.05,
    decCenterDeg: -65.5,
    chains: [
      [[16.811, -69.028], [15.919, -63.430], [15.315, -68.679], [16.811, -69.028]],
    ],
    box: [14.9, 17.2, -70.5, -60.5],
  },
  // 82. Tucana (큰부리새자리)
  {
    code: 'Tuc',
    nameEn: 'Tucana',
    nameKo: '큰부리새자리',
    raCenterHours: 23.8,
    decCenterDeg: -64.0,
    chains: [
      [[22.280, -60.259], [23.286, -58.236], [0.525, -62.958], [0.338, -64.875], [23.959, -65.577], [22.487, -65.479], [22.280, -60.259]],
    ],
    box: [22.1, 1.4, -75.5, -56.5],
  },
  // 83. Ursa Major (큰곰자리)
  {
    code: 'UMa',
    nameEn: 'Ursa Major',
    nameKo: '큰곰자리',
    raCenterHours: 11.8,
    decCenterDeg: 55.0,
    chains: [
      [[11.062, 61.751], [11.031, 56.382], [11.897, 53.695], [12.257, 57.033], [11.062, 61.751]],
      [[12.257, 57.033], [12.900, 55.960], [13.399, 54.925], [13.792, 49.313]],
      [[11.062, 61.751], [9.849, 59.039], [8.504, 60.718], [9.548, 51.677], [11.031, 56.382]],
      [[9.548, 51.677], [8.986, 48.042], [9.060, 47.156]],
      [[11.897, 53.695], [11.161, 44.498], [10.372, 41.499], [10.285, 42.914]],
      [[11.161, 44.498], [11.308, 33.094], [11.381, 31.529]],
    ],
    box: [8.1, 14.5, 28.5, 73.0],
  },
  // 84. Ursa Minor (작은곰자리)
  {
    code: 'UMi',
    nameEn: 'Ursa Minor',
    nameKo: '작은곰자리',
    raCenterHours: 15.5,
    decCenterDeg: 77.5,
    chains: [
      [[2.530, 89.264], [17.537, 86.586], [16.766, 82.037], [15.734, 77.794], [14.845, 74.155], [15.345, 71.834], [16.292, 75.755], [15.734, 77.794]],
    ],
    boundary: [
      [13.05, 69.5],
      [14.25, 69.5],
      [14.25, 65.8],
      [16.05, 65.8],
      [16.05, 69.8],
      [17.35, 69.8],
      [17.35, 74.8],
      [17.90, 74.8],
      [17.90, 80.0],
      [18.60, 80.0],
      [18.60, 85.4],
      [20.55, 85.4],
      [20.55, 86.4],
      [23.50, 86.4],
      [23.50, 87.3],
      [1.60, 87.3],
      [1.60, 86.5],
      [5.80, 86.5],
      [5.80, 88.1],
      [8.50, 88.1],
      [8.50, 86.7],
      [13.05, 86.7],
    ],
  },
  // 85. Vela (돛자리)
  {
    code: 'Vel',
    nameEn: 'Vela',
    nameKo: '돛자리',
    raCenterHours: 9.5,
    decCenterDeg: -48.0,
    chains: [
      [[8.159, -47.337], [8.745, -54.709], [9.369, -55.011], [9.948, -54.568], [10.779, -49.420], [10.285, -42.122], [9.133, -43.433], [8.159, -47.337]],
    ],
    box: [8.0, 11.1, -57.0, -37.0],
  },
  // 86. Virgo (처녀자리)
  {
    code: 'Vir',
    nameEn: 'Virgo',
    nameKo: '처녀자리',
    raCenterHours: 13.1,
    decCenterDeg: -3.0,
    chains: [
      [[13.420, -11.161], [12.694, -1.449], [12.332, -0.667], [11.845, 1.765], [11.764, 6.529]],
      [[12.694, -1.449], [12.926, 3.397], [13.036, 10.959]],
      [[12.694, -1.449], [13.578, -0.596], [14.273, -6.001], [14.770, -5.658]],
      [[13.420, -11.161], [13.916, -9.883], [14.273, -6.001]],
    ],
    box: [11.5, 15.1, -22.5, 14.5],
  },
  // 87. Volans (날치자리)
  {
    code: 'Vol',
    nameEn: 'Volans',
    nameKo: '날치자리',
    raCenterHours: 7.9,
    decCenterDeg: -69.5,
    chains: [
      [[9.040, -66.396], [8.429, -66.137], [7.718, -72.608], [7.147, -70.499], [7.281, -67.957], [8.429, -66.137]],
    ],
    box: [6.6, 9.1, -75.5, -64.0],
  },
  // 88. Vulpecula (여우자리)
  {
    code: 'Vul',
    nameEn: 'Vulpecula',
    nameKo: '여우자리',
    raCenterHours: 20.1,
    decCenterDeg: 24.5,
    chains: [
      [[19.478, 24.665], [19.938, 24.080], [20.232, 27.754], [20.920, 28.054]],
    ],
    box: [18.95, 21.5, 19.5, 29.0],
  },
];

/**
 * Build the complete 88 IAU Constellations data with subdivided spherical stick lines
 * and official equatorial boundaries.
 */
export const CONSTELLATION_DATA: ConstellationStick[] = RAW_88_CONSTELLATIONS.map((raw) => {
  const lines: Array<[[number, number], [number, number]]> = [];
  raw.chains.forEach((chain) => {
    for (let i = 0; i < chain.length - 1; i++) {
      const [ra1H, dec1] = chain[i];
      const [ra2H, dec2] = chain[i + 1];
      // Subdivide long stick segments into smaller segments so spherical projections and PDF clipping
      // never lose or break a constellation line near viewport edges.
      const subPts = subdivideStickSegment([ra1H * 15, dec1], [ra2H * 15, dec2], 4);
      for (let s = 0; s < subPts.length - 1; s++) {
        lines.push([subPts[s], subPts[s + 1]]);
      }
    }
  });

  const [raMin, raMax, decMin, decMax] = raw.box || [
    (raw.raCenterHours - 0.8 + 24) % 24,
    (raw.raCenterHours + 0.8) % 24,
    Math.max(-89, raw.decCenterDeg - 8),
    Math.min(89, raw.decCenterDeg + 8),
  ];

  return {
    constellation: raw.code,
    nameEn: raw.nameEn,
    nameKo: raw.nameKo,
    raCenterHours: raw.raCenterHours,
    decCenterDeg: raw.decCenterDeg,
    lines,
    boundaryPolygon: raw.boundary
      ? buildSteppedEquatorialBoundary(raw.boundary)
      : buildEquatorialBoundaryBox(raMin, raMax, decMin, decMax, 8),
  };
});

/**
 * Automatically extract all unique star vertices across all 88 constellations
 * so that every stick-figure joint has a real star dot even in fainter constellations.
 */
export function buildConstellationVertexStars(existingStars: StarRecord[]): StarRecord[] {
  const extra: StarRecord[] = [];
  let counter = 1;

  RAW_88_CONSTELLATIONS.forEach((raw) => {
    raw.chains.forEach((chain) => {
      chain.forEach(([raH, dec]) => {
        const raDeg = Number((raH * 15).toFixed(4));
        // Check if an existing named/Bayer star is within 0.25 deg of this vertex
        const alreadyExists =
          existingStars.some(
            (st) =>
              Math.abs(st.decDeg - dec) < 0.25 &&
              Math.min(Math.abs(st.raDeg - raDeg), 360 - Math.abs(st.raDeg - raDeg)) < 0.35
          ) ||
          extra.some(
            (st) =>
              Math.abs(st.decDeg - dec) < 0.25 &&
              Math.min(Math.abs(st.raDeg - raDeg), 360 - Math.abs(st.raDeg - raDeg)) < 0.35
          );

        if (!alreadyExists) {
          extra.push({
            id: `${raw.code}-vtx-${counter++}`,
            constellation: raw.code,
            raHours: Number(raH.toFixed(4)),
            raDeg,
            decDeg: Number(dec.toFixed(4)),
            mag: 3.65,
            bv: 0.45,
          });
        }
      });
    });
  });

  return extra;
}
