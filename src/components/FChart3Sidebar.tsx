import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  Compass,
  Crosshair,
  FileDown,
  MapPin,
  Search,
  Settings,
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
  ProjectionMode,
  SolarSystemBodyRecord,
  StarRecord,
} from '../types/astronomy';
import {
  computeLinkedLimitingMags,
  computeLstDeg,
  equatorialToHorizontal,
  formatDecDeg,
  formatRaHours,
  horizontalToEquatorial,
} from '../utils/atlasGenerator';
import {
  computeSolarSystemBodies,
  getRecommendedSolarFov,
} from '../utils/solarSystemEphemeris';
import { startSkySlew } from '../utils/skySlew';

const MIN_SIDEBAR_FOV_DEG = 0.02;
const MAX_SIDEBAR_FOV_DEG = 135;

const fovSliderScale = d3
  .scaleLog<number, number>()
  .base(10)
  .domain([MIN_SIDEBAR_FOV_DEG, MAX_SIDEBAR_FOV_DEG])
  .range([0, 1000])
  .clamp(true);

function fovToSliderStep(fovDeg: number): number {
  return Math.round(fovSliderScale(fovDeg));
}

function sliderStepToFov(step: number): number {
  const raw = fovSliderScale.invert(Math.max(0, Math.min(1000, step)));
  if (raw < 0.2) return Number(raw.toFixed(3));
  if (raw < 2) return Number(raw.toFixed(2));
  return Number(raw.toFixed(1));
}

interface FChart3SidebarProps {
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  onOpenAtlasModal: () => void;
  onOpenSettingsTab: () => void;
  onSelectDso: (dso: DSORecord) => void;
  onSelectStar?: (star: StarRecord) => void;
  onSelectSolarBody?: (body: SolarSystemBodyRecord) => void;
  sheetsCount: number;
}

type SidebarUnifiedItem =
  | {
      kind: 'dso';
      badge: string;
      badgeClass: string;
      id: string;
      title: string;
      sub: string;
      dso: DSORecord;
    }
  | {
      kind: 'star';
      badge: string;
      badgeClass: string;
      id: string;
      title: string;
      sub: string;
      star: StarRecord;
    }
  | {
      kind: 'solar';
      badge: string;
      badgeClass: string;
      id: string;
      title: string;
      sub: string;
      solar: SolarSystemBodyRecord;
    }
  | {
      kind: 'constellation';
      badge: string;
      badgeClass: string;
      id: string;
      title: string;
      sub: string;
      constellation: ConstellationStick;
    };

