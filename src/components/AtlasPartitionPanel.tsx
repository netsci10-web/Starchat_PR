import React from 'react';
import {
  BookOpen,
  Check,
  Compass,
  Eye,
  FileDown,
  Grid,
  Layers,
  Sliders,
} from 'lucide-react';
import {
  AtlasGeneratorOptions,
  AtlasPresetId,
  AtlasSheet,
} from '../types/astronomy';
import {
  ATLAS_PRESETS,
  formatDecDeg,
  formatRaHours,
} from '../utils/atlasGenerator';

interface AtlasPartitionPanelProps {
  options: AtlasGeneratorOptions;
  onChangeOptions: (updater: (prev: AtlasGeneratorOptions) => AtlasGeneratorOptions) => void;
  sheets: AtlasSheet[];
  activeSheet: AtlasSheet | null;
  onSelectSheet: (sheet: AtlasSheet) => void;
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
              원하는 한계등급(Limiting Magnitude)과 페이지당 화각(FOV)을 지정하면 적위 띠(Declination Band)별로 천구를 자동 분할하여 표지·전천 색인도·개별 성도가 포함된 벡터 PDF 성도집을 생성합니다.
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

      {/* Two-Column Split: Left Preset & Custom Parameters | Right All-Sky Interactive Tessellation Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Presets & Partition Parameters */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>성도집 분할 프리셋 및 세부 파라미터</span>
            </h3>

            {/* Preset Selector Buttons */}
            <div className="mt-3 space-y-2">
              {(Object.keys(ATLAS_PRESETS) as AtlasPresetId[]).map((pid) => {
                const p = ATLAS_PRESETS[pid];
                const isSelected = options.presetId === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleSelectPreset(pid)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {p.nameKo}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.subtitleKo}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fine-Grained Partition Sliders */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 dark:text-slate-400">페이지당 화각 (Chart FOV)</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {options.fovPerSheetDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={65}
                  step={2}
                  value={options.fovPerSheetDeg}
                  onChange={(e) =>
                    onChangeOptions((prev) => ({
                      ...prev,
                      presetId: 'custom_grid',
                      fovPerSheetDeg: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-cyan-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 dark:text-slate-400">항성 한계등급 (Limiting Star Mag)</span>
                  <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                    {options.limitStarMag.toFixed(1)} mag
                  </span>
                </div>
                <input
                  type="range"
                  min={5.0}
                  max={11.0}
                  step={0.2}
                  value={options.limitStarMag}
                  onChange={(e) =>
                    onChangeOptions((prev) => ({
                      ...prev,
                      presetId: 'custom_grid',
                      limitStarMag: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-cyan-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    최소 적위 (Dec Min)
                  </label>
                  <select
                    value={options.decMinDeg}
                    onChange={(e) =>
                      onChangeOptions((prev) => ({
                        ...prev,
                        presetId: 'custom_grid',
                        decMinDeg: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value={-90}>-90° (남천극 포함)</option>
                    <option value={-45}>-45° (남천 중위도)</option>
                    <option value={-35}>-35° (한반도 남쪽 한계)</option>
                    <option value={-20}>-20° (적도 남부)</option>
                    <option value={0}>0° (북반구 전용)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    인쇄 배색 테마 (PDF Theme)
                  </label>
                  <select
                    value={options.colorScheme}
                    onChange={(e) =>
                      onChangeOptions((prev) => ({
                        ...prev,
                        colorScheme: e.target.value as AtlasGeneratorOptions['colorScheme'],
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="paper">백색 출판 성도 (Paper Print)</option>
                    <option value="observatory">다크 천문대 (Observatory Dark)</option>
                    <option value="nightvision">야간 적색광 (Night Vision Red)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeCoverPage}
                    onChange={(e) =>
                      onChangeOptions((prev) => ({
                        ...prev,
                        includeCoverPage: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                  <span>표지 및 제원표 포함</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeIndexMapPage}
                    onChange={(e) =>
                      onChangeOptions((prev) => ({
                        ...prev,
                        includeIndexMapPage: e.target.checked,
                      }))
                    }
                    className="rounded accent-cyan-600"
                  />
                  <span>전천 분할 색인도 포함</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive All-Sky Rectangular Tessellation Map */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  전천 성도 분할 색인도 (All-Sky Sheet Index Map)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  분할된 타일(#01 ~ #{sheets.length})을 클릭하면 해당 성도의 중심 적경/적위 및 화각으로 즉시 이동합니다.
                </p>
              </div>
              {activeSheet && (
                <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
                  선택됨: Chart #{activeSheet.sheetNumber} ({activeSheet.titleKo})
                </div>
              )}
            </div>

            {/* SVG Rectangular All-Sky Tessellation Preview */}
            <div className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950">
              <svg
                viewBox="0 0 720 360"
                className="w-full h-auto block select-none"
              >
                <rect x="0" y="0" width="720" height="360" fill="#070A12" />

                {/* Equatorial Grid Lines on Index Map */}
                {[0, 4, 8, 12, 16, 20, 24].map((h) => {
                  const x = 40 + ((24 - h) / 24) * 650;
                  return (
                    <g key={`idx-ra-${h}`}>
                      <line
                        x1={x}
                        y1={20}
                        x2={x}
                        y2={330}
                        stroke="#1E293B"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={346}
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {h}h
                      </text>
                    </g>
                  );
                })}

                {[-90, -60, -30, 0, 30, 60, 90].map((d) => {
                  const y = 20 + ((90 - d) / 180) * 310;
                  return (
                    <g key={`idx-dec-${d}`}>
                      <line
                        x1={40}
                        y1={y}
                        x2={690}
                        y2={y}
                        stroke={d === 0 ? '#334155' : '#1E293B'}
                        strokeWidth={d === 0 ? '1.3' : '1'}
                      />
                      <text
                        x={32}
                        y={y + 3}
                        textAnchor="end"
                        fill="#64748B"
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {d > 0 ? `+${d}°` : `${d}°`}
                      </text>
                    </g>
                  );
                })}

                {/* Sheet Partition Tiles */}
                {sheets.map((sh) => {
                  const cx = 40 + ((24 - sh.centerRaHours) / 24) * 650;
                  const cy = 20 + ((90 - sh.centerDecDeg) / 180) * 310;
                  const bw = Math.min(640, (sh.raSpanHours / 24) * 650);
                  const bh = Math.min(90, (sh.decSpanDeg / 180) * 310);

                  const x0 = Math.max(40, cx - bw / 2);
                  const y0 = Math.max(20, cy - bh / 2);
                  const wClamped = Math.min(bw, 690 - x0);
                  const hClamped = Math.min(bh, 330 - y0);

                  const isCurrent = activeSheet?.sheetNumber === sh.sheetNumber;

                  return (
                    <g
                      key={`tile-${sh.sheetNumber}`}
                      onClick={() => onSelectSheet(sh)}
                      className="cursor-pointer group"
                    >
                      <rect
                        x={x0 + 1}
                        y={y0 + 1}
                        width={Math.max(8, wClamped - 2)}
                        height={Math.max(8, hClamped - 2)}
                        rx="2"
                        fill={
                          isCurrent
                            ? 'rgba(6, 182, 212, 0.30)'
                            : 'rgba(30, 41, 59, 0.48)'
                        }
                        stroke={isCurrent ? '#22D3EE' : '#38BDF8'}
                        strokeWidth={isCurrent ? '1.8' : '0.8'}
                      />
                      <text
                        x={x0 + wClamped / 2}
                        y={y0 + hClamped / 2 + 3.5}
                        textAnchor="middle"
                        fill={isCurrent ? '#FFFFFF' : '#BAE6FD'}
                        fontSize="10"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        #{sh.sheetNumber}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Quick Sheet Strip */}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>적경(RA)은 천구 내부 시점에 맞춰 좌측(동쪽)으로 증가합니다.</span>
            <span className="font-mono">J2000.0 EQUATORIAL TESSELLATION</span>
          </div>
        </div>
      </div>

      {/* Partitioned Sheets Directory Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            분할 성도 페이지 목록 (총 {sheets.length}매)
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            클릭 시 대화형 D3 성도 뷰어에서 즉시 미리보기
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-mono">
                <th className="py-2.5 px-4">SHEET</th>
                <th className="py-2.5 px-4">구역 및 대표 별자리</th>
                <th className="py-2.5 px-4">중심 좌표 (J2000)</th>
                <th className="py-2.5 px-4">화각 / 한계등급</th>
                <th className="py-2.5 px-4">수록 항성 / DSO</th>
                <th className="py-2.5 px-4">인접 성도 (N/S/E/W)</th>
                <th className="py-2.5 px-4 text-right">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
              {sheets.map((sh) => {
                const isCurrent = activeSheet?.sheetNumber === sh.sheetNumber;
                return (
                  <tr
                    key={sh.sheetNumber}
                    onClick={() => onSelectSheet(sh)}
                    className={`cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-cyan-50/70 dark:bg-cyan-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-bold text-cyan-600 dark:text-cyan-400">
                      #{String(sh.sheetNumber).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-4 font-sans">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {sh.titleKo}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {sh.zoneLabel}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                      {formatRaHours(sh.centerRaHours, true)} · {formatDecDeg(sh.centerDecDeg, true)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                      {sh.fovDeg}° · ≤{sh.limitStarMag.toFixed(1)}m
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                      {sh.starCountEstimate.toLocaleString()}성 · {sh.dsoCount} DSO
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                      N:{sh.adjacentNorth || '-'} · S:{sh.adjacentSouth || '-'} · E:{sh.adjacentEast || '-'} · W:{sh.adjacentWest || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSheet(sh);
                        }}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
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
  );
};
