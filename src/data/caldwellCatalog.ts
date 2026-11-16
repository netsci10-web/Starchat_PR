import { DSORecord, DSOType } from '../types/astronomy';
import { buildNebulaContour } from './messierCatalog';

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

function cItem(
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
  const id = `C${num}`;
  let contours = contourPolygons;
  if (
    !contours &&
    sizeMajorArcmin >= 18 &&
    (type === 'emission_nebula' ||
      type === 'reflection_nebula' ||
      type === 'supernova_remnant' ||
      type === 'spiral_galaxy')
  ) {
    const rDeg = Math.max(0.2, Math.min(1.5, sizeMajorArcmin / 115));
    const aspect = Math.max(0.25, Math.min(1.0, sizeMinorArcmin / Math.max(1, sizeMajorArcmin)));
    contours = [
      buildNebulaContour(
        raHours,
        decDeg,
        rDeg,
        aspect,
        positionAngleDeg,
        type.includes('galaxy') ? [0.05, 0.02, 0.0] : [0.24, -0.15, 0.11]
      ),
    ];
  }

  return {
    id,
    caldwellId: id,
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
      `${constellation} 영역의 패트릭 무어 콜드웰 ${id} (${catalogAlt}) ${TYPE_KO_LABEL[type]}입니다. 밝기 ${mag.toFixed(1)}등급, 시직경 ${sizeMajorArcmin}′×${sizeMinorArcmin}′.`,
    contourPolygons: contours,
  };
}

/**
 * Complete Caldwell Catalog: C1 through C109 (All 109 Objects, ordered by Declination North to South)
 * Epoch J2000.0
 */
