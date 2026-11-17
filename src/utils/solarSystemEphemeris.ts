import { SolarSystemBodyRecord } from '../types/astronomy';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const AU_KM = 149597870.7;

function normDeg(d: number): number {
  const res = d % 360;
  return res < 0 ? res + 360 : res;
}

function solveKepler(meanAnomalyDeg: number, e: number): number {
  const M = normDeg(meanAnomalyDeg) * DEG2RAD;
  let E = M + e * Math.sin(M) * (1.0 + e * Math.cos(M));
  for (let iter = 0; iter < 6; iter++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

/**
 * Convert observationDateTime string to days since J2000.0 (2000-01-01 12:00 TT)
 */
export function dateTimeToDaysSinceJ2000(dateTimeStr?: string): number {
  const parsed = dateTimeStr ? new Date(dateTimeStr) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const jd = date.getTime() / 86400000 + 2440587.5;
  return jd - 2451545.0;
}

interface OrbitalElements {
  id: string;
  kind: SolarSystemBodyRecord['kind'];
  nameKo: string;
  nameEn: string;
  /** Longitude of ascending node (deg) and rate (deg/day) */
  N0: number;
  Nd: number;
  /** Inclination to ecliptic (deg) and rate */
  i0: number;
  idRate: number;
  /** Argument of perihelion (deg) and rate */
  w0: number;
  wd: number;
  /** Semi-major axis (AU) */
  a: number;
  /** Eccentricity and rate */
  e0: number;
  ed: number;
  /** Mean anomaly at J2000.0 (deg) and daily motion (deg/day) */
  M0: number;
  Md: number;
  /** Absolute visual magnitude H (for planets/asteroids) */
  H: number;
  /** Equatorial radius in km (for angular diameter) */
  radiusKm: number;
  color: string;
  hasRings?: boolean;
  descriptionKo: string;
}

// Keplerian J2000 elements (Paul Schlyter / JPL Standish J2000 mean elements + asteroid osculating elements)
const HELIOCENTRIC_BODIES: OrbitalElements[] = [
  // Major Planets
  {
    id: 'mercury',
    kind: 'planet',
    nameKo: '수성',
    nameEn: 'Mercury',
    N0: 48.3313,
    Nd: 3.24587e-5,
    i0: 7.0047,
    idRate: 5.00e-8,
    w0: 29.1241,
    wd: 1.01444e-5,
    a: 0.387098,
    e0: 0.205635,
    ed: 5.59e-10,
    M0: 168.6562,
    Md: 4.0923344368,
    H: -0.42,
    radiusKm: 2439.7,
    color: '#D1D5DB',
    descriptionKo: '태양계 가장 안쪽의 내행성. 일출 직전 동쪽 하늘 또는 일몰 직후 서쪽 저고도에서 관측됩니다.',
  },
  {
    id: 'venus',
    kind: 'planet',
    nameKo: '금성',
    nameEn: 'Venus',
    N0: 76.6799,
    Nd: 2.46590e-5,
    i0: 3.3946,
    idRate: 2.75e-8,
    w0: 54.8910,
    wd: 1.38374e-5,
    a: 0.723330,
    e0: 0.006773,
    ed: -1.302e-9,
    M0: 48.0052,
    Md: 1.6021302244,
    H: -4.40,
    radiusKm: 6051.8,
    color: '#FEF3C7',
    descriptionKo: '밤하늘에서 달 다음으로 밝은 행성(샛별). 소형 망원경으로도 위상 변화를 뚜렷이 관측할 수 있습니다.',
  },
  {
    id: 'mars',
    kind: 'planet',
    nameKo: '화성',
    nameEn: 'Mars',
    N0: 49.5574,
    Nd: 2.11081e-5,
    i0: 1.8497,
    idRate: -1.78e-8,
    w0: 286.5016,
    wd: 2.92961e-5,
    a: 1.523688,
    e0: 0.093405,
    ed: 2.516e-9,
    M0: 18.6021,
    Md: 0.5240207766,
    H: -1.52,
    radiusKm: 3389.5,
    color: '#FB923C',
    descriptionKo: '붉은 산화철 표면과 극관, 어두운 지형이 특징인 외행성입니다.',
  },
  {
    id: 'jupiter',
    kind: 'planet',
    nameKo: '목성',
    nameEn: 'Jupiter',
    N0: 100.4542,
    Nd: 2.76854e-5,
    i0: 1.3030,
    idRate: -1.557e-7,
    w0: 273.8777,
    wd: 1.64505e-5,
    a: 5.20256,
    e0: 0.048498,
    ed: 4.469e-9,
    M0: 19.8950,
    Md: 0.0830853001,
    H: -9.40,
    radiusKm: 69911,
    color: '#FDE68A',
    descriptionKo: '태양계 최대 행성. 쌍안경이나 소구경 망원경으로도 적도 줄무늬와 4대 갈릴레이 위성(이오·유로파·가니메데·칼리스토)을 볼 수 있습니다.',
  },
  {
    id: 'saturn',
    kind: 'planet',
    nameKo: '토성',
    nameEn: 'Saturn',
    N0: 113.6634,
    Nd: 2.38980e-5,
    i0: 2.4886,
    idRate: -1.081e-7,
    w0: 339.3939,
    wd: 2.97661e-5,
    a: 9.55475,
    e0: 0.055546,
    ed: -9.499e-9,
    M0: 316.9670,
    Md: 0.0334442282,
    H: -8.88,
    radiusKm: 58232,
    color: '#FCD34D',
    hasRings: true,
    descriptionKo: '장엄한 고리 구조와 가장 큰 위성 타이탄(Titan)을 비롯한 다수의 위성을 거느린 행성입니다.',
  },
  {
    id: 'uranus',
    kind: 'planet',
    nameKo: '천왕성',
    nameEn: 'Uranus',
    N0: 74.0005,
    Nd: 1.3978e-5,
    i0: 0.7733,
    idRate: 1.9e-8,
    w0: 96.6612,
    wd: 3.0565e-5,
    a: 19.18171,
    e0: 0.047318,
    ed: 7.45e-9,
    M0: 142.5905,
    Md: 0.011725806,
    H: -7.19,
    radiusKm: 25362,
    color: '#99F6E4',
    descriptionKo: '청록색 원반으로 관측되는 얼음 거대 행성. 약 5.7등급으로 어두운 밤하늘에서는 맨눈으로도 희미하게 확인 가능합니다.',
  },
  {
    id: 'neptune',
    kind: 'planet',
    nameKo: '해왕성',
    nameEn: 'Neptune',
    N0: 131.7806,
    Nd: 3.0173e-5,
    i0: 1.7700,
    idRate: -2.55e-7,
    w0: 272.8461,
    wd: -6.027e-6,
    a: 30.05826,
    e0: 0.008606,
    ed: 2.15e-9,
    M0: 260.2471,
    Md: 0.005995147,
    H: -6.87,
    radiusKm: 24622,
    color: '#60A5FA',
    descriptionKo: '태양계 8번째 푸른 얼음 거대 행성. 약 7.8등급으로 쌍안경 또는 소형 망원경으로 관측합니다.',
  },
  // Dwarf Planets
  {
    id: 'pluto',
    kind: 'dwarf_planet',
    nameKo: '명왕성',
    nameEn: 'Pluto',
    N0: 110.30347,
    Nd: 0,
    i0: 17.14175,
    idRate: 0,
    w0: 113.76329,
    wd: 0,
    a: 39.48168677,
    e0: 0.24880766,
    ed: 0,
    M0: 14.86205,
    Md: 0.0039747,
    H: -0.7,
    radiusKm: 1188.3,
    color: '#E5E7EB',
    descriptionKo: '카이퍼 벨트의 대표적인 왜행성(134340 Pluto). 중·대구경 망원경(약 14.3등급)에서 희미한 점광원으로 관측됩니다.',
  },
  {
    id: '1_ceres',
    kind: 'dwarf_planet',
    nameKo: '(1) 세레스',
    nameEn: '1 Ceres',
    N0: 80.3055,
    Nd: 0,
    i0: 10.5934,
    idRate: 0,
    w0: 73.5977,
    wd: 0,
    a: 2.7675,
    e0: 0.07582,
    ed: 0,
    M0: 105.7,
    Md: 0.21408,
    H: 3.34,
    radiusKm: 469.7,
    color: '#CBD5E1',
    descriptionKo: '소행성대 최대 천체이자 왜행성. 충 무렵 약 6.7~7.5등급까지 밝아져 쌍안경으로도 관측할 수 있습니다.',
  },
  // Bright Main-Belt & Near-Earth Asteroids
  {
    id: '4_vesta',
    kind: 'asteroid',
    nameKo: '(4) 베스타',
    nameEn: '4 Vesta',
    N0: 103.851,
    Nd: 0,
    i0: 7.1404,
    idRate: 0,
    w0: 151.198,
    wd: 0,
    a: 2.3618,
    e0: 0.08874,
    ed: 0,
    M0: 186.4,
    Md: 0.27154,
    H: 3.20,
    radiusKm: 262.7,
    color: '#E2E8F0',
    descriptionKo: '가장 밝은 소행성 중 하나로 충 부근에서 5.5~6.5등급에 달해 어두운 밤하늘에서 육안 확인도 가능합니다.',
  },
  {
    id: '2_pallas',
    kind: 'asteroid',
    nameKo: '(2) 팔라스',
    nameEn: '2 Pallas',
    N0: 173.080,
    Nd: 0,
    i0: 34.837,
    idRate: 0,
    w0: 310.049,
    wd: 0,
    a: 2.7730,
    e0: 0.2305,
    ed: 0,
    M0: 91.2,
    Md: 0.21346,
    H: 4.13,
    radiusKm: 256,
    color: '#CBD5E1',
    descriptionKo: '궤도 경사각(34.8°)이 매우 큰 소행성대의 거대 소행성입니다.',
  },
  {
    id: '3_juno',
    kind: 'asteroid',
    nameKo: '(3) 유노',
    nameEn: '3 Juno',
    N0: 169.852,
    Nd: 0,
    i0: 12.989,
    idRate: 0,
    w0: 248.41,
    wd: 0,
    a: 2.6691,
    e0: 0.2562,
    ed: 0,
    M0: 112.5,
    Md: 0.22599,
    H: 5.33,
    radiusKm: 123,
    color: '#CBD5E1',
    descriptionKo: '세 번째로 발견된 주요 소행성으로 충 시기 약 7.5~8.5등급으로 관측됩니다.',
  },
  {
    id: '6_hebe',
    kind: 'asteroid',
    nameKo: '(6) 헤베',
    nameEn: '6 Hebe',
    N0: 138.64,
    Nd: 0,
    i0: 14.748,
    idRate: 0,
    w0: 239.66,
    wd: 0,
    a: 2.4257,
    e0: 0.2019,
    ed: 0,
    M0: 215.1,
    Md: 0.26089,
    H: 5.71,
    radiusKm: 92.6,
    color: '#CBD5E1',
    descriptionKo: '소행성대에서 밝기가 높은 S형 주요 소행성입니다.',
  },
  {
    id: '7_iris',
    kind: 'asteroid',
    nameKo: '(7) 이리스',
    nameEn: '7 Iris',
    N0: 259.65,
    Nd: 0,
    i0: 5.522,
    idRate: 0,
    w0: 145.28,
    wd: 0,
    a: 2.3862,
    e0: 0.2312,
    ed: 0,
    M0: 32.8,
    Md: 0.26738,
    H: 5.51,
    radiusKm: 100,
    color: '#CBD5E1',
    descriptionKo: '반사율이 높아 충 시기 약 7등급대까지 밝아지는 소행성입니다.',
  },
  {
    id: '10_hygiea',
    kind: 'asteroid',
    nameKo: '(10) 히기에이아',
    nameEn: '10 Hygiea',
    N0: 283.20,
    Nd: 0,
    i0: 3.831,
    idRate: 0,
    w0: 312.32,
    wd: 0,
    a: 3.1415,
    e0: 0.1124,
    ed: 0,
    M0: 148.6,
    Md: 0.17710,
    H: 5.43,
    radiusKm: 217,
    color: '#94A3B8',
    descriptionKo: '소행성대에서 네 번째로 큰 탄소질 소행성입니다.',
  },
  {
    id: '15_eunomia',
    kind: 'asteroid',
    nameKo: '(15) 에우노미아',
    nameEn: '15 Eunomia',
    N0: 293.20,
    Nd: 0,
    i0: 11.75,
    idRate: 0,
    w0: 97.92,
    wd: 0,
    a: 2.6437,
    e0: 0.1866,
    ed: 0,
    M0: 284.0,
    Md: 0.22926,
    H: 5.28,
    radiusKm: 128,
    color: '#CBD5E1',
    descriptionKo: 'S형 소행성 중 가장 큰 천체 중 하나입니다.',
  },
  {
    id: '433_eros',
    kind: 'asteroid',
    nameKo: '(433) 에로스',
    nameEn: '433 Eros',
    N0: 304.32,
    Nd: 0,
    i0: 10.828,
    idRate: 0,
    w0: 178.82,
    wd: 0,
    a: 1.4581,
    e0: 0.2229,
    ed: 0,
    M0: 245.5,
    Md: 0.55978,
    H: 10.31,
    radiusKm: 8.4,
    color: '#E2E8F0',
    descriptionKo: '근지구 소행성(NEA)의 대표적 천체로 궤도 이동 속도가 매우 빠릅니다.',
  },
];

// Geocentric Sun elements (Paul Schlyter, epoch 2000 Jan 0.0 UT = JD 2451543.5)
const SUN_GEOCENTRIC_ELEMENTS = {
  N0: 0.0,
  Nd: 0.0,
  i0: 0.0,
  idRate: 0.0,
  w0: 282.9404,
  wd: 4.70935e-5,
  a: 1.000000,
  e0: 0.016709,
  ed: -1.151e-9,
  M0: 356.0470,
  Md: 0.9856002585,
};

function computeHeliocentricEcliptic(
  el: Pick<
    OrbitalElements,
    'N0' | 'Nd' | 'i0' | 'idRate' | 'w0' | 'wd' | 'a' | 'e0' | 'ed' | 'M0' | 'Md'
  >,
  d: number
): { x: number; y: number; z: number; r: number } {
  const N = (el.N0 + el.Nd * d) * DEG2RAD;
  const inc = (el.i0 + el.idRate * d) * DEG2RAD;
  const w = (el.w0 + el.wd * d) * DEG2RAD;
  const e = el.e0 + el.ed * d;
  const M = el.M0 + el.Md * d;

  const E = solveKepler(M, e);
  const xv = el.a * (Math.cos(E) - e);
  const yv = el.a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);

  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);

  const cosN = Math.cos(N);
  const sinN = Math.sin(N);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const vw = v + w;
  const cosVW = Math.cos(vw);
  const sinVW = Math.sin(vw);

  const x = r * (cosN * cosVW - sinN * sinVW * cosI);
  const y = r * (sinN * cosVW + cosN * sinVW * cosI);
  const z = r * (sinVW * sinI);

  return { x, y, z, r };
}

