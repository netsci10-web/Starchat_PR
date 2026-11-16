export type ProjectionMode = 'stereographic' | 'orthographic' | 'equidistant';

export type ChartColorScheme = 'paper' | 'observatory' | 'nightvision';

export type DSOType =
  | 'emission_nebula'
  | 'reflection_nebula'
  | 'planetary_nebula'
  | 'supernova_remnant'
  | 'dark_nebula'
  | 'spiral_galaxy'
  | 'elliptical_galaxy'
  | 'irregular_galaxy'
  | 'open_cluster'
  | 'globular_cluster';

export interface StarRecord {
  id: string;
  hip?: number;
  bayer?: string;
  flamsteed?: string;
  constellation: string; // 3-letter IAU code e.g. 'Ori', 'UMa', 'Cyg'
  nameEn?: string;
  nameKo?: string;
  raHours: number; // 0 to 24h J2000
  raDeg: number; // 0 to 360 deg J2000
  decDeg: number; // -90 to +90 deg J2000
  mag: number; // Visual magnitude V
  bv: number; // B-V color index (-0.3 blue to +1.8 red)
  spectralType?: string;
  isDouble?: boolean;
  isVariable?: boolean;
  separationArcsec?: number;
  isProcedural?: boolean;
}

export interface ConstellationStick {
  constellation: string;
  nameEn: string;
  nameKo: string;
  raCenterHours: number;
  decCenterDeg: number;
  lines: Array<[[number, number], [number, number]]>; // Array of [[raDeg1, decDeg1], [raDeg2, decDeg2]]
  boundaryPolygon: Array<[number, number]>; // Closed sequence of [raDeg, decDeg] vertices along J2000 meridians/parallels
}

export interface MilkyWayContourLevel {
  id: string;
  level: 1 | 2 | 3; // 1 = outer faint halo, 2 = main galactic band, 3 = bright star clouds / core
  labelKo: string;
  labelEn: string;
  polygons: Array<Array<[number, number]>>; // Array of closed loops in [raDeg, decDeg]
  isDarkRift?: boolean;
}

export interface DSORecord {
  id: string; // Primary display ID e.g., 'M42', 'C20'
  messierId?: string; // e.g., 'M1', 'M42'
  caldwellId?: string; // e.g., 'C14', 'C20'
  catalogAlt?: string; // e.g., 'NGC 1976', 'NGC 7000'
  nameKo: string;
  nameEn: string;
  type: DSOType;
  constellation: string;
  raHours: number;
  raDeg: number;
  decDeg: number;
  mag: number;
  surfaceBrightness?: number;
  sizeMajorArcmin: number;
  sizeMinorArcmin: number;
  positionAngleDeg: number; // 0 = North, 90 = East
  descriptionKo: string;
  /**
   * Optional multi-lobe vector contour polygon in [raDeg, decDeg]
   * Used by fchart3 for famous extended nebulae (Orion, North America, Veil, Lagoon, Rosette, Heart/Soul, LMC, Carina, etc.)
   */
  contourPolygons?: Array<Array<[number, number]>>;
}

export type CoordinateSystemMode = 'equatorial' | 'horizontal';

export interface FChart3Config {
  // Coordinate System & Observer Time/Location
  coordinateSystem: CoordinateSystemMode; // 'equatorial' (J2000 RA/Dec) or 'horizontal' (Alt-Az)
  centerRaHours: number; // 0 - 24h
  centerDecDeg: number; // -90 to +90 deg
  centerAzDeg: number; // 0 - 360 deg (0=N, 90=E, 180=S, 270=W)
  centerAltDeg: number; // -90 to +90 deg
  observerLatDeg: number; // -90 to +90 deg (North positive)
  observerLonDeg: number; // -180 to +180 deg (East positive)
  observerLocationName: string;
  observationDateTime: string; // YYYY-MM-DDTHH:mm local time
  showHorizonGround: boolean; // Show ground mask & horizon line in Horizontal mode

  // View & Optics
  fovDeg: number; // Field of view in degrees (1.0 to 140)
  projection: ProjectionMode;
  colorScheme: ChartColorScheme;
  mirrorHorizontal: boolean; // Mirror for diagonal prism / Newtonian views
  mirrorVertical: boolean;

  // Magnitude & Dynamic Filtering (fchart3 core flags)
  limitStarMag: number; // -limit-star / -lim-star (e.g., 4.5 to 11.5)
  limitDsoMag: number; // -limit-dso / -lim-dso (e.g., 6.0 to 14.0)
  starScaleFactor: number; // Magnitude disc sizing multiplier (0.7 to 1.5)

  // Vector Layer Toggles
  showCenterCrosshair: boolean; // Center crosshair reticle (+)
  showMilkyWayContours: boolean; // Enhanced Milky Way isophote contours
  milkyWayStyle: 'isophote_contour' | 'shaded_vector' | 'stippled';
  showConstellationLines: boolean; // Stick figures
  showConstellationBoundaries: boolean; // IAU Official RA/Dec boundaries
  showNebulaOutlines: boolean; // Extended vector polygons for nebulae & galaxies
  showMessierObjects: boolean; // Messier Catalog (M1 - M110)
  showCaldwellObjects: boolean; // Caldwell Catalog (C1 - C109)
  showEquatorialGrid: boolean; // J2000 RA/Dec or Alt-Az graticule
  showEclipticAndGalactic: boolean; // Ecliptic & Galactic Equator
  showStarLabels: 'all_named' | 'bayer_and_named' | 'bright_only' | 'none';
  showDsoLabels: boolean;
  showMagnitudeScale: boolean; // Legend in corner
  showScaleBar: boolean; // Angular scale bar

  // Finder Reticle / Telrad Overlay
  reticleMode: 'none' | 'telrad' | 'binoculars_7x50' | 'eyepiece_afov' | 'ccd_sensor';
  customEyepieceFovDeg: number;
}

export type AtlasPresetId =
  | 'binocular_14'
  | 'tirion_26'
  | 'messier_deep_44'
  | 'korean_seasonal_18'
  | 'custom_grid';

export interface AtlasSheet {
  sheetNumber: number;
  totalSheets: number;
  zoneLabel: string;
  titleKo: string;
  titleEn: string;
  centerRaHours: number;
  centerRaDeg: number;
  centerDecDeg: number;
  fovDeg: number;
  raSpanHours: number;
  decSpanDeg: number;
  limitStarMag: number;
  limitDsoMag: number;
  adjacentNorth?: number;
  adjacentSouth?: number;
  adjacentEast?: number;
  adjacentWest?: number;
  featuredConstellations: string[];
  featuredDsos: string[];
  starCountEstimate: number;
  dsoCount: number;
}

export interface AtlasGeneratorOptions {
  presetId: AtlasPresetId;
  atlasTitle: string;
  authorOrObservatory: string;
  epochLabel: 'J2000.0';
  paperSize: 'A4_LANDSCAPE' | 'A4_PORTRAIT' | 'A3_LANDSCAPE';
  colorScheme: 'paper' | 'observatory' | 'nightvision';
  decMinDeg: number;
  decMaxDeg: number;
  fovPerSheetDeg: number;
  overlapPercent: number;
  limitStarMag: number;
  limitDsoMag: number;
  includeCoverPage: boolean;
  includeIndexMapPage: boolean;
  includeDsoAppendix: boolean;
}
