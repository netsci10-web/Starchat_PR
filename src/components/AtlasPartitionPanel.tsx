import React, { useMemo, useState } from 'react';
import {
  Check,
  FileDown,
  Lock,
  Sliders,
  Unlock,
} from 'lucide-react';
import {
  BRIGHT_STARS,
  CONSTELLATION_DATA,
  MESSIER_CATALOG,
  MILKY_WAY_CONTOURS,
} from '../data/astronomyData';
import {
  AtlasGeneratorOptions,
  AtlasPresetId,
  AtlasSheet,
} from '../types/astronomy';
import {
  ATLAS_PRESETS,
  bvToStarColor,
  formatDecDeg,
  formatRaHours,
  generateAtlasSheets,
} from '../utils/atlasGenerator';

interface AtlasPartitionPanelProps {
  options: AtlasGeneratorOptions;
  onChangeOptions: (updater: (prev: AtlasGeneratorOptions) => AtlasGeneratorOptions) => void;
  sheets: AtlasSheet[];
  activeSheet: AtlasSheet | null;
  onSelectSheet: (sheet: AtlasSheet, jumpToChart?: boolean) => void;
  onGeneratePdf: () => void;
  pdfProgress: { current: number; total: number; stage: string } | null;
}

export const AtlasPartitionPanel: React.FC<AtlasPartitionPanelProps> = ({
  options,
  onChangeOptions,
  sheets,
  activeSheet,
  onSelectSheet,
  onGeneratePdf,
  pdfProgress,
}) => {
  const [hoveredSheetNumber, setHoveredSheetNumber] = useState<number | null>(null);
  const [boxOpacityPercent, setBoxOpacityPercent] = useState<number>(30);
  const isCustomPreset = options.presetId === 'custom_grid';

  // Dynamic sheet count calculation for each preset to guarantee 100% match with top description
  const presetSheetCounts = useMemo(() => {
    const counts: Record<AtlasPresetId, number> = {} as any;
    for (const pid of Object.keys(ATLAS_PRESETS) as AtlasPresetId[]) {
      const p = ATLAS_PRESETS[pid];
      if (pid === options.presetId) {
        counts[pid] = sheets.length;
      } else {
        counts[pid] = generateAtlasSheets({
          ...options,
          presetId: pid,
          decMinDeg: p.decMinDeg,
          decMaxDeg: p.decMaxDeg,
          fovPerSheetDeg: p.fovPerSheetDeg,
          overlapPercent: p.overlapPercent,
          limitStarMag: p.limitStarMag,
          limitDsoMag: p.limitDsoMag,
        }).length;
      }
    }
    return counts;
  }, [options, sheets.length]);

  const handleSelectPreset = (presetId: AtlasPresetId) => {
    const p = ATLAS_PRESETS[presetId];
    onChangeOptions((prev) => ({
      ...prev,
      presetId,
      atlasTitle: p.nameEn,
      decMinDeg: p.decMinDeg,
      decMaxDeg: p.decMaxDeg,
      fovPerSheetDeg: p.fovPerSheetDeg,
      overlapPercent: p.overlapPercent,
      limitStarMag: p.limitStarMag,
      limitDsoMag: p.limitDsoMag,
    }));
  };

  const totalStarsAcrossAtlas = sheets.reduce((acc, s) => acc + s.starCountEstimate, 0);
  const totalDsosAcrossAtlas = sheets.reduce((acc, s) => acc + s.dsoCount, 0);

  // Coordinate helper for the All-Sky Index Map SVG (RA: 24h on left -> 0h on right, Dec: +90° top -> -90° bottom)
  // Map frame: x in [40, 690] (width 650), y in [20, 330] (height 310)
  const raDegToX = (raDeg: number): number => {
    const normRaHours = (((raDeg / 15) % 24) + 24) % 24;
    return 40 + ((24 - normRaHours) / 24) * 650;
  };
  const decDegToY = (decDeg: number): number => {
    const clampedDec = Math.max(-90, Math.min(90, decDeg));
    return 20 + ((90 - clampedDec) / 180) * 310;
  };

  // Precompute Ecliptic curve and Milky Way contour polylines for the All-Sky Star Chart background
  const eclipticPointsStr = useMemo(() => {
    const pts: string[] = [];
    const epsRad = (23.4393 * Math.PI) / 180;
    for (let raH = 24; raH >= 0; raH -= 0.25) {
      const raRad = (raH * 15 * Math.PI) / 180;
      const decRad = Math.atan(Math.sin(raRad) * Math.tan(epsRad));
      const decDeg = (decRad * 180) / Math.PI;
      const x = 40 + ((24 - raH) / 24) * 650;
      const y = decDegToY(decDeg);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, []);

  const milkyWayPaths = useMemo(() => {
    const paths: Array<{ d: string; level: number }> = [];
    MILKY_WAY_CONTOURS.forEach((mw) => {
      mw.polygons.forEach((poly) => {
        let currentSegment: Array<[number, number]> = [];
        for (let i = 0; i < poly.length; i++) {
          const [ra, dec] = poly[i];
          const x = raDegToX(ra);
          const y = decDegToY(dec);
          if (currentSegment.length > 0) {
            const prevX = currentSegment[currentSegment.length - 1][0];
            if (Math.abs(x - prevX) > 160) {
              if (currentSegment.length >= 2) {
                paths.push({
                  d:
                    'M ' +
                    currentSegment.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L '),
                  level: mw.level,
                });
              }
              currentSegment = [];
            }
          }
          currentSegment.push([x, y]);
        }
        if (currentSegment.length >= 2) {
          paths.push({
            d:
              'M ' +
              currentSegment.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L '),
            level: mw.level,
          });
        }
      });
    });
    return paths;
  }, []);

  const hoveredOrActiveSheet = useMemo(() => {
    if (hoveredSheetNumber !== null) {
      return (
        sheets.find((s) => s.sheetNumber === hoveredSheetNumber) ||
        activeSheet ||
        sheets[0] ||
        null
      );
    }
    return activeSheet || sheets[0] || null;
  }, [hoveredSheetNumber, sheets, activeSheet]);

  return (
    <div className="space-y-6">
      {/* Header & Primary PDF Export Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
              FCHART3-ATLAS MULTI-PAGE VECTOR ENGINE · J2000.0
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              다중 페이지 맞춤형 벡터 성도집 (fchart3-atlas) 분할 및 PDF 생성
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              원하는 성도집 프리셋을 선택하거나 사용자 정의 분할 성도집에서 한계등급·화각을 설정하면, 전천 성도 위의 분리칸 색인도와 개별 분할 성도가 포함된 벡터 PDF 성도집을 생성합니다.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={Boolean(pdfProgress)}
              onClick={onGeneratePdf}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {pdfProgress
                  ? `벡터 성도집 생성 중 (${pdfProgress.current}/${pdfProgress.total})...`
                  : `전권 벡터 PDF 출력 (총 ${
                      sheets.length +
                      (options.includeCoverPage ? 1 : 0) +
                      (options.includeIndexMapPage ? 1 : 0)
                    }페이지)`}
              </span>
            </button>
          </div>
        </div>

        {/* Live PDF Generation Progress Bar */}
        {pdfProgress && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300 mb-1.5">
              <span>{pdfProgress.stage}</span>
              <span>
                {Math.round((pdfProgress.current / Math.max(1, pdfProgress.total)) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-150"
                style={{
                  width: `${Math.min(
                    100,
                    (pdfProgress.current / Math.max(1, pdfProgress.total)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Quantitative Atlas Telemetry Summary */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">분할 성도 매수</div>
            <div className="mt-0.5 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {sheets.length}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">CHARTS</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">페이지당 화각 / 중첩률</div>
            <div className="mt-0.5 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {options.fovPerSheetDeg.toFixed(0)}°
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">
                FOV · {options.overlapPercent}% OVERLAP
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">항성 / DSO 한계등급</div>
            <div className="mt-0.5 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
                {options.limitStarMag.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">
                MAG (DSO {options.limitDsoMag.toFixed(1)})
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">수록 항성 및 DSO 수(누적)</div>
            <div className="mt-0.5 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {totalStarsAcrossAtlas.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">
                STARS · {totalDsosAcrossAtlas} DSO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Split: Left Preset & Custom Parameters (50% compact size) | Right All-Sky Star Chart Index Map + Partitioned Sheets List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (3-4 cols): Presets & Partition Parameters (50% Compact Size, Locked unless 'custom_grid' is selected) */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>성도집 분할 프리셋 및 세부 파라미터</span>
            </h3>

            {/* Preset Selector Buttons (Compact 50% Size) */}
            <div className="mt-2 space-y-1">
              {(Object.keys(ATLAS_PRESETS) as AtlasPresetId[]).map((pid) => {
                const p = ATLAS_PRESETS[pid];
                const isSelected = options.presetId === pid;
                const count = isSelected ? sheets.length : (presetSheetCounts[pid] || 0);
                const baseName = p.nameKo.replace(/\s*\(\d+매\)/, '');
                const displayName = `${baseName} (${count}매)`;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleSelectPreset(pid)}
                    className={`w-full text-left py-1.5 px-2.5 rounded-md border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                        {displayName}
                      </span>
                      {isSelected && (
                        <Check className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {p.subtitleKo}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fine-Grained Partition Parameters Header + Lock Notice (Compact 50% Size) */}
            <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  {isCustomPreset ? (
                    <Unlock className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  ) : (
                    <Lock className="w-3 h-3 text-amber-500" />
                  )}
                  <span>세부 파라미터 설정</span>
                </span>
                <span
                  className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${
                    isCustomPreset
                      ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isCustomPreset
                    ? '편집 가능'
                    : '사용자 정의 외 변경 불가'}
                </span>
              </div>

              {/* Disabled unless 'custom_grid' (사용자 정의 분할 성도집) is selected */}
              <fieldset
                disabled={!isCustomPreset}
                className={`space-y-2 transition-opacity ${
                  !isCustomPreset ? 'opacity-45 pointer-events-none select-none' : ''
                }`}
              >
                <div>
                  <div className="flex justify-between text-[10.5px] mb-0.5">
                    <span className="text-slate-600 dark:text-slate-400">페이지당 화각 (FOV)</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {options.fovPerSheetDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={16}
                    max={65}
                    step={2}
                    disabled={!isCustomPreset}
                    value={options.fovPerSheetDeg}
                    onChange={(e) => {
                      if (!isCustomPreset) return;
                      onChangeOptions((prev) => ({
                        ...prev,
                        fovPerSheetDeg: Number(e.target.value),
                      }));
                    }}
                    className="w-full h-1.5 accent-cyan-600 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10.5px] mb-0.5">
                    <span className="text-slate-600 dark:text-slate-400">
                      항성 한계등급 (최대 14.0)
                    </span>
                    <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                      {options.limitStarMag.toFixed(1)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5.0}
                    max={14.0}
                    step={0.2}
                    disabled={!isCustomPreset}
                    value={options.limitStarMag}
                    onChange={(e) => {
                      if (!isCustomPreset) return;
                      onChangeOptions((prev) => ({
                        ...prev,
                        limitStarMag: Number(e.target.value),
                      }));
                    }}
                    className="w-full h-1.5 accent-cyan-600 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10.5px] mb-0.5">
                    <span className="text-slate-600 dark:text-slate-400">
                      성운·은하 한계등급 (최대 14.0)
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {options.limitDsoMag.toFixed(1)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5.0}
                    max={14.0}
                    step={0.2}
                    disabled={!isCustomPreset}
                    value={options.limitDsoMag}
                    onChange={(e) => {
                      if (!isCustomPreset) return;
                      onChangeOptions((prev) => ({
                        ...prev,
                        limitDsoMag: Number(e.target.value),
                      }));
                    }}
                    className="w-full h-1.5 accent-cyan-600 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                      최소 적위 (Dec Min)
                    </label>
                    <select
                      disabled={!isCustomPreset}
                      value={options.decMinDeg}
                      onChange={(e) => {
                        if (!isCustomPreset) return;
                        onChangeOptions((prev) => ({
                          ...prev,
                          decMinDeg: Number(e.target.value),
                        }));
                      }}
                      className="w-full px-2 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:cursor-not-allowed"
                    >
                      <option value={-90}>-90° (남천극)</option>
                      <option value={-45}>-45° (남천 중위도)</option>
                      <option value={-35}>-35° (한반도 남쪽)</option>
                      <option value={-20}>-20° (적도 남부)</option>
                      <option value={0}>0° (북반구)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                      인쇄 배색 테마
                    </label>
                    <select
                      disabled={!isCustomPreset}
                      value={options.colorScheme}
                      onChange={(e) => {
                        if (!isCustomPreset) return;
                        onChangeOptions((prev) => ({
                          ...prev,
                          colorScheme: e.target.value as AtlasGeneratorOptions['colorScheme'],
                        }));
                      }}
                      className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:cursor-not-allowed"
                    >
                      <option value="paper">백색 출판</option>
                      <option value="observatory">다크 관측</option>
                      <option value="nightvision">야간 적색</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <label className="flex items-center gap-1.5 text-[10.5px] text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isCustomPreset}
                      checked={options.includeCoverPage}
                      onChange={(e) => {
                        if (!isCustomPreset) return;
                        onChangeOptions((prev) => ({
                          ...prev,
                          includeCoverPage: e.target.checked,
                        }));
                      }}
                      className="rounded accent-cyan-600"
                    />
                    <span>표지·제원표</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[10.5px] text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isCustomPreset}
                      checked={options.includeIndexMapPage}
                      onChange={(e) => {
                        if (!isCustomPreset) return;
                        onChangeOptions((prev) => ({
                          ...prev,
                          includeIndexMapPage: e.target.checked,
                        }));
                      }}
                      className="rounded accent-cyan-600"
                    />
                    <span>전천 색인도</span>
                  </label>
                </div>
              </fieldset>
            </div>
          </div>
        </div>

        {/* Right Column (8-9 cols): All-Sky Star Chart with Partition Cells Overlay + Partitioned Sheets Directory Directly Below */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* Card 1: Interactive All-Sky Star Chart with Partition Cells Overlay */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    전천 성도 분할 색인도 (All-Sky Star Chart &amp; Partition Index Map)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    전천 성도(88 별자리·은하수·항성·메시에 천체) 위에 표시된 분리칸(#01 ~ #{sheets.length})을 클릭하면 해당 성도로 즉시 이동합니다.
                  </p>
                </div>
                {hoveredOrActiveSheet && (
                  <div className="text-xs font-mono px-2.5 py-1 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shrink-0 flex items-center gap-2">
                    <span>
                      Chart #{String(hoveredOrActiveSheet.sheetNumber).padStart(2, '0')} · {hoveredOrActiveSheet.titleKo} ({formatRaHours(hoveredOrActiveSheet.centerRaHours, true)} / {formatDecDeg(hoveredOrActiveSheet.centerDecDeg, true)})
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSheet(hoveredOrActiveSheet, true)}
                      className="px-2 py-0.5 rounded text-[10.5px] font-sans font-semibold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition-colors whitespace-nowrap ml-1"
                      title="대화형 성도 뷰어에서 보기"
                    >
                      성도 열기 →
                    </button>
                  </div>
                )}
              </div>

              {/* SVG All-Sky Star Chart + Partition Grid Overlay */}
              <div className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-[#050914]">
                <svg
                  data-chart-svg="true"
                  viewBox="0 0 720 360"
                  className="w-full h-auto block select-none"
                >
                  <defs>
                    <clipPath id="all-sky-index-clip">
                      <rect x="40" y="20" width="650" height="310" />
                    </clipPath>
                  </defs>

                  <rect x="0" y="0" width="720" height="360" fill="#050914" />
                  <rect x="40" y="20" width="650" height="310" fill="#081022" />

                  {/* ===========================================================
                      1. ALL-SKY STAR CHART LAYER (전천 성도 배경: 은하수 · 좌표격자 · 황도 · 88 별자리 · 항성 · 메시에 천체)
                     =========================================================== */}
                  <g clipPath="url(#all-sky-index-clip)">
                    {/* Milky Way Contours on All-Sky Chart */}
                    {milkyWayPaths.map((mw, idx) => (
                      <path
                        key={`idx-mw-${idx}`}
                        d={mw.d}
                        fill="none"
                        stroke={
                          mw.level === 3
                            ? 'rgba(56, 189, 248, 0.25)'
                            : mw.level === 2
                            ? 'rgba(56, 189, 248, 0.16)'
                            : 'rgba(148, 163, 184, 0.12)'
                        }
                        strokeWidth={mw.level === 3 ? '3.5' : mw.level === 2 ? '5.5' : '8'}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}

                    {/* Ecliptic Curve (황도선) */}
                    <polyline
                      points={eclipticPointsStr}
                      fill="none"
                      stroke="rgba(244, 63, 94, 0.55)"
                      strokeWidth="1.1"
                      strokeDasharray="4,3"
                    />

                    {/* All 88 Official IAU Constellation Stick Figures & Labels */}
                    {CONSTELLATION_DATA.map((con) => {
                      const cx = raDegToX(con.raCenterHours * 15);
                      const cy = decDegToY(con.decCenterDeg);
                      return (
                        <g key={`idx-con-${con.constellation}`}>
                          {con.lines.map(([p1, p2], sIdx) => {
                            const x1 = raDegToX(p1[0]);
                            const y1 = decDegToY(p1[1]);
                            const x2 = raDegToX(p2[0]);
                            const y2 = decDegToY(p2[1]);
                            // Skip segments wrapping across the 0h/24h border
                            if (Math.abs(x2 - x1) > 160) return null;
                            return (
                              <line
                                key={`idx-seg-${con.constellation}-${sIdx}`}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke="rgba(56, 189, 248, 0.70)"
                                strokeWidth="0.85"
                              />
                            );
                          })}
                          {cy > 28 && cy < 322 && (
                            <text
                              x={cx}
                              y={cy - 3}
                              textAnchor="middle"
                              fill="rgba(226, 232, 240, 0.90)"
                              fontSize="6.8"
                              fontWeight="600"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {con.constellation.toUpperCase()}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Messier Deep-Sky Objects on All-Sky Chart */}
                    {MESSIER_CATALOG.map((dso) => {
                      const x = raDegToX(dso.raDeg);
                      const y = decDegToY(dso.decDeg);
                      return (
                        <circle
                          key={`idx-dso-${dso.id}`}
                          cx={x}
                          cy={y}
                          r="1.6"
                          fill="#10B981"
                          stroke="#064E3B"
                          strokeWidth="0.4"
                          opacity="0.9"
                        />
                      );
                    })}

                    {/* Bright Stars on All-Sky Chart (up to mag 5.2 for rich stellar identification) */}
                    {BRIGHT_STARS.filter((st) => st.mag <= 5.2).map((st) => {
                      const x = raDegToX(st.raDeg);
                      const y = decDegToY(st.decDeg);
                      const r = Math.max(0.75, 3.0 - st.mag * 0.44);
                      const color = bvToStarColor(st.bv, 'observatory');
                      const isVeryBright = st.mag <= 1.8;
                      return (
                        <g key={`idx-star-${st.id}`}>
                          {isVeryBright && (
                            <circle
                              cx={x}
                              cy={y}
                              r={r * 1.8}
                              fill={color}
                              opacity="0.22"
                            />
                          )}
                          <circle
                            cx={x}
                            cy={y}
                            r={r}
                            fill={color}
                          />
                          {isVeryBright && (
                            <circle
                              cx={x}
                              cy={y}
                              r={Math.max(0.6, r * 0.4)}
                              fill="#FFFFFF"
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* ===========================================================
                      2. EQUATORIAL COORDINATE AXES & LABELS
                     =========================================================== */}
                  {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((h) => {
                    const x = 40 + ((24 - h) / 24) * 650;
                    return (
                      <g key={`idx-ra-${h}`}>
                        <line
                          x1={x}
                          y1={20}
                          x2={x}
                          y2={330}
                          stroke="rgba(51, 65, 85, 0.45)"
                          strokeWidth="0.7"
                        />
                        {h % 2 === 0 && (
                          <text
                            x={x}
                            y={346}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="9.5"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {h}h
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {[-90, -60, -30, 0, 30, 60, 90].map((d) => {
                    const y = decDegToY(d);
                    return (
                      <g key={`idx-dec-${d}`}>
                        <line
                          x1={40}
                          y1={y}
                          x2={690}
                          y2={y}
                          stroke={d === 0 ? 'rgba(148, 163, 184, 0.55)' : 'rgba(51, 65, 85, 0.45)'}
                          strokeWidth={d === 0 ? '1.1' : '0.7'}
                        />
                        <text
                          x={34}
                          y={y + 3}
                          textAnchor="end"
                          fill="#94A3B8"
                          fontSize="9.5"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {d > 0 ? `+${d}°` : `${d}°`}
                        </text>
                      </g>
                    );
                  })}

                  {/* ===========================================================
                      3. SHEET PARTITION CELLS OVERLAY (전천 성도 위에 뚜렷하게 표시되는 분리칸)
                     =========================================================== */}
                  {sheets.map((sh) => {
                    const cx = 40 + ((24 - sh.centerRaHours) / 24) * 650;
                    const cy = 20 + ((90 - sh.centerDecDeg) / 180) * 310;
                    const bw = Math.min(650, (sh.raSpanHours / 24) * 650);
                    const bh = Math.min(110, (sh.decSpanDeg / 180) * 310);

                    const x0 = Math.max(40, Math.min(690 - bw, cx - bw / 2));
                    const y0 = Math.max(20, Math.min(330 - bh, cy - bh / 2));
                    const wClamped = Math.min(bw, 690 - x0);
                    const hClamped = Math.min(bh, 330 - y0);

                    const isCurrent = activeSheet?.sheetNumber === sh.sheetNumber;
                    const isHovered = hoveredSheetNumber === sh.sheetNumber;

                    const boxStrokeOpacity = boxOpacityPercent / 100;
                    const boxFillOpacity = (boxOpacityPercent / 100) * 0.25;
                    const boxTextOpacity = Math.max(0.2, (boxOpacityPercent / 100) * 0.85);

                    return (
                      <g
                        key={`tile-${sh.sheetNumber}`}
                        onClick={() => onSelectSheet(sh, false)}
                        onMouseEnter={() => setHoveredSheetNumber(sh.sheetNumber)}
                        onMouseLeave={() => setHoveredSheetNumber(null)}
                        className="cursor-pointer"
                      >
                        {/* Outer Partition Cell Box (controlled by boxOpacityPercent slider) */}
                        <rect
                          x={x0 + 0.8}
                          y={y0 + 0.8}
                          width={Math.max(10, wClamped - 1.6)}
                          height={Math.max(10, hClamped - 1.6)}
                          rx="2"
                          fill={
                            isCurrent
                              ? 'rgba(6, 182, 212, 0.22)'
                              : isHovered
                              ? 'rgba(56, 189, 248, 0.16)'
                              : `rgba(6, 182, 212, ${boxFillOpacity})`
                          }
                          stroke={
                            isCurrent
                              ? '#22D3EE'
                              : isHovered
                              ? '#38BDF8'
                              : `rgba(56, 189, 248, ${boxStrokeOpacity})`
                          }
                          strokeWidth={isCurrent || isHovered ? '1.8' : '0.8'}
                        />

                        {/* Sheet Number: subtle text controlled by opacity slider; clear badge on hover/current */}
                        {isCurrent || isHovered ? (
                          <g>
                            <rect
                              x={x0 + wClamped / 2 - 14}
                              y={y0 + hClamped / 2 - 7}
                              width="28"
                              height="14"
                              rx="3"
                              fill={isCurrent ? '#0891B2' : '#0284C7'}
                              stroke={isCurrent ? '#67E8F9' : '#BAE6FD'}
                              strokeWidth="0.9"
                            />
                            <text
                              x={x0 + wClamped / 2}
                              y={y0 + hClamped / 2 + 3.2}
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="8.5"
                              fontWeight="700"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              #{String(sh.sheetNumber).padStart(2, '0')}
                            </text>
                          </g>
                        ) : (
                          <text
                            x={x0 + wClamped / 2}
                            y={y0 + hClamped / 2 + 3.0}
                            textAnchor="middle"
                            fill={`rgba(148, 163, 184, ${boxTextOpacity})`}
                            fontSize="8"
                            fontWeight="500"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            #{String(sh.sheetNumber).padStart(2, '0')}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Outer Map Border */}
                  <rect
                    x="40"
                    y="20"
                    width="650"
                    height="310"
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1.4"
                  />
                </svg>
              </div>
            </div>

            {/* Legend Strip under Index Map with Center Box Opacity Slider */}
            <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              {/* Left Legend Indicators */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-2 rounded-xs border border-sky-400 inline-block transition-opacity"
                    style={{ opacity: Math.max(0.3, boxOpacityPercent / 100) }}
                  />
                  <span>분할 성도 분리칸 (#01~#{sheets.length})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-sky-400/70 inline-block" />
                  <span>88 별자리선</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  <span>메시에 천체</span>
                </span>
              </div>

              {/* Center Slider: Box Opacity Control (두 번째 그림 가운데에 위치하는 박스 투명도 설정 슬라이드바) */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  분할 박스 투명도
                </span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={boxOpacityPercent}
                  onChange={(e) => setBoxOpacityPercent(Number(e.target.value))}
                  className="w-24 sm:w-32 h-1.5 accent-cyan-600 cursor-pointer"
                  title="분할 성도 박스 투명도 설정 (5% ~ 100%)"
                />
                <span className="font-mono text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 w-9 text-right tabular-nums">
                  {boxOpacityPercent}%
                </span>
              </div>

              {/* Right Coordinate Tag */}
              <span className="font-mono">ALL-SKY J2000.0 TESSELLATION</span>
            </div>
          </div>

          {/* Card 2: Partitioned Sheets Directory Table (Placed Directly Below the All-Sky Sheet Index Map) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                분할 성도 페이지 목록 (총 {sheets.length}매)
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                클릭 시 대화형 D3 성도 뷰어에서 즉시 미리보기
              </span>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-mono">
                    <th className="py-2.5 px-3.5">SHEET</th>
                    <th className="py-2.5 px-3.5">구역 및 대표 별자리</th>
                    <th className="py-2.5 px-3.5">중심 좌표 (J2000)</th>
                    <th className="py-2.5 px-3.5">화각 / 한계등급</th>
                    <th className="py-2.5 px-3.5">수록 항성 / DSO</th>
                    <th className="py-2.5 px-3.5">인접 성도</th>
                    <th className="py-2.5 px-3.5 text-right">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {sheets.map((sh) => {
                    const isCurrent = activeSheet?.sheetNumber === sh.sheetNumber;
                    return (
                      <tr
                        key={sh.sheetNumber}
                        onClick={() => onSelectSheet(sh, false)}
                        onMouseEnter={() => setHoveredSheetNumber(sh.sheetNumber)}
                        onMouseLeave={() => setHoveredSheetNumber(null)}
                        className={`cursor-pointer transition-colors ${
                          isCurrent
                            ? 'bg-cyan-50/70 dark:bg-cyan-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-3.5 font-bold text-cyan-600 dark:text-cyan-400">
                          #{String(sh.sheetNumber).padStart(2, '0')}
                        </td>
                        <td className="py-2 px-3.5 font-sans">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {sh.titleKo}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {sh.zoneLabel}
                          </div>
                        </td>
                        <td className="py-2 px-3.5 text-slate-700 dark:text-slate-300">
                          {formatRaHours(sh.centerRaHours, true)} · {formatDecDeg(sh.centerDecDeg, true)}
                        </td>
                        <td className="py-2 px-3.5 text-slate-700 dark:text-slate-300">
                          {sh.fovDeg}° · ≤{sh.limitStarMag.toFixed(1)}m
                        </td>
                        <td className="py-2 px-3.5 text-slate-700 dark:text-slate-300">
                          {sh.starCountEstimate.toLocaleString()}성 · {sh.dsoCount} DSO
                        </td>
                        <td className="py-2 px-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                          N:{sh.adjacentNorth || '-'} S:{sh.adjacentSouth || '-'} E:{sh.adjacentEast || '-'} W:{sh.adjacentWest || '-'}
                        </td>
                        <td className="py-2 px-3.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSheet(sh, true);
                            }}
                            className="px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            성도 열기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
