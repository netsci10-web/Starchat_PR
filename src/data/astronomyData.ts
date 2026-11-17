import {
  ConstellationStick,
  DSORecord,
  MilkyWayContourLevel,
  StarRecord,
} from '../types/astronomy';
import { CALDWELL_CATALOG } from './caldwellCatalog';
import {
  buildConstellationVertexStars,
  CONSTELLATION_DATA as ALL_88_CONSTELLATIONS,
} from './constellationsCatalog';
import { buildNebulaContour, MESSIER_CATALOG } from './messierCatalog';

/**
 * Helper: Convert Galactic coordinates (lDeg, bDeg) to J2000 Equatorial (raDeg, decDeg)
 * North Galactic Pole J2000: RA = 192.85948 deg, Dec = +27.12825 deg, l_NCP = 122.93192 deg
 */
export function galacticToEquatorial(lDeg: number, bDeg: number): [number, number] {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const l = lDeg * rad;
  const b = bDeg * rad;

  const raGP = 192.85948 * rad;
  const decGP = 27.12825 * rad;
  const lNCP = 122.93192 * rad;

  const sinDec =
    Math.sin(b) * Math.sin(decGP) +
    Math.cos(b) * Math.cos(decGP) * Math.cos(lNCP - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

  const y = Math.cos(b) * Math.sin(lNCP - l);
  const x =
    Math.sin(b) * Math.cos(decGP) -
    Math.cos(b) * Math.sin(decGP) * Math.cos(lNCP - l);

  let ra = Math.atan2(y, x) + raGP;
  ra = ((ra * deg) % 360 + 360) % 360;
  return [Number(ra.toFixed(3)), Number((dec * deg).toFixed(3))];
}

/**
 * Inverse helper: Approximate Galactic latitude |b| in degrees from Equatorial (raDeg, decDeg)
 */
export function equatorialToGalacticLat(raDeg: number, decDeg: number): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const ra = raDeg * rad;
  const dec = decDeg * rad;
  const raGP = 192.85948 * rad;
  const decGP = 27.12825 * rad;

  const sinB =
    Math.sin(dec) * Math.sin(decGP) +
    Math.cos(dec) * Math.cos(decGP) * Math.cos(ra - raGP);
  return Math.asin(Math.max(-1, Math.min(1, sinB))) * deg;
}

const s = (
  id: string,
  constellation: string,
  bayer: string,
  raHours: number,
  decDeg: number,
  mag: number,
  bv: number,
  nameKo?: string,
  nameEn?: string,
  isDouble?: boolean,
  isVariable?: boolean
): StarRecord => ({
  id,
  constellation,
  bayer,
  raHours,
  raDeg: Number((raHours * 15).toFixed(4)),
  decDeg,
  mag,
  bv,
  nameKo,
  nameEn,
  isDouble,
  isVariable,
});

/**
 * Named & Bayer Bright Stars across Northern & Southern Hemispheres
 */
