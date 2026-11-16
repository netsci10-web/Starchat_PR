import { DSORecord, DSOType } from '../types/astronomy';

/**
 * Helper to create realistic multi-lobe nebula / galaxy vector contour polygons in [raDeg, decDeg]
 */
export function buildNebulaContour(
  raHours: number,
  decDeg: number,
  radiusRawDeg: number,
  aspectRatio: number,
  paDeg: number,
  lobeCoeffs: number[] = [0.22, -0.14, 0.11]
): Array<[number, number]> {
  const centerRa = raHours * 15;
  const centerDec = decDeg;
  const cosDec = Math.max(0.15, Math.cos((centerDec * Math.PI) / 180));
  const paRad = (paDeg * Math.PI) / 180;
  const pts: Array<[number, number]> = [];
  const n = 32;

  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    let rMod = 1.0;
    lobeCoeffs.forEach((c, idx) => {
      rMod += c * Math.sin(theta * (idx + 2) + (idx + 1) * 0.8);
    });
    const xLocal = radiusRawDeg * rMod * Math.cos(theta);
    const yLocal = radiusRawDeg * aspectRatio * rMod * Math.sin(theta);

    const dRa = (xLocal * Math.cos(paRad) - yLocal * Math.sin(paRad)) / cosDec;
    const dDec = xLocal * Math.sin(paRad) + yLocal * Math.cos(paRad);

    pts.push([
      Number((((centerRa + dRa) % 360 + 360) % 360).toFixed(4)),
      Number(Math.max(-89.5, Math.min(89.5, centerDec + dDec)).toFixed(4)),
    ]);
  }
  if (pts.length > 0) pts.push([...pts[0]]);
  return pts;
}

const TYPE_KO_LABEL: Record<DSOType, string> = {
  emission_nebula: '발광성운',
  reflection_nebula: '반사성운',
  planetary_nebula: '행성상성운',
  supernova_remnant: '초신성 잔해',
  dark_nebula: '암흑성운',
  spiral_galaxy: '나선은하',
  elliptical_galaxy: '타원은하',
  irregular_galaxy: '불규칙은하',
  globular_cluster: '구상성단',
  open_cluster: '산개성단',
};

function mItem(
  num: number,
  catalogAlt: string,
  nameKo: string,
  nameEn: string,
  type: DSOType,
  constellation: string,
  raHours: number,
  decDeg: number,
  mag: number,
  sizeMajorArcmin: number,
  sizeMinorArcmin: number,
  positionAngleDeg = 0,
  descriptionKo?: string,
  contourPolygons?: Array<Array<[number, number]>>
): DSORecord {
  const id = `M${num}`;
  // Automatically generate vector outline contour for large extended nebulae and large galaxies
  let contours = contourPolygons;
  if (
    !contours &&
    sizeMajorArcmin >= 22 &&
    (type === 'emission_nebula' ||
      type === 'reflection_nebula' ||
      type === 'supernova_remnant' ||
      type === 'spiral_galaxy')
  ) {
    const rDeg = Math.max(0.22, Math.min(1.5, sizeMajorArcmin / 120));
    const aspect = Math.max(0.25, Math.min(1.0, sizeMinorArcmin / Math.max(1, sizeMajorArcmin)));
    contours = [
      buildNebulaContour(
        raHours,
        decDeg,
        rDeg,
        aspect,
        positionAngleDeg,
        type.includes('galaxy') ? [0.05, 0.02, 0.0] : [0.22, -0.14, 0.1]
      ),
    ];
  }

  return {
    id,
    messierId: id,
    catalogAlt,
    nameKo,
    nameEn,
    type,
    constellation,
    raHours: Number(raHours.toFixed(4)),
    raDeg: Number((raHours * 15).toFixed(4)),
    decDeg: Number(decDeg.toFixed(4)),
    mag,
    sizeMajorArcmin,
    sizeMinorArcmin,
    positionAngleDeg,
    descriptionKo:
      descriptionKo ||
      `${constellation} 영역에 위치한 메시에 ${id} (${catalogAlt}) ${TYPE_KO_LABEL[type]}입니다. 밝기 ${mag.toFixed(1)}등급, 시직경 ${sizeMajorArcmin}′×${sizeMinorArcmin}′.`,
    contourPolygons: contours,
  };
}

/**
 * Complete Messier Catalog: M1 through M110 (All 110 Objects)
 * Epoch J2000.0
 */
