import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Compass,
  Copy,
  MapPin,
  Sliders,
  Terminal,
} from 'lucide-react';
import {
  CONSTELLATION_DATA,
  DSO_CATALOG,
} from '../data/astronomyData';
import {
  AtlasGeneratorOptions,
  DSORecord,
  FChart3Config,
} from '../types/astronomy';
import {
  buildFchart3CliCommand,
  computeLstDeg,
  equatorialToHorizontal,
  formatAltDeg,
  formatAzDeg,
  formatDecDeg,
  formatRaHours,
  horizontalToEquatorial,
  OBSERVER_LOCATION_PRESETS,
} from '../utils/atlasGenerator';

interface CatalogAndSpecsViewProps {
  mode: 'catalog' | 'specs' | 'settings';
  config: FChart3Config;
  onChangeConfig: (updater: (prev: FChart3Config) => FChart3Config) => void;
  atlasOptions: AtlasGeneratorOptions;
  onJumpToTarget: (raHours: number, decDeg: number, fovDeg: number, dso?: DSORecord) => void;
}

export const CatalogAndSpecsView: React.FC<CatalogAndSpecsViewProps> = ({
  mode,
  config,
  onChangeConfig,
  atlasOptions,
  onJumpToTarget,
}) => {
  const [filterType, setFilterType] = useState<
    'all' | 'messier' | 'caldwell' | 'nebula' | 'galaxy' | 'cluster'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const cliCommands = buildFchart3CliCommand(config, atlasOptions);
  const lstDeg = useMemo(
    () => computeLstDeg(config.observationDateTime, config.observerLonDeg),
    [config.observationDateTime, config.observerLonDeg]
  );

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

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

  const messierObjects = DSO_CATALOG.filter(
    (d) =>
      Boolean(d.messierId) &&
      (!q ||
        d.id.toLowerCase().includes(q) ||
        d.nameKo.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
        d.constellation.toLowerCase().includes(q))
  );
  const caldwellObjects = DSO_CATALOG.filter(
    (d) =>
      Boolean(d.caldwellId) &&
      (!q ||
        d.id.toLowerCase().includes(q) ||
        d.nameKo.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        (d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) ||
        d.constellation.toLowerCase().includes(q))
  );

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
          <span>중심 십자선 표시 (Center Crosshair)</span>
          <input
            type="checkbox"
            checked={config.showCenterCrosshair}
            onChange={(e) =>
              onChangeConfig((p) => ({
                ...p,
                showCenterCrosshair: e.target.checked,
              }))
            }
            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
          />
        </label>

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
          <span>지평좌표계 지상 및 지평선 표시 (Horizon & Ground)</span>
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

      {/* Ground / Horizon Toggle */}
      <label className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
        <div>
          <div className="font-semibold text-emerald-900 dark:text-emerald-300">
            지평좌표계 전환 시 지상(Ground) 및 방위점(N·E·S·W) 표시
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            고도 0° 이하의 지평선 아래 하늘을 지상 마스크로 가리고 8방위 나침반을 표시합니다
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

      {/* Observation Date & Time */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>관측 날짜 및 시각 (Observation Date & Time)</span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleStepHours(-1)}
              className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              -1시간
            </button>
            <button
              type="button"
              onClick={handleSetNowDateTime}
              className="px-2 py-0.5 text-[11px] font-medium rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 cursor-pointer"
            >
              현재 시각
            </button>
            <button
              type="button"
              onClick={() => handleStepHours(1)}
              className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              +1시간
            </button>
          </div>
        </div>
        <input
          type="datetime-local"
          value={config.observationDateTime}
          onChange={(e) => applyObservationDateTime(e.target.value)}
          className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        />
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

  if (mode === 'catalog') {
    const filteredDsos = DSO_CATALOG.filter((d) => {
      if (
        q &&
        !d.id.toLowerCase().includes(q) &&
        !d.nameKo.toLowerCase().includes(q) &&
        !d.nameEn.toLowerCase().includes(q) &&
        !(d.catalogAlt && d.catalogAlt.toLowerCase().includes(q)) &&
        !d.constellation.toLowerCase().includes(q)
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                MESSIER (M1–M110) · CALDWELL (C1–C109) · 88 IAU CONSTELLATIONS
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                메시에 110선 · 콜드웰 109선 및 88개 별자리 전체 카탈로그
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                메시에 전 목록(M1~M110, 110개)과 콜드웰 전 목록(C1~C109, 109개), 그리고 IAU 공식 88개 별자리를 모두 검색·선택하여 성도에서 즉시 조준할 수 있습니다.
              </p>
            </div>

            {/* Functional Segmented Filter Bar including Messier and Caldwell */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              {(
                [
                  { id: 'all', label: `전체 (${DSO_CATALOG.length})` },
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

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="천체 번호(M1~M110, C1~C109), 한국어/영어 이름, NGC/IC 번호, 별자리 약자 검색..."
              className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 py-2 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                검색 초기화
              </button>
            )}
          </div>
        </div>

        {/* Deep-Sky Objects Grid */}
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

  if (mode === 'settings') {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
            FCHART3 VECTOR CARTOGRAPHY SETTINGS · COORDINATE SYSTEM · DATE & LOCATION
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            성도 벡터 레이어 · 중심 십자선 · 좌표계 전환(적도/지평) · 관측 날짜 및 위치 설정
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            중심 십자선, 은하수 등고선, 별자리 경계선, 성운 윤곽선 제어는 물론 적도좌표계(RA/Dec)와 지평좌표계(Az/Alt) 전환, 지평선 지상 표시, 관측 날짜·시간 및 관측지 위도/경도를 설정할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Columns: Vector Cartography Layer Control Card + Coordinate/Date/Location Card + Label Settings */}
          <div className="lg:col-span-5 space-y-5">
            {renderVectorLayersControlCard()}
            {renderCoordinateAndLocationCard()}

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
                <span>성도 하단 등급 스케일 범례 (Magnitude Legend) 표시</span>
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
                <span>성도 하단 각거리 축척 막대 (Angular Scale Bar) 표시</span>
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
            </div>
          </div>

          {/* Right 7 Columns: Side-by-Side Messier & Caldwell Quick View Tables */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Messier Objects Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                    MESSIER CATALOG
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    메시에 천체 목록 ({messierObjects.length}선)
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {config.showMessierObjects ? '표시 중' : '숨김'}
                </span>
              </div>

              <div className="mt-3 space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {messierObjects.map((dso) => (
                  <div
                    key={dso.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-1.5">
                          {dso.messierId}
                        </span>
                        {dso.nameKo}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {dso.catalogAlt} · {dso.mag.toFixed(1)}m · {formatRaHours(dso.raHours, true)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToTarget(dso.raHours, dso.decDeg, 16, dso)}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-slate-900 dark:bg-cyan-600 text-white hover:opacity-90 shrink-0 cursor-pointer"
                    >
                      조준
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Caldwell Objects Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                    CALDWELL CATALOG
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    콜드웰 천체 목록 ({caldwellObjects.length}선)
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {config.showCaldwellObjects ? '표시 중' : '숨김'}
                </span>
              </div>

              <div className="mt-3 space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {caldwellObjects.map((dso) => (
                  <div
                    key={dso.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        <span className="font-mono text-amber-600 dark:text-amber-400 mr-1.5">
                          {dso.caldwellId}
                        </span>
                        {dso.nameKo}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {dso.catalogAlt} · {dso.mag.toFixed(1)}m · {formatRaHours(dso.raHours, true)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToTarget(dso.raHours, dso.decDeg, 16, dso)}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-slate-900 dark:bg-amber-600 text-white hover:opacity-90 shrink-0 cursor-pointer"
                    >
                      조준
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Specs & CLI Reference View (also includes Vector Cartography Layer Control Card + Coordinate/Date/Location Card right alongside CLI commands)
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
          SKYBBER/FCHART3 & FCHART3-ATLAS CARTOGRAPHIC SPECIFICATION
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
          D3.js 구면 벡터 투영 아키텍처 · 레이어 설정 및 Python fchart3 CLI 스크립트
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          우측의 벡터 카토그래피 레이어 및 좌표계 설정을 변경하면 좌측의 <code className="font-mono text-xs">fchart3</code> / <code className="font-mono text-xs">fchart3-atlas</code> CLI 명령어와 대화형 벡터 성도에 즉시 반영됩니다.
        </p>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Single & Multi-Page CLI Commands */}
          <div className="lg:col-span-7 space-y-4">
            {/* Single Chart CLI Command */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                  <span>단일 벡터 성도 CLI 명령어 (fchart3)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(cliCommands.singleChartCmd, 'single')}
                  className="px-2.5 py-1 rounded text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'single' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>복사됨</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>복사</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-800 dark:text-cyan-300 overflow-x-auto leading-relaxed">
                {cliCommands.singleChartCmd}
              </pre>
            </div>

            {/* Multi-Page Atlas CLI Command */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                  <span>다중 페이지 성도집 CLI 명령어 (fchart3-atlas)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(cliCommands.atlasCmd, 'atlas')}
                  className="px-2.5 py-1 rounded text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'atlas' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>복사됨</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>복사</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-800 dark:text-cyan-300 overflow-x-auto leading-relaxed">
                {cliCommands.atlasCmd}
              </pre>
            </div>
          </div>

          {/* Right 5 Columns: Vector Cartography Layer Control Card + Coordinate/Location Card right next to CLI Specs */}
          <div className="lg:col-span-5 space-y-5">
            {renderVectorLayersControlCard()}
            {renderCoordinateAndLocationCard()}
          </div>
        </div>
      </div>

      {/* Cartographic Symbol & Layer Specification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
            01. MILKY WAY ISOPHOTES
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
            은하수 다중 등고선 (Galactic Isophotes)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            은하좌표계(Galactic Longitude l, Latitude b)에서 정의된 3단계 광도 등고선(Level 1 외곽 헤일로, Level 2 은하 중심 띠, Level 3 궁수·백조·방패·용골자리 고밀도 성운군)을 J2000 적도좌표 및 지평좌표로 실시간 변환하여 출력합니다.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
            02. EQUATORIAL & HORIZONTAL COORDINATES
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
            적도좌표계(RA/Dec) ↔ 지평좌표계(Az/Alt) 실시간 구면 변환
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            관측지 위도·경도와 관측 시각으로부터 지방항성시(LST)를 계산하여 모든 항성·별자리·메시에/콜드웰 천체를 방위각(Azimuth)과 고도(Altitude)로 변환하며, 지평선(Alt=0°)과 지상 마스크를 함께 렌더링합니다.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
            03. MESSIER & CALDWELL VECTOR CONTOURS
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
            메시에 110선 · 콜드웰 109선 및 88개 별자리 전체 수록
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            메시에(M1~M110)와 콜드웰(C1~C109) 전 목록 및 IAU 88개 별자리의 구면 세분화 보조선, 중심 십자선, 1.0° 초고배율 시야를 SVG 및 다중 페이지 PDF에 동일하게 렌더링합니다.
          </p>
        </div>
      </div>
    </div>
  );
};