export const FChart3Sidebar: React.FC<FChart3SidebarProps> = ({
  config,
  onChangeConfig,
  onOpenAtlasModal,
  onOpenSettingsTab,
  onSelectDso,
  onSelectStar,
  onSelectSolarBody,
  sheetsCount,
}) => {
  const [sidebarMode, setSidebarMode] = useState<'settings' | 'search'>('settings');
  const [finderTab, setFinderTab] = useState<'messier' | 'caldwell' | 'solar' | 'constellations'>('messier');
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessierId, setSelectedMessierId] = useState<string>('M42');
  const [selectedCaldwellId, setSelectedCaldwellId] = useState<string>('C20');
  const [selectedSolarId, setSelectedSolarId] = useState<string>('jupiter');
  const [selectedConstellationCode, setSelectedConstellationCode] = useState<string>('Ori');

  const q = searchQuery.trim().toLowerCase();
  const uq = unifiedSearchQuery.trim().toLowerCase();
  const isHorizontal = config.coordinateSystem === 'horizontal';

  const lstDeg = useMemo(
    () => computeLstDeg(config.observationDateTime, config.observerLonDeg),
    [config.observationDateTime, config.observerLonDeg]
  );

  const solarSystemBodies = useMemo<SolarSystemBodyRecord[]>(
    () => computeSolarSystemBodies(config.observationDateTime),
    [config.observationDateTime]
  );

  const constellationMap = useMemo(() => {
    const m = new Map<string, { nameKo: string; nameEn: string }>();
    CONSTELLATION_DATA.forEach((c) => m.set(c.constellation, { nameKo: c.nameKo, nameEn: c.nameEn }));
    return m;
  }, []);

  const unifiedResults = useMemo<SidebarUnifiedItem[]>(() => {
    if (!uq) return [];
    const list: SidebarUnifiedItem[] = [];

    for (const body of solarSystemBodies) {
      const hay = [
        body.id,
        body.nameKo,
        body.nameEn,
        body.parentNameKo || '',
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
        list.push({
          kind: 'solar',
          badge: badgeLabel,
          badgeClass:
            body.kind === 'planet' || body.kind === 'sun'
              ? 'bg-amber-950/70 text-amber-300 border-amber-700/60'
              : body.kind === 'satellite'
              ? 'bg-sky-950/70 text-sky-300 border-sky-700/60'
              : 'bg-violet-950/70 text-violet-300 border-violet-700/60',
          id: `sol-${body.id}`,
          title: `${body.nameKo} (${body.nameEn})`,
          sub: `${badgeLabel} · ${body.mag.toFixed(1)}m · ${formatRaHours(body.raHours, true)} ${formatDecDeg(
            body.decDeg,
            true
          )}`,
          solar: body,
        });
      }
    }

    for (const star of BRIGHT_STARS) {
      const con = constellationMap.get(star.constellation);
      const hay = [
        star.id,
        star.nameKo || '',
        star.nameEn || '',
        star.bayer ? `${star.bayer} ${star.constellation}` : '',
        star.constellation,
        con?.nameKo || '',
        con?.nameEn || '',
      ]
        .join(' ')
        .toLowerCase();
      if (hay.includes(uq)) {
        list.push({
          kind: 'star',
          badge: '항성',
          badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
          id: `s-${star.id}`,
          title: star.nameKo
            ? `${star.nameKo}${star.nameEn ? ` (${star.nameEn})` : ''}`
            : `${star.bayer || ''} ${star.constellation}`,
          sub: `${star.bayer ? `${star.bayer} ` : ''}${star.constellation} · ${star.mag.toFixed(1)}m · ${formatRaHours(
            star.raHours,
            true
          )}`,
          star,
        });
      }
    }

    for (const dso of DSO_CATALOG) {
      const con = constellationMap.get(dso.constellation);
      const hay = [
        dso.id,
        dso.messierId || '',
        dso.caldwellId || '',
        dso.catalogAlt || '',
        dso.nameKo,
        dso.nameEn,
        dso.constellation,
        con?.nameKo || '',
        con?.nameEn || '',
      ]
        .join(' ')
        .toLowerCase();
      if (hay.includes(uq)) {
        const isM = Boolean(dso.messierId);
        const isC = Boolean(dso.caldwellId);
        list.push({
          kind: 'dso',
          badge: isM ? dso.messierId! : isC ? dso.caldwellId! : dso.id,
          badgeClass: isM
            ? 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60'
            : isC
            ? 'bg-amber-950/70 text-amber-300 border-amber-700/60'
            : 'bg-purple-950/70 text-purple-300 border-purple-700/60',
          id: `d-${dso.id}`,
          title: dso.nameKo,
          sub: `${dso.catalogAlt || dso.id} · ${dso.constellation} · ${dso.mag.toFixed(1)}m · ${formatRaHours(
            dso.raHours,
            true
          )}`,
          dso,
        });
      }
    }

    for (const con of CONSTELLATION_DATA) {
      const hay = [con.constellation, con.nameKo, con.nameEn].join(' ').toLowerCase();
      if (hay.includes(uq)) {
        list.push({
          kind: 'constellation',
          badge: con.constellation,
          badgeClass: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/60',
          id: `c-${con.constellation}`,
          title: `${con.nameKo} (${con.nameEn})`,
          sub: `별자리 · RA ${formatRaHours(con.raCenterHours, true)} Dec ${formatDecDeg(
            con.decCenterDeg,
            true
          )}`,
          constellation: con,
        });
      }
    }

    return list.slice(0, 45);
  }, [uq, constellationMap, solarSystemBodies]);

  const filteredMessier = useMemo(() => {
    if (!q) return MESSIER_CATALOG;
    return MESSIER_CATALOG.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.nameKo.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
        d.constellation.toLowerCase().includes(q)
    );
  }, [q]);

  const filteredCaldwell = useMemo(() => {
    if (!q) return CALDWELL_CATALOG;
    return CALDWELL_CATALOG.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.nameKo.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
        d.constellation.toLowerCase().includes(q)
    );
  }, [q]);

  const filteredSolarBodies = useMemo(() => {
    if (!q) return solarSystemBodies;
    return solarSystemBodies.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.nameKo.toLowerCase().includes(q) ||
        b.nameEn.toLowerCase().includes(q) ||
        (b.parentNameKo && b.parentNameKo.toLowerCase().includes(q)) ||
        b.kind.toLowerCase().includes(q)
    );
  }, [q, solarSystemBodies]);

  const filteredConstellations = useMemo(() => {
    if (!q) return CONSTELLATION_DATA;
    return CONSTELLATION_DATA.filter(
      (c) =>
        c.constellation.toLowerCase().includes(q) ||
        c.nameKo.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q)
    );
  }, [q]);

  const jumpToDso = (dso: DSORecord) => {
    onSelectDso(dso);
    if (dso.messierId) setSelectedMessierId(dso.id);
    if (dso.caldwellId) setSelectedCaldwellId(dso.id);
    const nextFov = 18;
    const linked = computeLinkedLimitingMags(nextFov, config);
    const nextDsoMag = Math.max(linked.limitDsoMag, Number((dso.mag + 0.5).toFixed(1)));
    const extraFinalPatch: Partial<FChart3Config> =
      nextDsoMag > linked.limitDsoMag
        ? {
            limitDsoMag: nextDsoMag,
            magRefDsoFovDeg: nextFov,
            magRefDsoMag: nextDsoMag,
          }
        : {};
    startSkySlew({
      currentConfig: config,
      onChangeConfig,
      targetRaHours: dso.raHours,
      targetDecDeg: dso.decDeg,
      targetFovDeg: nextFov,
      extraInitialPatch: {
        showMessierObjects: dso.messierId ? true : config.showMessierObjects,
        showCaldwellObjects: dso.caldwellId ? true : config.showCaldwellObjects,
        showNebulaOutlines:
          !dso.messierId && !dso.caldwellId ? true : config.showNebulaOutlines,
        showConstellationLines: true,
      },
      extraFinalPatch,
    });
  };

  const jumpToStar = (star: StarRecord) => {
    onSelectStar?.(star);
    const nextFov = 14;
    const linked = computeLinkedLimitingMags(nextFov, config);
    const nextStarMag = Math.max(linked.limitStarMag, Number((star.mag + 0.5).toFixed(1)));
    const extraFinalPatch: Partial<FChart3Config> =
      nextStarMag > linked.limitStarMag
        ? {
            limitStarMag: nextStarMag,
            magRefStarFovDeg: nextFov,
            magRefStarMag: nextStarMag,
          }
        : {};
    startSkySlew({
      currentConfig: config,
      onChangeConfig,
      targetRaHours: star.raHours,
      targetDecDeg: star.decDeg,
      targetFovDeg: nextFov,
      extraInitialPatch: {
        showConstellationLines: true,
      },
      extraFinalPatch,
    });
  };

  const jumpToSolarBody = (body: SolarSystemBodyRecord) => {
    setSelectedSolarId(body.id);
    onSelectSolarBody?.(body);
    const nextFov = getRecommendedSolarFov(body);
    startSkySlew({
      currentConfig: config,
      onChangeConfig,
      targetRaHours: body.raHours,
      targetDecDeg: body.decDeg,
      targetFovDeg: nextFov,
      extraInitialPatch: {
        showSolarSystem: true,
        showSolarSystemLabels: true,
        showPlanetDetails: true,
      },
    });
  };

  const handleSelectSidebarUnifiedItem = (item: SidebarUnifiedItem) => {
    if (item.kind === 'dso') {
      jumpToDso(item.dso);
    } else if (item.kind === 'star') {
      jumpToStar(item.star);
    } else if (item.kind === 'solar') {
      jumpToSolarBody(item.solar);
    } else {
      const con = item.constellation;
      setSelectedConstellationCode(con.constellation);
      startSkySlew({
        currentConfig: config,
        onChangeConfig,
        targetRaHours: con.raCenterHours,
        targetDecDeg: con.decCenterDeg,
        targetFovDeg: 36,
        extraInitialPatch: {
          showConstellationLines: true,
        },
      });
    }
  };

  const handleCoordinateModeChange = (mode: 'equatorial' | 'horizontal') => {
    if (mode === config.coordinateSystem) return;
    if (mode === 'horizontal') {
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

  return (
    <aside className="w-full h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 overflow-hidden">
      {/* Top Tab Bar: 설정 | 검색창 (설정 옆에 검색창 탭 배치) */}
      <div className="px-2.5 pt-2 pb-1.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setSidebarMode('settings')}
            className={`py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              sidebarMode === 'settings'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>설정</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarMode('search')}
            className={`py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              sidebarMode === 'search'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>검색창</span>
          </button>
        </div>
      </div>

      {sidebarMode === 'settings' ? (
        /* =====================================================================
           TAB 1: 설정 (메시에·콜드웰 천체 목록 제거, 한 화면에 깔끔하게 표시)
           ===================================================================== */
        <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col justify-between gap-2.5">
          <div className="space-y-3">
            {/* Section 1: Projection & Coordinate System */}
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between">
                <span>투영 · 좌표</span>
                <span className="font-mono text-[10px] text-slate-400">D3-GEO</span>
              </div>

              {/* Projection Mode Selector */}
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'stereographic', label: '입체(Stereo)' },
                    { id: 'orthographic', label: '직교(Ortho)' },
                    { id: 'equidistant', label: '등거리(Equi)' },
                  ] as Array<{ id: ProjectionMode; label: string }>
                ).map((proj) => (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({ ...prev, projection: proj.id }))
                    }
                    className={`py-1 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      config.projection === proj.id
                        ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {proj.label}
                  </button>
                ))}
              </div>

              {/* Coordinate System Selector: Equatorial vs Horizontal */}
              <div className="mt-1.5 grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleCoordinateModeChange('equatorial')}
                  className={`py-1 px-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    !isHorizontal
                      ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  적도좌표 (RA/Dec)
                </button>
                <button
                  type="button"
                  onClick={() => handleCoordinateModeChange('horizontal')}
                  className={`py-1 px-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    isHorizontal
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  지평좌표 (Az/Alt)
                </button>
              </div>

              {/* Quick Observer Location & Date/Time Banner when in Horizontal Mode */}
              {isHorizontal && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{config.observerLocationName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={onOpenSettingsTab}
                      className="text-emerald-700 dark:text-emerald-400 underline font-medium cursor-pointer"
                    >
                      날짜·위치 설정
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      위도 {config.observerLatDeg.toFixed(2)}° / 경도 {config.observerLonDeg.toFixed(2)}°
                    </span>
                    <span>{config.observationDateTime.replace('T', ' ')}</span>
                  </div>
                  <label className="flex items-center justify-between text-xs text-slate-800 dark:text-slate-200 pt-1 border-t border-emerald-200/70 dark:border-emerald-800/50 cursor-pointer">
                    <span className="flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-medium">지평선</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={config.showHorizonGround}
                      onChange={(e) =>
                        onChangeConfig((p) => ({
                          ...p,
                          showHorizonGround: e.target.checked,
                        }))
                      }
                      className="rounded accent-emerald-600 cursor-pointer"
                    />
                  </label>
                  <div className="pt-1 space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                      <span>지평선 위치</span>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((p) => ({ ...p, horizonAltDeg: 0 }))
                        }
                        className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        title="현재 위치(0°)로 되돌리기"
                      >
                        {(config.horizonAltDeg ?? 0) === 0
                          ? '0° (현재)'
                          : `${(config.horizonAltDeg ?? 0).toFixed(0)}°`}
                      </button>
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
                      title="지평선을 화면 아래쪽으로 내려 성도 위쪽 하늘의 별을 더 많이 볼 수 있게 합니다"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      <span>-85°</span>
                      <span>-45°</span>
                      <span>0° (현재)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: FOV & Limiting Magnitude Sliders */}
            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div
                className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100"
                title="현재 화각과 한계등급을 기준점으로 항성(5·log₁₀)과 DSO(2.5·log₁₀)를 D3 scaleLog로 연동"
              >
                <span>화각 및 한계등급</span>
                <span className="font-mono text-[9.5px] font-normal text-cyan-600 dark:text-cyan-400">
                  Pogson · D3 log
                </span>
              </div>

              {/* Logarithmic FOV Slider (0.02° ~ 135°) */}
              <div>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    화각(FOV)
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {config.fovDeg < 0.2
                      ? config.fovDeg.toFixed(3)
                      : config.fovDeg < 2
                      ? config.fovDeg.toFixed(2)
                      : config.fovDeg.toFixed(1)}
                    °
                    {config.fovDeg < 2 && (
                      <span className="text-[10px] text-cyan-500 ml-1">
                        ({(config.fovDeg * 60).toFixed(1)}′)
                      </span>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={1}
                  value={fovToSliderStep(config.fovDeg)}
                  onChange={(e) => {
                    const nextFov = sliderStepToFov(Number(e.target.value));
                    onChangeConfig((prev) => ({
                      ...prev,
                      fovDeg: nextFov,
                      ...computeLinkedLimitingMags(nextFov, prev),
                    }));
                  }}
                  className="w-full accent-cyan-600"
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-400">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((p) => ({
                        ...p,
                        fovDeg: 0.02,
                        ...computeLinkedLimitingMags(0.02, p),
                      }))
                    }
                    className="hover:text-cyan-500 cursor-pointer font-semibold"
                  >
                    0.02° 극대
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((p) => ({
                        ...p,
                        fovDeg: 0.3,
                        ...computeLinkedLimitingMags(0.3, p),
                      }))
                    }
                    className="hover:text-cyan-500 cursor-pointer font-semibold"
                  >
                    0.3° 행성
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((p) => ({
                        ...p,
                        fovDeg: 10,
                        ...computeLinkedLimitingMags(10, p),
                      }))
                    }
                    className="hover:text-cyan-500 cursor-pointer"
                  >
                    10° 정밀
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((p) => ({
                        ...p,
                        fovDeg: 25,
                        ...computeLinkedLimitingMags(25, p),
                      }))
                    }
                    className="hover:text-cyan-500 cursor-pointer"
                  >
                    25° 표준
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((p) => ({
                        ...p,
                        fovDeg: 90,
                        ...computeLinkedLimitingMags(90, p),
                      }))
                    }
                    className="hover:text-cyan-500 cursor-pointer"
                  >
                    90° 광시야
                  </button>
                </div>
              </div>

              {/* Star Limiting Magnitude Slider (up to 14.0) - re-anchors Star reference at current FOV */}
              <div>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    별 등급(Star)
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                    ≤ {config.limitStarMag.toFixed(1)} 등급
                  </span>
                </div>
                <input
                  type="range"
                  min={4.0}
                  max={14.0}
                  step={0.1}
                  value={config.limitStarMag}
                  onChange={(e) => {
                    const nextStarMag = Number(e.target.value);
                    onChangeConfig((prev) => ({
                      ...prev,
                      limitStarMag: nextStarMag,
                      magRefStarFovDeg: prev.fovDeg,
                      magRefStarMag: nextStarMag,
                    }));
                  }}
                  className="w-full accent-cyan-600"
                />
              </div>

              {/* DSO Limiting Magnitude Slider (up to 16.0) - re-anchors DSO reference at current FOV */}
              <div>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    성운·성단(DSO)
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    ≤ {config.limitDsoMag.toFixed(1)} 등급
                  </span>
                </div>
                <input
                  type="range"
                  min={5.0}
                  max={16.0}
                  step={0.1}
                  value={config.limitDsoMag}
                  onChange={(e) => {
                    const nextDsoMag = Number(e.target.value);
                    onChangeConfig((prev) => ({
                      ...prev,
                      limitDsoMag: nextDsoMag,
                      magRefDsoFovDeg: prev.fovDeg,
                      magRefDsoMag: nextDsoMag,
                    }));
                  }}
                  className="w-full accent-cyan-600"
                />
              </div>
            </div>

            {/* Section 3: Quick Layer Checkboxes (No Object List Here) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  빠른 레이어 표시 설정
                </span>
                <button
                  type="button"
                  onClick={onOpenSettingsTab}
                  className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                  <span>상세 설정</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>메시에 ({MESSIER_CATALOG.length})</span>
                  <input
                    type="checkbox"
                    checked={config.showMessierObjects}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showMessierObjects: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>콜드웰 ({CALDWELL_CATALOG.length})</span>
                  <input
                    type="checkbox"
                    checked={config.showCaldwellObjects}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showCaldwellObjects: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>별자리선 ({CONSTELLATION_DATA.length})</span>
                  <input
                    type="checkbox"
                    checked={config.showConstellationLines}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showConstellationLines: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>별자리 경계</span>
                  <input
                    type="checkbox"
                    checked={config.showConstellationBoundaries}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showConstellationBoundaries: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>은하수 배경</span>
                  <input
                    type="checkbox"
                    checked={config.showMilkyWayContours}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showMilkyWayContours: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>태양계 천체</span>
                  <input
                    type="checkbox"
                    checked={config.showSolarSystem}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showSolarSystem: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>행성 위상·표면</span>
                  <input
                    type="checkbox"
                    checked={config.showPlanetDetails ?? true}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showPlanetDetails: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                  <span>좌표 격자</span>
                  <input
                    type="checkbox"
                    checked={config.showEquatorialGrid}
                    onChange={(e) =>
                      onChangeConfig((p) => ({
                        ...p,
                        showEquatorialGrid: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                </label>

                <div className="col-span-2 pt-1.5 mt-0.5 border-t border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                  <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      <span>중앙 십자선 표시</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={config.showCenterCrosshair}
                      onChange={(e) =>
                        onChangeConfig((p) => ({
                          ...p,
                          showCenterCrosshair: e.target.checked,
                        }))
                      }
                      className="rounded accent-cyan-600"
                    />
                  </label>
                  <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer">
                    <span>성도 오른쪽 위 커서 위치 표시</span>
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
            </div>
          </div>

          {/* Bottom Action: Open Multi-Page fchart3-atlas Generator */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onOpenAtlasModal}
              className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-cyan-600 hover:opacity-95 text-white flex items-center justify-center gap-2 transition-opacity cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>다중 페이지 성도집 분할 · PDF 생성 ({sheetsCount}매)</span>
            </button>
          </div>
        </div>
      ) : (
        /* =====================================================================
           TAB 2: 검색창 (전체 천체 종합 검색창 + 메시에 110 · 콜드웰 109 · 88 별자리 대상 검색)
           ===================================================================== */
        <div className="flex-1 min-h-0 p-3.5 flex flex-col gap-2.5 overflow-hidden">
          {/* Unified All-Sky Object Search Bar (전체 천체 대상 종합 검색창) */}
          <div className="p-2.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-cyan-500/30 space-y-2 shrink-0">
            <label className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-500" />
                <span>전체 천체 대상 종합 검색창</span>
              </span>
              <span className="text-[10px] font-mono font-normal text-slate-400">
                행성·위성·소행성·M·C·항성
              </span>
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-cyan-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={unifiedSearchQuery}
                onChange={(e) => setUnifiedSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && unifiedResults.length > 0) {
                    handleSelectSidebarUnifiedItem(unifiedResults[0]);
                  }
                }}
                placeholder="행성, 위성, 소행성, M42, 북극성..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded border border-cyan-500/40 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              {unifiedSearchQuery && (
                <button
                  type="button"
                  onClick={() => setUnifiedSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  title="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {uq && (
              <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                {unifiedResults.length === 0 ? (
                  <div className="py-2 text-center text-[11px] text-slate-400">
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  unifiedResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSidebarUnifiedItem(item)}
                      className="w-full text-left px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-cyan-500 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded border shrink-0 ${item.badgeClass}`}
                          >
                            {item.badge}
                          </span>
                          <span className="truncate">{item.title}</span>
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {item.sub}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Segmented Switcher: Messier | Caldwell | Solar System | Constellations */}
          <div className="grid grid-cols-4 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setFinderTab('messier')}
              className={`py-1.5 px-0.5 text-[10.5px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'messier'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              메시에
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('caldwell')}
              className={`py-1.5 px-0.5 text-[10.5px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'caldwell'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              콜드웰
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('solar')}
              className={`py-1.5 px-0.5 text-[10.5px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'solar'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              태양계
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('constellations')}
              className={`py-1.5 px-0.5 text-[10.5px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'constellations'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              별자리
            </button>
          </div>

          {/* Direct Dropdown Selector for Instant Selection of Any M1-M110 / C1-C109 / 88 Constellations */}
          {finderTab === 'messier' && (
            <div className="shrink-0">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                메시에 천체 전 목록 바로가기 (M1 ~ M110 전체 110개)
              </label>
              <select
                value={selectedMessierId}
                onChange={(e) => {
                  const found = MESSIER_CATALOG.find((d) => d.id === e.target.value);
                  if (found) jumpToDso(found);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
            <div className="shrink-0">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                콜드웰 천체 전 목록 바로가기 (C1 ~ C109 전체 109개)
              </label>
              <select
                value={selectedCaldwellId}
                onChange={(e) => {
                  const found = CALDWELL_CATALOG.find((d) => d.id === e.target.value);
                  if (found) jumpToDso(found);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
            <div className="shrink-0">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                태양계 천체 바로가기 (행성 · 위성 · 소행성 {solarSystemBodies.length}개)
              </label>
              <select
                value={selectedSolarId}
                onChange={(e) => {
                  const found = solarSystemBodies.find((b) => b.id === e.target.value);
                  if (found) jumpToSolarBody(found);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {solarSystemBodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameKo} ({b.nameEn}) · {b.mag.toFixed(1)}m
                  </option>
                ))}
              </select>
            </div>
          )}

          {finderTab === 'constellations' && (
            <div className="shrink-0">
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
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
                    startSkySlew({
                      currentConfig: config,
                      onChangeConfig,
                      targetRaHours: found.raCenterHours,
                      targetDecDeg: found.decCenterDeg,
                      targetFovDeg: 36,
                      extraInitialPatch: {
                        showConstellationLines: true,
                      },
                    });
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {CONSTELLATION_DATA.map((con) => (
                  <option key={con.constellation} value={con.constellation}>
                    {con.constellation} · {con.nameKo} ({con.nameEn})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
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
                  ? '행성(목성, 토성), 위성(이오, 타이탄), 소행성(베스타)...'
                  : '88개 별자리 이름 또는 약자(Ori, UMa...) 검색...'
              }
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Full-Height Scrollable List of All Items */}
          <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-0.5">
            {finderTab === 'messier' &&
              filteredMessier.map((dso) => (
                <button
                  key={dso.id}
                  type="button"
                  onClick={() => jumpToDso(dso)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedMessierId === dso.id
                      ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-1.5">
                        {dso.messierId}
                      </span>
                      {dso.nameKo}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-1">
                      {dso.mag.toFixed(1)}m
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
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
                  onClick={() => jumpToDso(dso)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedCaldwellId === dso.id
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      <span className="font-mono text-amber-500 dark:text-amber-400 mr-1.5">
                        {dso.caldwellId}
                      </span>
                      {dso.nameKo}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-1">
                      {dso.mag.toFixed(1)}m
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
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
                return (
                  <button
                    key={body.id}
                    type="button"
                    onClick={() => jumpToSolarBody(body)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                      selectedSolarId === body.id
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 mr-1.5">
                          [{badgeText}]
                        </span>
                        {body.nameKo} ({body.nameEn})
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-1">
                        {body.mag.toFixed(1)}m
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
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
                    startSkySlew({
                      currentConfig: config,
                      onChangeConfig,
                      targetRaHours: con.raCenterHours,
                      targetDecDeg: con.decCenterDeg,
                      targetFovDeg: 36,
                      extraInitialPatch: {
                        showConstellationLines: true,
                      },
                    });
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedConstellationCode === con.constellation
                      ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-1.5">
                        {con.constellation}
                      </span>
                      {con.nameKo} ({con.nameEn})
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {con.lines.length}선분
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    중심 RA {formatRaHours(con.raCenterHours, true)} · Dec{' '}
                    {formatDecDeg(con.decCenterDeg, true)}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
};