export const MESSIER_CATALOG: DSORecord[] = [
  mItem(1, 'NGC 1952', '게 성운', 'Crab Nebula', 'supernova_remnant', 'Tau', 5.5755, 22.0145, 8.4, 7, 5, 140, '1054년 초신성 폭발 잔해이자 메시에 목록 1번 천체입니다.', [
    buildNebulaContour(5.5755, 22.0145, 0.18, 0.7, 140, [0.18, -0.12, 0.09]),
  ]),
  mItem(2, 'NGC 7089', '물병자리 구상성단 M2', 'M2 Globular Cluster', 'globular_cluster', 'Aqr', 21.5575, -0.8233, 6.3, 16, 16),
  mItem(3, 'NGC 5272', '사냥개자리 구상성단 M3', 'M3 Globular Cluster', 'globular_cluster', 'CVn', 13.7032, 28.3772, 6.2, 18, 18, 0, '약 50만 개의 항성을 포함하는 북반구 대표 구상성단입니다.'),
  mItem(4, 'NGC 6121', '전갈자리 구상성단 M4', 'Spider Globular Cluster', 'globular_cluster', 'Sco', 16.3931, -26.5258, 5.6, 36, 36, 0, '안타레스 바로 서쪽에 위치한 지구에서 가장 가까운 구상성단 중 하나입니다.'),
  mItem(5, 'NGC 5904', '뱀자리 구상성단 M5', 'Rose Globular Cluster', 'globular_cluster', 'Ser', 15.3099, 2.0811, 5.7, 23, 23),
  mItem(6, 'NGC 6405', '나비 성단', 'Butterfly Cluster', 'open_cluster', 'Sco', 17.6683, -32.2533, 4.2, 25, 25, 0, '전갈자리 꼬리 부근의 나비 모양 산개성단입니다.'),
  mItem(7, 'NGC 6475', '프톨레마이오스 성단', 'Ptolemy Cluster', 'open_cluster', 'Sco', 17.8975, -34.7933, 3.3, 80, 80, 0, '전갈자리 침 동쪽의 대형 육안 산개성단입니다.'),
  mItem(8, 'NGC 6523', '석호 성운 (라군 성운)', 'Lagoon Nebula', 'emission_nebula', 'Sgr', 18.0631, -24.3867, 5.0, 90, 40, 110, '궁수자리 은하수 중심부의 거대 발광성운입니다.', [
    buildNebulaContour(18.0631, -24.3867, 0.9, 0.55, 110, [0.24, -0.18, 0.12]),
  ]),
  mItem(9, 'NGC 6333', '뱀주인자리 구상성단 M9', 'M9 Globular Cluster', 'globular_cluster', 'Oph', 17.3199, -18.5161, 7.7, 12, 12),
  mItem(10, 'NGC 6254', '뱀주인자리 구상성단 M10', 'M10 Globular Cluster', 'globular_cluster', 'Oph', 16.9525, -4.1003, 6.4, 20, 20),
  mItem(11, 'NGC 6705', '야생오리 성단', 'Wild Duck Cluster', 'open_cluster', 'Sct', 18.8514, -6.27, 5.8, 14, 14, 0, '방패자리 은하수 성운군 내부의 매우 조밀한 산개성단입니다.'),
  mItem(12, 'NGC 6218', '뱀주인자리 구상성단 M12', 'Gumball Globular Cluster', 'globular_cluster', 'Oph', 16.7872, -1.9486, 6.7, 16, 16),
  mItem(13, 'NGC 6205', '헤르쿨레스 대구상성단', 'Hercules Globular Cluster', 'globular_cluster', 'Her', 16.6949, 36.4614, 5.8, 20, 20, 0, '북반구 최고의 구상성단으로 수십만 개의 별이 밀집해 있습니다.'),
  mItem(14, 'NGC 6402', '뱀주인자리 구상성단 M14', 'M14 Globular Cluster', 'globular_cluster', 'Oph', 17.6267, -3.2458, 7.6, 11, 11),
  mItem(15, 'NGC 7078', '페가수스 구상성단 M15', 'Great Pegasus Cluster', 'globular_cluster', 'Peg', 21.4995, 12.167, 6.2, 18, 18, 0, '페가수스자리 코 끝 에니프 북서쪽의 중심핵 붕괴 구상성단입니다.'),
  mItem(16, 'NGC 6611', '독수리 성운', 'Eagle Nebula', 'emission_nebula', 'Ser', 18.3133, -13.7917, 6.0, 70, 50, 20, '창조의 기둥으로 유명한 메시에 발광성운 및 산개성단입니다.', [
    buildNebulaContour(18.3133, -13.7917, 0.65, 0.68, 20, [0.26, -0.15, 0.12]),
  ]),
  mItem(17, 'NGC 6618', '오메가 성운 (백조 성운)', 'Omega / Swan Nebula', 'emission_nebula', 'Sgr', 18.3464, -16.1767, 6.0, 46, 37, 120, '궁수자리 북쪽 경계의 고밀도 H II 발광성운입니다.', [
    buildNebulaContour(18.3464, -16.1767, 0.58, 0.52, 120, [0.22, -0.16, 0.1]),
  ]),
  mItem(18, 'NGC 6613', '궁수자리 산개성단 M18', 'Black Swan Cluster', 'open_cluster', 'Sgr', 18.3328, -17.1017, 6.9, 9, 9),
  mItem(19, 'NGC 6273', '뱀주인자리 구상성단 M19', 'M19 Oblate Globular', 'globular_cluster', 'Oph', 17.0439, -26.2678, 6.8, 17, 17),
  mItem(20, 'NGC 6514', '삼열 성운 (트라이피드 성운)', 'Trifid Nebula', 'emission_nebula', 'Sgr', 18.045, -23.03, 6.3, 28, 28, 0, '발광·반사·암흑성운이 3분할로 결합된 삼열 성운입니다.', [
    buildNebulaContour(18.045, -23.03, 0.42, 0.85, 0, [0.16, 0.14, -0.08]),
  ]),
  mItem(21, 'NGC 6531', '궁수자리 산개성단 M21', 'Webb’s Cross Cluster', 'open_cluster', 'Sgr', 18.0703, -22.49, 5.9, 13, 13),
  mItem(22, 'NGC 6656', '궁수자리 대구상성단 M22', 'Great Sagittarius Cluster', 'globular_cluster', 'Sgr', 18.6067, -23.9047, 5.1, 32, 32, 0, '궁수자리 북동쪽의 매우 밝은 구상성단입니다.'),
  mItem(23, 'NGC 6494', '궁수자리 산개성단 M23', 'M23 Open Cluster', 'open_cluster', 'Sgr', 17.9511, -18.985, 5.5, 27, 27),
  mItem(24, 'IC 4715', '작은 궁수자리 항성구름', 'Small Sagittarius Star Cloud', 'open_cluster', 'Sgr', 18.28, -18.55, 4.6, 90, 40, 25, '은하수 나선팔이 암흑 먼지 사이로 드러난 거대 항성구름입니다.'),
  mItem(25, 'IC 4725', '궁수자리 산개성단 M25', 'M25 Open Cluster', 'open_cluster', 'Sgr', 18.5275, -19.1167, 4.6, 32, 32),
  mItem(26, 'NGC 6694', '방패자리 산개성단 M26', 'M26 Open Cluster', 'open_cluster', 'Sct', 18.755, -9.3833, 8.0, 15, 15),
  mItem(27, 'NGC 6853', '아령 성운 (덤벨 성운)', 'Dumbbell Nebula', 'planetary_nebula', 'Vul', 19.9934, 22.7211, 7.4, 8.0, 5.7, 125, '여우자리 영역의 가장 밝고 큰 행성상성운입니다.'),
  mItem(28, 'NGC 6626', '궁수자리 구상성단 M28', 'M28 Globular Cluster', 'globular_cluster', 'Sgr', 18.4092, -24.8697, 6.8, 11, 11),
  mItem(29, 'NGC 6913', '백조자리 냉각탑 성단 M29', 'Cooling Tower Cluster', 'open_cluster', 'Cyg', 20.3989, 38.5233, 6.6, 7, 7),
  mItem(30, 'NGC 7099', '염소자리 구상성단 M30', 'Jellyfish Globular Cluster', 'globular_cluster', 'Cap', 21.6728, -23.1797, 7.2, 12, 12),
  mItem(31, 'NGC 224', '안드로메다 은하', 'Andromeda Galaxy', 'spiral_galaxy', 'And', 0.7123, 41.2692, 3.4, 190, 60, 35, '국부은하군 최대의 나선은하로 35° 위치각 타원 벡터 윤곽으로 표현됩니다.', [
    buildNebulaContour(0.7123, 41.2692, 1.58, 0.32, 35, [0.04, 0.02, 0.0]),
    buildNebulaContour(0.7123, 41.2692, 0.75, 0.35, 35, [0.02, 0.0, 0.0]),
  ]),
  mItem(32, 'NGC 221', '안드로메다 동반은하 M32', 'Le Gentil (M32)', 'elliptical_galaxy', 'And', 0.7116, 40.8653, 8.1, 8.7, 6.5, 160, '안드로메다 은하 바로 남쪽에 붙어 있는 조밀한 왜소 타원은하입니다.'),
  mItem(33, 'NGC 598', '삼각형자리 은하 (바람개비 은하)', 'Triangulum Galaxy', 'spiral_galaxy', 'Tri', 1.5641, 30.6599, 5.7, 70, 42, 23, '삼각형자리 북서쪽의 대형 정면 나선은하입니다.', [
    buildNebulaContour(1.5641, 30.6599, 0.65, 0.62, 23, [0.08, -0.05, 0.04]),
  ]),
  mItem(34, 'NGC 1039', '페르세우스 산개성단 M34', 'Spiral Cluster M34', 'open_cluster', 'Per', 2.7014, 42.7617, 5.2, 35, 35),
  mItem(35, 'NGC 2168', '쌍둥이자리 산개성단 M35', 'Shoe-Buckle Cluster', 'open_cluster', 'Gem', 6.1483, 24.3333, 5.1, 28, 28, 0, '쌍둥이자리 발끝의 풍성한 산개성단입니다.'),
  mItem(36, 'NGC 1960', '마차부자리 바람개비 성단 M36', 'Pinwheel Cluster M36', 'open_cluster', 'Aur', 5.602, 34.14, 6.0, 12, 12),
  mItem(37, 'NGC 2099', '마차부자리 산개성단 M37', 'Salt and Pepper Cluster', 'open_cluster', 'Aur', 5.8717, 32.5533, 5.6, 24, 24, 0, '마차부자리 3대 메시에 산개성단 중 가장 조밀하고 밝은 성단입니다.'),
  mItem(38, 'NGC 1912', '불가사리 성단 M38', 'Starfish Cluster', 'open_cluster', 'Aur', 5.4781, 35.855, 6.4, 21, 21),
  mItem(39, 'NGC 7092', '백조자리 산개성단 M39', 'M39 Open Cluster', 'open_cluster', 'Cyg', 21.53, 48.4333, 4.6, 32, 32),
  mItem(40, 'Winnecke 4', '위네케 4 이중성', 'Winnecke 4 (WNC 4)', 'open_cluster', 'UMa', 12.37, 58.0828, 8.4, 1.0, 1.0, 0, '큰곰자리 메그레즈 북동쪽의 메시에 목록 유일의 광학 이중성입니다.'),
  mItem(41, 'NGC 2287', '큰개자리 산개성단 M41', 'Little Beehive Cluster', 'open_cluster', 'CMa', 6.7669, -20.7567, 4.5, 38, 38, 0, '시리우스 남쪽 약 4°에 자리한 밝은 산개성단입니다.'),
  mItem(42, 'NGC 1976', '오리온 대성운', 'Great Orion Nebula', 'emission_nebula', 'Ori', 5.5881, -5.3911, 4.0, 85, 60, 35, '오리온자리 소검 중앙의 대표적 메시에 발광성운으로 다중 등고선 벡터 윤곽선을 포함합니다.', [
    buildNebulaContour(5.5881, -5.3911, 0.85, 0.72, 35, [0.28, -0.18, 0.14]),
    buildNebulaContour(5.592, -4.85, 0.42, 0.65, 15, [0.18, 0.12, -0.1]),
  ]),
  mItem(43, 'NGC 1982', '드 메랑 성운', 'De Mairan’s Nebula', 'emission_nebula', 'Ori', 5.5931, -5.2667, 9.0, 20, 15, 20, '오리온 대성운(M42) 바로 북쪽에 암흑대로 분리된 발광성운입니다.'),
  mItem(44, 'NGC 2632', '프레세페 성단 (벌집 성단)', 'Beehive Cluster (Praesepe)', 'open_cluster', 'Cnc', 8.6703, 19.6667, 3.1, 95, 95, 0, '게자리 중심의 대표적 육안 산개성단입니다.'),
  mItem(45, 'Melotte 22', '플레이아데스 성단 (좀생이별)', 'Pleiades (Seven Sisters)', 'open_cluster', 'Tau', 3.7833, 24.1167, 1.6, 110, 90, 45, '황소자리의 대표적 산개성단 및 메로페 반사성운 외곽 등고선입니다.', [
    buildNebulaContour(3.7833, 24.1167, 0.95, 0.78, 45, [0.2, -0.14, 0.1]),
  ]),
  mItem(46, 'NGC 2437', '고물자리 산개성단 M46', 'M46 Open Cluster', 'open_cluster', 'Pup', 7.6967, -14.81, 6.1, 27, 27, 0, '내부에 행성상성운 NGC 2438이 겹쳐 보이는 풍성한 산개성단입니다.'),
  mItem(47, 'NGC 2422', '고물자리 산개성단 M47', 'M47 Open Cluster', 'open_cluster', 'Pup', 7.6097, -14.4833, 4.2, 30, 30),
  mItem(48, 'NGC 2548', '바다뱀자리 산개성단 M48', 'M48 Open Cluster', 'open_cluster', 'Hya', 8.2292, -5.75, 5.8, 54, 54),
  mItem(49, 'NGC 4472', '처녀자리 거대 타원은하 M49', 'M49 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.4963, 8.0004, 8.4, 10.2, 8.3, 155),
  mItem(50, 'NGC 2323', '하트 모양 성단 M50', 'Heart-Shaped Cluster', 'open_cluster', 'Mon', 7.0465, -8.3378, 5.9, 16, 16),
  mItem(51, 'NGC 5194', '소용돌이 은하 (부자 은하)', 'Whirlpool Galaxy', 'spiral_galaxy', 'CVn', 13.4979, 47.1953, 8.4, 11, 7, 163, '사냥개자리 북동쪽의 동반은하 NGC 5195와 상호작용하는 정면 나선은하입니다.'),
  mItem(52, 'NGC 7654', '카시오페이아 산개성단 M52', 'Scorpion Cluster M52', 'open_cluster', 'Cas', 23.4039, 61.5933, 6.9, 13, 13),
  mItem(53, 'NGC 5024', '머리털자리 구상성단 M53', 'M53 Globular Cluster', 'globular_cluster', 'Com', 13.2153, 18.1682, 7.6, 13, 13),
  mItem(54, 'NGC 6715', '궁수자리 구상성단 M54', 'M54 Sagittarius Dwarf Globular', 'globular_cluster', 'Sgr', 18.9176, -30.4799, 7.6, 12, 12),
  mItem(55, 'NGC 6809', '여름 장미 성단 M55', 'Summer Rose Star Cluster', 'globular_cluster', 'Sgr', 19.6666, -30.9648, 6.3, 19, 19),
  mItem(56, 'NGC 6779', '거문고자리 구상성단 M56', 'M56 Globular Cluster', 'globular_cluster', 'Lyr', 19.2765, 30.1835, 8.3, 8.8, 8.8),
  mItem(57, 'NGC 6720', '고리 성운 (링 성운)', 'Ring Nebula', 'planetary_nebula', 'Lyr', 18.8931, 33.0292, 8.8, 3.0, 2.4, 60, '거문고자리 셸리아크와 술라파트 사이의 대표적 고리 모양 행성상성운입니다.'),
  mItem(58, 'NGC 4579', '처녀자리 막대나선은하 M58', 'M58 Barred Spiral Galaxy', 'spiral_galaxy', 'Vir', 12.6288, 11.8181, 9.7, 5.9, 4.7, 95),
  mItem(59, 'NGC 4621', '처녀자리 타원은하 M59', 'M59 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.7006, 11.6469, 9.6, 5.4, 3.7, 165),
  mItem(60, 'NGC 4649', '처녀자리 거대 타원은하 M60', 'M60 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.7278, 11.5526, 8.8, 7.4, 6.0, 105),
  mItem(61, 'NGC 4303', '처녀자리 나선은하 M61', 'Swelling Spiral M61', 'spiral_galaxy', 'Vir', 12.3653, 4.4738, 9.7, 6.5, 5.8, 160),
  mItem(62, 'NGC 6266', '전갈자리 구상성단 M62', 'Flickering Globular M62', 'globular_cluster', 'Oph', 17.0202, -30.1124, 6.5, 15, 15),
  mItem(63, 'NGC 5055', '해바라기 은하', 'Sunflower Galaxy', 'spiral_galaxy', 'CVn', 13.2637, 42.0294, 8.6, 13, 7, 105, '사냥개자리 영역의 정교한 다중 나선팔 은하입니다.'),
  mItem(64, 'NGC 4826', '검은눈 은하', 'Black Eye Galaxy', 'spiral_galaxy', 'Com', 12.9455, 21.6827, 8.5, 10.7, 5.1, 115, '머리털자리의 짙은 중심부 암흑 먼지띠가 특징인 나선은하입니다.'),
  mItem(65, 'NGC 3623', '사자자리 삼중은하 M65', 'Leo Triplet M65', 'spiral_galaxy', 'Leo', 11.3155, 13.0922, 9.3, 9.8, 2.9, 170, 'M66 및 NGC 3628과 함께 사자자리 삼중은하(Leo Triplet)를 이룹니다.'),
  mItem(66, 'NGC 3627', '사자자리 삼중은하 M66', 'Leo Triplet M66', 'spiral_galaxy', 'Leo', 11.3375, 12.9913, 8.9, 9.1, 4.2, 173, '사자자리 삼중은하 중 가장 크고 비대칭 나선팔이 뚜렷한 은하입니다.'),
  mItem(67, 'NGC 2682', '킹 코브라 성단 M67', 'King Cobra / Golden Eye Cluster', 'open_cluster', 'Cnc', 8.855, 11.8, 6.1, 30, 30, 0, '게자리 남쪽의 약 40억 년 된 대표적인 고령 산개성단입니다.'),
  mItem(68, 'NGC 4590', '바다뱀자리 구상성단 M68', 'M68 Globular Cluster', 'globular_cluster', 'Hya', 12.6578, -26.7441, 7.8, 11, 11),
  mItem(69, 'NGC 6637', '궁수자리 구상성단 M69', 'M69 Globular Cluster', 'globular_cluster', 'Sgr', 18.5231, -32.3481, 7.6, 9.8, 9.8),
  mItem(70, 'NGC 6681', '궁수자리 구상성단 M70', 'M70 Globular Cluster', 'globular_cluster', 'Sgr', 18.7202, -32.2921, 7.9, 8.0, 8.0),
  mItem(71, 'NGC 6838', '화살자리 구상성단 M71', 'Angelfish Cluster M71', 'globular_cluster', 'Sge', 19.8962, 18.7792, 8.2, 7.2, 7.2),
  mItem(72, 'NGC 6981', '물병자리 구상성단 M72', 'M72 Globular Cluster', 'globular_cluster', 'Aqr', 20.891, -12.5373, 9.3, 6.6, 6.6),
  mItem(73, 'NGC 6994', '물병자리 성군 M73', 'M73 Asterism', 'open_cluster', 'Aqr', 20.9831, -12.6333, 9.0, 2.8, 2.8),
  mItem(74, 'NGC 628', '팬텀 은하 (유령 은하)', 'Phantom Galaxy', 'spiral_galaxy', 'Psc', 1.6116, 15.7836, 9.4, 10.5, 9.5, 25, '물고기자리 에타성 동쪽의 완벽한 대칭 나선팔을 지닌 정면 나선은하입니다.'),
  mItem(75, 'NGC 6864', '궁수자리 구상성단 M75', 'M75 Globular Cluster', 'globular_cluster', 'Sgr', 20.1013, -21.9223, 8.5, 6.8, 6.8),
  mItem(76, 'NGC 650', '작은 아령 성운', 'Little Dumbbell Nebula', 'planetary_nebula', 'Per', 1.7055, 51.5754, 10.1, 2.7, 1.8, 45, '페르세우스자리 북쪽의 양극성 행성상성운입니다.'),
  mItem(77, 'NGC 1068', '고래자리 A 은하 (오징어 은하)', 'Cetus A / Squid Galaxy', 'spiral_galaxy', 'Cet', 2.7113, -0.0133, 8.9, 7.1, 6.0, 70, '고래자리의 대표적인 세이퍼트 활동은하핵(AGN) 나선은하입니다.'),
  mItem(78, 'NGC 2068', '오리온자리 반사성운 M78', 'M78 Reflection Nebula', 'reflection_nebula', 'Ori', 5.7794, 0.05, 8.3, 8, 6, 45, '오리온의 삼태성 알니탁 북동쪽에 위치한 가장 밝은 확산 반사성운입니다.'),
  mItem(79, 'NGC 1904', '토끼자리 구상성단 M79', 'M79 Globular Cluster', 'globular_cluster', 'Lep', 5.4029, -24.5242, 7.7, 9.6, 9.6, 0, '겨울철 남쪽 하늘 토끼자리에 위치한 귀한 구상성단입니다.'),
  mItem(80, 'NGC 6093', '전갈자리 구상성단 M80', 'M80 Globular Cluster', 'globular_cluster', 'Sco', 16.284, -22.9761, 7.3, 10, 10),
  mItem(81, 'NGC 3031', '보데 은하', "Bode's Galaxy", 'spiral_galaxy', 'UMa', 9.9259, 69.0653, 6.9, 27, 14, 149, '큰곰자리 북쪽의 대표적 대형 메시에 나선은하입니다.'),
  mItem(82, 'NGC 3034', '시가 은하', 'Cigar Galaxy', 'irregular_galaxy', 'UMa', 9.9312, 69.6797, 8.4, 11, 4, 65, '보데 은하(M81) 바로 북쪽에 나란히 놓인 폭발적 항성생성 은하입니다.'),
  mItem(83, 'NGC 5236', '남쪽 바람개비 은하', 'Southern Pinwheel Galaxy', 'spiral_galaxy', 'Hya', 13.6169, -29.8658, 7.5, 12.9, 11.5, 45, '바다뱀자리와 센타우루스자리 경계의 밝은 정면 막대나선은하입니다.'),
  mItem(84, 'NGC 4374', '처녀자리 은하단 M84', 'M84 Lenticular Galaxy', 'elliptical_galaxy', 'Vir', 12.4177, 12.887, 9.1, 6.5, 5.6, 135, '마카리안 사슬(Markarian’s Chain) 서쪽 끝을 이루는 밝은 타원/렌즈형 은하입니다.'),
  mItem(85, 'NGC 4382', '머리털자리 은하 M85', 'M85 Lenticular Galaxy', 'elliptical_galaxy', 'Com', 12.4233, 18.1911, 9.1, 7.1, 5.5, 15),
  mItem(86, 'NGC 4406', '처녀자리 은하단 M86', 'M86 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.4366, 12.946, 8.9, 8.9, 5.8, 120, '마카리안 사슬 중심부의 거대 타원은하입니다.'),
  mItem(87, 'NGC 4486', '처녀자리 A 은하 (M87)', 'Virgo A (M87)', 'elliptical_galaxy', 'Vir', 12.5137, 12.3911, 8.6, 8.3, 6.6, 160, '초대질량 블랙홀 제트로 유명한 처녀자리 은하단 중심의 초거대 타원은하입니다.'),
  mItem(88, 'NGC 4501', '머리털자리 나선은하 M88', 'M88 Spiral Galaxy', 'spiral_galaxy', 'Com', 12.5331, 14.4204, 9.6, 6.9, 3.7, 140),
  mItem(89, 'NGC 4552', '처녀자리 타원은하 M89', 'M89 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.5944, 12.5563, 9.8, 5.1, 4.7, 0),
  mItem(90, 'NGC 4569', '처녀자리 나선은하 M90', 'M90 Spiral Galaxy', 'spiral_galaxy', 'Vir', 12.6138, 13.1629, 9.5, 9.5, 4.4, 30),
  mItem(91, 'NGC 4548', '머리털자리 막대나선은하 M91', 'M91 Barred Spiral Galaxy', 'spiral_galaxy', 'Com', 12.5907, 14.4963, 10.2, 5.4, 4.3, 150),
  mItem(92, 'NGC 6341', '헤르쿨레스 구상성단 M92', 'M92 Globular Cluster', 'globular_cluster', 'Her', 17.2854, 43.1359, 6.4, 14, 14, 0, 'M13 못지않게 밝고 조밀한 헤르쿨레스자리 북쪽의 구상성단입니다.'),
  mItem(93, 'NGC 2447', '고물자리 산개성단 M93', 'Critter Cluster M93', 'open_cluster', 'Pup', 7.7433, -23.8567, 6.2, 22, 22),
  mItem(94, 'NGC 4736', '고양이 눈 은하 (악어 눈 은하)', "Cat's Eye / Croc's Eye Galaxy", 'spiral_galaxy', 'CVn', 12.8481, 41.1203, 8.2, 11.2, 9.1, 110, '이중 고리 구조를 지닌 사냥개자리의 밝은 나선은하입니다.'),
  mItem(95, 'NGC 3351', '사자자리 막대나선은하 M95', 'M95 Barred Spiral Galaxy', 'spiral_galaxy', 'Leo', 10.7327, 11.7038, 9.7, 7.4, 5.0, 15),
  mItem(96, 'NGC 3368', '사자자리 나선은하 M96', 'M96 Spiral Galaxy', 'spiral_galaxy', 'Leo', 10.7794, 11.8199, 9.2, 7.6, 5.2, 135),
  mItem(97, 'NGC 3587', '부엉이 성운', 'Owl Nebula', 'planetary_nebula', 'UMa', 11.2466, 55.019, 9.9, 3.4, 3.3, 0, '북두칠성 국자 바닥 메라크 남동쪽의 부엉이 눈 모양 행성상성운입니다.'),
  mItem(98, 'NGC 4192', '머리털자리 나선은하 M98', 'M98 Spiral Galaxy', 'spiral_galaxy', 'Com', 12.2301, 14.9005, 10.1, 9.8, 2.8, 155),
  mItem(99, 'NGC 4254', '머리털자리 바람개비 은하 M99', 'Coma Pinwheel Galaxy', 'spiral_galaxy', 'Com', 12.3138, 14.4165, 9.9, 5.4, 4.7, 65),
  mItem(100, 'NGC 4321', '거울 은하 (미러 은하) M100', 'Mirror Galaxy M100', 'spiral_galaxy', 'Com', 12.3819, 15.8223, 9.3, 7.4, 6.3, 30, '처녀자리 은하단에서 가장 크고 뚜렷한 정면 나선은하(Grand Design Spiral)입니다.'),
  mItem(101, 'NGC 5457', '바람개비 은하', 'Pinwheel Galaxy', 'spiral_galaxy', 'UMa', 14.0535, 54.3489, 7.9, 29, 27, 0, '북두칠성 미자르와 알카이드 북동쪽의 대형 정면 나선은하입니다.'),
  mItem(102, 'NGC 5866', '방추 은하 (스핀들 은하)', 'Spindle Galaxy (M102)', 'spiral_galaxy', 'Dra', 15.1082, 55.7633, 9.9, 6.5, 3.1, 128, '용자리 남서쪽 경계의 날카로운 먼지띠를 지닌 렌즈형/나선은하입니다.'),
  mItem(103, 'NGC 581', '카시오페이아 산개성단 M103', 'M103 Open Cluster', 'open_cluster', 'Cas', 1.5561, 60.6583, 7.4, 6, 6),
  mItem(104, 'NGC 4594', '솜브레로 은하', 'Sombrero Galaxy', 'spiral_galaxy', 'Vir', 12.6665, -11.6231, 8.0, 9, 4, 90, '처녀자리 남쪽 경계의 짙은 적도 암흑띠를 가진 나선은하입니다.'),
  mItem(105, 'NGC 3379', '사자자리 타원은하 M105', 'M105 Elliptical Galaxy', 'elliptical_galaxy', 'Leo', 10.7971, 12.5816, 9.3, 5.4, 4.8, 70),
  mItem(106, 'NGC 4258', '사냥개자리 나선은하 M106', 'M106 Spiral Galaxy', 'spiral_galaxy', 'CVn', 12.316, 47.3037, 8.4, 18.6, 7.2, 150, '사냥개자리 북서쪽의 밝고 거대한 활동 나선은하입니다.'),
  mItem(107, 'NGC 6171', '뱀주인자리 구상성단 M107', 'Crucifix Globular M107', 'globular_cluster', 'Oph', 16.5422, -13.0538, 7.9, 13, 13),
  mItem(108, 'NGC 3556', '서핑보드 은하 M108', 'Surfboard Galaxy', 'spiral_galaxy', 'UMa', 11.1919, 55.6741, 10.0, 8.7, 2.2, 75, '부엉이 성운(M97) 바로 북서쪽에 나란히 위치한 측면 나선은하입니다.'),
  mItem(109, 'NGC 3992', '진공청소기 은하 M109', 'Vacuum Cleaner Galaxy', 'spiral_galaxy', 'UMa', 11.96, 53.3745, 9.8, 7.6, 4.7, 70, '북두칠성 페크다(γ UMa) 바로 남동쪽에 위치한 막대나선은하입니다.'),
  mItem(110, 'NGC 205', '안드로메다 제2동반은하 M110', 'Edward Young Star (M110)', 'elliptical_galaxy', 'And', 0.6728, 41.6853, 8.0, 21.9, 11.0, 170, '안드로메다 은하(M31) 북서쪽에 자리한 밝은 왜소 타원은하이자 메시에 목록 110번입니다.'),
];