const BASE_BRIGHT_STARS: StarRecord[] = [
  // Ursa Minor (작은곰자리)
  s('UMi-alpha', 'UMi', 'α', 2.530, 89.264, 1.98, 0.60, '폴라리스(북극성)', 'Polaris', true, true),
  s('UMi-beta', 'UMi', 'β', 14.845, 74.155, 2.08, 1.47, '코카브', 'Kochab'),
  s('UMi-gamma', 'UMi', 'γ', 15.345, 71.834, 3.05, 0.06, '페르카드', 'Pherkad'),
  s('UMi-delta', 'UMi', 'δ', 17.537, 86.586, 4.36, 0.02, '일둔', 'Yildun'),
  s('UMi-epsilon', 'UMi', 'ε', 16.766, 82.037, 4.23, 0.90),
  s('UMi-zeta', 'UMi', 'ζ', 15.734, 77.794, 4.32, 0.04),
  s('UMi-eta', 'UMi', 'η', 16.292, 75.755, 4.95, 0.37),
  s('UMi-theta', 'UMi', 'θ', 15.523, 77.349, 4.96, 1.59),
  s('UMi-19', 'UMi', '19', 16.183, 75.878, 5.48, -0.04),
  s('UMi-lambda', 'UMi', 'λ', 16.950, 89.038, 6.38, 1.66),

  // Ursa Major (큰곰자리)
  s('UMa-alpha', 'UMa', 'α', 11.062, 61.751, 1.79, 1.07, '두베', 'Dubhe', true),
  s('UMa-beta', 'UMa', 'β', 11.031, 56.382, 2.37, -0.02, '메라크', 'Merak'),
  s('UMa-gamma', 'UMa', 'γ', 11.897, 53.695, 2.44, 0.00, '페크다', 'Phecda'),
  s('UMa-delta', 'UMa', 'δ', 12.257, 57.033, 3.31, 0.08, '메그레즈', 'Megrez'),
  s('UMa-epsilon', 'UMa', 'ε', 12.900, 55.960, 1.77, -0.02, '알리오스', 'Alioth', false, true),
  s('UMa-zeta', 'UMa', 'ζ', 13.399, 54.925, 2.23, 0.02, '미자르', 'Mizar', true),
  s('UMa-80', 'UMa', 'g', 13.420, 54.988, 3.99, 0.16, '알코르', 'Alcor'),
  s('UMa-eta', 'UMa', 'η', 13.792, 49.313, 1.86, -0.19, '알카이드', 'Alkaid'),
  s('UMa-theta', 'UMa', 'θ', 9.548, 51.677, 3.17, 0.46),
  s('UMa-iota', 'UMa', 'ι', 8.986, 48.042, 3.14, 0.19, '탈리타', 'Talitha', true),
  s('UMa-lambda', 'UMa', 'λ', 10.285, 42.914, 3.45, 0.03, '타니아 보레알리스', 'Tania Borealis'),
  s('UMa-mu', 'UMa', 'μ', 10.372, 41.499, 3.06, 1.59, '타니아 오스트랄리스', 'Tania Australis'),
  s('UMa-psi', 'UMa', 'ψ', 11.161, 44.498, 3.01, 1.14),

  // Cassiopeia (카시오페이아자리)
  s('Cas-alpha', 'Cas', 'α', 0.675, 56.537, 2.24, 1.17, '셰다르', 'Schedar'),
  s('Cas-beta', 'Cas', 'β', 0.153, 59.150, 2.28, 0.34, '카프', 'Caph', false, true),
  s('Cas-gamma', 'Cas', 'γ', 0.945, 60.717, 2.47, -0.15, '나비', 'Navi', true, true),
  s('Cas-delta', 'Cas', 'δ', 1.430, 60.235, 2.68, 0.13, '루크바', 'Ruchbah', false, true),
  s('Cas-epsilon', 'Cas', 'ε', 1.907, 63.670, 3.35, -0.15, '세긴', 'Segin'),
  s('Cas-eta', 'Cas', 'η', 0.818, 57.815, 3.44, 0.57, '아키르드', 'Achird', true),

  // Cepheus (세페우스자리)
  s('Cep-alpha', 'Cep', 'α', 21.310, 62.585, 2.45, 0.22, '알데라민', 'Alderamin'),
  s('Cep-beta', 'Cep', 'β', 21.478, 70.561, 3.23, -0.22, '알피르크', 'Alfirk', true, true),
  s('Cep-gamma', 'Cep', 'γ', 23.656, 77.632, 3.21, 1.03, '에라이', 'Errai', true),
  s('Cep-zeta', 'Cep', 'ζ', 22.181, 58.201, 3.35, 1.57),
  s('Cep-iota', 'Cep', 'ι', 22.828, 66.200, 3.52, 1.05),
  s('Cep-delta', 'Cep', 'δ', 22.486, 58.415, 3.95, 0.65, '세페우스 델타', 'Delta Cephei', true, true),
  s('Cep-mu', 'Cep', 'μ', 21.725, 58.780, 4.08, 2.26, '석류석 별', 'Garnet Star', false, true),

  // Cygnus (백조자리)
  s('Cyg-alpha', 'Cyg', 'α', 20.691, 45.280, 1.25, 0.09, '데네브', 'Deneb'),
  s('Cyg-gamma', 'Cyg', 'γ', 20.370, 40.257, 2.23, 0.67, '사드르', 'Sadr'),
  s('Cyg-epsilon', 'Cyg', 'ε', 20.770, 33.970, 2.48, 1.03, '기아나', 'Gienah'),
  s('Cyg-delta', 'Cyg', 'δ', 19.749, 45.131, 2.87, -0.03, '파와리스', 'Fawaris', true),
  s('Cyg-beta', 'Cyg', 'β', 19.512, 27.960, 3.08, 1.13, '알비레오', 'Albireo', true),
  s('Cyg-zeta', 'Cyg', 'ζ', 21.216, 30.227, 3.21, 0.99),
  s('Cyg-eta', 'Cyg', 'η', 19.938, 35.083, 3.89, 1.02),
  s('Cyg-61', 'Cyg', '61', 21.115, 38.749, 5.20, 1.18, '백조 61', '61 Cygni', true),

  // Lyra (거문고자리)
  s('Lyr-alpha', 'Lyr', 'α', 18.616, 38.784, 0.03, 0.00, '베가(직녀성)', 'Vega'),
  s('Lyr-gamma', 'Lyr', 'γ', 18.982, 32.690, 3.25, -0.05, '술라파트', 'Sulafat'),
  s('Lyr-beta', 'Lyr', 'β', 18.835, 33.363, 3.52, 0.00, '셸리아크', 'Sheliak', true, true),
  s('Lyr-delta2', 'Lyr', 'δ', 18.908, 36.898, 4.22, 1.65, undefined, undefined, true),
  s('Lyr-epsilon', 'Lyr', 'ε', 18.739, 39.668, 4.67, 0.16, '더블더블', 'Double Double', true),
  s('Lyr-zeta', 'Lyr', 'ζ', 18.746, 37.605, 4.34, 0.19, undefined, undefined, true),

  // Aquila (독수리자리)
  s('Aql-alpha', 'Aql', 'α', 19.846, 8.868, 0.76, 0.22, '알타이르(견우성)', 'Altair'),
  s('Aql-gamma', 'Aql', 'γ', 19.771, 10.613, 2.72, 1.52, '타라제드', 'Tarazed'),
  s('Aql-beta', 'Aql', 'β', 19.922, 6.407, 3.71, 0.86, '알샤인', 'Alshain'),
  s('Aql-zeta', 'Aql', 'ζ', 19.090, 13.863, 2.99, 0.01, '오카브', 'Okab'),
  s('Aql-delta', 'Aql', 'δ', 19.425, 3.115, 3.36, 0.32),
  s('Aql-lambda', 'Aql', 'λ', 19.104, -4.882, 3.43, -0.09),
  s('Aql-theta', 'Aql', 'θ', 20.188, -0.821, 3.24, -0.07),
  s('Aql-eta', 'Aql', 'η', 19.874, 1.006, 3.87, 0.78, undefined, undefined, false, true),

  // Orion (오리온자리)
  s('Ori-beta', 'Ori', 'β', 5.242, -8.202, 0.13, -0.03, '리겔', 'Rigel', true),
  s('Ori-alpha', 'Ori', 'α', 5.919, 7.407, 0.42, 1.85, '베텔게우스', 'Betelgeuse', false, true),
  s('Ori-gamma', 'Ori', 'γ', 5.419, 6.350, 1.64, -0.22, '벨라트릭스', 'Bellatrix'),
  s('Ori-epsilon', 'Ori', 'ε', 5.603, -1.202, 1.69, -0.19, '알닐람', 'Alnilam'),
  s('Ori-zeta', 'Ori', 'ζ', 5.679, -1.943, 1.77, -0.21, '알니탁', 'Alnitak', true),
  s('Ori-kappa', 'Ori', 'κ', 5.796, -9.669, 2.06, -0.17, '사이프', 'Saiph'),
  s('Ori-delta', 'Ori', 'δ', 5.533, -0.299, 2.23, -0.22, '민타카', 'Mintaka', true),
  s('Ori-iota', 'Ori', 'ι', 5.590, -5.910, 2.77, -0.24, '하트야', 'Hatysa', true),
  s('Ori-theta1', 'Ori', 'θ¹', 5.588, -5.390, 5.13, 0.02, '트라페지움', 'Trapezium', true),
  s('Ori-lambda', 'Ori', 'λ', 5.586, 9.934, 3.39, -0.18, '메이사', 'Meissa', true),
  s('Ori-pi3', 'Ori', 'π³', 4.831, 6.961, 3.19, 0.45, '타비트', 'Tabit'),

  // Taurus (황소자리)
  s('Tau-alpha', 'Tau', 'α', 4.599, 16.509, 0.86, 1.54, '알데바란', 'Aldebaran', true, true),
  s('Tau-beta', 'Tau', 'β', 5.438, 28.608, 1.65, -0.13, '엘나트', 'Elnath'),
  s('Tau-eta', 'Tau', 'η', 3.791, 24.105, 2.87, -0.09, '알키오네', 'Alcyone', true),
  s('Tau-zeta', 'Tau', 'ζ', 5.627, 21.143, 3.01, -0.19, '티앙구안', 'Tianguan'),
  s('Tau-theta2', 'Tau', 'θ²', 4.478, 15.871, 3.40, 0.18, undefined, undefined, true),
  s('Tau-gamma', 'Tau', 'γ', 4.330, 15.627, 3.65, 0.99, '히아둠 I', 'Prima Hyadum'),
  s('Tau-epsilon', 'Tau', 'ε', 4.477, 19.180, 3.53, 1.01, '아인', 'Ain'),
  s('Tau-lambda', 'Tau', 'λ', 4.011, 12.490, 3.47, -0.12, undefined, undefined, false, true),

  // Canis Major & Canis Minor
  s('CMa-alpha', 'CMa', 'α', 6.752, -16.716, -1.46, 0.00, '시리우스', 'Sirius', true),
  s('CMa-epsilon', 'CMa', 'ε', 6.977, -28.972, 1.50, -0.21, '아다라', 'Adhara', true),
  s('CMa-delta', 'CMa', 'δ', 7.140, -26.393, 1.84, 0.68, '웨젠', 'Wezen'),
  s('CMa-beta', 'CMa', 'β', 6.378, -17.956, 1.98, -0.23, '미르잠', 'Mirzam', false, true),
  s('CMa-eta', 'CMa', 'η', 7.401, -29.303, 2.45, -0.08, '알루드라', 'Aludra'),
  s('CMa-zeta', 'CMa', 'ζ', 6.338, -30.063, 3.02, -0.19, '푸르드', 'Furud'),
  s('CMi-alpha', 'CMi', 'α', 7.655, 5.225, 0.34, 0.42, '프로키온', 'Procyon', true),
  s('CMi-beta', 'CMi', 'β', 7.453, 8.289, 2.89, -0.09, '고메이사', 'Gomeisa'),

  // Gemini, Auriga, Perseus, Andromeda, Pegasus
  s('Gem-beta', 'Gem', 'β', 7.755, 28.026, 1.14, 1.00, '폴룩스', 'Pollux'),
  s('Gem-alpha', 'Gem', 'α', 7.577, 31.888, 1.58, 0.03, '카스토르', 'Castor', true),
  s('Gem-gamma', 'Gem', 'γ', 6.629, 16.399, 1.93, 0.00, '알헤나', 'Alhena'),
  s('Gem-mu', 'Gem', 'μ', 6.383, 22.514, 2.87, 1.64, '테자트', 'Tejat', false, true),
  s('Gem-epsilon', 'Gem', 'ε', 6.732, 25.131, 2.98, 1.40, '메브수타', 'Mebsuta'),
  s('Gem-eta', 'Gem', 'η', 6.248, 22.507, 3.28, 1.60, '프로푸스', 'Propus', true, true),
  s('Gem-zeta', 'Gem', 'ζ', 7.068, 20.570, 3.79, 0.79, '메크부다', 'Mekbuda', false, true),
  s('Gem-delta', 'Gem', 'δ', 7.335, 21.982, 3.53, 0.34, '와사트', 'Wasat', true),
  s('Aur-alpha', 'Aur', 'α', 5.278, 45.998, 0.08, 0.80, '카펠라', 'Capella', true),
  s('Aur-beta', 'Aur', 'β', 5.992, 44.947, 1.90, 0.03, '멘칼리난', 'Menkalinan', false, true),
  s('Aur-theta', 'Aur', 'θ', 5.995, 37.213, 2.62, -0.08, '마하심', 'Mahasim', true),
  s('Aur-iota', 'Aur', 'ι', 4.950, 33.166, 2.69, 1.53, '하살레', 'Hassaleh'),
  s('Aur-epsilon', 'Aur', 'ε', 5.033, 43.823, 2.99, 0.54, '알마즈', 'Almaaz', false, true),
  s('Aur-eta', 'Aur', 'η', 5.108, 41.234, 3.18, -0.18, '해두스 II', 'Haedus'),
  s('Per-alpha', 'Per', 'α', 3.405, 49.861, 1.79, 0.48, '미르파크', 'Mirfak'),
  s('Per-beta', 'Per', 'β', 3.136, 40.956, 2.12, -0.05, '알골', 'Algol', true, true),
  s('Per-zeta', 'Per', 'ζ', 3.902, 31.884, 2.85, 0.12),
  s('Per-epsilon', 'Per', 'ε', 3.964, 40.010, 2.89, -0.18, undefined, undefined, true),
  s('Per-gamma', 'Per', 'γ', 3.079, 53.506, 2.93, 0.70),
  s('Per-delta', 'Per', 'δ', 3.715, 47.788, 3.01, -0.13),
  s('Per-eta', 'Per', 'η', 2.844, 55.896, 3.76, 1.69, '미람', 'Miram', true),
  s('And-alpha', 'And', 'α', 0.140, 29.090, 2.06, -0.11, '알페라츠', 'Alpheratz'),
  s('And-beta', 'And', 'β', 1.163, 35.621, 2.06, 1.58, '미라크', 'Mirach'),
  s('And-gamma', 'And', 'γ', 2.065, 42.330, 2.10, 1.37, '알마크', 'Almach', true),
  s('And-delta', 'And', 'δ', 0.655, 30.861, 3.27, 1.28),
  s('Peg-epsilon', 'Peg', 'ε', 21.736, 9.875, 2.39, 1.52, '에니프', 'Enif'),
  s('Peg-beta', 'Peg', 'β', 23.063, 28.083, 2.42, 1.67, '셰아트', 'Scheat', false, true),
  s('Peg-alpha', 'Peg', 'α', 23.079, 15.205, 2.49, -0.04, '마르카브', 'Markab'),
  s('Peg-gamma', 'Peg', 'γ', 0.220, 15.184, 2.83, -0.23, '알게니브', 'Algenib'),
  s('Peg-eta', 'Peg', 'η', 22.717, 30.221, 2.94, 0.86, '마타르', 'Matar'),
  s('Peg-zeta', 'Peg', 'ζ', 22.691, 10.831, 3.41, -0.09, '호맘', 'Homam'),
  s('Peg-theta', 'Peg', 'θ', 22.170, 6.198, 3.53, 0.08, '비함', 'Biham'),

  // Leo, Virgo, Boötes, Corona Borealis, Hercules, Scorpius, Sagittarius, Ophiuchus, Draco
  s('Leo-alpha', 'Leo', 'α', 10.140, 11.967, 1.36, -0.11, '레굴루스', 'Regulus', true),
  s('Leo-gamma', 'Leo', 'γ', 10.333, 19.841, 2.01, 1.15, '알기에바', 'Algieba', true),
  s('Leo-beta', 'Leo', 'β', 11.818, 14.572, 2.14, 0.09, '데네볼라', 'Denebola'),
  s('Leo-delta', 'Leo', 'δ', 11.235, 20.524, 2.56, 0.12, '조스마', 'Zosma'),
  s('Leo-epsilon', 'Leo', 'ε', 9.764, 23.774, 2.98, 0.81, '알게누비', 'Algenubi'),
  s('Leo-theta', 'Leo', 'θ', 11.237, 15.430, 3.34, -0.01, '체르탄', 'Chertan'),
  s('Leo-zeta', 'Leo', 'ζ', 10.278, 23.417, 3.44, 0.31, '아드하페라', 'Adhafera'),
  s('Vir-alpha', 'Vir', 'α', 13.420, -11.161, 0.97, -0.23, '스피카', 'Spica', false, true),
  s('Vir-gamma', 'Vir', 'γ', 12.694, -1.449, 2.74, 0.36, '포리마', 'Porrima', true),
  s('Vir-epsilon', 'Vir', 'ε', 13.036, 10.959, 2.83, 0.94, '빈데미아트릭스', 'Vindemiatrix'),
  s('Vir-zeta', 'Vir', 'ζ', 13.578, -0.596, 3.37, 0.11, '헤제', 'Heze'),
  s('Vir-delta', 'Vir', 'δ', 12.926, 3.397, 3.38, 1.58, '아우바', 'Auva'),
  s('Vir-beta', 'Vir', 'β', 11.845, 1.765, 3.61, 0.55, '자비야바', 'Zavijava'),
  s('Boo-alpha', 'Boo', 'α', 14.261, 19.182, -0.05, 1.23, '아크투루스', 'Arcturus'),
  s('Boo-epsilon', 'Boo', 'ε', 14.750, 27.074, 2.37, 0.97, '이자르', 'Izar', true),
  s('Boo-eta', 'Boo', 'η', 13.911, 18.398, 2.68, 0.58, '무프리드', 'Muphrid'),
  s('Boo-gamma', 'Boo', 'γ', 14.535, 38.308, 3.03, 0.19, '세긴누스', 'Seginus'),
  s('Boo-beta', 'Boo', 'β', 15.032, 40.391, 3.50, 0.97, '네카르', 'Nekkar'),
  s('CrB-alpha', 'CrB', 'α', 15.578, 26.715, 2.23, -0.02, '알페카', 'Alphecca', false, true),
  s('Her-beta', 'Her', 'β', 16.504, 21.490, 2.77, 0.94, '코르네포로스', 'Kornephoros'),
  s('Her-zeta', 'Her', 'ζ', 16.688, 31.603, 2.81, 0.65, undefined, undefined, true),
  s('Her-alpha', 'Her', 'α', 17.244, 14.390, 3.08, 1.44, '라스알게티', 'Rasalgethi', true, true),
  s('Sco-alpha', 'Sco', 'α', 16.490, -26.432, 0.96, 1.83, '안타레스', 'Antares', true, true),
  s('Sco-lambda', 'Sco', 'λ', 17.560, -37.104, 1.63, -0.22, '샤울라', 'Shaula'),
  s('Sco-theta', 'Sco', 'θ', 17.622, -42.998, 1.87, 0.40, '사르가스', 'Sargas'),
  s('Sco-delta', 'Sco', 'δ', 16.005, -22.622, 2.32, -0.12, '드슈바', 'Dschubba'),
  s('Sco-epsilon', 'Sco', 'ε', 16.836, -34.293, 2.29, 1.15, '라라와그', 'Larawag'),
  s('Sco-kappa', 'Sco', 'κ', 17.708, -39.030, 2.41, -0.22, '기르타브', 'Girtab'),
  s('Sco-beta', 'Sco', 'β', 16.091, -19.805, 2.62, -0.07, '아크라브', 'Acrab', true),
  s('Sgr-epsilon', 'Sgr', 'ε', 18.403, -34.385, 1.85, -0.03, '카우스 오스트랄리스', 'Kaus Australis'),
  s('Sgr-sigma', 'Sgr', 'σ', 18.921, -26.297, 2.02, -0.22, '눈키', 'Nunki'),
  s('Sgr-zeta', 'Sgr', 'ζ', 19.044, -29.880, 2.60, 0.08, '아셀라', 'Ascella', true),
  s('Sgr-delta', 'Sgr', 'δ', 18.350, -29.828, 2.70, 1.38, '카우스 메디아', 'Kaus Media'),
  s('Sgr-lambda', 'Sgr', 'λ', 18.466, -25.422, 2.81, 1.04, '카우스 보레알리스', 'Kaus Borealis'),
  s('Oph-alpha', 'Oph', 'α', 17.582, 12.560, 2.08, 0.15, '라스알하게', 'Rasalhague'),
  s('Oph-eta', 'Oph', 'η', 17.173, -15.725, 2.43, 0.06, '사비크', 'Sabik', true),
  s('Dra-gamma', 'Dra', 'γ', 17.943, 51.489, 2.23, 1.52, '엘타닌', 'Eltanin'),
  s('Dra-eta', 'Dra', 'η', 16.400, 61.514, 2.74, 0.91, '알디바인', 'Athebyne'),
  s('Dra-beta', 'Dra', 'β', 17.507, 52.301, 2.79, 0.98, '라스타반', 'Rastaban'),
  s('Dra-alpha', 'Dra', 'α', 14.073, 64.376, 3.65, -0.05, '투반', 'Thuban'),

  // Southern & Other Major Named Stars
  s('PsA-alpha', 'PsA', 'α', 22.961, -29.622, 1.16, 0.09, '포말하우트', 'Fomalhaut'),
  s('Car-alpha', 'Car', 'α', 6.399, -52.696, -0.74, 0.15, '카노푸스', 'Canopus'),
  s('Car-beta', 'Car', 'β', 9.220, -69.717, 1.68, 0.00, '미아플라시두스', 'Miaplacidus'),
  s('Car-epsilon', 'Car', 'ε', 8.375, -59.510, 1.86, 1.27, '아비오르', 'Avior'),
  s('Cen-alpha', 'Cen', 'α', 14.660, -60.834, -0.27, 0.71, '리길 켄타우루스', 'Rigil Kentaurus', true),
  s('Cen-beta', 'Cen', 'β', 14.064, -60.373, 0.61, -0.23, '하다르', 'Hadar', true),
  s('Cru-alpha', 'Cru', 'α', 12.443, -63.099, 0.76, -0.24, '아크룩스', 'Acrux', true),
  s('Cru-beta', 'Cru', 'β', 12.795, -59.689, 1.25, -0.23, '미모사', 'Mimosa'),
  s('Cru-gamma', 'Cru', 'γ', 12.519, -57.113, 1.63, 1.59, '가크룩스', 'Gacrux'),
  s('Eri-alpha', 'Eri', 'α', 1.629, -57.237, 0.46, -0.16, '아케르나르', 'Achernar'),
  s('Cet-beta', 'Cet', 'β', 0.727, -17.987, 2.04, 1.02, '디프다', 'Diphda'),
  s('Cet-alpha', 'Cet', 'α', 3.038, 4.090, 2.53, 1.64, '멘카르', 'Menkar'),
  s('Cet-omicron', 'Cet', 'ο', 2.322, -2.978, 3.04, 1.42, '미라', 'Mira', true, true),
  s('Ari-alpha', 'Ari', 'α', 2.120, 23.462, 2.00, 1.15, '하말', 'Hamal'),
  s('Ari-beta', 'Ari', 'β', 1.911, 20.808, 2.64, 0.13, '셰라탄', 'Sheratan'),
  s('CVn-alpha', 'CVn', 'α', 12.934, 38.318, 2.89, -0.12, '코르 카롤리', 'Cor Caroli', true),
  s('Hya-alpha', 'Hya', 'α', 9.460, -8.659, 1.98, 1.44, '알파드', 'Alphard'),
  s('Aqr-beta', 'Aqr', 'β', 21.526, -5.571, 2.91, 0.83, '사달수드', 'Sadalsuud'),
  s('Aqr-alpha', 'Aqr', 'α', 22.096, -0.320, 2.96, 0.98, '사달멜리크', 'Sadalmelik'),
  s('Cap-delta', 'Cap', 'δ', 21.784, -16.127, 2.87, 0.29, '데네브 알게디', 'Deneb Algedi', false, true),
  s('Gru-alpha', 'Gru', 'α', 22.137, -46.961, 1.74, -0.13, '알나이르', 'Alnair'),
  s('Pav-alpha', 'Pav', 'α', 20.427, -56.735, 1.94, -0.20, '피콕(공작성)', 'Peacock'),
  s('TrA-alpha', 'TrA', 'α', 16.811, -69.028, 1.91, 1.44, '아트리아', 'Atria'),
  s('Vel-gamma', 'Vel', 'γ', 8.159, -47.337, 1.75, -0.22, '수하일', 'Regor', true),
  s('Phe-alpha', 'Phe', 'α', 0.438, -42.306, 2.40, 1.09, '앙카', 'Ankaa'),
  s('Lib-beta', 'Lib', 'β', 15.283, -9.383, 2.61, -0.11, '주벤에샤말리', 'Zubeneschamali'),
  s('Lib-alpha', 'Lib', 'α', 14.848, -16.042, 2.75, 0.15, '주벤엘게누비', 'Zubenelgenubi', true),
  s('Ser-alpha', 'Ser', 'α', 15.738, 6.426, 2.63, 1.17, '우누칼하이', 'Unukalhai'),
  s('Lep-alpha', 'Lep', 'α', 5.545, -17.822, 2.58, 0.21, '아르네브', 'Arneb'),
  s('Col-alpha', 'Col', 'α', 5.661, -34.074, 2.65, -0.12, '팍트', 'Phact'),
];

