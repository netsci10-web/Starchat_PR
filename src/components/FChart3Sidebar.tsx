import React, { useMemo, useState } from 'react';
import {
  FileDown,
  FlipHorizontal,
  FlipVertical,
  Search,
  Settings,
} from 'lucide-react';
import {
  CALDWELL_CATALOG,
  CONSTELLATION_DATA,
  MESSIER_CATALOG,
} from '../data/astronomyData';
import {
  ChartColorScheme,
  DSORecord,
  FChart3Config,
  ProjectionMode,
} from '../types/astronomy';
import { formatDecDeg, formatRaHours } from '../utils/atlasGenerator';

interface FChart3SidebarProps {
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  onOpenAtlasModal: () => void;
  onOpenSettingsTab: () => void;
  onSelectDso: (dso: DSORecord) => void;
  sheetsCount: number;
}

export const FChart3Sidebar: React.FC<FChart3SidebarProps> = ({
  config,
  onChangeConfig,
  onOpenAtlasModal,
  onOpenSettingsTab,
  onSelectDso,
  sheetsCount,
}) => {
  const [finderTab, setFinderTab] = useState<'messier' | 'caldwell' | 'constellations'>('messier');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessierId, setSelectedMessierId] = useState<string>('M42');
  const [selectedCaldwellId, setSelectedCaldwellId] = useState<string>('C20');
  const [selectedConstellationCode, setSelectedConstellationCode] = useState<string>('Ori');

  const q = searchQuery.trim().toLowerCase();

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
    onChangeConfig((prev) => ({
      ...prev,
      showMessierObjects: dso.messierId ? true : prev.showMessierObjects,
      showCaldwellObjects: dso.caldwellId ? true : prev.showCaldwellObjects,
      showConstellationLines: true,
      centerRaHours: dso.raHours,
      centerDecDeg: dso.decDeg,
      fovDeg: 18,
      limitStarMag: Math.max(prev.limitStarMag, 8.6),
      limitDsoMag: Math.max(prev.limitDsoMag, Number((dso.mag + 0.5).toFixed(1))),
    }));
  };

  return (
    <aside className="w-full lg:w-[370px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Section 1: Cartographic Theme & Projection */}
        <div>
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center justify-between">
            <span>성도 출력 테마 및 구면 투영법</span>
            <span className="font-mono text-[11px] text-slate-400">D3-GEO</span>
          </div>

          {/* 3-Mode Color Scheme Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'paper', label: '백색 출판' },
                { id: 'observatory', label: '다크 관측' },
                { id: 'nightvision', label: '적색 야간' },
              ] as Array<{ id: ChartColorScheme; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onChangeConfig((prev) => ({ ...prev, colorScheme: item.id }))
                }
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  config.colorScheme === item.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Projection Mode Selector */}
          <div className="mt-2.5 grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
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
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  config.projection === proj.id
                    ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {proj.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section 2: FOV & Limiting Magnitude Sliders */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>한계등급 (Limiting Mag) 및 화각 (FOV)</span>
            <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
              fchart3 Engine
            </span>
          </div>

          {/* FOV Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">화각 (Field of View)</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {config.fovDeg.toFixed(1)}°
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={135}
              step={0.5}
              value={config.fovDeg}
              onChange={(e) =>
                onChangeConfig((prev) => ({
                  ...prev,
                  fovDeg: Number(e.target.value),
                }))
              }
              className="w-full accent-cyan-600"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-0.5">
              <button
                type="button"
                onClick={() => onChangeConfig((p) => ({ ...p, fovDeg: 10 }))}
                className="hover:text-cyan-500 cursor-pointer"
              >
                10° 정밀
              </button>
              <button
                type="button"
                onClick={() => onChangeConfig((p) => ({ ...p, fovDeg: 25 }))}
                className="hover:text-cyan-500 cursor-pointer"
              >
                25° 표준
              </button>
              <button
                type="button"
                onClick={() => onChangeConfig((p) => ({ ...p, fovDeg: 45 }))}
                className="hover:text-cyan-500 cursor-pointer"
              >
                45° 쌍안경
              </button>
              <button
                type="button"
                onClick={() => onChangeConfig((p) => ({ ...p, fovDeg: 90 }))}
                className="hover:text-cyan-500 cursor-pointer"
              >
                90° 광시야
              </button>
            </div>
          </div>

          {/* Star Limiting Magnitude Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">항성 한계등급 (-limit-star)</span>
              <span className="font-mono font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                ≤ {config.limitStarMag.toFixed(1)} 등급
              </span>
            </div>
            <input
              type="range"
              min={4.0}
              max={11.5}
              step={0.1}
              value={config.limitStarMag}
              onChange={(e) =>
                onChangeConfig((prev) => ({
                  ...prev,
                  limitStarMag: Number(e.target.value),
                }))
              }
              className="w-full accent-cyan-600"
            />
          </div>

          {/* DSO Limiting Magnitude Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">성운·은하 한계등급 (-limit-dso)</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                ≤ {config.limitDsoMag.toFixed(1)} 등급
              </span>
            </div>
            <input
              type="range"
              min={5.0}
              max={13.5}
              step={0.5}
              value={config.limitDsoMag}
              onChange={(e) =>
                onChangeConfig((prev) => ({
                  ...prev,
                  limitDsoMag: Number(e.target.value),
                }))
              }
              className="w-full accent-cyan-600"
            />
          </div>

          {/* Center RA / Dec Steppers */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                중심 적경 RA (0~24h)
              </label>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={config.centerRaHours}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerRaHours: ((Number(e.target.value) % 24) + 24) % 24,
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                중심 적위 Dec (-90~+90°)
              </label>
              <input
                type="number"
                min={-90}
                max={90}
                step={2}
                value={config.centerDecDeg}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    centerDecDeg: Math.max(-89.5, Math.min(89.5, Number(e.target.value))),
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Reticle & Mirroring Quick Row */}
          <div className="pt-1 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                파인더 시야 링 (Reticle)
              </label>
              <select
                value={config.reticleMode}
                onChange={(e) =>
                  onChangeConfig((p) => ({
                    ...p,
                    reticleMode: e.target.value as FChart3Config['reticleMode'],
                  }))
                }
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="none">표시 안 함</option>
                <option value="telrad">Telrad (0.5°·2°·4°)</option>
                <option value="binoculars_7x50">7×50 쌍안경 (7.0°)</option>
                <option value="eyepiece_afov">망원경 아이피스</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                광학계 상 반전 (Mirror)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig((p) => ({
                      ...p,
                      mirrorHorizontal: !p.mirrorHorizontal,
                    }))
                  }
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    config.mirrorHorizontal
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                  title="천정미러용 좌우 반전"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>좌우</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig((p) => ({
                      ...p,
                      mirrorVertical: !p.mirrorVertical,
                    }))
                  }
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    config.mirrorVertical
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                  title="직초점/뉴턴식 상하 반전"
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>상하</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Complete Messier (M1-M110) & Caldwell (C1-C109) & 88 Constellations Explorer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              전체 메시에(110) · 콜드웰(109) · 별자리(88) 선택
            </span>
            <button
              type="button"
              onClick={onOpenSettingsTab}
              className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Settings className="w-3 h-3" />
              <span>레이어 설정</span>
            </button>
          </div>

          {/* Quick Checkboxes for Messier, Caldwell & Constellation Lines visibility */}
          <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
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
          </div>

          {/* Segmented Switcher: Messier (110) | Caldwell (109) | Constellations (88) */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setFinderTab('messier')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'messier'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              메시에 (110)
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('caldwell')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'caldwell'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              콜드웰 (109)
            </button>
            <button
              type="button"
              onClick={() => setFinderTab('constellations')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finderTab === 'constellations'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              88 별자리
            </button>
          </div>

          {/* Direct Dropdown Selector for Instant Selection of Any M1-M110 / C1-C109 / 88 Constellations */}
          {finderTab === 'messier' && (
            <div>
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
            <div>
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

          {finderTab === 'constellations' && (
            <div>
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
                    onChangeConfig((prev) => ({
                      ...prev,
                      showConstellationLines: true,
                      centerRaHours: found.raCenterHours,
                      centerDecDeg: found.decCenterDeg,
                      fovDeg: 36,
                    }));
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
          <div className="relative">
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
                  : '88개 별자리 이름 또는 약자(Ori, UMa...) 검색...'
              }
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Scrollable List of All Items */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
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

            {finderTab === 'constellations' &&
              filteredConstellations.map((con) => (
                <button
                  key={con.constellation}
                  type="button"
                  onClick={() => {
                    setSelectedConstellationCode(con.constellation);
                    onChangeConfig((prev) => ({
                      ...prev,
                      showConstellationLines: true,
                      centerRaHours: con.raCenterHours,
                      centerDecDeg: con.decCenterDeg,
                      fovDeg: 36,
                    }));
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

        {/* Bottom Action: Open Multi-Page fchart3-atlas Generator */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onOpenAtlasModal}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-cyan-600 hover:opacity-95 text-white flex items-center justify-center gap-2 transition-opacity cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>다중 페이지 성도집 분할 · PDF 생성 ({sheetsCount}매)</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
