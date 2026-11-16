/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { AtlasPartitionPanel } from './components/AtlasPartitionPanel';
import { CatalogAndSpecsView } from './components/CatalogAndSpecsView';
import { FChart3Sidebar } from './components/FChart3Sidebar';
import { FChart3Viewport } from './components/FChart3Viewport';
import {
  AtlasGeneratorOptions,
  AtlasSheet,
  DSORecord,
  FChart3Config,
  StarRecord,
} from './types/astronomy';
import {
  ATLAS_PRESETS,
  computeLstDeg,
  equatorialToHorizontal,
  exportMultiPageAtlasPdf,
  formatAltDeg,
  formatAzDeg,
  formatDecDeg,
  formatRaHours,
  generateAtlasSheets,
} from './utils/atlasGenerator';

type ActiveWorkspaceTab = 'chart' | 'atlas' | 'catalog' | 'specs' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('chart');

  // Default fchart3 Interactive Vector Star Chart Configuration (Orion / Winter Milky Way view)
  const [config, setConfig] = useState<FChart3Config>({
    coordinateSystem: 'equatorial',
    centerRaHours: 5.588,
    centerDecDeg: -2.0,
    centerAzDeg: 180.0,
    centerAltDeg: 50.0,
    observerLatDeg: 37.5665,
    observerLonDeg: 126.9780,
    observerLocationName: '서울 (Seoul)',
    observationDateTime: '2026-11-16T23:00',
    showHorizonGround: true,
    showCenterCrosshair: true,
    fovDeg: 32,
    projection: 'stereographic',
    colorScheme: 'observatory',
    mirrorHorizontal: false,
    mirrorVertical: false,
    limitStarMag: 8.6,
    limitDsoMag: 11.5,
    starScaleFactor: 1.05,
    showMilkyWayContours: false,
    milkyWayStyle: 'shaded_vector',
    showConstellationLines: true,
    showConstellationBoundaries: false,
    showNebulaOutlines: false,
    showMessierObjects: true,
    showCaldwellObjects: true,
    showEquatorialGrid: true,
    showEclipticAndGalactic: false,
    showStarLabels: 'bayer_and_named',
    showDsoLabels: true,
    showMagnitudeScale: true,
    showScaleBar: true,
    showCursorCoords: true,
    reticleMode: 'none',
    customEyepieceFovDeg: 2.0,
  });

  // Default fchart3-atlas Multi-Page Sky Atlas Partitioning Options
  const [atlasOptions, setAtlasOptions] = useState<AtlasGeneratorOptions>({
    presetId: 'korean_seasonal_18',
    atlasTitle: ATLAS_PRESETS.korean_seasonal_18.nameEn,
    authorOrObservatory: 'FChart3 Vector Cartography Studio',
    epochLabel: 'J2000.0',
    paperSize: 'A4_LANDSCAPE',
    colorScheme: 'paper',
    decMinDeg: ATLAS_PRESETS.korean_seasonal_18.decMinDeg,
    decMaxDeg: ATLAS_PRESETS.korean_seasonal_18.decMaxDeg,
    fovPerSheetDeg: ATLAS_PRESETS.korean_seasonal_18.fovPerSheetDeg,
    overlapPercent: ATLAS_PRESETS.korean_seasonal_18.overlapPercent,
    limitStarMag: ATLAS_PRESETS.korean_seasonal_18.limitStarMag,
    limitDsoMag: ATLAS_PRESETS.korean_seasonal_18.limitDsoMag,
    includeCoverPage: true,
    includeIndexMapPage: true,
    includeDsoAppendix: true,
  });

  // Compute partitioned AtlasSheets dynamically from atlasOptions
  const atlasSheets = useMemo(
    () => generateAtlasSheets(atlasOptions),
    [atlasOptions]
  );

  const [activeSheetNumber, setActiveSheetNumber] = useState<number | null>(null);
  const [selectedObject, setSelectedObject] = useState<{
    type: 'star' | 'dso';
    data: StarRecord | DSORecord;
  } | null>(null);

  const [pdfProgress, setPdfProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  } | null>(null);

  const activeSheet = useMemo(
    () => atlasSheets.find((s) => s.sheetNumber === activeSheetNumber) || null,
    [atlasSheets, activeSheetNumber]
  );

  // Select a partitioned sheet from fchart3-atlas and jump to it in the D3 chart
  const handleSelectSheet = (sheet: AtlasSheet) => {
    setActiveSheetNumber(sheet.sheetNumber);
    setConfig((prev) => {
      const lstDeg = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
      const [az, alt] = equatorialToHorizontal(
        sheet.centerRaHours * 15,
        sheet.centerDecDeg,
        prev.observerLatDeg,
        lstDeg
      );
      return {
        ...prev,
        centerRaHours: sheet.centerRaHours,
        centerDecDeg: sheet.centerDecDeg,
        centerAzDeg: Number(az.toFixed(1)),
        centerAltDeg: Number(alt.toFixed(1)),
        fovDeg: sheet.fovDeg,
        limitStarMag: sheet.limitStarMag,
        limitDsoMag: sheet.limitDsoMag,
      };
    });
    setActiveTab('chart');
  };

  // Trigger multi-page vector PDF generation
  const handleExportMultiPagePdf = async () => {
    if (pdfProgress) return;
    try {
      setPdfProgress({
        current: 1,
        total: atlasSheets.length + 2,
        stage: '다중 페이지 벡터 성도집 초기화 중...',
      });
      await exportMultiPageAtlasPdf(
        atlasOptions,
        atlasSheets,
        config,
        (current, total, stage) => {
          setPdfProgress({ current, total, stage });
        }
      );
    } finally {
      setTimeout(() => setPdfProgress(null), 600);
    }
  };

  const isDarkUi = config.colorScheme !== 'paper';

  return (
    <div className={`${isDarkUi ? 'dark' : ''} h-screen w-screen overflow-hidden`}>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between gap-6 px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#chart"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('chart');
            }}
            className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            FCHART3 ATLAS STUDIO
          </a>

          {/* Zone 2: 5 concise single-line text navigation links (with '검색창' right next to '대화형 벡터 성도') */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a
              href="#chart"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('chart');
              }}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'chart'
                  ? 'text-slate-900 dark:text-white border-b-2 border-cyan-500'
                  : ''
              }`}
            >
              대화형 벡터 성도
            </a>
            <a
              href="#catalog"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('catalog');
              }}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'catalog'
                  ? 'text-slate-900 dark:text-white border-b-2 border-cyan-500'
                  : ''
              }`}
            >
              검색창
            </a>
            <a
              href="#atlas"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('atlas');
              }}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'atlas'
                  ? 'text-slate-900 dark:text-white border-b-2 border-cyan-500'
                  : ''
              }`}
            >
              다중 성도집 분할 ({atlasSheets.length}매)
            </a>
            <a
              href="#specs"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('specs');
              }}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'specs'
                  ? 'text-slate-900 dark:text-white border-b-2 border-cyan-500'
                  : ''
              }`}
            >
              CLI 및 도법 명세
            </a>
            <a
              href="#settings"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('settings');
              }}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'settings'
                  ? 'text-slate-900 dark:text-white border-b-2 border-cyan-500'
                  : ''
              }`}
            >
              설정
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={Boolean(pdfProgress)}
              onClick={handleExportMultiPagePdf}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pdfProgress
                ? `PDF 생성 중 (${pdfProgress.current}/${pdfProgress.total})`
                : `맞춤 성도집 PDF 출력 (${atlasSheets.length}매)`}
            </button>
          </div>
        </header>

        {/* Sub-Toolbar for Mobile Navigation & Live Telemetry Ribbon */}
        <div className="px-5 py-1.5 bg-slate-100 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              ● {config.coordinateSystem === 'horizontal' ? 'HORIZONTAL (ALT-AZ)' : 'EQUATORIAL (J2000)'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {config.coordinateSystem === 'horizontal'
                ? `CENTER: Az ${formatAzDeg(config.centerAzDeg)} / Alt ${formatAltDeg(config.centerAltDeg)} (${config.observerLocationName})`
                : `CENTER: ${formatRaHours(config.centerRaHours)} / ${formatDecDeg(config.centerDecDeg)}`}
            </span>
            <span aria-hidden="true">·</span>
            <span>FOV: {config.fovDeg.toFixed(1)}°</span>
            <span aria-hidden="true">·</span>
            <span>LIMIT MAG: {config.limitStarMag.toFixed(1)}</span>
          </div>

          {/* Mobile Tab Switcher + Quick Atlas Sheet Strip */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="flex md:hidden items-center gap-1">
              {(
                [
                  { id: 'chart', label: '성도' },
                  { id: 'catalog', label: '검색창' },
                  { id: 'atlas', label: '성도집 분할' },
                  { id: 'specs', label: 'CLI 명세' },
                  { id: 'settings', label: '설정' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-2 py-1 rounded text-xs font-sans whitespace-nowrap ${
                    activeTab === t.id
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span className="text-slate-400 hidden sm:inline">fchart3-atlas 시트:</span>
            <div className="flex items-center gap-1">
              {atlasSheets.slice(0, 8).map((sh) => (
                <button
                  key={sh.sheetNumber}
                  type="button"
                  onClick={() => handleSelectSheet(sh)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap cursor-pointer ${
                    activeSheetNumber === sh.sheetNumber
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={`${sh.titleKo} (${formatRaHours(sh.centerRaHours, true)}, ${formatDecDeg(sh.centerDecDeg, true)})`}
                >
                  #{sh.sheetNumber}
                </button>
              ))}
              {atlasSheets.length > 8 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('atlas')}
                  className="px-2 py-0.5 rounded text-[11px] bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  +{atlasSheets.length - 8}매 전체보기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Workspace Body (Full Window Height, Zero Window Scroll) */}
        {activeTab === 'chart' ? (
          <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Left Parameter & Search Console */}
            <FChart3Sidebar
              config={config}
              onChangeConfig={setConfig}
              onOpenAtlasModal={() => setActiveTab('atlas')}
              onOpenSettingsTab={() => setActiveTab('settings')}
              onSelectDso={(dso) => setSelectedObject({ type: 'dso', data: dso })}
              onSelectStar={(star) => setSelectedObject({ type: 'star', data: star })}
              sheetsCount={atlasSheets.length}
            />

            {/* Right Interactive D3.js Vector Star Chart Viewport */}
            <FChart3Viewport
              config={config}
              onChangeConfig={setConfig}
              activeSheet={activeSheet}
              allSheets={atlasSheets}
              onSelectSheet={handleSelectSheet}
              selectedObject={selectedObject}
              onSelectObject={setSelectedObject}
            />
          </main>
        ) : (
          <main className="flex-1 min-h-0 w-full overflow-y-auto">
            <div className="max-w-[1440px] w-full mx-auto px-6 py-5">
              {activeTab === 'atlas' && (
                <AtlasPartitionPanel
                  options={atlasOptions}
                  onChangeOptions={setAtlasOptions}
                  sheets={atlasSheets}
                  activeSheet={activeSheet}
                  onSelectSheet={handleSelectSheet}
                  onGeneratePdf={handleExportMultiPagePdf}
                  pdfProgress={pdfProgress}
                />
              )}

              {(activeTab === 'catalog' ||
                activeTab === 'specs' ||
                activeTab === 'settings') && (
                <CatalogAndSpecsView
                  mode={activeTab}
                  config={config}
                  onChangeConfig={setConfig}
                  atlasOptions={atlasOptions}
                  onJumpToTarget={(raHours, decDeg, fovDeg, dso, star) => {
                    if (dso) {
                      setSelectedObject({ type: 'dso', data: dso });
                    } else if (star) {
                      setSelectedObject({ type: 'star', data: star });
                    }
                    setConfig((prev) => {
                      const lstDeg = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
                      const [az, alt] = equatorialToHorizontal(
                        raHours * 15,
                        decDeg,
                        prev.observerLatDeg,
                        lstDeg
                      );
                      return {
                        ...prev,
                        showMessierObjects: dso?.messierId ? true : prev.showMessierObjects,
                        showCaldwellObjects: dso?.caldwellId ? true : prev.showCaldwellObjects,
                        showNebulaOutlines:
                          dso && !dso.messierId && !dso.caldwellId
                            ? true
                            : prev.showNebulaOutlines,
                        showConstellationLines: true,
                        limitDsoMag: dso
                          ? Math.max(prev.limitDsoMag, Number((dso.mag + 0.5).toFixed(1)))
                          : prev.limitDsoMag,
                        limitStarMag: star
                          ? Math.max(prev.limitStarMag, Number((star.mag + 0.5).toFixed(1)))
                          : prev.limitStarMag,
                        centerRaHours: raHours,
                        centerDecDeg: decDeg,
                        centerAzDeg: Number(az.toFixed(1)),
                        centerAltDeg: Number(alt.toFixed(1)),
                        fovDeg,
                      };
                    });
                    setActiveTab('chart');
                  }}
                />
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