/**
 * Combined Bright Stars + All 88 Constellation Stick-Figure Vertex Stars
 */
export const BRIGHT_STARS: StarRecord[] = [
  ...BASE_BRIGHT_STARS,
  ...buildConstellationVertexStars(BASE_BRIGHT_STARS),
];

/**
 * All 88 Official IAU Constellations with stick figure segments and boundary polygons
 */
export const CONSTELLATION_DATA: ConstellationStick[] = ALL_88_CONSTELLATIONS;

/**
 * Generate seamless 360-degree North & South Galactic Isophote Ribbon edges
 */
function buildGalacticBandEdges(
  halfWidthDeg: number,
  wobbleAmpDeg = 2.0,
  stepDeg = 3
): [Array<[number, number]>, Array<[number, number]>] {
  const north: Array<[number, number]> = [];
  const south: Array<[number, number]> = [];

  for (let l = 0; l < 360; l += stepDeg) {
    const rad = (l * Math.PI) / 180;
    const bulgeFactor =
      1 +
      0.55 * Math.exp(-Math.pow(((l + 180) % 360) - 180, 2) / 1400) +
      0.28 * Math.exp(-Math.pow(l - 80, 2) / 900) +
      0.32 * Math.exp(-Math.pow(l - 285, 2) / 900);

    const w = halfWidthDeg * bulgeFactor;
    const ripple = wobbleAmpDeg * Math.sin(rad * 4) * Math.cos(rad * 2.5);
    north.push(galacticToEquatorial(l, w + ripple));
    south.push(galacticToEquatorial(l, -w + ripple * 0.7));
  }

  if (north.length > 0) north.push([...north[0]]);
  if (south.length > 0) south.push([...south[0]]);
  return [north, south];
}