interface SatelliteSpec {
  id: string;
  parentBodyId: string;
  parentNameKo: string;
  nameKo: string;
  nameEn: string;
  /** Semi-major axis in km */
  orbitRadiusKm: number;
  /** Orbital period in days (negative = retrograde) */
  periodDays: number;
  /** Epoch longitude at J2000 (deg) */
  lambda0Deg: number;
  /** Orbital inclination relative to parent equator / ecliptic (deg) */
  inclinationDeg: number;
  /** Node angle (deg) */
  nodeDeg: number;
  /** Approximate visual magnitude at mean opposition */
  mag: number;
  radiusKm: number;
  color: string;
  descriptionKo: string;
}

const PLANETARY_SATELLITES: SatelliteSpec[] = [
  // Mars Moons
  {
    id: 'phobos',
    parentBodyId: 'mars',
    parentNameKo: '화성',
    nameKo: '포보스',
    nameEn: 'Phobos',
    orbitRadiusKm: 9376,
    periodDays: 0.31891,
    lambda0Deg: 110,
    inclinationDeg: 26.0,
    nodeDeg: 45,
    mag: 11.4,
    radiusKm: 11.2,
    color: '#D6D3D1',
    descriptionKo: '화성의 안쪽 위성 포보스(공전주기 7시간 39분). 화성에 매우 바짝 붙어 공전합니다.',
  },
  {
    id: 'deimos',
    parentBodyId: 'mars',
    parentNameKo: '화성',
    nameKo: '데이모스',
    nameEn: 'Deimos',
    orbitRadiusKm: 23463,
    periodDays: 1.26244,
    lambda0Deg: 245,
    inclinationDeg: 25.2,
    nodeDeg: 47,
    mag: 12.5,
    radiusKm: 6.2,
    color: '#D6D3D1',
    descriptionKo: '화성의 바깥쪽 위성 데이모스(공전주기 약 30시간).',
  },
  // Jupiter Galilean Moons
  {
    id: 'io',
    parentBodyId: 'jupiter',
    parentNameKo: '목성',
    nameKo: '이오',
    nameEn: 'Io',
    orbitRadiusKm: 421700,
    periodDays: 1.769138,
    lambda0Deg: 200.39,
    inclinationDeg: 3.1,
    nodeDeg: 315,
    mag: 5.0,
    radiusKm: 1821.6,
    color: '#FDE047',
    descriptionKo: '목성의 갈릴레이 위성 중 가장 안쪽의 화산 활동 위성 이오(Io)입니다.',
  },
  {
    id: 'europa',
    parentBodyId: 'jupiter',
    parentNameKo: '목성',
    nameKo: '유로파',
    nameEn: 'Europa',
    orbitRadiusKm: 671034,
    periodDays: 3.551181,
    lambda0Deg: 36.12,
    inclinationDeg: 3.1,
    nodeDeg: 315,
    mag: 5.3,
    radiusKm: 1560.8,
    color: '#FEF9C3',
    descriptionKo: '두꺼운 얼음 지각 아래 거대한 액체 바다가 존재하는 갈릴레이 위성 유로파입니다.',
  },
  {
    id: 'ganymede',
    parentBodyId: 'jupiter',
    parentNameKo: '목성',
    nameKo: '가니메데',
    nameEn: 'Ganymede',
    orbitRadiusKm: 1070412,
    periodDays: 7.154553,
    lambda0Deg: 44.07,
    inclinationDeg: 3.1,
    nodeDeg: 315,
    mag: 4.6,
    radiusKm: 2634.1,
    color: '#E5E7EB',
    descriptionKo: '태양계에서 가장 큰 위성 가니메데(Ganymede). 쌍안경으로도 쉽게 구별됩니다.',
  },
  {
    id: 'callisto',
    parentBodyId: 'jupiter',
    parentNameKo: '목성',
    nameKo: '칼리스토',
    nameEn: 'Callisto',
    orbitRadiusKm: 1882709,
    periodDays: 16.689018,
    lambda0Deg: 181.40,
    inclinationDeg: 3.1,
    nodeDeg: 315,
    mag: 5.7,
    radiusKm: 2410.3,
    color: '#CBD5E1',
    descriptionKo: '갈릴레이 위성 중 가장 바깥 궤도를 도는 칼리스토(Callisto)입니다.',
  },
  // Saturn Major Moons
  {
    id: 'enceladus',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '엔셀라두스',
    nameEn: 'Enceladus',
    orbitRadiusKm: 238020,
    periodDays: 1.370218,
    lambda0Deg: 199.1,
    inclinationDeg: 26.7,
    nodeDeg: 169.5,
    mag: 11.7,
    radiusKm: 252.1,
    color: '#F8FAFC',
    descriptionKo: '얼음 간헐천을 분출하는 토성의 밝은 내부 위성 엔셀라두스입니다.',
  },
  {
    id: 'tethys',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '테티스',
    nameEn: 'Tethys',
    orbitRadiusKm: 294660,
    periodDays: 1.887802,
    lambda0Deg: 89.6,
    inclinationDeg: 26.7,
    nodeDeg: 169.5,
    mag: 10.2,
    radiusKm: 531.1,
    color: '#F1F5F9',
    descriptionKo: '토성의 고리 근처를 도는 얼음 위성 테티스입니다.',
  },
  {
    id: 'dione',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '디오네',
    nameEn: 'Dione',
    orbitRadiusKm: 377400,
    periodDays: 2.736915,
    lambda0Deg: 357.7,
    inclinationDeg: 26.7,
    nodeDeg: 169.5,
    mag: 10.4,
    radiusKm: 561.4,
    color: '#E2E8F0',
    descriptionKo: '소형 망원경으로 관측 가능한 토성의 주요 위성 디오네입니다.',
  },
  {
    id: 'rhea',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '레아',
    nameEn: 'Rhea',
    orbitRadiusKm: 527040,
    periodDays: 4.517500,
    lambda0Deg: 359.2,
    inclinationDeg: 26.7,
    nodeDeg: 169.5,
    mag: 9.7,
    radiusKm: 763.8,
    color: '#E2E8F0',
    descriptionKo: '토성에서 타이탄 다음으로 큰 두 번째 위성 레아(Rhea)입니다.',
  },
  {
    id: 'titan',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '타이탄',
    nameEn: 'Titan',
    orbitRadiusKm: 1221870,
    periodDays: 15.945421,
    lambda0Deg: 163.3,
    inclinationDeg: 26.7,
    nodeDeg: 169.5,
    mag: 8.3,
    radiusKm: 2574.7,
    color: '#FDBA74',
    descriptionKo: '질소 대기를 가진 토성 최대 위성 타이탄(약 8.3등급). 소구경 망원경으로도 주황빛 점으로 쉽게 보입니다.',
  },
  {
    id: 'iapetus',
    parentBodyId: 'saturn',
    parentNameKo: '토성',
    nameKo: '이아페투스',
    nameEn: 'Iapetus',
    orbitRadiusKm: 3561300,
    periodDays: 79.33018,
    lambda0Deg: 355.2,
    inclinationDeg: 15.5,
    nodeDeg: 140.0,
    mag: 10.8,
    radiusKm: 734.5,
    color: '#D6D3D1',
    descriptionKo: '공전 반구의 명암 대비가 극심한 토성의 외곽 위성 이아페투스입니다.',
  },
  // Uranus Moons
  {
    id: 'titania',
    parentBodyId: 'uranus',
    parentNameKo: '천왕성',
    nameKo: '티타니아',
    nameEn: 'Titania',
    orbitRadiusKm: 435910,
    periodDays: 8.705872,
    lambda0Deg: 24.6,
    inclinationDeg: 97.8,
    nodeDeg: 167.0,
    mag: 13.7,
    radiusKm: 788.4,
    color: '#BAE6FD',
    descriptionKo: '천왕성에서 가장 큰 위성 티타니아입니다.',
  },
  {
    id: 'oberon',
    parentBodyId: 'uranus',
    parentNameKo: '천왕성',
    nameKo: '오베론',
    nameEn: 'Oberon',
    orbitRadiusKm: 583520,
    periodDays: 13.463239,
    lambda0Deg: 283.0,
    inclinationDeg: 97.8,
    nodeDeg: 167.0,
    mag: 13.9,
    radiusKm: 761.4,
    color: '#BAE6FD',
    descriptionKo: '천왕성의 가장 바깥쪽 주요 위성 오베론입니다.',
  },
  // Neptune Moon
  {
    id: 'triton',
    parentBodyId: 'neptune',
    parentNameKo: '해왕성',
    nameKo: '트리톤',
    nameEn: 'Triton',
    orbitRadiusKm: 354759,
    periodDays: -5.876854,
    lambda0Deg: 215.4,
    inclinationDeg: 156.8,
    nodeDeg: 177.6,
    mag: 13.5,
    radiusKm: 1353.4,
    color: '#93C5FD',
    descriptionKo: '역행 공전을 하는 해왕성 최대 위성 트리톤입니다.',
  },
];

