/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { AtlasPartitionPanel } from './components/AtlasPartitionPanel';
import { CatalogAndSpecsView } from './components/CatalogAndSpecsView';
import { FChart3Sidebar } from './components/FChart3Sidebar';
import { FChart3Viewport } from './components/FChart3Viewport';
import {
  AtlasGeneratorOptions,
  AtlasSheet,
  DSORecord,
  FChart3Config,
  SelectedSkyObject,
  SolarSystemBodyRecord,
  StarRecord,
} from './types/astronomy';
import {
  ATLAS_PRESETS,
  computeLinkedLimitingMags,
  computeLstDeg,
  equatorialToHorizontal,
  exportMultiPageAtlasPdf,
  generateAtlasSheets,
} from './utils/atlasGenerator';

type ActiveWorkspaceTab = 'chart' | 'atlas' | 'catalog' | 'settings';

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
    horizonAltDeg: 0,
    showCenterCrosshair: true,
    fovDeg: 32,
    projection: 'stereographic',
    colorScheme: 'observatory',
    mirrorHorizontal: false,
    mirrorVertical: false,
    limitStarMag: 9.8,
    limitDsoMag: 11.8,
    magRefStarFovDeg: 32,
    magRefStarMag: 9.8,
    magRefDsoFovDeg: 32,
    magRefDsoMag: 11.8,
    starScaleFactor: 0.9,
    showMilkyWayContours: true,
    milkyWayStyle: 'shaded_vector',
    showConstellationLines: true,
    showConstellationBoundaries: true,
    showNebulaOutlines: true,
    showMessierObjects: true,
    showCaldwellObjects: true,
    showSolarSystem: true,
    showSolarSystemLabels: true,
    showPlanetDetails: true,
    showEquatorialGrid: true,
    showEclipticAndGalactic: false,
    showStarLabels: 'bayer_and_named',
    showDsoLabels: true,
    showMagnitudeScale: true,
    showScaleBar: true,
    showCursorCoords: true,
    reticleMode: 'none',
    activeReticles: [],
    customEyepieceFovDeg: 1.7,
    eyepieceInputMode: 'direct',
    telescopeFocalLengthMm: 1000,
    eyepieceFocalLengthMm: 25,
    eyepieceAfovDeg: 68,
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
  const [selectedObject, setSelectedObject] = useState<SelectedSkyObject | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const sidebarCloseTimerRef = useRef<number | null>(null);

  const openLeftSidebar = () => {
    if (sidebarCloseTimerRef.current !== null) {
      window.clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setIsSidebarOpen(true);
  };

  const scheduleCloseLeftSidebar = () => {
    if (sidebarCloseTimerRef.current !== null) {
      window.clearTimeout(sidebarCloseTimerRef.current);
    }
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      setIsSidebarOpen(false);
    }, 180);
  };

  const [pdfProgress, setPdfProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  } | null>(null);

  const activeSheet = useMemo(
    () => atlasSheets.find((s) => s.sheetNumber === activeSheetNumber) || null,
    [atlasSheets, activeSheetNumber]
  );

  // Select a partitioned sheet from fchart3-atlas and optionally jump to it in the D3 chart
  const handleSelectSheet = (sheet: AtlasSheet, jumpToChart = false) => {
    setActiveSheetNumber(sheet.sheetNumber);
    setConfig((prev) => {
      const lstDeg = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
      const [az, alt] = equatorialToHorizontal(
        sheet.centerRaHours * 15,
        sheet.centerDecDeg,
        prev.observerLatDeg,
        lstDeg
      );
      const linked = computeLinkedLimitingMags(sheet.fovDeg, prev);
      const nextStarMag = Math.max(linked.limitStarMag, sheet.limitStarMag);
      const nextDsoMag = Math.max(linked.limitDsoMag, sheet.limitDsoMag);
      return {
        ...prev,
        centerRaHours: sheet.centerRaHours,
        centerDecDeg: sheet.centerDecDeg,
        centerAzDeg: Number(az.toFixed(1)),
        centerAltDeg: Number(alt.toFixed(1)),
        fovDeg: sheet.fovDeg,
        limitStarMag: nextStarMag,
        limitDsoMag: nextDsoMag,
        magRefStarFovDeg: nextStarMag > linked.limitStarMag ? sheet.fovDeg : linked.magRefStarFovDeg,
        magRefStarMag: nextStarMag > linked.limitStarMag ? nextStarMag : linked.magRefStarMag,
        magRefDsoFovDeg: nextDsoMag > linked.limitDsoMag ? sheet.fovDeg : linked.magRefDsoFovDeg,
        magRefDsoMag: nextDsoMag > linked.limitDsoMag ? nextDsoMag : linked.magRefDsoMag,
      };
    });
    if (jumpToChart) {
      setActiveTab('chart');
    }
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
  const isNightUi = config.colorScheme === 'nightvision';

  return (
    <div
      className={`${isDarkUi ? 'dark' : ''} ${
        isNightUi ? 'nightvision-ui' : ''
      } h-screen w-screen overflow-hidden`}
    >
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

          <div className="hidden md:block shrink-0" />
        </header>

        {/* Main Workspace Body (Full Window Height, Zero Window Scroll) */}
        {activeTab === 'chart' ? (
          <main
            className="relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden"
            onMouseMove={(e) => {
              if (!isSidebarOpen && e.clientX <= 22) {
                openLeftSidebar();
              }
            }}
          >
            {/* Left-edge hotzone trigger + subtle edge grip indicator */}
            <div
              onMouseEnter={openLeftSidebar}
              onPointerEnter={openLeftSidebar}
              className={`absolute inset-y-0 left-0 w-4 z-30 flex items-center justify-start transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              title="왼쪽 메뉴 열기"
            >
              <div className="w-3 h-12 rounded-r-md bg-slate-800/75 border border-l-0 border-cyan-500/45 text-cyan-400 flex items-center justify-center shadow-sm backdrop-blur-xs">
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            {/* Slide-in Left Parameter & Search Console Drawer */}
            <div
              onMouseEnter={openLeftSidebar}
              onMouseLeave={scheduleCloseLeftSidebar}
              className={`absolute inset-y-0 left-0 z-40 w-[232px] transition-all duration-300 ease-out ${
                isSidebarOpen
                  ? 'translate-x-0 opacity-100 pointer-events-auto shadow-2xl shadow-black/60'
                  : '-translate-x-full opacity-0 pointer-events-none'
              }`}
            >
              <FChart3Sidebar
                config={config}
                onChangeConfig={setConfig}
                onOpenAtlasModal={() => {
                  setIsSidebarOpen(false);
                  setActiveTab('atlas');
                }}
                onOpenSettingsTab={() => {
                  setIsSidebarOpen(false);
                  setActiveTab('settings');
                }}
                onSelectDso={(dso) => setSelectedObject({ type: 'dso', data: dso })}
                onSelectStar={(star) => setSelectedObject({ type: 'star', data: star })}
                onSelectSolarBody={(solar) => setSelectedObject({ type: 'solar', data: solar })}
                sheetsCount={atlasSheets.length}
              />
            </div>

            {/* Full-Width Interactive D3.js Vector Star Chart Viewport */}
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

              {(activeTab === 'catalog' || activeTab === 'settings') && (
                <CatalogAndSpecsView
                  mode={activeTab}
                  config={config}
                  onChangeConfig={setConfig}
                  onJumpToTarget={(
                    raHours: number,
                    decDeg: number,
                    fovDeg: number,
                    dso?: DSORecord,
                    star?: StarRecord,
                    solar?: SolarSystemBodyRecord
                  ) => {
                    if (dso) {
                      setSelectedObject({ type: 'dso', data: dso });
                    } else if (star) {
                      setSelectedObject({ type: 'star', data: star });
                    } else if (solar) {
                      setSelectedObject({ type: 'solar', data: solar });
                    }
                    setConfig((prev) => {
                      const lstDeg = computeLstDeg(prev.observationDateTime, prev.observerLonDeg);
                      const [az, alt] = equatorialToHorizontal(
                        raHours * 15,
                        decDeg,
                        prev.observerLatDeg,
                        lstDeg
                      );
                      const linked = computeLinkedLimitingMags(fovDeg, prev);
                      const nextDsoMag = dso
                        ? Math.max(linked.limitDsoMag, Number((dso.mag + 0.5).toFixed(1)))
                        : linked.limitDsoMag;
                      const nextStarMag = star
                        ? Math.max(linked.limitStarMag, Number((star.mag + 0.5).toFixed(1)))
                        : linked.limitStarMag;
                      return {
                        ...prev,
                        showMessierObjects: dso?.messierId ? true : prev.showMessierObjects,
                        showCaldwellObjects: dso?.caldwellId ? true : prev.showCaldwellObjects,
                        showSolarSystem: solar ? true : prev.showSolarSystem,
                        showNebulaOutlines:
                          dso && !dso.messierId && !dso.caldwellId
                            ? true
                            : prev.showNebulaOutlines,
                        showConstellationLines: true,
                        limitDsoMag: nextDsoMag,
                        limitStarMag: nextStarMag,
                        magRefStarFovDeg:
                          nextStarMag > linked.limitStarMag ? fovDeg : linked.magRefStarFovDeg,
                        magRefStarMag:
                          nextStarMag > linked.limitStarMag ? nextStarMag : linked.magRefStarMag,
                        magRefDsoFovDeg:
                          nextDsoMag > linked.limitDsoMag ? fovDeg : linked.magRefDsoFovDeg,
                        magRefDsoMag:
                          nextDsoMag > linked.limitDsoMag ? nextDsoMag : linked.magRefDsoMag,
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