function buildGalacticCloudBlob(
  lCenter: number,
  bCenter: number,
  lRadius: number,
  bRadius: number,
  irregularity = 0.18,
  points = 32
): Array<[number, number]> {
  const poly: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * Math.PI * 2;
    const mod =
      1 +
      irregularity * Math.sin(theta * 3 + lCenter * 0.1) +
      irregularity * 0.5 * Math.cos(theta * 5);
    const l = lCenter + lRadius * mod * Math.cos(theta);
    const b = bCenter + bRadius * mod * Math.sin(theta);
    poly.push(galacticToEquatorial((l + 360) % 360, b));
  }
  if (poly.length > 0) poly.push([...poly[0]]);
  return poly;
}

const MW_LEVEL_1_BAND = buildGalacticBandEdges(12.5, 2.2, 3);
const MW_LEVEL_2_BAND = buildGalacticBandEdges(6.8, 1.5, 3);

/**
 * Multi-Level Vector Milky Way Isophote Contours (은하수 등고선)
 */
export const MILKY_WAY_CONTOURS: MilkyWayContourLevel[] = [
  {
    id: 'mw-level-1',
    level: 1,
    labelKo: '은하수 외곽 등고선 (Level 1 Halo)',
    labelEn: 'Outer Galactic Isophote (Level 1)',
    polygons: [MW_LEVEL_1_BAND[0], MW_LEVEL_1_BAND[1]],
    bandRings: MW_LEVEL_1_BAND,
  },
  {
    id: 'mw-level-2',
    level: 2,
    labelKo: '은하수 중심 띠 등고선 (Level 2 Main Band)',
    labelEn: 'Intermediate Galactic Band (Level 2)',
    polygons: [MW_LEVEL_2_BAND[0], MW_LEVEL_2_BAND[1]],
    bandRings: MW_LEVEL_2_BAND,
  },
  {
    id: 'mw-level-3',
    level: 3,
    labelKo: '은하수 고밀도 성운군 등고선 (Level 3 Star Clouds)',
    labelEn: 'Bright Galactic Core & Star Clouds (Level 3)',
    polygons: [
      buildGalacticCloudBlob(0, -1.5, 22, 5.8, 0.22),
      buildGalacticCloudBlob(26, -1.2, 9.5, 3.8, 0.16),
      buildGalacticCloudBlob(78, 1.0, 14.5, 4.2, 0.2),
      buildGalacticCloudBlob(125, -1.0, 13.0, 3.4, 0.18),
      buildGalacticCloudBlob(202, 0.5, 14.0, 3.2, 0.15),
      buildGalacticCloudBlob(288, -0.8, 21.0, 4.8, 0.2),
      buildGalacticCloudBlob(328, 0.5, 14.0, 4.0, 0.18),
    ],
  },
];