interface BodySpinParams {
  poleRaDeg: number;
  poleDecDeg: number;
  WDeg: number;
  flattening?: number;
}

function getBodySpinParams(id: string, d: number, distAu: number): BodySpinParams | null {
  const T = d / 36525;
  // Light-travel time correction in days (0.005775518 days per AU)
  const dLight = d - distAu * 0.005775518;

  switch (id) {
    case 'sun':
      return {
        poleRaDeg: 286.13,
        poleDecDeg: 63.87,
        WDeg: normDeg(84.176 + 14.1844 * d),
      };
    case 'moon': {
      const E1 = (125.045 - 0.0529921 * d) * DEG2RAD;
      const E2 = (250.089 - 0.1059842 * d) * DEG2RAD;
      return {
        poleRaDeg: 269.9949 + 0.0031 * T - 3.8787 * Math.sin(E1) - 0.1204 * Math.sin(E2),
        poleDecDeg: 66.5392 + 0.0130 * T + 1.5419 * Math.cos(E1) + 0.0239 * Math.cos(E2),
        WDeg: normDeg(38.3213 + 13.17639648 * d + 3.5610 * Math.sin(E1) + 0.1208 * Math.sin(E2)),
      };
    }
    case 'mercury':
      return {
        poleRaDeg: 281.01 - 0.033 * T,
        poleDecDeg: 61.45 - 0.005 * T,
        WDeg: normDeg(329.5469 + 6.1385025 * dLight),
      };
    case 'venus':
      return {
        poleRaDeg: 272.76,
        poleDecDeg: 67.16,
        WDeg: normDeg(160.2 - 1.4813688 * dLight),
      };
    case 'mars':
      return {
        poleRaDeg: 317.68143 - 0.1061 * T,
        poleDecDeg: 52.88650 - 0.0609 * T,
        WDeg: normDeg(176.63 + 350.89198226 * dLight),
        flattening: 0.0059,
      };
    case 'jupiter':
      return {
        poleRaDeg: 268.056595 - 0.006499 * T,
        poleDecDeg: 64.495303 + 0.002413 * T,
        // IAU System II rotation (tracks Great Red Spot & temperate belts)
        WDeg: normDeg(43.3 + 870.27003539 * dLight),
        flattening: 0.06487,
      };
    case 'saturn':
      return {
        poleRaDeg: 40.589 - 0.036 * T,
        poleDecDeg: 83.537 - 0.004 * T,
        WDeg: normDeg(38.9 + 810.7939024 * dLight),
        flattening: 0.09796,
      };
    case 'uranus':
      return {
        poleRaDeg: 257.311,
        poleDecDeg: -15.175,
        WDeg: normDeg(203.81 - 501.1600928 * dLight),
        flattening: 0.0229,
      };
    case 'neptune': {
      const N = (357.85 + 52.316 * T) * DEG2RAD;
      return {
        poleRaDeg: 299.36 + 0.7 * Math.sin(N),
        poleDecDeg: 43.46 - 0.51 * Math.cos(N),
        WDeg: normDeg(253.18 + 536.3128492 * dLight - 0.48 * Math.sin(N)),
        flattening: 0.0171,
      };
    }
    default:
      return null;
  }
}