export const CALDWELL_CATALOG: DSORecord[] = [
  cItem(1, 'NGC 188', '폴라리스 고대 산개성단', 'Polarissima Cluster', 'open_cluster', 'Cep', 0.788, 85.25, 8.1, 15, 15, 0, '북천극(폴라리스)에서 약 4° 떨어진 콜드웰 목록 1번 고령 산개성단입니다.'),
  cItem(2, 'NGC 40', '나비넥타이 성운', 'Bow-Tie Nebula', 'planetary_nebula', 'Cep', 0.217, 72.52, 10.7, 0.8, 0.6),
  cItem(3, 'NGC 4236', '용자리 막대나선은하 C3', 'NGC 4236 Galaxy', 'spiral_galaxy', 'Dra', 12.278, 69.47, 9.6, 21.9, 7.2, 162),
  cItem(4, 'NGC 7023', '아이리스 성운 (붓꽃 성운)', 'Iris Nebula', 'reflection_nebula', 'Cep', 21.027, 68.17, 6.8, 18, 18, 25, '세페우스자리의 푸른 반사성운과 암흑성운 복합체입니다.', [
    buildNebulaContour(21.027, 68.17, 0.45, 0.78, 25, [0.18, -0.14, 0.1]),
  ]),
  cItem(5, 'IC 342', '숨겨진 은하 (히든 갤럭시)', 'Hidden Galaxy', 'spiral_galaxy', 'Cam', 3.78, 68.1, 8.4, 21.4, 20.9, 0, '기린자리 은하수 적도면 먼지 뒤에 숨어 있는 거대 정면 나선은하입니다.'),
  cItem(6, 'NGC 6543', '고양이 눈 성운', "Cat's Eye Nebula", 'planetary_nebula', 'Dra', 17.976, 66.63, 8.1, 0.4, 0.3, 0, '용자리 황도 북극 근처에 위치한 정교한 다중 껍질 행성상성운입니다.'),
  cItem(7, 'NGC 2403', '기린자리 나선은하 C7', 'Cam Spiral NGC 2403', 'spiral_galaxy', 'Cam', 7.615, 65.6, 8.5, 21.9, 12.3, 127),
  cItem(8, 'NGC 559', '카시오페이아 유령 성단 C8', ' Caldwell 8 Cluster', 'open_cluster', 'Cas', 1.492, 63.3, 9.5, 4.4, 4.4),
  cItem(9, 'Sh2-155', '동굴 성운', 'Cave Nebula', 'emission_nebula', 'Cep', 22.947, 62.62, 7.7, 50, 30, 110, '세페우스자리 은하수 내의 아치형 암흑대와 전리수소 발광성운입니다.', [
    buildNebulaContour(22.947, 62.62, 0.65, 0.58, 110, [0.22, -0.18, 0.1]),
  ]),
  cItem(10, 'NGC 663', '잔디깎이 성단 C10', 'Lawnmower Cluster', 'open_cluster', 'Cas', 1.772, 61.25, 7.1, 16, 16),
  cItem(11, 'NGC 7635', '버블 성운 (비눗방울 성운)', 'Bubble Nebula', 'emission_nebula', 'Cas', 23.346, 61.2, 10.0, 15, 8, 70, '카시오페이아자리 M52 성단 근처의 항성풍 거품 발광성운입니다.'),
  cItem(12, 'NGC 6946', '불꽃놀이 은하', 'Fireworks Galaxy', 'spiral_galaxy', 'Cep', 20.581, 60.15, 8.8, 11.5, 9.8, 60, '세페우스-백조자리 경계의 초신성이 가장 많이 관측된 나선은하입니다.'),
  cItem(13, 'NGC 457', '올빼미 성단 (ET 성단)', 'Owl / ET Cluster', 'open_cluster', 'Cas', 1.326, 58.29, 6.4, 13, 13, 0, '카시오페이아자리 파이(φ) 별이 두 눈처럼 빛나는 올빼미 모양 산개성단입니다.'),
  cItem(14, 'NGC 869 / NGC 884', '페르세우스 이중성단', 'Double Cluster (h & χ Per)', 'open_cluster', 'Per', 2.333, 57.13, 3.7, 60, 30, 90, '카시오페이아와 페르세우스 사이의 화려한 쌍둥이 산개성단입니다.'),
  cItem(15, 'NGC 6826', '깜빡이는 행성상성운', 'Blinking Planetary Nebula', 'planetary_nebula', 'Cyg', 19.746, 50.53, 8.8, 0.5, 0.4),
  cItem(16, 'NGC 7243', '도마뱀자리 산개성단 C16', 'Lacerta Cluster NGC 7243', 'open_cluster', 'Lac', 22.253, 49.88, 6.4, 21, 21),
  cItem(17, 'NGC 147', '카시오페이아 왜소은하 C17', 'NGC 147 Dwarf Galaxy', 'elliptical_galaxy', 'Cas', 0.553, 48.51, 9.5, 13.2, 7.8, 25),
  cItem(18, 'NGC 185', '카시오페이아 왜소은하 C18', 'NGC 185 Dwarf Galaxy', 'elliptical_galaxy', 'Cas', 0.65, 48.34, 9.2, 11.7, 10.0, 35),
  cItem(19, 'IC 5146', '고치 성운 (코쿤 성운)', 'Cocoon Nebula', 'emission_nebula', 'Cyg', 21.892, 47.27, 7.2, 12, 12, 0, '암흑성운 바나드 168 끝에 자리한 백조자리의 붉은 고치 성운입니다.'),
  cItem(20, 'NGC 7000', '북아메리카 성운', 'North America Nebula', 'emission_nebula', 'Cyg', 20.988, 44.33, 4.0, 120, 100, 15, '백조자리 데네브 동쪽에 펼쳐진 대표적 거대 발광성운(멕시코만 윤곽 포함)입니다.', [
    buildNebulaContour(20.988, 44.33, 1.35, 0.82, 15, [0.34, -0.25, 0.19]),
    buildNebulaContour(20.845, 44.0, 0.72, 0.68, -20, [0.22, -0.15, 0.12]),
  ]),
  cItem(21, 'NGC 4449', '사냥개자리 박스 은하 C21', 'Box Galaxy NGC 4449', 'irregular_galaxy', 'CVn', 12.469, 44.09, 9.6, 6.2, 4.4, 45),
  cItem(22, 'NGC 7662', '푸른 눈덩이 성운', 'Blue Snowball Nebula', 'planetary_nebula', 'And', 23.431, 42.53, 8.3, 0.6, 0.5, 0, '안드로메다자리의 선명한 청록색 원반을 보여주는 행성상성운입니다.'),
  cItem(23, 'NGC 891', '은빛 조각 은하 (외곽 나선은하)', 'Silver Sliver Galaxy', 'spiral_galaxy', 'And', 2.376, 42.35, 9.9, 13.5, 2.5, 22, '적도 암흑 먼지띠가 칼날처럼 가로지르는 측면 나선은하입니다.'),
  cItem(24, 'NGC 1275', '페르세우스 A 활동은하', 'Perseus A (NGC 1275)', 'elliptical_galaxy', 'Per', 3.33, 41.51, 11.6, 2.2, 1.7),
  cItem(25, 'NGC 2419', '은하간 방랑자 구상성단', 'Intergalactic Wanderer', 'globular_cluster', 'Lyn', 7.636, 38.88, 10.4, 4.6, 4.6),
  cItem(26, 'NGC 4244', '은빛 바늘 은하', 'Silver Needle Galaxy', 'spiral_galaxy', 'CVn', 12.292, 37.81, 10.4, 16.6, 1.9, 48),
  cItem(27, 'NGC 6888', '초승달 성운', 'Crescent Nebula', 'emission_nebula', 'Cyg', 20.202, 38.35, 7.4, 18, 12, 35, '백조자리 사드르(γ Cyg) 남서쪽의 볼프-레이에 항성풍 성운입니다.'),
  cItem(28, 'NGC 752', '안드로메다 골프채 성단 C28', 'NGC 752 Open Cluster', 'open_cluster', 'And', 1.963, 37.78, 5.7, 50, 50),
  cItem(29, 'NGC 5005', '사냥개자리 나선은하 C29', 'NGC 5005 Spiral Galaxy', 'spiral_galaxy', 'CVn', 13.182, 37.06, 9.8, 5.8, 2.8, 65),
  cItem(30, 'NGC 7331', '페가수스 사슴벌레 은하', 'Deer Lick Galaxy', 'spiral_galaxy', 'Peg', 22.618, 34.42, 9.5, 10.5, 3.7, 171, '스테판 오중주 북쪽의 우리은하 쌍둥이 나선은하입니다.'),
  cItem(31, 'IC 405', '불타는 별 성운', 'Flaming Star Nebula', 'emission_nebula', 'Aur', 5.271, 34.25, 6.0, 37, 19, 160, '마차부자리 도주성 AE Aurigae를 둘러싼 발광·반사성운입니다.', [
    buildNebulaContour(5.271, 34.25, 0.55, 0.52, 160, [0.24, -0.14, 0.12]),
  ]),
  cItem(32, 'NGC 4631', '고래 은하', 'Whale Galaxy', 'spiral_galaxy', 'CVn', 12.702, 32.54, 9.2, 15.5, 2.7, 86, '사냥개자리 남쪽의 고래 모양 측면 나선은하입니다.'),
  cItem(33, 'NGC 6992', '동부 면사포 성운 (베일 성운 동쪽)', 'Eastern Veil Nebula', 'supernova_remnant', 'Cyg', 20.94, 31.72, 7.0, 60, 8, 155, '백조자리 초신성 잔해 루프의 밝은 동쪽 아크(네트워크 성운)입니다.', [
    buildNebulaContour(20.94, 31.72, 0.95, 0.32, 155, [0.22, -0.1, 0.15]),
  ]),
  cItem(34, 'NGC 6960', '서부 면사포 성운 (마녀 빗자루 성운)', 'Western Veil / Witch’s Broom', 'supernova_remnant', 'Cyg', 20.761, 30.71, 7.0, 70, 6, 175, '백조자리 52번 별을 가로지르는 서쪽 면사포 초신성 잔해입니다.', [
    buildNebulaContour(20.761, 30.71, 0.88, 0.28, 175, [-0.2, 0.14, 0.08]),
  ]),
  cItem(35, 'NGC 4889', '머리털자리 은하단 중심은하 C35', 'Coma B Giant Elliptical', 'elliptical_galaxy', 'Com', 13.002, 27.98, 11.4, 2.9, 1.9),
  cItem(36, 'NGC 4559', '머리털자리 잉어 은하 C36', 'Koi Fish Galaxy', 'spiral_galaxy', 'Com', 12.599, 27.96, 9.9, 10.7, 4.4, 150),
  cItem(37, 'NGC 6885', '여우자리 산개성단 C37', 'Foxhead Cluster NGC 6885', 'open_cluster', 'Vul', 20.199, 26.48, 5.7, 20, 20),
  cItem(38, 'NGC 4565', '바늘 은하', 'Needle Galaxy', 'spiral_galaxy', 'Com', 12.606, 25.99, 9.6, 15.9, 1.9, 136, '북은하극 근처 머리털자리의 가장 유명한 칼날 측면 나선은하입니다.'),
  cItem(39, 'NGC 2392', '에스키모 성운 (광대 성운)', 'Eskimo / Clownface Nebula', 'planetary_nebula', 'Gem', 7.486, 20.91, 9.1, 0.8, 0.7, 0, '쌍둥이자리 와사트 남동쪽의 이중 껍질 행성상성운입니다.'),
  cItem(40, 'NGC 3626', '사자자리 렌즈형 은하 C40', 'NGC 3626 Galaxy', 'spiral_galaxy', 'Leo', 11.334, 18.36, 10.9, 2.7, 1.9),
  cItem(41, 'Melotte 25', '히아데스 성단', 'Hyades Cluster', 'open_cluster', 'Tau', 4.45, 15.87, 0.5, 330, 330, 0, '황소자리 알데바란 주변에 V자 형태로 펼쳐진 지구에서 가장 가까운 산개성단입니다.'),
  cItem(42, 'NGC 7006', '돌고래자리 원거리 구상성단 C42', 'Delphinus Remote Globular', 'globular_cluster', 'Del', 21.025, 16.19, 10.6, 2.8, 2.8),
  cItem(43, 'NGC 7814', '작은 솜브레로 은하', 'Little Sombrero Galaxy', 'spiral_galaxy', 'Peg', 0.054, 16.15, 10.5, 5.5, 2.3, 135),
  cItem(44, 'NGC 7479', '페가수스 프로펠러 은하 C44', 'Superman / Propeller Galaxy', 'spiral_galaxy', 'Peg', 23.082, 12.32, 10.9, 4.1, 3.1, 25),
  cItem(45, 'NGC 5248', '목동자리 나선은하 C45', 'NGC 5248 Spiral Galaxy', 'spiral_galaxy', 'Boo', 13.625, 8.88, 10.2, 6.2, 4.5, 110),
  cItem(46, 'NGC 2261', '허블 변광성운', "Hubble's Variable Nebula", 'reflection_nebula', 'Mon', 6.653, 8.74, 9.0, 2.5, 1.5, 0, '외뿔소자리 R Mon 변광성에 의해 밝기가 변하는 부채꼴 반사성운입니다.'),
  cItem(47, 'NGC 6934', '돌고래자리 구상성단 C47', 'NGC 6934 Globular Cluster', 'globular_cluster', 'Del', 20.57, 7.4, 8.9, 7.1, 7.1),
  cItem(48, 'NGC 2775', '게자리 나선은하 C48', 'Caldwell 48 Flocculent Spiral', 'spiral_galaxy', 'Cnc', 9.172, 7.04, 10.1, 4.3, 3.3),
  cItem(49, 'NGC 2237', '장미 성운 (로제트 성운)', 'Rosette Nebula', 'emission_nebula', 'Mon', 6.533, 4.95, 4.8, 80, 65, 0, '외뿔소자리 북서쪽의 장미꽃 모양 거대 발광성운입니다.', [
    buildNebulaContour(6.533, 4.95, 0.82, 0.88, 0, [0.16, 0.18, -0.14]),
  ]),
  cItem(50, 'NGC 2244', '장미 성운 중심 위성 성단', 'Satellite Cluster (NGC 2244)', 'open_cluster', 'Mon', 6.532, 4.93, 4.8, 24, 24, 0, '장미 성운(C49) 중심 공동에서 성운을 이온화시키는 젊은 O형 별들의 산개성단입니다.'),
  cItem(51, 'IC 1613', '고래자리 불규칙 왜소은하 C51', 'IC 1613 Dwarf Galaxy', 'irregular_galaxy', 'Cet', 1.08, 2.12, 9.2, 16.2, 14.5),
  cItem(52, 'NGC 4697', '처녀자리 타원은하 C52', 'NGC 4697 Elliptical Galaxy', 'elliptical_galaxy', 'Vir', 12.81, -5.8, 9.2, 7.2, 4.7, 70),
  cItem(53, 'NGC 3115', '육분의자리 방추 은하', 'Spindle Galaxy (Sextans)', 'elliptical_galaxy', 'Sex', 10.088, -7.72, 8.9, 7.2, 2.5, 43),
  cItem(54, 'NGC 2506', '외뿔소자리 산개성단 C54', 'NGC 2506 Open Cluster', 'open_cluster', 'Mon', 8.0, -10.77, 7.6, 12, 12),
  cItem(55, 'NGC 7009', '토성 성운', 'Saturn Nebula', 'planetary_nebula', 'Aqr', 21.07, -11.36, 8.0, 0.7, 0.5, 78, '양끝에 제트 돌기가 뻗어 토성 고리처럼 보이는 물병자리 행성상성운입니다.'),
  cItem(56, 'NGC 246', '해골 성운', 'Skull Nebula', 'planetary_nebula', 'Cet', 0.784, -11.87, 8.0, 4.0, 3.5),
  cItem(57, 'NGC 6822', '바나드 은하', "Barnard's Galaxy", 'irregular_galaxy', 'Sgr', 19.749, -14.8, 8.8, 15.5, 13.5),
  cItem(58, 'NGC 2360', '캐롤라인의 성단', "Caroline's Cluster", 'open_cluster', 'CMa', 7.295, -15.64, 7.2, 13, 13),
  cItem(59, 'NGC 3242', '목성의 유령 성운', 'Ghost of Jupiter', 'planetary_nebula', 'Hya', 10.413, -18.64, 7.7, 0.7, 0.6, 0, '바다뱀자리 뮤(μ) 별 남쪽에 위치한 목성 시직경 크기의 푸른 행성상성운입니다.'),
  cItem(60, 'NGC 4038', '더듬이 은하 (안테나 은하 북쪽)', 'Antennae Galaxies (NGC 4038)', 'spiral_galaxy', 'Crv', 12.031, -18.87, 10.3, 5.2, 3.1, 60, '까마귀자리에서 충돌 중인 한 쌍의 더듬이 상호작용 은하입니다.'),
  cItem(61, 'NGC 4039', '더듬이 은하 (안테나 은하 남쪽)', 'Antennae Galaxies (NGC 4039)', 'spiral_galaxy', 'Crv', 12.032, -18.89, 10.6, 4.8, 2.5, 50),
  cItem(62, 'NGC 247', '고래자리 바늘귀 은하 C62', "Burbidge's Chain Parent NGC 247", 'spiral_galaxy', 'Cet', 0.785, -20.76, 8.9, 21.4, 6.9, 170),
  cItem(63, 'NGC 7293', '나선 성운 (헬릭스 성운)', 'Helix Nebula', 'planetary_nebula', 'Aqr', 22.494, -20.84, 7.6, 25, 18, 115, '물병자리 남쪽의 밤하늘에서 시직경이 가장 큰 대표적 행성상성운입니다.', [
    buildNebulaContour(22.494, -20.84, 0.36, 0.82, 115, [0.06, -0.04, 0.02]),
  ]),
  cItem(64, 'NGC 2362', '타우 큰개자리 성단 (멕시칸 점핑빈)', 'Tau Canis Majoris Cluster', 'open_cluster', 'CMa', 7.312, -24.95, 4.1, 8, 8),
  cItem(65, 'NGC 253', '조각가자리 은하 (은화 은하)', 'Sculptor / Silver Coin Galaxy', 'spiral_galaxy', 'Scl', 0.793, -25.29, 7.2, 27.5, 6.8, 52, '남은하극 근처 조각가자리에서 가장 밝고 거대한 폭발적 항성생성 나선은하입니다.'),
  cItem(66, 'NGC 5694', '바다뱀자리 구상성단 C66', 'Tombaugh’s Globular NGC 5694', 'globular_cluster', 'Hya', 14.66, -26.54, 10.2, 4.3, 4.3),
  cItem(67, 'NGC 1097', '화로자리 막대나선은하 C67', 'NGC 1097 Barred Spiral', 'spiral_galaxy', 'For', 2.771, -30.28, 9.2, 9.3, 6.3, 130),
  cItem(68, 'NGC 6729', '남쪽왕관자리 R CrA 성운', 'R Coronae Australis Nebula', 'reflection_nebula', 'CrA', 19.031, -36.96, 9.5, 1.5, 1.0),
  cItem(69, 'NGC 6302', '벌레 성운 (버그/나비 성운)', 'Bug / Butterfly Nebula', 'planetary_nebula', 'Sco', 17.229, -37.1, 9.6, 1.2, 0.5, 90),
  cItem(70, 'NGC 300', '조각가자리 나선은하 C70', 'Southern Pinwheel NGC 300', 'spiral_galaxy', 'Scl', 0.915, -37.68, 8.1, 21.9, 15.5, 110),
  cItem(71, 'NGC 2477', '고물자리 산개성단 C71', 'Electric Guitar Cluster', 'open_cluster', 'Pup', 7.872, -38.53, 5.8, 27, 27),
  cItem(72, 'NGC 55', '고래 은하 (조각가자리 C72)', 'String of Pearls Galaxy', 'spiral_galaxy', 'Scl', 0.252, -39.22, 7.9, 32.4, 5.6, 108),
  cItem(73, 'NGC 1851', '비둘기자리 구상성단 C73', 'Columba Globular NGC 1851', 'globular_cluster', 'Col', 5.235, -40.05, 7.1, 12, 12),
  cItem(74, 'NGC 3132', '팔열 성운 (남쪽 고리 성운)', 'Eight-Burst / Southern Ring Nebula', 'planetary_nebula', 'Vel', 10.117, -40.44, 9.2, 1.4, 0.9, 30, '돛자리의 밝은 남반구 대표 고리 행성상성운입니다.'),
  cItem(75, 'NGC 6124', '전갈자리 산개성단 C75', 'NGC 6124 Open Cluster', 'open_cluster', 'Sco', 16.422, -40.65, 5.8, 29, 29),
  cItem(76, 'NGC 6231', '북쪽 보석상자 성단 (아기 전갈 성단)', 'Northern Jewel Box / Baby Scorpion', 'open_cluster', 'Sco', 16.904, -41.83, 2.6, 15, 15, 0, '전갈자리 제타(ζ) 별 북쪽에 자리한 매우 밝은 산개성단입니다.'),
  cItem(77, 'NGC 5128', '센타우루스 A 전파은하', 'Centaurus A (Hamburger Galaxy)', 'elliptical_galaxy', 'Cen', 13.424, -43.02, 6.8, 25, 20, 35, '강렬한 암흑 먼지띠가 중심부를 가로지르는 남천 대표 활동은하입니다.'),
  cItem(78, 'NGC 6541', '남쪽왕관자리 구상성단 C78', 'NGC 6541 Globular Cluster', 'globular_cluster', 'CrA', 18.134, -43.71, 6.3, 15, 15),
  cItem(79, 'NGC 3201', '돛자리 구상성단 C79', 'NGC 3201 Globular Cluster', 'globular_cluster', 'Vel', 10.293, -46.41, 6.8, 20, 20),
  cItem(80, 'NGC 5139', '오메가 센타우리 구상성단', 'Omega Centauri (ω Cen)', 'globular_cluster', 'Cen', 13.447, -47.48, 3.9, 55, 55, 0, '우리은하에서 가장 크고 밝은 약 천만 개 별의 초대형 구상성단입니다.'),
  cItem(81, 'NGC 6352', '제단자리 구상성단 C81', 'Ara Globular NGC 6352', 'globular_cluster', 'Ara', 17.425, -48.42, 7.8, 9.0, 9.0),
  cItem(82, 'NGC 6193', '제단자리 산개성단 C82', 'NGC 6193 & Rim Nebula', 'open_cluster', 'Ara', 16.689, -48.77, 5.2, 15, 15),
  cItem(83, 'NGC 4945', '센타우루스 측면 나선은하 C83', 'Tweezers Galaxy NGC 4945', 'spiral_galaxy', 'Cen', 13.091, -49.47, 8.4, 20.0, 3.8, 43),
  cItem(84, 'NGC 5286', '센타우루스 구상성단 C84', 'Caldwell 84 Globular', 'globular_cluster', 'Cen', 13.774, -51.37, 7.4, 11, 11),
  cItem(85, 'IC 2391', '오미크론 돛자리 성단', 'Omicron Velorum Cluster', 'open_cluster', 'Vel', 8.671, -53.03, 2.5, 50, 50),
  cItem(86, 'NGC 6397', '제단자리 근접 구상성단 C86', 'NGC 6397 Globular Cluster', 'globular_cluster', 'Ara', 17.679, -53.67, 5.7, 31, 31),
  cItem(87, 'NGC 1261', '시계자리 구상성단 C87', 'Horologium Globular NGC 1261', 'globular_cluster', 'Hor', 3.204, -55.22, 8.3, 6.8, 6.8),
  cItem(88, 'NGC 5823', '컴퍼스자리 산개성단 C88', 'NGC 5823 Open Cluster', 'open_cluster', 'Cir', 15.092, -55.6, 7.9, 10, 10),
  cItem(89, 'NGC 6087', '직각자자리 S 성단 C89', 'S Normae Cluster', 'open_cluster', 'Nor', 16.314, -57.9, 5.4, 12, 12),
  cItem(90, 'NGC 2867', '용골자리 행성상성운 C90', 'Caldwell 90 Planetary Nebula', 'planetary_nebula', 'Car', 9.357, -58.31, 9.7, 0.3, 0.3),
  cItem(91, 'NGC 3532', '소원성취 성단 (위싱웰 성단)', 'Wishing Well Cluster', 'open_cluster', 'Car', 11.097, -58.75, 3.0, 50, 50, 0, '용골자리 은하수의 육안으로도 화려하게 빛나는 대형 산개성단입니다.'),
  cItem(92, 'NGC 3372', '에타 카리나 대성운', 'Carina Nebula (Eta Carinae)', 'emission_nebula', 'Car', 10.75, -59.87, 1.0, 120, 120, 140, '남반구 용골자리 은하수의 거대 발광성운 복합체입니다.', [
    buildNebulaContour(10.75, -59.87, 1.45, 0.85, 140, [0.3, -0.22, 0.16]),
  ]),
  cItem(93, 'NGC 6752', '공작자리 대구상성단 C93', 'Great Peacock Globular', 'globular_cluster', 'Pav', 19.182, -59.98, 5.4, 29, 29, 0, '오메가 센타우리, 47 투카나에 이어 남천에서 세 번째로 밝은 구상성단입니다.'),
  cItem(94, 'NGC 4755', '보석상자 성단 (쥬얼박스)', 'Jewel Box Cluster', 'open_cluster', 'Cru', 12.894, -60.36, 4.2, 10, 10, 0, '남십자자리 미모사(β Cru) 남동쪽의 다채로운 색채 대비 산개성단입니다.'),
  cItem(95, 'NGC 6025', '남쪽삼각형자리 산개성단 C95', 'NGC 6025 Open Cluster', 'open_cluster', 'TrA', 16.053, -60.43, 5.1, 12, 12),
  cItem(96, 'NGC 2516', '남쪽 벌집 성단 (다이아몬드 성단)', 'Southern Beehive Cluster', 'open_cluster', 'Car', 7.968, -60.75, 3.8, 30, 30),
  cItem(97, 'NGC 3766', '진주 성단 C97', 'Pearl Cluster', 'open_cluster', 'Cen', 11.604, -61.62, 5.3, 12, 12),
  cItem(98, 'NGC 4609', '석탄자루 성단 C98', 'Coalsack Cluster NGC 4609', 'open_cluster', 'Cru', 12.705, -62.97, 6.9, 5, 5),
  cItem(99, 'Coalsack', '석탄자루 암흑성운', 'Coalsack Dark Nebula', 'reflection_nebula', 'Cru', 12.833, -62.5, 6.0, 360, 240, 15, '남십자자리 동쪽에 자리한 밤하늘에서 가장 뚜렷한 거대 암흑성운 윤곽입니다.', [
    buildNebulaContour(12.833, -62.5, 2.2, 0.65, 15, [0.18, -0.14, 0.1]),
  ]),
  cItem(100, 'IC 2944', '달리는 닭 성운 (람다 센타우리 성운)', 'Running Chicken Nebula', 'emission_nebula', 'Cen', 11.633, -63.02, 4.5, 75, 50, 120),
  cItem(101, 'NGC 6744', '공작자리 대형 나선은하 C101', 'Pavo Great Spiral Galaxy', 'spiral_galaxy', 'Pav', 19.163, -63.86, 8.3, 20.0, 12.9, 15),
  cItem(102, 'IC 2602', '남쪽 플레이아데스 성단', 'Southern Pleiades (Theta Carinae)', 'open_cluster', 'Car', 10.716, -64.4, 1.9, 100, 100, 0, '용골자리 세타(θ) 별을 중심으로 빛나는 남천의 플레이아데스 산개성단입니다.'),
  cItem(103, 'NGC 2070', '타란툴라 성운 (독거미 성운)', 'Tarantula Nebula (30 Doradus)', 'emission_nebula', 'Dor', 5.645, -69.1, 8.0, 40, 25, 45, '대마젤란은하(LMC) 내부의 초거대 전리수소 폭발적 항성생성 영역입니다.', [
    buildNebulaContour(5.645, -69.1, 0.55, 0.72, 45, [0.28, -0.18, 0.14]),
  ]),
  cItem(104, 'NGC 362', '큰부리새자리 구상성단 C104', 'NGC 362 Globular Cluster', 'globular_cluster', 'Tuc', 1.054, -70.85, 6.4, 14, 14),
  cItem(105, 'NGC 4833', '파리자리 구상성단 C105', 'Southern Butterfly Globular', 'globular_cluster', 'Mus', 12.993, -70.88, 7.0, 14, 14),
  cItem(106, 'NGC 104', '47 투카나 구상성단', '47 Tucanae (47 Tuc)', 'globular_cluster', 'Tuc', 0.401, -72.08, 4.0, 50, 50, 0, '소마젤란은하 서쪽에 빛나는 밤하늘에서 두 번째로 밝고 거대한 구상성단입니다.'),
  cItem(107, 'NGC 6101', '극락조자리 구상성단 C107', 'Apus Globular NGC 6101', 'globular_cluster', 'Aps', 16.43, -72.2, 9.2, 10.7, 10.7),
  cItem(108, 'NGC 4372', '파리자리 구상성단 C108', 'Southern Dark Doodad Globular', 'globular_cluster', 'Mus', 12.43, -72.66, 7.2, 18.6, 18.6),
  cItem(109, 'NGC 3195', '카멜레온자리 행성상성운 C109', 'Chamaeleon Planetary Nebula', 'planetary_nebula', 'Cha', 10.158, -80.86, 11.6, 0.7, 0.5, 0, '남천극에 가장 가까운 콜드웰 목록 마지막 109번 행성상성운입니다.'),
];