/**
 * Additional famous extended Sharpless / IC Nebulae with fchart3 vector outlines
 */
const EXTRA_EXTENDED_NEBULAE: DSORecord[] = [
  {
    id: 'IC 1396',
    catalogAlt: 'Sh2-131',
    nameKo: '코끼리 코 성운',
    nameEn: "Elephant's Trunk Nebula",
    type: 'emission_nebula',
    constellation: 'Cep',
    raHours: 21.65,
    raDeg: 324.75,
    decDeg: 57.5,
    mag: 3.5,
    sizeMajorArcmin: 170,
    sizeMinorArcmin: 140,
    positionAngleDeg: 0,
    descriptionKo: '세페우스자리 석류석 별 주변의 거대 전리수소 영역 벡터 윤곽입니다.',
    contourPolygons: [
      buildNebulaContour(21.65, 57.5, 1.5, 0.88, 10, [0.16, -0.14, 0.12]),
    ],
  },
  {
    id: 'NGC 1499',
    catalogAlt: 'Sh2-220',
    nameKo: '캘리포니아 성운',
    nameEn: 'California Nebula',
    type: 'emission_nebula',
    constellation: 'Per',
    raHours: 4.05,
    raDeg: 60.75,
    decDeg: 36.42,
    mag: 5.0,
    sizeMajorArcmin: 150,
    sizeMinorArcmin: 40,
    positionAngleDeg: 145,
    descriptionKo: '페르세우스자리 제타성 북쪽의 길쭉한 발광성운 윤곽입니다.',
    contourPolygons: [
      buildNebulaContour(4.05, 36.42, 1.35, 0.34, 145, [0.22, -0.15, 0.09]),
    ],
  },
  {
    id: 'IC 1805',
    catalogAlt: 'Sh2-190',
    nameKo: '하트 & 소울 성운',
    nameEn: 'Heart & Soul Nebulae',
    type: 'emission_nebula',
    constellation: 'Cas',
    raHours: 2.55,
    raDeg: 38.25,
    decDeg: 61.45,
    mag: 6.5,
    sizeMajorArcmin: 150,
    sizeMinorArcmin: 120,
    positionAngleDeg: 130,
    descriptionKo: '카시오페이아자리 동쪽 경계의 대형 복합 성운 영역(IC 1805 + IC 1848)입니다.',
    contourPolygons: [
      buildNebulaContour(2.55, 61.45, 1.15, 0.85, 130, [0.28, -0.2, 0.14]),
      buildNebulaContour(2.85, 60.4, 0.95, 0.65, 115, [0.24, 0.15, -0.12]),
    ],
  },
];

