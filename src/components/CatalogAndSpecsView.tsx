import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Compass,
  MapPin,
  Search,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BRIGHT_STARS,
  CALDWELL_CATALOG,
  CONSTELLATION_DATA,
  DSO_CATALOG,
  MESSIER_CATALOG,
} from '../data/astronomyData';
import {
  ConstellationStick,
  DSORecord,
  FChart3Config,
  SolarSystemBodyRecord,
  StarRecord,
} from '../types/astronomy';
import {
  computeLstDeg,
  equatorialToHorizontal,
  formatAltDeg,
  formatAzDeg,
  formatDecDeg,
  formatRaHours,
  horizontalToEquatorial,
  OBSERVER_LOCATION_PRESETS,
} from '../utils/atlasGenerator';
import {
  computeSolarSystemBodies,
  getRecommendedSolarFov,
} from '../utils/solarSystemEphemeris';

interface CatalogAndSpecsViewProps {
  mode: 'catalog' | 'settings';
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  onJumpToTarget: (
    raHours: number,
    decDeg: number,
    fovDeg: number,
    dso?: DSORecord,
    star?: StarRecord,
    solar?: SolarSystemBodyRecord
  ) => void;
}

type UnifiedSearchResult =
  | {
      kind: 'dso';
      categoryLabel: string;
      badgeColor: string;
      id: string;
      titleKo: string;
      subtitle: string;
      raHours: number;
      decDeg: number;
      mag?: number;
      fovDeg: number;
      dso: DSORecord;
    }
  | {
      kind: 'star';
      categoryLabel: string;
      badgeColor: string;
      id: string;
      titleKo: string;
      subtitle: string;
      raHours: number;
      decDeg: number;
      mag: number;
      fovDeg: number;
      star: StarRecord;
    }
  | {
      kind: 'solar';
      categoryLabel: string;
      badgeColor: string;
      id: string;
      titleKo: string;
      subtitle: string;
      raHours: number;
      decDeg: number;
      mag: number;
      fovDeg: number;
      solar: SolarSystemBodyRecord;
    }
  | {
      kind: 'constellation';
      categoryLabel: string;
      badgeColor: string;
      id: string;
      titleKo: string;
      subtitle: string;
      raHours: number;
      decDeg: number;
      fovDeg: number;
      constellation: ConstellationStick;
    };