/**
 * Given a unit direction vector from body toward observer (Earth or Sun) in J2000 Equatorial XYZ,
 * compute sub-observer planetocentric latitude (deg) and Central Meridian West Longitude (deg).
 */
function computeBodyAspectFromVector(
  dirFromBodyEq: [number, number, number],
  poleRaDeg: number,
  poleDecDeg: number,
  WDeg: number
): { latDeg: number; cmDeg: number } {
  const a0 = poleRaDeg * DEG2RAD;
  const d0 = poleDecDeg * DEG2RAD;
  const px = Math.cos(d0) * Math.cos(a0);
  const py = Math.cos(d0) * Math.sin(a0);
  const pz = Math.sin(d0);

  // Q = ascending node of body's equator on J2000 equator
  const qx = -Math.sin(a0);
  const qy = Math.cos(a0);
  const qz = 0;

  // R = p x q
  const rx = -Math.cos(a0) * Math.sin(d0);
  const ry = -Math.sin(a0) * Math.sin(d0);
  const rz = Math.cos(d0);

  const [vx, vy, vz] = dirFromBodyEq;
  const sinLat = Math.max(-1, Math.min(1, px * vx + py * vy + pz * vz));
  const latDeg = Math.asin(sinLat) * RAD2DEG;

  const xEq = qx * vx + qy * vy + qz * vz;
  const yEq = rx * vx + ry * vy + rz * vz;
  const lambdaE = Math.atan2(yEq, xEq) * RAD2DEG;
  const cmDeg = normDeg(WDeg - lambdaE);

  return { latDeg, cmDeg };
}