export { MESSIER_CATALOG, CALDWELL_CATALOG };

/**
 * Full Deep-Sky Object Catalog:
 * - All 110 Messier Objects (M1 - M110)
 * - All 109 Caldwell Objects (C1 - C109)
 * - Additional Extended Nebulae (IC 1396, NGC 1499, IC 1805)
 */
export const DSO_CATALOG: DSORecord[] = [
  ...MESSIER_CATALOG,
  ...CALDWELL_CATALOG,
  ...EXTRA_EXTENDED_NEBULAE,
];

/**
 * Deterministic spatial star generator (simulating fchart3 Gaia/Tycho2/UCAC4 catalog down to mag 14.0)
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cachedProceduralStars: StarRecord[] | null = null;

export function getAllProceduralStars(): StarRecord[] {
  if (cachedProceduralStars) return cachedProceduralStars;

  const list: StarRecord[] = [];
  const rng = seededRandom(20261116);
  const totalCount = 16000;

  for (let i = 0; i < totalCount; i++) {
    let raDeg: number;
    let decDeg: number;

    if (rng() < 0.36) {
      const l = rng() * 360;
      const u1 = Math.max(0.0001, rng());
      const u2 = rng();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const b = Math.max(-32, Math.min(32, z * 9.5));
      [raDeg, decDeg] = galacticToEquatorial(l, b);
    } else {
      raDeg = rng() * 360;
      const sinDec = rng() * 2 - 1;
      decDeg = (Math.asin(sinDec) * 180) / Math.PI;
    }

    const u = rng();
    // Distribute stars smoothly from mag 4.1 up to mag 14.0
    const mag = Number((4.1 + Math.pow(u, 0.48) * 9.9).toFixed(2));
    const bv = Number((-0.2 + Math.pow(rng(), 1.3) * 1.75).toFixed(2));
    const isDouble = mag < 7.5 && rng() < 0.045;

    list.push({
      id: `TYC-${i + 1000}`,
      constellation: '',
      raHours: Number((raDeg / 15).toFixed(4)),
      raDeg: Number(raDeg.toFixed(4)),
      decDeg: Number(decDeg.toFixed(4)),
      mag,
      bv,
      isDouble,
      isProcedural: true,
    });
  }

  cachedProceduralStars = list;
  return list;
}

/**
 * Generate deterministic deep-field stars (mag 10.5 .. 14.0) for sky tiles around the current center
 * when zooming in or using deep limiting magnitudes (up to 14.0), covering the full widescreen viewport.
 */