export const CatalogAndSpecsView: React.FC<CatalogAndSpecsViewProps> = ({
  mode,
  config,
  onChangeConfig,
  onJumpToTarget,
}) => {
  const [filterType, setFilterType] = useState<
    'all' | 'messier' | 'caldwell' | 'solar' | 'nebula' | 'galaxy' | 'cluster'
  >('all');
  const [finderTab, setFinderTab] = useState<'messier' | 'caldwell' | 'solar' | 'constellations'>('messier');
  const [selectedMessierId, setSelectedMessierId] = useState<string>('M1');
  const [selectedCaldwellId, setSelectedCaldwellId] = useState<string>('C1');
  const [selectedSolarId, setSelectedSolarId] = useState<string>('jupiter');
  const [selectedConstellationCode, setSelectedConstellationCode] = useState<string>('Ori');
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const solarSystemBodies = useMemo<SolarSystemBodyRecord[]>(
    () => computeSolarSystemBodies(config.observationDateTime),
    [config.observationDateTime]
  );

  const lstDeg = useMemo(
    () => computeLstDeg(config.observationDateTime, config.observerLonDeg),
    [config.observationDateTime, config.observerLonDeg]
  );

  const handleSwitchCoordinateSystem = (targetMode: 'equatorial' | 'horizontal') => {
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

  const applyObservationDateTime = (nextDateTime: string) => {
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
          centerRaHours: Number((raDeg / 15).toFixed(3)),
          centerDecDeg: Number(Math.max(-89.5, Math.min(89.5, decDeg)).toFixed(2)),
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
          centerRaHours: Number(nextRaHours.toFixed(3)),
          centerAzDeg: Number(az.toFixed(1)),
          centerAltDeg: Number(alt.toFixed(1)),
        };
      }
    });
  };

  const handleSetNowDateTime = () => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
    applyObservationDateTime(localIso);
  };

  const handleStepHours = (deltaHours: number) => {
    const base = config.observationDateTime ? new Date(config.observationDateTime) : new Date();
    const valid = Number.isNaN(base.getTime()) ? new Date() : base;
    const shifted = new Date(valid.getTime() + deltaHours * 3600000);
    const tzOffsetMs = shifted.getTimezoneOffset() * 60000;
    const localIso = new Date(shifted.getTime() - tzOffsetMs).toISOString().slice(0, 16);
    applyObservationDateTime(localIso);
  };

  const q = searchQuery.trim().toLowerCase();
  const uq = unifiedSearchQuery.trim().toLowerCase();

  // Map constellation code to Korean name for richer search matching
  const constellationNameMap = useMemo(() => {
    const map = new Map<string, { nameKo: string; nameEn: string }>();
    CONSTELLATION_DATA.forEach((c) => {
      map.set(c.constellation, { nameKo: c.nameKo, nameEn: c.nameEn });
    });
    return map;
  }, []);

  // Unified All-Sky Search Results (Solar System + Stars + Messier + Caldwell + Extended Nebulae + 88 Constellations)
  const unifiedResults = useMemo<UnifiedSearchResult[]>(() => {
    if (!uq) return [];
    const results: UnifiedSearchResult[] = [];

    // 0. Solar System Bodies (Sun, Moon, Planets, Satellites, Dwarf Planets, Asteroids)
    for (const body of solarSystemBodies) {
      const hay = [
        body.id,
        body.nameKo,
        body.nameEn,
        body.parentNameKo || '',
        body.descriptionKo,
        body.kind === 'planet'
          ? '행성 planet'
          : body.kind === 'satellite'
          ? '위성 moon satellite'
          : body.kind === 'asteroid'
          ? '소행성 asteroid'
          : body.kind === 'dwarf_planet'
          ? '왜행성 dwarf planet'
          : body.kind,
      ]
        .join(' ')
        .toLowerCase();

      if (hay.includes(uq)) {
        const badgeLabel =
          body.kind === 'sun'
            ? '태양'
            : body.kind === 'moon'
            ? '달'
            : body.kind === 'planet'
            ? '행성'
            : body.kind === 'dwarf_planet'
            ? '왜행성'
            : body.kind === 'satellite'
            ? `${body.parentNameKo || ''} 위성`
            : '소행성';
        results.push({
          kind: 'solar',
          categoryLabel: badgeLabel,
          badgeColor:
            body.kind === 'planet' || body.kind === 'sun'
              ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
              : body.kind === 'satellite'
              ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
              : 'bg-violet-950/80 text-violet-300 border-violet-700/60',
          id: `solar-${body.id}`,
          titleKo: `${body.nameKo} (${body.nameEn})`,
          subtitle: `${badgeLabel} · ${body.mag.toFixed(1)}m · ${
            body.distanceAu < 0.01
              ? `${(body.distanceAu * 149597870.7).toFixed(0)} km`
              : `${body.distanceAu.toFixed(2)} AU`
          }`,
          raHours: body.raHours,
          decDeg: body.decDeg,
          mag: body.mag,
          fovDeg: getRecommendedSolarFov(body),
          solar: body,
        });
      }
    }

    // 1. Named & Bright Stars
    for (const star of BRIGHT_STARS) {
      const conInfo = constellationNameMap.get(star.constellation);
      const hay = [
        star.id,
        star.nameKo || '',
        star.nameEn || '',
        star.bayer ? `${star.bayer} ${star.constellation}` : '',
        star.constellation,
        conInfo?.nameKo || '',
        conInfo?.nameEn || '',
      ]
        .join(' ')
        .toLowerCase();

      if (hay.includes(uq)) {
        const displayName = star.nameKo
          ? `${star.nameKo}${star.nameEn ? ` (${star.nameEn})` : ''}`
          : `${star.bayer || ''} ${star.constellation} (${star.id})`;
        results.push({
          kind: 'star',
          categoryLabel: '항성',
          badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
          id: `star-${star.id}`,
          titleKo: displayName,
          subtitle: `${star.bayer ? `${star.bayer} ` : ''}${star.constellation}${
            conInfo ? ` (${conInfo.nameKo})` : ''
          } · ${star.mag.toFixed(2)}m`,
          raHours: star.raHours,
          decDeg: star.decDeg,
          mag: star.mag,
          fovDeg: 14,
          star,
        });
      }
    }

    // 2. Deep-Sky Objects (Messier 110 + Caldwell 109 + Extended Nebulae)
    for (const dso of DSO_CATALOG) {
      const conInfo = constellationNameMap.get(dso.constellation);
      const hay = [
        dso.id,
        dso.messierId || '',
        dso.caldwellId || '',
        dso.catalogAlt || '',
        dso.nameKo,
        dso.nameEn,
        dso.constellation,
        conInfo?.nameKo || '',
        conInfo?.nameEn || '',
        dso.descriptionKo,
      ]
        .join(' ')
        .toLowerCase();

      if (hay.includes(uq)) {
        const isMessier = Boolean(dso.messierId);
        const isCaldwell = Boolean(dso.caldwellId);
        results.push({
          kind: 'dso',
          categoryLabel: isMessier
            ? `메시에 ${dso.messierId}`
            : isCaldwell
            ? `콜드웰 ${dso.caldwellId}`
            : dso.id,
          badgeColor: isMessier
            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
            : isCaldwell
            ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            : 'bg-purple-950/80 text-purple-300 border-purple-700/60',
          id: `dso-${dso.id}`,
          titleKo: `${dso.nameKo} (${dso.nameEn})`,
          subtitle: `${dso.catalogAlt || dso.id} · ${dso.constellation}${
            conInfo ? ` (${conInfo.nameKo})` : ''
          } · ${dso.mag.toFixed(1)}m`,
          raHours: dso.raHours,
          decDeg: dso.decDeg,
          mag: dso.mag,
          fovDeg: 16,
          dso,
        });
      }
    }

    // 3. Official 88 IAU Constellations
    for (const con of CONSTELLATION_DATA) {
      const hay = [con.constellation, con.nameKo, con.nameEn].join(' ').toLowerCase();
      if (hay.includes(uq)) {
        results.push({
          kind: 'constellation',
          categoryLabel: `별자리 ${con.constellation}`,
          badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
          id: `con-${con.constellation}`,
          titleKo: `${con.nameKo} (${con.nameEn})`,
          subtitle: `IAU 약자 ${con.constellation} · 보조선 ${con.lines.length}선분`,
          raHours: con.raCenterHours,
          decDeg: con.decCenterDeg,
          fovDeg: 36,
          constellation: con,
        });
      }
    }

    return results.slice(0, 65);
  }, [uq, constellationNameMap, solarSystemBodies]);

  const handleSelectUnifiedResult = (item: UnifiedSearchResult) => {
    if (item.kind === 'dso') {
      if (item.dso.messierId) setSelectedMessierId(item.dso.id);
      if (item.dso.caldwellId) setSelectedCaldwellId(item.dso.id);
      onJumpToTarget(item.raHours, item.decDeg, item.fovDeg, item.dso, undefined, undefined);
    } else if (item.kind === 'star') {
      onJumpToTarget(item.raHours, item.decDeg, item.fovDeg, undefined, item.star, undefined);
    } else if (item.kind === 'solar') {
      setSelectedSolarId(item.solar.id);
      onJumpToTarget(item.raHours, item.decDeg, item.fovDeg, undefined, undefined, item.solar);
    } else {
      setSelectedConstellationCode(item.constellation.constellation);
      onJumpToTarget(item.raHours, item.decDeg, item.fovDeg);
    }
  };

  /**
   * Reusable Vector Cartography Layers Control Card (matches user's reference screenshot + Center Crosshair & Horizon Ground checkboxes)
   */
  const renderVectorLayersControlCard = () => (
    <div className="bg-[#0B1120] text-slate-100 border border-slate-800 rounded-lg p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h3 className="text-sm font-bold tracking-tight text-white">
          벡터 카토그래피 레이어 제어 (Vector Layers)
        </h3>
        <span className="text-[11px] font-mono text-cyan-400">
          FCHART3 RENDER ENGINE
        </span>
      </div>

      <div className="space-y-3 pt-1">
        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>은하수 다중 등고선 (Milky Way Contours)</span>
          <input
            type="checkbox"
            checked={config.showMilkyWayContours}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showMilkyWayContours: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        {config.showMilkyWayContours && (
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-md text-xs">
            {(
              [
                { id: 'shaded_vector', label: '벡터 음영' },
                { id: 'isophote_contour', label: '등고선 윤곽' },
                { id: 'stippled', label: '점묘(Stipple)' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() =>
                  onChangeConfig((p) => ({ ...p, milkyWayStyle: st.id }))
                }
                className={`py-1.5 px-2 rounded transition-colors whitespace-nowrap cursor-pointer ${
                  config.milkyWayStyle === st.id
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>IAU 공식 별자리 경계선 (Boundaries)</span>
          <input
            type="checkbox"
            checked={config.showConstellationBoundaries}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showConstellationBoundaries: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>별자리 보조선 및 명칭 (Constellations · 88개 전체)</span>
          <input
            type="checkbox"
            checked={config.showConstellationLines}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showConstellationLines: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>성운·은하 벡터 윤곽선 (Nebula Outlines)</span>
          <input
            type="checkbox"
            checked={config.showNebulaOutlines}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showNebulaOutlines: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>메시에 천체 표시 (Messier Objects · M1–M110 전체)</span>
          <input
            type="checkbox"
            checked={config.showMessierObjects}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showMessierObjects: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>태양계 천체 표시 (행성 · 주요 위성 · 소행성)</span>
          <input
            type="checkbox"
            checked={config.showSolarSystem}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showSolarSystem: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>행성 위상 · 표면 상세 묘사 (Phases &amp; Surface Features)</span>
          <input
            type="checkbox"
            checked={config.showPlanetDetails ?? true}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showPlanetDetails: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>콜드웰 천체 표시 (Caldwell Objects · C1–C109 전체)</span>
          <input
            type="checkbox"
            checked={config.showCaldwellObjects}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showCaldwellObjects: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>
            {config.coordinateSystem === 'horizontal'
              ? '지평 고도·방위각 좌표 격자 (Alt-Az Grid)'
              : 'J2000 적도 좌표 격자 (Equatorial Grid)'}
          </span>
          <input
            type="checkbox"
            checked={config.showEquatorialGrid}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showEquatorialGrid: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>지평선 (Horizon)</span>
          <input
            type="checkbox"
            checked={config.showHorizonGround}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showHorizonGround: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>황도 및 은하적도선 (Ecliptic & Galactic)</span>
          <input
            type="checkbox"
            checked={config.showEclipticAndGalactic}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showEclipticAndGalactic: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-slate-200 cursor-pointer py-0.5 hover:text-white transition-colors">
          <span>성도 오른쪽 위 커서 위치 표시 (Cursor Coordinates)</span>
          <input
            type="checkbox"
            checked={config.showCursorCoords}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showCursorCoords: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );

  /**
   * Reusable Coordinate System, Horizon Ground, Date/Time & Observer Location Card
   */
  const renderCoordinateAndLocationCard = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            좌표계 전환 · 지평선(지상) · 관측 날짜 및 위치 설정
          </h3>
        </div>
        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
          LST {formatRaHours(lstDeg / 15, true)}
        </span>
      </div>

      {/* Coordinate System Mode Selector */}
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          천구 좌표계 모드 (Coordinate System)
        </label>
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => handleSwitchCoordinateSystem('equatorial')}
            className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              config.coordinateSystem === 'equatorial'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            적도좌표계 (J2000 RA / Dec)
          </button>
          <button
            type="button"
            onClick={() => handleSwitchCoordinateSystem('horizontal')}
            className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              config.coordinateSystem === 'horizontal'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            지평좌표계 (방위각 Az / 고도 Alt)
          </button>
        </div>
      </div>

      {/* Ground / Horizon Toggle + Position Slider */}
      <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-slate-800 dark:text-slate-200 space-y-2">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-semibold text-emerald-900 dark:text-emerald-300">
              지평선 (Horizon &amp; 방위점 N·E·S·W 표시)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              지평선 아래 하늘을 가리고 8방위 나침반을 표시합니다
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.showHorizonGround}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showHorizonGround: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0 ml-3"
          />
        </label>

        <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-emerald-900 dark:text-emerald-300">
              지평선 위치 (지평선을 아래로 내려 위쪽 별 더 보기)
            </span>
            <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {(config.horizonAltDeg ?? 0) === 0
                ? '0° (현재)'
                : `${(config.horizonAltDeg ?? 0).toFixed(0)}°`}
            </span>
          </div>
          <input
            type="range"
            min={-85}
            max={0}
            step={1}
            value={config.horizonAltDeg ?? 0}
            disabled={!config.showHorizonGround}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                horizonAltDeg: Number(e.target.value),
              }))
            }
            className="w-full accent-emerald-600 disabled:opacity-40 cursor-pointer"
          />
        </div>
      </div>

      {/* Observation Date & Time */}
      <div className="pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Calendar className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>관측 날짜 및 시각 (Observation Date &amp; Time)</span>
          </label>
          <input
            type="datetime-local"
            step="1"
            value={config.observationDateTime}
            onChange={(e) => applyObservationDateTime(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shrink-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleStepHours(-24)}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              -1일
            </button>
            <button
              type="button"
              onClick={() => handleStepHours(-1)}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              -1시간
            </button>
            <button
              type="button"
              onClick={handleSetNowDateTime}
              className="px-2 py-1 text-[11px] font-medium rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 cursor-pointer"
            >
              현재 시각
            </button>
            <button
              type="button"
              onClick={() => handleStepHours(1)}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              +1시간
            </button>
            <button
              type="button"
              onClick={() => handleStepHours(24)}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              +1일
            </button>
          </div>
        </div>
      </div>

      {/* Observer Location Presets + Custom Lat/Lon */}
      <div className="space-y-2.5 pt-1">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>관측 위치 선택 (Observer Location & Lat/Lon)</span>
        </label>

        <select
          value={
            OBSERVER_LOCATION_PRESETS.find(
              (loc) =>
                Math.abs(loc.latDeg - config.observerLatDeg) < 0.01 &&
                Math.abs(loc.lonDeg - config.observerLonDeg) < 0.01
            )?.id || 'custom'
          }
          onChange={(e) => {
            const preset = OBSERVER_LOCATION_PRESETS.find((l) => l.id === e.target.value);
            if (preset) {
              onChangeConfig((p) => ({
                ...p,
                observerLatDeg: preset.latDeg,
                observerLonDeg: preset.lonDeg,
                observerLocationName: preset.name,
              }));
            }
          }}
          className="w-full px-3 py-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          {OBSERVER_LOCATION_PRESETS.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name} · 위도 {loc.latDeg.toFixed(2)}° / 경도 {loc.lonDeg.toFixed(2)}° ({loc.region})
            </option>
          ))}
          <option value="custom">사용자 직접 입력 위치 ({config.observerLocationName})</option>
        </select>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              관측지 위도 Latitude (-90~+90°)
            </label>
            <input
              type="number"
              min={-90}
              max={90}
              step={0.1}
              value={config.observerLatDeg}
              onChange={(e) => {
                const lat = Math.max(-89.9, Math.min(89.9, Number(e.target.value)));
                onChangeConfig((p) => ({
                  ...p,
                  observerLatDeg: lat,
                  observerLocationName: `북위 ${lat.toFixed(2)}° 사용자 관측지`,
                }));
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              관측지 경도 Longitude (-180~+180°)
            </label>
            <input
              type="number"
              min={-180}
              max={180}
              step={0.1}
              value={config.observerLonDeg}
              onChange={(e) => {
                const lon = Math.max(-180, Math.min(180, Number(e.target.value)));
                onChangeConfig((p) => ({
                  ...p,
                  observerLonDeg: lon,
                }));
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Live Converted Center Readout */}
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <span>
            적도 중심: {formatRaHours(config.centerRaHours)} / {formatDecDeg(config.centerDecDeg)}
          </span>
          <span>
            지평 중심: Az {formatAzDeg(config.centerAzDeg)} / Alt {formatAltDeg(config.centerAltDeg)}
          </span>
        </div>
      </div>
    </div>
  );

  /**
   * Reusable Finder Reticle & Telescope/Eyepiece Optics Card
   */
  const renderFinderReticleAndOpticsCard = () => {
    const fTel = config.telescopeFocalLengthMm || 1000;
    const fEye = config.eyepieceFocalLengthMm || 25;
    const afov = config.eyepieceAfovDeg || 68;
    const magnification = Number((fTel / fEye).toFixed(1));
    const calculatedTfov = Number(((afov * fEye) / fTel).toFixed(2));

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              시야 링 및 망원경·아이피스 시야각 설정
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-500 font-semibold">
            FINDER RETICLE
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            시야 링 선택 (중복 선택하여 누적 표시 가능)
          </label>
          {(() => {
            const activeList: Array<'telrad' | 'binoculars_7x50' | 'eyepiece_afov'> = Array.isArray(
              config.activeReticles
            )
              ? config.activeReticles
              : config.reticleMode !== 'none' && config.reticleMode !== 'ccd_sensor'
              ? [config.reticleMode]
              : [];
            const toggleItem = (id: 'telrad' | 'binoculars_7x50' | 'eyepiece_afov') => {
              onChangeConfig((prev) => {
                const cur: Array<'telrad' | 'binoculars_7x50' | 'eyepiece_afov'> = Array.isArray(
                  prev.activeReticles
                )
                  ? prev.activeReticles
                  : prev.reticleMode !== 'none' && prev.reticleMode !== 'ccd_sensor'
                  ? [prev.reticleMode]
                  : [];
                const next = cur.includes(id)
                  ? cur.filter((x) => x !== id)
                  : [...cur, id];
                return {
                  ...prev,
                  activeReticles: next,
                  reticleMode: next[0] ?? 'none',
                };
              });
            };
            return (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      showCenterCrosshair: !prev.showCenterCrosshair,
                    }))
                  }
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded border transition-colors cursor-pointer ${
                    config.showCenterCrosshair
                      ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/40 text-slate-900 dark:text-white font-semibold'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-cyan-500"
                      style={{
                        backgroundColor: config.showCenterCrosshair
                          ? '#06B6D4'
                          : 'transparent',
                      }}
                    />
                    <span>중앙 십자선</span>
                  </span>
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      config.showCenterCrosshair
                        ? 'bg-cyan-600 border-cyan-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {config.showCenterCrosshair && (
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    )}
                  </span>
                </button>
                {(
                  [
                    {
                      id: 'telrad',
                      label: 'Telrad 등배파인더 (0.5° · 2.0° · 4.0° 3중 동심원)',
                      dotColor: '#EF4444',
                    },
                    {
                      id: 'binoculars_7x50',
                      label: '7×50 쌍안경 시야 링 (7.0° 점선 원)',
                      dotColor: '#06B6D4',
                    },
                    {
                      id: 'eyepiece_afov',
                      label: `망원경 아이피스 시야 링 (${config.customEyepieceFovDeg.toFixed(2)}°)`,
                      dotColor: '#F59E0B',
                    },
                  ] as Array<{
                    id: 'telrad' | 'binoculars_7x50' | 'eyepiece_afov';
                    label: string;
                    dotColor: string;
                  }>
                ).map((item) => {
                  const checked = activeList.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded border transition-colors cursor-pointer ${
                        checked
                          ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/40 text-slate-900 dark:text-white font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
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
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {(Array.isArray(config.activeReticles)
          ? config.activeReticles.includes('eyepiece_afov')
          : config.reticleMode === 'eyepiece_afov') && (
          <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-3.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-300">
              아이피스 시야각(TFOV) 설정 방식
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-amber-100/60 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() =>
                  onChangeConfig((p) => ({ ...p, eyepieceInputMode: 'direct' }))
                }
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  config.eyepieceInputMode !== 'telescope'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                시야각 바로 넣기 (직접 입력)
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeConfig((p) => ({
                    ...p,
                    eyepieceInputMode: 'telescope',
                    telescopeFocalLengthMm: fTel,
                    eyepieceFocalLengthMm: fEye,
                    eyepieceAfovDeg: afov,
                    customEyepieceFovDeg: calculatedTfov,
                  }));
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  config.eyepieceInputMode === 'telescope'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                망원경과 아이피스로 계산
              </button>
            </div>

            {config.eyepieceInputMode !== 'telescope' ? (
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  아이피스 실시야각 직접 입력 (True Field of View, °)
                </label>
                <div className="flex items-center gap-2">
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
                    className="w-32 px-3 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400"
                  />
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    도(°)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  성도 중앙에 해당 시야각의 주황색 원환이 실제 밤하늘 축척 크기로 표시됩니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">
                      망원경 초점거리 (Focal Length, mm)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={5000}
                      step={50}
                      value={config.telescopeFocalLengthMm || 1000}
                      onChange={(e) => {
                        const nextTel = Math.max(50, Number(e.target.value) || 1000);
                        const curEye = config.eyepieceFocalLengthMm || 25;
                        const curAfov = config.eyepieceAfovDeg || 68;
                        const nextTfov = Number(((curAfov * curEye) / nextTel).toFixed(2));
                        onChangeConfig((p) => ({
                          ...p,
                          telescopeFocalLengthMm: nextTel,
                          customEyepieceFovDeg: nextTfov,
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">
                      아이피스 초점거리 (Focal Length, mm)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={60}
                      step={1}
                      value={config.eyepieceFocalLengthMm || 25}
                      onChange={(e) => {
                        const nextEye = Math.max(1, Number(e.target.value) || 25);
                        const curTel = config.telescopeFocalLengthMm || 1000;
                        const curAfov = config.eyepieceAfovDeg || 68;
                        const nextTfov = Number(((curAfov * nextEye) / curTel).toFixed(2));
                        onChangeConfig((p) => ({
                          ...p,
                          eyepieceFocalLengthMm: nextEye,
                          customEyepieceFovDeg: nextTfov,
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-700 dark:text-slate-300">
                      아이피스 겉보기 시야각 (Apparent FOV, °)
                    </label>
                    <div className="flex items-center gap-1">
                      {[50, 68, 82, 100].map((deg) => (
                        <button
                          key={`settings-afov-${deg}`}
                          type="button"
                          onClick={() => {
                            const curTel = config.telescopeFocalLengthMm || 1000;
                            const curEye = config.eyepieceFocalLengthMm || 25;
                            const nextTfov = Number(((deg * curEye) / curTel).toFixed(2));
                            onChangeConfig((p) => ({
                              ...p,
                              eyepieceAfovDeg: deg,
                              customEyepieceFovDeg: nextTfov,
                            }));
                          }}
                          className={`px-1.5 py-0.5 text-[10px] rounded border cursor-pointer ${
                            (config.eyepieceAfovDeg || 68) === deg
                              ? 'bg-amber-500 text-white border-amber-600 font-bold'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={20}
                    max={120}
                    step={1}
                    value={config.eyepieceAfovDeg || 68}
                    onChange={(e) => {
                      const nextAfov = Math.max(10, Math.min(130, Number(e.target.value) || 68));
                      const curTel = config.telescopeFocalLengthMm || 1000;
                      const curEye = config.eyepieceFocalLengthMm || 25;
                      const nextTfov = Number(((nextAfov * curEye) / curTel).toFixed(2));
                      onChangeConfig((p) => ({
                        ...p,
                        eyepieceAfovDeg: nextAfov,
                        customEyepieceFovDeg: nextTfov,
                      }));
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Calculation Output Box */}
                <div className="p-3 rounded-lg bg-amber-100/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">배율: </span>
                    <span className="font-bold text-amber-700 dark:text-amber-300 text-sm">
                      {magnification}배
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">
                      ({fTel}mm ÷ {fEye}mm)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">실시야각(TFOV): </span>
                    <span className="font-bold text-amber-700 dark:text-amber-300 text-sm">
                      {config.customEyepieceFovDeg.toFixed(2)}°
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">
                      ({afov}° ÷ {magnification})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (mode === 'catalog') {
    const filteredMessier = !q
      ? MESSIER_CATALOG
      : MESSIER_CATALOG.filter(
          (d) =>
            d.id.toLowerCase().includes(q) ||
            d.nameKo.toLowerCase().includes(q) ||
            d.nameEn.toLowerCase().includes(q) ||
            (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
            d.constellation.toLowerCase().includes(q)
        );

    const filteredCaldwell = !q
      ? CALDWELL_CATALOG
      : CALDWELL_CATALOG.filter(
          (d) =>
            d.id.toLowerCase().includes(q) ||
            d.nameKo.toLowerCase().includes(q) ||
            d.nameEn.toLowerCase().includes(q) ||
            (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
            d.constellation.toLowerCase().includes(q)
        );

    const filteredSolarBodies = !q
      ? solarSystemBodies
      : solarSystemBodies.filter(
          (b) =>
            b.id.toLowerCase().includes(q) ||
            b.nameKo.toLowerCase().includes(q) ||
            b.nameEn.toLowerCase().includes(q) ||
            (b.parentNameKo && b.parentNameKo.toLowerCase().includes(q)) ||
            b.kind.toLowerCase().includes(q)
        );

    const filteredConstellations = !q
      ? CONSTELLATION_DATA
      : CONSTELLATION_DATA.filter(
          (c) =>
            c.constellation.toLowerCase().includes(q) ||
            c.nameKo.toLowerCase().includes(q) ||
            c.nameEn.toLowerCase().includes(q)
        );

    const filteredDsos = DSO_CATALOG.filter((d) => {
      const activeQuery = q || uq;
      if (
        activeQuery &&
        !d.id.toLowerCase().includes(activeQuery) &&
        !d.nameKo.toLowerCase().includes(activeQuery) &&
        !d.nameEn.toLowerCase().includes(activeQuery) &&
        !(d.catalogAlt && d.catalogAlt.toLowerCase().includes(activeQuery)) &&
        !d.constellation.toLowerCase().includes(activeQuery)
      ) {
        return false;
      }
      if (filterType === 'all') return true;
      if (filterType === 'messier') return Boolean(d.messierId);
      if (filterType === 'caldwell') return Boolean(d.caldwellId);
      if (filterType === 'nebula')
        return (
          d.type === 'emission_nebula' ||
          d.type === 'reflection_nebula' ||
          d.type === 'planetary_nebula' ||
          d.type === 'supernova_remnant' ||
          d.type === 'dark_nebula'
        );
      if (filterType === 'galaxy') return d.type.includes('galaxy');
      if (filterType === 'cluster') return d.type.includes('cluster');
      return true;
    });

    return (
      <div className="space-y-6">
        {/* Top Interactive Search Console (Unified All-Sky Search Bar above Messier/Caldwell/88 Constellations) */}
        <div className="bg-[#0B1120] text-slate-100 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          {/* 1. Unified All-Sky Object Search Bar (전체 천체 대상 종합 검색창) */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  전체 천체 대상 종합 검색창 (태양계 행성·위성·소행성 · 항성 · 메시에 110 · 콜드웰 109 · 88 별자리 통합 검색)
                </span>
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                검색 후 클릭 또는 Enter 입력 시 성도 즉시 이동
              </span>
            </div>

            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={unifiedSearchQuery}
                  onChange={(e) => setUnifiedSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && unifiedResults.length > 0) {
                      handleSelectUnifiedResult(unifiedResults[0]);
                    }
                  }}
                  placeholder="전체 천체 통합 검색 (예: 목성, 타이탄, 이오, 베스타, 세레스, 명왕성, M42, 시리우스, 오리온...)"
                  className="w-full pl-10 pr-9 py-2.5 text-xs rounded-lg border border-cyan-500/40 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
                {unifiedSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setUnifiedSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    title="검색어 지우기"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {unifiedResults.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSelectUnifiedResult(unifiedResults[0])}
                  className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  첫 결과 조준 ({unifiedResults.length}건)
                </button>
              )}
            </div>

            {/* Unified Search Results List */}
            {uq && (
              <div className="pt-1">
                {unifiedResults.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-400 text-center">
                    &ldquo;{unifiedSearchQuery}&rdquo;에 해당하는 천체(항성·메시에·콜드웰·NGC/IC·별자리)가 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
                    {unifiedResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectUnifiedResult(item)}
                        className="text-left p-2.5 rounded-lg border border-slate-800 bg-slate-950/80 hover:border-cyan-500/70 hover:bg-slate-900 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border shrink-0 ${item.badgeColor}`}
                            >
                              {item.categoryLabel}
                            </span>
                            <span className="text-xs font-semibold text-slate-100 truncate">
                              {item.titleKo}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                            {item.subtitle} · {formatRaHours(item.raHours, true)}{' '}
                            {formatDecDeg(item.decDeg, true)}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded text-[11px] font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                          성도 이동
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Segmented Switcher: Messier (110) | Caldwell (109) | Solar System | Constellations (88) */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setFinderTab('messier')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'messier'
                  ? 'bg-slate-950 text-cyan-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              메시에 (110)
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('caldwell')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'caldwell'
                  ? 'bg-slate-950 text-amber-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              콜드웰 (109)
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('solar')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'solar'
                  ? 'bg-slate-950 text-emerald-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              태양계 ({solarSystemBodies.length})
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('constellations')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'constellations'
                  ? 'bg-slate-950 text-cyan-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              88 별자리
            </button>
          </div>

          {/* Direct Dropdown Selector + Category Filter Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            {finderTab === 'messier' && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">
                  메시에 천체 전 목록 바로가기 (M1 ~ M110 전체 110개)
                </label>
                <select
                  value={selectedMessierId}
                  onChange={(e) => {
                    const found = MESSIER_CATALOG.find((d) => d.id === e.target.value);
                    if (found) {
                      setSelectedMessierId(found.id);
                      onJumpToTarget(found.raHours, found.decDeg, 18, found);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                >
                  {MESSIER_CATALOG.map((dso) => (
                    <option key={dso.id} value={dso.id}>
                      {dso.id} · {dso.nameKo} ({dso.catalogAlt} · {dso.constellation} · {dso.mag.toFixed(1)}m)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {finderTab === 'caldwell' && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">
                  콜드웰 천체 전 목록 바로가기 (C1 ~ C109 전체 109개)
                </label>
                <select
                  value={selectedCaldwellId}
                  onChange={(e) => {
                    const found = CALDWELL_CATALOG.find((d) => d.id === e.target.value);
                    if (found) {
                      setSelectedCaldwellId(found.id);
                      onJumpToTarget(found.raHours, found.decDeg, 18, found);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                >
                  {CALDWELL_CATALOG.map((dso) => (
                    <option key={dso.id} value={dso.id}>
                      {dso.id} · {dso.nameKo} ({dso.catalogAlt} · {dso.constellation} · {dso.mag.toFixed(1)}m)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {finderTab === 'solar' && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">
                  태양계 행성 · 주요 위성 · 소행성 바로가기 ({solarSystemBodies.length}개)
                </label>
                <select
                  value={selectedSolarId}
                  onChange={(e) => {
                    const found = solarSystemBodies.find((b) => b.id === e.target.value);
                    if (found) {
                      setSelectedSolarId(found.id);
                      const fov = getRecommendedSolarFov(found);
                      onJumpToTarget(found.raHours, found.decDeg, fov, undefined, undefined, found);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                >
                  {solarSystemBodies.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameKo} ({b.nameEn}) · {b.mag.toFixed(1)}m · {formatRaHours(b.raHours, true)}{' '}
                      {formatDecDeg(b.decDeg, true)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {finderTab === 'constellations' && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">
                  IAU 공식 88개 별자리 전체 바로가기
                </label>
                <select
                  value={selectedConstellationCode}
                  onChange={(e) => {
                    const found = CONSTELLATION_DATA.find(
                      (c) => c.constellation === e.target.value
                    );
                    if (found) {
                      setSelectedConstellationCode(found.constellation);
                      onJumpToTarget(found.raCenterHours, found.decCenterDeg, 36);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                >
                  {CONSTELLATION_DATA.map((con) => (
                    <option key={con.constellation} value={con.constellation}>
                      {con.constellation} · {con.nameKo} ({con.nameEn})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  finderTab === 'messier'
                    ? 'M1~M110 번호, 이름, NGC, 별자리 검색...'
                    : finderTab === 'caldwell'
                    ? 'C1~C109 번호, 이름, NGC, 별자리 검색...'
                    : finderTab === 'solar'
                    ? '행성(목성, 토성), 위성(이오, 타이탄), 소행성(베스타, 세레스)...'
                    : '88개 별자리 이름 또는 약자(Ori, UMa...) 검색...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Scrollable Grid of Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[380px] overflow-y-auto pr-1">
            {finderTab === 'messier' &&
              filteredMessier.map((dso) => (
                <button
                  key={dso.id}
                  type="button"
                  onClick={() => {
                    setSelectedMessierId(dso.id);
                    onJumpToTarget(dso.raHours, dso.decDeg, 18, dso);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    selectedMessierId === dso.id
                      ? 'border-cyan-500 bg-cyan-950/30'
                      : 'border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-100 truncate">
                      <span className="font-mono text-cyan-400 mr-1.5">
                        {dso.messierId}
                      </span>
                      {dso.nameKo}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 ml-1">
                      {dso.mag.toFixed(1)}m
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    {dso.catalogAlt} · {dso.constellation} · {formatRaHours(dso.raHours, true)}{' '}
                    {formatDecDeg(dso.decDeg, true)}
                  </div>
                </button>
              ))}

            {finderTab === 'caldwell' &&
              filteredCaldwell.map((dso) => (
                <button
                  key={dso.id}
                  type="button"
                  onClick={() => {
                    setSelectedCaldwellId(dso.id);
                    onJumpToTarget(dso.raHours, dso.decDeg, 18, dso);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    selectedCaldwellId === dso.id
                      ? 'border-amber-500 bg-amber-950/30'
                      : 'border-slate-800 hover:border-amber-500/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-100 truncate">
                      <span className="font-mono text-amber-400 mr-1.5">
                        {dso.caldwellId}
                      </span>
                      {dso.nameKo}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 ml-1">
                      {dso.mag.toFixed(1)}m
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    {dso.catalogAlt} · {dso.constellation} · {formatRaHours(dso.raHours, true)}{' '}
                    {formatDecDeg(dso.decDeg, true)}
                  </div>
                </button>
              ))}

            {finderTab === 'solar' &&
              filteredSolarBodies.map((body) => {
                const badgeText =
                  body.kind === 'sun'
                    ? '태양'
                    : body.kind === 'moon'
                    ? '달'
                    : body.kind === 'planet'
                    ? '행성'
                    : body.kind === 'dwarf_planet'
                    ? '왜행성'
                    : body.kind === 'satellite'
                    ? `${body.parentNameKo || ''} 위성`
                    : '소행성';
                const targetFov = getRecommendedSolarFov(body);
                return (
                  <button
                    key={body.id}
                    type="button"
                    onClick={() => {
                      setSelectedSolarId(body.id);
                      onJumpToTarget(body.raHours, body.decDeg, targetFov, undefined, undefined, body);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedSolarId === body.id
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-slate-800 hover:border-emerald-500/60 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-100 truncate">
                        <span className="font-mono text-emerald-400 mr-1.5">
                          [{badgeText}]
                        </span>
                        {body.nameKo} ({body.nameEn})
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 ml-1">
                        {body.mag.toFixed(1)}m
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-1">
                      {formatRaHours(body.raHours, true)} {formatDecDeg(body.decDeg, true)} ·{' '}
                      {body.distanceAu < 0.01
                        ? `${(body.distanceAu * 149597870.7).toFixed(0)}km`
                        : `${body.distanceAu.toFixed(2)} AU`}
                    </div>
                  </button>
                );
              })}

            {finderTab === 'constellations' &&
              filteredConstellations.map((con) => (
                <button
                  key={con.constellation}
                  type="button"
                  onClick={() => {
                    setSelectedConstellationCode(con.constellation);
                    onJumpToTarget(con.raCenterHours, con.decCenterDeg, 36);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    selectedConstellationCode === con.constellation
                      ? 'border-cyan-500 bg-cyan-950/30'
                      : 'border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-100">
                      <span className="font-mono text-cyan-400 mr-1.5">
                        {con.constellation}
                      </span>
                      {con.nameKo} ({con.nameEn})
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {con.lines.length}선분
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    중심 RA {formatRaHours(con.raCenterHours, true)} · Dec{' '}
                    {formatDecDeg(con.decCenterDeg, true)}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Category Filter & Full DSO Cards Grid */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                MESSIER (M1–M110) · CALDWELL (C1–C109) · 88 IAU CONSTELLATIONS
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                천체 유형별 상세 검색 및 88개 별자리 전체 디렉토리
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              {(
                [
                  { id: 'all', label: `전체 (${DSO_CATALOG.length})` },
                  { id: 'solar', label: `태양계 (${solarSystemBodies.length})` },
                  { id: 'messier', label: `메시에 (110)` },
                  { id: 'caldwell', label: `콜드웰 (109)` },
                  { id: 'nebula', label: '성운' },
                  { id: 'galaxy', label: '은하' },
                  { id: 'cluster', label: '성단' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filterType === tab.id
                      ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Solar System Directory Cards when 'solar' filter is selected */}
        {filterType === 'solar' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSolarBodies.map((body) => {
              const badgeText =
                body.kind === 'sun'
                  ? '태양 (Sun)'
                  : body.kind === 'moon'
                  ? '달 (Moon)'
                  : body.kind === 'planet'
                  ? '행성 (Planet)'
                  : body.kind === 'dwarf_planet'
                  ? '왜행성 (Dwarf Planet)'
                  : body.kind === 'satellite'
                  ? `${body.parentNameKo || ''} 위성 (Satellite)`
                  : '소행성 (Asteroid)';
              const targetFov = getRecommendedSolarFov(body);
              return (
                <div
                  key={`card-${body.id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {badgeText}
                      </strong>
                      <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
                        {body.mag.toFixed(1)} mag
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {body.nameKo} ({body.nameEn})
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>RA {formatRaHours(body.raHours, true)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Dec {formatDecDeg(body.decDeg, true)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {body.distanceAu < 0.01
                          ? `${(body.distanceAu * 149597870.7).toFixed(0)} km`
                          : `${body.distanceAu.toFixed(3)} AU`}
                      </span>
                    </div>
                    <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {body.descriptionKo}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      시직경 {body.angularDiameterArcsec.toFixed(1)}″
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToTarget(body.raHours, body.decDeg, targetFov, undefined, undefined, body)
                      }
                      className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 dark:bg-emerald-600 text-white hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
                    >
                      성도에서 보기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Deep-Sky Objects Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDsos.map((dso) => (
              <div
                key={dso.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                    <span>
                      {dso.messierId ? (
                        <strong className="text-cyan-600 dark:text-cyan-400">
                          메시에 {dso.messierId}
                        </strong>
                      ) : dso.caldwellId ? (
                        <strong className="text-amber-600 dark:text-amber-400">
                          콜드웰 {dso.caldwellId}
                        </strong>
                      ) : (
                        <strong>{dso.id}</strong>
                      )}{' '}
                      · {dso.catalogAlt || dso.constellation}
                    </span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
                      {dso.mag.toFixed(1)} mag
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {dso.nameKo} ({dso.nameEn})
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>RA {formatRaHours(dso.raHours, true)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Dec {formatDecDeg(dso.decDeg, true)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      크기 {dso.sizeMajorArcmin}′×{dso.sizeMinorArcmin}′
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {dso.descriptionKo}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    {dso.contourPolygons
                      ? `다각형 벡터 등고선 (${dso.contourPolygons.length}개 루프)`
                      : 'fchart3 표준 기호'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToTarget(dso.raHours, dso.decDeg, 16, dso)}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 dark:bg-cyan-600 text-white hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
                  >
                    성도에서 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Official IAU Constellations Directory */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            IAU 공식 88개 별자리 전체 경계선 및 보조선 디렉토리 ({CONSTELLATION_DATA.length}개 별자리 전체 수록)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {CONSTELLATION_DATA.map((con) => (
              <button
                key={con.constellation}
                type="button"
                onClick={() =>
                  onJumpToTarget(con.raCenterHours, con.decCenterDeg, 36)
                }
                className="p-2.5 rounded border border-slate-200 dark:border-slate-800 hover:border-cyan-500 text-left transition-colors cursor-pointer"
              >
                <div className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  {con.constellation}
                </div>
                <div className="text-xs font-medium text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                  {con.nameKo}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  {formatRaHours(con.raCenterHours, true)} · {formatDecDeg(con.decCenterDeg, true)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Settings View (mode === 'settings')
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
          FCHART3 VECTOR CARTOGRAPHY SETTINGS · COORDINATE SYSTEM · DATE & LOCATION
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
          성도 벡터 레이어 · 좌표계 전환(적도/지평) · 관측 날짜 및 위치 설정
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          은하수 등고선, 별자리 경계선, 성운 윤곽선 제어는 물론 적도좌표계(RA/Dec)와 지평좌표계(Az/Alt) 전환, 지평선 지상 표시, 관측 날짜·시간 및 관측지 위도/경도를 설정할 수 있습니다.
        </p>
      </div>

      {/* Settings Only Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Vector Cartography Layer Control Card + Label & Legend Settings */}
        <div className="lg:col-span-6 space-y-5">
          {renderVectorLayersControlCard()}

          {/* Additional Display & Label Settings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>라벨 표기 및 범례 상세 설정</span>
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                항성 이름 및 바이어 기호 표기 (Star Labels)
              </label>
              <select
                value={config.showStarLabels}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    showStarLabels: e.target.value as FChart3Config['showStarLabels'],
                  }))
                }
                className="w-full px-3 py-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="bayer_and_named">고유명칭 + 주요 바이어 기호 (권장)</option>
                <option value="all_named">모든 고유명칭 항성 표시</option>
                <option value="bright_only">1~2등성 밝은 별만 표시</option>
                <option value="none">항성 라벨 숨기기</option>
              </select>
            </div>

            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5">
              <span>메시에 · 콜드웰 천체 번호 및 이름 라벨 표시</span>
              <input
                type="checkbox"
                checked={config.showDsoLabels}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    showDsoLabels: e.target.checked,
                  }))
                }
                className="rounded accent-cyan-600"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5">
              <span>성도 속 하단 등급 스케일 범례 (Magnitude Legend) 표시</span>
              <input
                type="checkbox"
                checked={config.showMagnitudeScale}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    showMagnitudeScale: e.target.checked,
                  }))
                }
                className="rounded accent-cyan-600"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5">
              <span>성도 속 하단 각거리 축척 막대 (Angular Scale Bar) 표시</span>
              <input
                type="checkbox"
                checked={config.showScaleBar}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    showScaleBar: e.target.checked,
                  }))
                }
                className="rounded accent-cyan-600"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5">
              <span>성도 오른쪽 위 커서 위치 좌표 (Cursor Coordinates) 표시</span>
              <input
                type="checkbox"
                checked={config.showCursorCoords}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    showCursorCoords: e.target.checked,
                  }))
                }
                className="rounded accent-cyan-600"
              />
            </label>
          </div>
        </div>

        {/* Right 6 Columns: Coordinate System, Horizon Ground, Date/Time & Observer Location Card + Finder Reticle & Optics */}
        <div className="lg:col-span-6 space-y-5">
          {renderCoordinateAndLocationCard()}
          {renderFinderReticleAndOpticsCard()}
        </div>
      </div>
    </div>
  );
};