/**
 * Compute geocentric J2000 positions for Sun, Moon, Planets, Dwarf Planets, Asteroids, and Planetary Moons.
 */
export function computeSolarSystemBodies(
  observationDateTime?: string
): SolarSystemBodyRecord[] {
  // d = days since J2000.0 (JD 2451545.0) for IAU spin/pole & Meeus J2000 formulas
  // dSchlyter = days since 2000 Jan 0.0 UT (JD 2451543.5) for Paul Schlyter's orbital elements
  const d = dateTimeToDaysSinceJ2000(observationDateTime);
  const dSchlyter = d + 1.5;
  const eps = (23.4393 - 3.563e-7 * dSchlyter) * DEG2RAD;
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  // Schlyter's Sun elements give geocentric ecliptic position of the Sun; Earth heliocentric = -sunGeocentric
  const sunGeocentricEcl = computeHeliocentricEcliptic(SUN_GEOCENTRIC_ELEMENTS, dSchlyter);
  const earth = {
    x: -sunGeocentricEcl.x,
    y: -sunGeocentricEcl.y,
    z: -sunGeocentricEcl.z,
    r: sunGeocentricEcl.r,
  };

  const bodies: SolarSystemBodyRecord[] = [];
  const planetGeoMap = new Map<
    string,
    {
      raDeg: number;
      decDeg: number;
      distAu: number;
      geoVecAu: [number, number, number];
      radiusKm: number;
      phasePercent: number;
      poleRaDeg: number;
      poleDecDeg: number;
      subEarthLatDeg: number;
      subSolarLatDeg: number;
    }
  >();

  // 1. Sun (Geocentric = +sunGeocentricEcl = -Earth heliocentric)
  let sunGeoVecAu: [number, number, number] = [1, 0, 0];
  {
    const xg = sunGeocentricEcl.x;
    const yg = sunGeocentricEcl.y;
    const zg = sunGeocentricEcl.z;
    const xEq = xg;
    const yEq = yg * cosEps - zg * sinEps;
    const zEq = yg * sinEps + zg * cosEps;
    sunGeoVecAu = [xEq, yEq, zEq];
    const distAu = Math.hypot(xEq, yEq, zEq);
    const raDeg = normDeg(Math.atan2(yEq, xEq) * RAD2DEG);
    const decDeg = Math.atan2(zEq, Math.hypot(xEq, yEq)) * RAD2DEG;
    const angDiam = ((2 * 696340) / (distAu * AU_KM)) * RAD2DEG * 3600;
    const sunSpin = getBodySpinParams('sun', d, distAu)!;
    const sunToEarth: [number, number, number] = [-xEq / distAu, -yEq / distAu, -zEq / distAu];
    const sunAspect = computeBodyAspectFromVector(
      sunToEarth,
      sunSpin.poleRaDeg,
      sunSpin.poleDecDeg,
      sunSpin.WDeg
    );
    bodies.push({
      id: 'sun',
      kind: 'sun',
      nameKo: '태양',
      nameEn: 'Sun',
      raHours: raDeg / 15,
      raDeg,
      decDeg,
      mag: -26.74,
      angularDiameterArcsec: Number(angDiam.toFixed(1)),
      distanceAu: Number(distAu.toFixed(4)),
      color: '#FDE047',
      poleRaDeg: sunSpin.poleRaDeg,
      poleDecDeg: sunSpin.poleDecDeg,
      subEarthLatDeg: Number(sunAspect.latDeg.toFixed(2)),
      centralMeridianDeg: Number(sunAspect.cmDeg.toFixed(2)),
      descriptionKo: '태양계의 중심 항성. 성도상에서 황도를 따라 연주 운동합니다.',
    });
  }

  // 2. Moon (Geocentric Lunar Ephemeris with major periodic perturbations)
  {
    const Nm = normDeg(125.1228 - 0.0529538083 * dSchlyter) * DEG2RAD;
    const im = 5.1454 * DEG2RAD;
    const wm = normDeg(318.0634 + 0.1643573223 * dSchlyter) * DEG2RAD;
    const am = 60.2666; // Earth radii
    const em = 0.054900;
    const Mm = normDeg(115.3654 + 13.0649929509 * dSchlyter);

    const Em = solveKepler(Mm, em);
    const xvm = am * (Math.cos(Em) - em);
    const yvm = am * Math.sqrt(1 - em * em) * Math.sin(Em);
    const vm = Math.atan2(yvm, xvm);
    const rm = Math.hypot(xvm, yvm);

    const xhm = rm * (Math.cos(Nm) * Math.cos(vm + wm) - Math.sin(Nm) * Math.sin(vm + wm) * Math.cos(im));
    const yhm = rm * (Math.sin(Nm) * Math.cos(vm + wm) + Math.cos(Nm) * Math.sin(vm + wm) * Math.cos(im));
    const zhm = rm * (Math.sin(vm + wm) * Math.sin(im));

    let lonM = Math.atan2(yhm, xhm) * RAD2DEG;
    let latM = Math.atan2(zhm, Math.hypot(xhm, yhm)) * RAD2DEG;

    const Ms = normDeg(SUN_GEOCENTRIC_ELEMENTS.M0 + SUN_GEOCENTRIC_ELEMENTS.Md * dSchlyter) * DEG2RAD;
    const ws = normDeg(SUN_GEOCENTRIC_ELEMENTS.w0 + SUN_GEOCENTRIC_ELEMENTS.wd * dSchlyter) * DEG2RAD;
    const Ls = ws + Ms;
    const Lm = Nm + wm + Mm * DEG2RAD;
    const Dm = Lm - Ls;
    const Fm = Lm - Nm;

    // Lunar longitude & latitude perturbations
    lonM +=
      -1.274 * Math.sin(Mm * DEG2RAD - 2 * Dm) +
      0.658 * Math.sin(2 * Dm) -
      0.186 * Math.sin(Ms) -
      0.059 * Math.sin(2 * Mm * DEG2RAD - 2 * Dm) -
      0.057 * Math.sin(Mm * DEG2RAD - 2 * Dm + Ms) +
      0.053 * Math.sin(Mm * DEG2RAD + 2 * Dm) +
      0.046 * Math.sin(2 * Dm - Ms) +
      0.041 * Math.sin(Mm * DEG2RAD - Ms) -
      0.035 * Math.sin(Dm) -
      0.031 * Math.sin(Mm * DEG2RAD + Ms);
    latM +=
      -0.173 * Math.sin(Fm - 2 * Dm) -
      0.055 * Math.sin(Mm * DEG2RAD - Fm - 2 * Dm) -
      0.046 * Math.sin(Mm * DEG2RAD + Fm - 2 * Dm) +
      0.033 * Math.sin(Fm + 2 * Dm);
    const rFinalRe = rm - 0.58 * Math.cos(Mm * DEG2RAD - 2 * Dm) - 0.46 * Math.cos(2 * Dm);

    const lonRad = lonM * DEG2RAD;
    const latRad = latM * DEG2RAD;
    const xe = Math.cos(lonRad) * Math.cos(latRad);
    const ye = Math.sin(lonRad) * Math.cos(latRad);
    const ze = Math.sin(latRad);

    const xEq = xe;
    const yEq = ye * cosEps - ze * sinEps;
    const zEq = ye * sinEps + ze * cosEps;

    const raDeg = normDeg(Math.atan2(yEq, xEq) * RAD2DEG);
    const decDeg = Math.atan2(zEq, Math.hypot(xEq, yEq)) * RAD2DEG;
    const distKm = rFinalRe * 6378.14;
    const distAu = distKm / AU_KM;
    const angDiam = ((2 * 1737.4) / distKm) * RAD2DEG * 3600;

    // Exact 3D Moon-Sun-Earth phase angle
    const moonGeoAu: [number, number, number] = [xEq * distAu, yEq * distAu, zEq * distAu];
    const mToSun: [number, number, number] = [
      sunGeoVecAu[0] - moonGeoAu[0],
      sunGeoVecAu[1] - moonGeoAu[1],
      sunGeoVecAu[2] - moonGeoAu[2],
    ];
    const mToSunLen = Math.hypot(mToSun[0], mToSun[1], mToSun[2]);
    const mToEarth: [number, number, number] = [-xEq, -yEq, -zEq];
    const cosMoonPhase = Math.max(
      -1,
      Math.min(
        1,
        (mToSun[0] * mToEarth[0] + mToSun[1] * mToEarth[1] + mToSun[2] * mToEarth[2]) /
          Math.max(1e-12, mToSunLen)
      )
    );
    const phasePct = ((1 + cosMoonPhase) / 2) * 100;
    const elongDeg =
      Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            (xEq * sunGeoVecAu[0] + yEq * sunGeoVecAu[1] + zEq * sunGeoVecAu[2]) /
              Math.max(1e-12, Math.hypot(sunGeoVecAu[0], sunGeoVecAu[1], sunGeoVecAu[2]))
          )
        )
      ) * RAD2DEG;
    const moonMag = -12.7 + 0.026 * Math.abs(180 - elongDeg) + 4e-9 * Math.pow(180 - elongDeg, 4);

    const moonSpin = getBodySpinParams('moon', d, distAu)!;
    const moonAspect = computeBodyAspectFromVector(
      mToEarth,
      moonSpin.poleRaDeg,
      moonSpin.poleDecDeg,
      moonSpin.WDeg
    );
    const moonToSunUnit: [number, number, number] = [
      mToSun[0] / mToSunLen,
      mToSun[1] / mToSunLen,
      mToSun[2] / mToSunLen,
    ];
    const moonSunAspect = computeBodyAspectFromVector(
      moonToSunUnit,
      moonSpin.poleRaDeg,
      moonSpin.poleDecDeg,
      moonSpin.WDeg
    );

    bodies.push({
      id: 'moon',
      kind: 'moon',
      parentBodyId: 'earth',
      parentNameKo: '지구',
      nameKo: '달',
      nameEn: 'Moon',
      raHours: raDeg / 15,
      raDeg,
      decDeg,
      mag: Number(Math.min(-2.5, moonMag).toFixed(1)),
      angularDiameterArcsec: Number(angDiam.toFixed(1)),
      distanceAu: Number(distAu.toFixed(5)),
      phasePercent: Number(phasePct.toFixed(1)),
      color: '#F1F5F9',
      poleRaDeg: moonSpin.poleRaDeg,
      poleDecDeg: moonSpin.poleDecDeg,
      subEarthLatDeg: Number(moonAspect.latDeg.toFixed(2)),
      subSolarLatDeg: Number(moonSunAspect.latDeg.toFixed(2)),
      centralMeridianDeg: Number(moonAspect.cmDeg.toFixed(2)),
      descriptionKo: `지구의 유일한 자연위성 달 (위상 약 ${phasePct.toFixed(1)}%). 시간에 따라 황도 근처 별자리를 빠르게 통과합니다.`,
    });
  }

  // 3. Heliocentric Planets, Dwarf Planets, and Asteroids
  for (const el of HELIOCENTRIC_BODIES) {
    const helio = computeHeliocentricEcliptic(el, dSchlyter);
    const xg = helio.x - earth.x;
    const yg = helio.y - earth.y;
    const zg = helio.z - earth.z;

    const xEq = xg;
    const yEq = yg * cosEps - zg * sinEps;
    const zEq = yg * sinEps + zg * cosEps;

    const distAu = Math.hypot(xEq, yEq, zEq);
    const raDeg = normDeg(Math.atan2(yEq, xEq) * RAD2DEG);
    const decDeg = Math.atan2(zEq, Math.hypot(xEq, yEq)) * RAD2DEG;

    // Phase angle (Sun - Target - Earth)
    const cosPhase = Math.max(
      -1,
      Math.min(1, (helio.r * helio.r + distAu * distAu - earth.r * earth.r) / (2 * helio.r * distAu))
    );
    const phaseDeg = Math.acos(cosPhase) * RAD2DEG;
    const phasePct = ((1 + cosPhase) / 2) * 100;

    // Visual magnitude V
    let mag = el.H + 5 * Math.log10(Math.max(0.01, helio.r * distAu));
    if (el.id === 'mercury') {
      mag += 0.038 * phaseDeg - 0.000273 * phaseDeg * phaseDeg + 2e-6 * Math.pow(phaseDeg, 3);
    } else if (el.id === 'venus') {
      mag += 0.0009 * phaseDeg + 0.000239 * phaseDeg * phaseDeg - 6.5e-7 * Math.pow(phaseDeg, 3);
    } else if (el.kind === 'asteroid' || el.kind === 'dwarf_planet') {
      mag += 0.032 * phaseDeg;
    } else {
      mag += 0.014 * phaseDeg;
    }

    const angDiam = ((2 * el.radiusKm) / (distAu * AU_KM)) * RAD2DEG * 3600;
    const roundedPhase = Number(phasePct.toFixed(1));

    const spin = getBodySpinParams(el.id, d, distAu);
    let poleRaDeg: number | undefined;
    let poleDecDeg: number | undefined;
    let subEarthLatDeg: number | undefined;
    let subSolarLatDeg: number | undefined;
    let centralMeridianDeg: number | undefined;

    if (spin) {
      poleRaDeg = spin.poleRaDeg;
      poleDecDeg = spin.poleDecDeg;
      const toEarthUnit: [number, number, number] = [
        -xEq / distAu,
        -yEq / distAu,
        -zEq / distAu,
      ];
      const earthAspect = computeBodyAspectFromVector(
        toEarthUnit,
        spin.poleRaDeg,
        spin.poleDecDeg,
        spin.WDeg
      );
      subEarthLatDeg = Number(earthAspect.latDeg.toFixed(2));
      centralMeridianDeg = Number(earthAspect.cmDeg.toFixed(2));

      const toSunEq: [number, number, number] = [
        sunGeoVecAu[0] - xEq,
        sunGeoVecAu[1] - yEq,
        sunGeoVecAu[2] - zEq,
      ];
      const toSunLen = Math.max(1e-12, Math.hypot(toSunEq[0], toSunEq[1], toSunEq[2]));
      const sunAspect = computeBodyAspectFromVector(
        [toSunEq[0] / toSunLen, toSunEq[1] / toSunLen, toSunEq[2] / toSunLen],
        spin.poleRaDeg,
        spin.poleDecDeg,
        spin.WDeg
      );
      subSolarLatDeg = Number(sunAspect.latDeg.toFixed(2));

      planetGeoMap.set(el.id, {
        raDeg,
        decDeg,
        distAu,
        geoVecAu: [xEq, yEq, zEq],
        radiusKm: el.radiusKm,
        phasePercent: roundedPhase,
        poleRaDeg,
        poleDecDeg,
        subEarthLatDeg,
        subSolarLatDeg,
      });
    }

    bodies.push({
      id: el.id,
      kind: el.kind,
      nameKo: el.nameKo,
      nameEn: el.nameEn,
      raHours: raDeg / 15,
      raDeg,
      decDeg,
      mag: Number(mag.toFixed(2)),
      angularDiameterArcsec: Number(angDiam.toFixed(2)),
      distanceAu: Number(distAu.toFixed(3)),
      phasePercent: roundedPhase,
      color: el.color,
      hasRings: el.hasRings,
      poleRaDeg,
      poleDecDeg,
      subEarthLatDeg,
      subSolarLatDeg,
      centralMeridianDeg,
      flattening: spin?.flattening,
      descriptionKo: el.descriptionKo,
    });
  }

  // 4. Planetary Satellites (projected in true parent equatorial frame with phase, depth, and eclipse)
  // Precise J2000 node-referred orbital angles & inclinations relative to parent's equator
  const SAT_EQUATOR_PARAMS: Record<
    string,
    { lambda0Deg: number; incToParentEqDeg: number; nodeOffsetDeg: number }
  > = {
    // Mars
    phobos: { lambda0Deg: 110.0, incToParentEqDeg: 1.09, nodeOffsetDeg: 0 },
    deimos: { lambda0Deg: 245.0, incToParentEqDeg: 1.79, nodeOffsetDeg: 0 },
    // Jupiter Galilean Moons (exact Laplace resonance J2000 angles from Jupiter equatorial node Q)
    io: { lambda0Deg: 14.95, incToParentEqDeg: 0.05, nodeOffsetDeg: 0 },
    europa: { lambda0Deg: 209.55, incToParentEqDeg: 0.47, nodeOffsetDeg: 120 },
    ganymede: { lambda0Deg: 216.86, incToParentEqDeg: 0.2, nodeOffsetDeg: 60 },
    callisto: { lambda0Deg: 76.65, incToParentEqDeg: 0.19, nodeOffsetDeg: 290 },
    // Saturn Moons (ring plane = Saturn equator, Iapetus tilted 15.47 deg)
    enceladus: { lambda0Deg: 238.1, incToParentEqDeg: 0.02, nodeOffsetDeg: 0 },
    tethys: { lambda0Deg: 128.6, incToParentEqDeg: 1.09, nodeOffsetDeg: 40 },
    dione: { lambda0Deg: 36.7, incToParentEqDeg: 0.02, nodeOffsetDeg: 0 },
    rhea: { lambda0Deg: 38.2, incToParentEqDeg: 0.35, nodeOffsetDeg: 15 },
    titan: { lambda0Deg: 202.3, incToParentEqDeg: 0.35, nodeOffsetDeg: 25 },
    iapetus: { lambda0Deg: 34.2, incToParentEqDeg: 15.47, nodeOffsetDeg: 139 },
    // Uranus Moons (equatorial ring plane)
    titania: { lambda0Deg: 24.6, incToParentEqDeg: 0.34, nodeOffsetDeg: 0 },
    oberon: { lambda0Deg: 283.0, incToParentEqDeg: 0.06, nodeOffsetDeg: 0 },
    // Neptune Triton (retrograde ~23 deg to Neptune equator, represented by negative periodDays)
    triton: { lambda0Deg: 215.4, incToParentEqDeg: 23.0, nodeOffsetDeg: 185 },
  };

  for (const sat of PLANETARY_SATELLITES) {
    const parentGeo = planetGeoMap.get(sat.parentBodyId);
    if (!parentGeo) continue;

    const eqParam = SAT_EQUATOR_PARAMS[sat.id];
    const l0 = eqParam ? eqParam.lambda0Deg : sat.lambda0Deg;
    const incEq = (eqParam ? eqParam.incToParentEqDeg : 0) * DEG2RAD;
    const nodeEq = (eqParam ? eqParam.nodeOffsetDeg : 0) * DEG2RAD;

    // Orbital angle along parent's equatorial frame (from ascending node Q)
    const orbAngle = (l0 + (360 / sat.periodDays) * d) * DEG2RAD;
    const uOrb = orbAngle - nodeEq;

    // Coordinates in parent's (q_hat, r_hat, p_hat) equatorial frame
    const cQ =
      sat.orbitRadiusKm *
      (Math.cos(nodeEq) * Math.cos(uOrb) - Math.sin(nodeEq) * Math.sin(uOrb) * Math.cos(incEq));
    const cR =
      sat.orbitRadiusKm *
      (Math.sin(nodeEq) * Math.cos(uOrb) + Math.cos(nodeEq) * Math.sin(uOrb) * Math.cos(incEq));
    const cP = sat.orbitRadiusKm * (Math.sin(uOrb) * Math.sin(incEq));

    // Parent J2000 equatorial basis vectors
    const a0 = parentGeo.poleRaDeg * DEG2RAD;
    const d0 = parentGeo.poleDecDeg * DEG2RAD;
    const px = Math.cos(d0) * Math.cos(a0);
    const py = Math.cos(d0) * Math.sin(a0);
    const pz = Math.sin(d0);
    const qx = -Math.sin(a0);
    const qy = Math.cos(a0);
    const qz = 0;
    const rx = -Math.cos(a0) * Math.sin(d0);
    const ry = -Math.sin(a0) * Math.sin(d0);
    const rz = Math.cos(d0);

    // Satellite 3D offset vector from parent in J2000 Equatorial XYZ (km)
    const sx = cQ * qx + cR * rx + cP * px;
    const sy = cQ * qy + cR * ry + cP * py;
    const sz = cQ * qz + cR * rz + cP * pz;

    const distKm = parentGeo.distAu * AU_KM;
    const raRad = parentGeo.raDeg * DEG2RAD;
    const decRad = parentGeo.decDeg * DEG2RAD;

    // Project onto East, North, and Line-of-Sight vectors at parent
    const dEastKm = -sx * Math.sin(raRad) + sy * Math.cos(raRad);
    const dNorthKm =
      -sx * Math.sin(decRad) * Math.cos(raRad) -
      sy * Math.sin(decRad) * Math.sin(raRad) +
      sz * Math.cos(decRad);
    const dDepthKm =
      sx * Math.cos(decRad) * Math.cos(raRad) +
      sy * Math.cos(decRad) * Math.sin(raRad) +
      sz * Math.sin(decRad);

    // Check if satellite lies inside parent's umbra shadow cone
    const antiSunX = parentGeo.geoVecAu[0] - sunGeoVecAu[0];
    const antiSunY = parentGeo.geoVecAu[1] - sunGeoVecAu[1];
    const antiSunZ = parentGeo.geoVecAu[2] - sunGeoVecAu[2];
    const antiSunLen = Math.max(1e-12, Math.hypot(antiSunX, antiSunY, antiSunZ));
    const uShX = antiSunX / antiSunLen;
    const uShY = antiSunY / antiSunLen;
    const uShZ = antiSunZ / antiSunLen;
    const alongShadowKm = sx * uShX + sy * uShY + sz * uShZ;
    const sNormSq = sx * sx + sy * sy + sz * sz;
    const perpDistKm = Math.sqrt(Math.max(0, sNormSq - alongShadowKm * alongShadowKm));
    const inEclipse = alongShadowKm > 0 && perpDistKm < parentGeo.radiusKm * 0.99;

    const dDecDeg = (dNorthKm / distKm) * RAD2DEG;
    const cosDec = Math.max(0.1, Math.cos(decRad));
    const dRaDeg = ((dEastKm / distKm) * RAD2DEG) / cosDec;

    const raDeg = normDeg(parentGeo.raDeg + dRaDeg);
    const decDeg = Math.max(-89.9, Math.min(89.9, parentGeo.decDeg + dDecDeg));
    const angDiam = ((2 * sat.radiusKm) / (distKm + dDepthKm)) * RAD2DEG * 3600;
    const satDistAu = parentGeo.distAu + dDepthKm / AU_KM;

    bodies.push({
      id: sat.id,
      kind: 'satellite',
      parentBodyId: sat.parentBodyId,
      parentNameKo: sat.parentNameKo,
      nameKo: sat.nameKo,
      nameEn: sat.nameEn,
      raHours: raDeg / 15,
      raDeg,
      decDeg,
      mag: inEclipse ? Number((sat.mag + 4.0).toFixed(1)) : sat.mag,
      angularDiameterArcsec: Number(angDiam.toFixed(3)),
      distanceAu: Number(satDistAu.toFixed(6)),
      phasePercent: parentGeo.phasePercent,
      color: sat.color,
      poleRaDeg: parentGeo.poleRaDeg,
      poleDecDeg: parentGeo.poleDecDeg,
      subEarthLatDeg: parentGeo.subEarthLatDeg,
      subSolarLatDeg: parentGeo.subSolarLatDeg,
      inEclipse,
      descriptionKo: sat.descriptionKo,
    });
  }

  return bodies;
}

/**
 * Recommended close-up FOV (degrees) when focusing or jumping to a Solar System body.
 * - Jupiter (0.30 deg = 18 arcmin): frames Jupiter and all 4 Galilean moons together on one screen.
 * - Saturn (0.15 deg = 9 arcmin): frames Saturn's rings and major moons.
 * - Rocky / ice planets (0.04 deg = 2.4 arcmin): clearly shows planetary phase and surface markings.
 */
export function getRecommendedSolarFov(body: SolarSystemBodyRecord): number {
  if (body.id === 'jupiter') return 0.30;
  if (body.id === 'saturn') return 0.15;
  if (body.kind === 'moon' || body.kind === 'sun') return 1.2;
  if (body.kind === 'planet') return 0.04;
  if (body.kind === 'satellite') return 0.25;
  if (body.kind === 'dwarf_planet' || body.kind === 'asteroid') return 8;
  return 10;
}