function getDeepFieldTileStars(
  centerRaDeg: number,
  centerDecDeg: number,
  fovDeg: number,
  limitStarMag: number,
  maxRadiusDeg: number
): StarRecord[] {
  if (limitStarMag <= 10.5) return [];

  const tileSizeDeg =
    fovDeg <= 0.08
      ? 0.025
      : fovDeg <= 0.25
      ? 0.0625
      : fovDeg <= 0.8
      ? 0.2
      : fovDeg <= 2.5
      ? 0.5
      : fovDeg <= 6
      ? 1.0
      : fovDeg <= 15
      ? 2.0
      : fovDeg <= 30
      ? 4.0
      : fovDeg <= 60
      ? 6.0
      : 10.0;
  const maxRadius = Math.min(130, Math.max(maxRadiusDeg, fovDeg * 1.8 + tileSizeDeg * 2));
  const minDec = Math.max(-89, centerDecDeg - maxRadius);
  const maxDec = Math.min(89, centerDecDeg + maxRadius);

  const decStartIdx = Math.floor((minDec + 90) / tileSizeDeg);
  const decEndIdx = Math.floor((maxDec + 90) / tileSizeDeg);
  const totalRaTiles = Math.round(360 / tileSizeDeg);

  // Scale stars per tile by how deep past mag 10.5 the user has set (up to 14.0)
  const depthFraction = Math.min(1, (limitStarMag - 10.5) / 3.5);
  const basePerTile =
    fovDeg <= 0.25 ? 6 : fovDeg <= 2.5 ? 8 : fovDeg <= 15 ? 14 : fovDeg <= 35 ? 8 : 5;
  const starsPerTile = Math.max(2, Math.round(depthFraction * basePerTile));

  const deepStars: StarRecord[] = [];

  for (let dIdx = decStartIdx; dIdx <= decEndIdx; dIdx++) {
    const tileDecMin = dIdx * tileSizeDeg - 90;
    const tileDecCenter = tileDecMin + tileSizeDeg * 0.5;
    const nearPole = Math.abs(tileDecCenter) + maxRadius >= 89.2;
    const cosDec = Math.max(0.08, Math.cos((tileDecCenter * Math.PI) / 180));
    const raHalfSpanDeg = nearPole ? 180 : Math.min(180, (maxRadius + tileSizeDeg) / cosDec);

    const raStartIdx =
      raHalfSpanDeg >= 179.5
        ? 0
        : Math.floor((centerRaDeg - raHalfSpanDeg) / tileSizeDeg);
    const raEndIdx =
      raHalfSpanDeg >= 179.5
        ? totalRaTiles - 1
        : Math.floor((centerRaDeg + raHalfSpanDeg) / tileSizeDeg);

    for (let rawR = raStartIdx; rawR <= raEndIdx; rawR++) {
      const rIdx = ((rawR % totalRaTiles) + totalRaTiles) % totalRaTiles;
      const tileRaMin = rIdx * tileSizeDeg;
      const tileRaCenter = tileRaMin + tileSizeDeg * 0.5;

      if (
        angularDistanceDeg(centerRaDeg, centerDecDeg, tileRaCenter, tileDecCenter) >
        maxRadius
      ) {
        continue;
      }

      const tileSeed = ((dIdx + 5000) * 73856093) ^ ((rIdx + 1000) * 19349663);
      const rng = seededRandom(tileSeed);

      for (let k = 0; k < starsPerTile; k++) {
        const mag = Number((10.5 + Math.pow(rng(), 0.68) * 3.5).toFixed(2));
        if (mag > limitStarMag) continue;

        const raDeg = (tileRaMin + rng() * tileSizeDeg + 360) % 360;
        const decDeg = Math.max(-89.9, Math.min(89.9, tileDecMin + rng() * tileSizeDeg));
        const bv = Number((-0.15 + Math.pow(rng(), 1.2) * 1.65).toFixed(2));

        deepStars.push({
          id: `UCAC4-${dIdx}-${rIdx}-${k}`,
          constellation: '',
          raHours: Number((raDeg / 15).toFixed(4)),
          raDeg: Number(raDeg.toFixed(4)),
          decDeg: Number(decDeg.toFixed(4)),
          mag,
          bv,
          isProcedural: true,
        });
      }
    }
  }

  return deepStars;
}

/**
 * Angular distance in degrees between two Equatorial J2000 coordinates
 */
export function angularDistanceDeg(
  raDeg1: number,
  decDeg1: number,
  raDeg2: number,
  decDeg2: number
): number {
  const rad = Math.PI / 180;
  const r1 = raDeg1 * rad;
  const d1 = decDeg1 * rad;
  const r2 = raDeg2 * rad;
  const d2 = decDeg2 * rad;

  const cosAngle =
    Math.sin(d1) * Math.sin(d2) +
    Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2);
  return (Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180) / Math.PI;
}

/**
 * Query visible stars for a given center (RA/Dec), FOV, and limiting magnitude (up to 14.0).
 * Accounts for wide aspect ratios and stereographic corner reach so stars fill the entire viewport.
 */
export function getVisibleStars(
  centerRaDeg: number,
  centerDecDeg: number,
  fovDeg: number,
  limitStarMag: number,
  aspectDiagonalFactor = 2.6
): StarRecord[] {
  const fovRad = (Math.max(0.015, Math.min(165, fovDeg)) * Math.PI) / 180;
  const stereographicCornerDeg =
    ((2 * Math.atan(2 * aspectDiagonalFactor * Math.tan(fovRad / 4))) * 180) / Math.PI;
  const maxRadius = Math.min(
    180,
    Math.max(fovDeg * aspectDiagonalFactor + 20, stereographicCornerDeg + 16)
  );
  const deepRadius = Math.min(
    130,
    Math.max(
      fovDeg * aspectDiagonalFactor + Math.min(8, Math.max(0.15, fovDeg * 0.5)),
      stereographicCornerDeg + Math.min(6, Math.max(0.15, fovDeg * 0.4))
    )
  );

  const bright = BRIGHT_STARS.filter(
    (st) =>
      st.mag <= limitStarMag &&
      angularDistanceDeg(centerRaDeg, centerDecDeg, st.raDeg, st.decDeg) <= maxRadius
  );

  if (limitStarMag <= 4.1) {
    return bright;
  }

  const allProc = getAllProceduralStars();
  const proc = allProc.filter(
    (st) =>
      st.mag <= limitStarMag &&
      angularDistanceDeg(centerRaDeg, centerDecDeg, st.raDeg, st.decDeg) <= maxRadius
  );

  const deepTileStars =
    limitStarMag > 10.5 && fovDeg <= 65
      ? getDeepFieldTileStars(centerRaDeg, centerDecDeg, fovDeg, limitStarMag, deepRadius)
      : [];

  return [...bright, ...proc, ...deepTileStars];
}
