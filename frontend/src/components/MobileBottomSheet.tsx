import React, { useState, useRef, useMemo } from 'react';
import { Station, LiveBus, SimulationResult } from '../types';
import { SimulationCard } from './SimulationCard';
import { StationTimeline } from './StationTimeline';
import { isStationBookmarked } from '../utils/favorites';
import { ChevronUp, ChevronDown, Bus, Star, Route } from 'lucide-react';

export type BottomSheetTier = 'PEEK' | 'HALF' | 'FULL';

export interface MobileBottomSheetProps {
  className?: string;
  stations: Station[];
  displayedStations?: Station[];
  activeDirection: 'UP' | 'DOWN';
  onDirectionChange: (dir: 'UP' | 'DOWN') => void;
  selectedStationSeq: number | null;
  onSelectStation: (seq: number) => void;
  busesByStationSeq: Map<number, LiveBus[]> | Record<number, LiveBus[]>;
  liveBuses?: LiveBus[];
  simData?: SimulationResult | null;
  simulationResult?: SimulationResult | null;
  isSimLoading?: boolean;
  isLoadingSim?: boolean;
  queueCount: number;
  onChangeQueueCount?: (q: number) => void;
  setQueueCount?: (q: number) => void;
  favorites?: number[];
  onToggleFavorite: (seq: number) => void;
  upStations?: Station[];
  downStations?: Station[];
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  className = '',
  stations,
  displayedStations,
  activeDirection,
  onDirectionChange,
  selectedStationSeq,
  onSelectStation,
  busesByStationSeq,
  liveBuses = [],
  simData,
  simulationResult,
  isSimLoading,
  isLoadingSim,
  queueCount,
  onChangeQueueCount,
  setQueueCount,
  favorites,
  onToggleFavorite,
  upStations,
  downStations,
}) => {
  const [tier, setTier] = useState<BottomSheetTier>('PEEK');
  const [dragDeltaY, setDragDeltaY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const touchStartYRef = useRef<number>(0);
  const touchStartTimeRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const listTouchStartYRef = useRef<number>(0);
  const listTouchStartScrollTopRef = useRef<number>(0);

  const currentStationSeq = selectedStationSeq ?? 16;
  const currentStation = stations.find((s) => s.stationSeq === currentStationSeq);

  const effectiveSimResult = simulationResult ?? simData ?? null;
  const effectiveIsSimLoading = isLoadingSim ?? isSimLoading ?? false;
  const handleChangeQueue = onChangeQueueCount ?? setQueueCount ?? (() => {});

  const upSt = useMemo(
    () => upStations || stations.filter((s) => s.direction === 'UP'),
    [upStations, stations]
  );
  const downSt = useMemo(
    () => downStations || stations.filter((s) => s.direction === 'DOWN'),
    [downStations, stations]
  );
  const dispStations = useMemo(
    () => displayedStations || (activeDirection === 'UP' ? upSt : downSt),
    [displayedStations, activeDirection, upSt, downSt]
  );

  const isFavorite = favorites
    ? favorites.includes(currentStationSeq)
    : isStationBookmarked(currentStationSeq);

  // Next bus info for Peek tier
  const nextBus = effectiveSimResult?.buses?.[0];

  // Base translateY for each snap tier
  const getBaseTranslateY = (t: BottomSheetTier): string => {
    switch (t) {
      case 'PEEK':
        return 'calc(88vh - 92px)';
      case 'HALF':
        return 'calc(88vh - 48vh)';
      case 'FULL':
        return '0px';
    }
  };

  // Header / Handle Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    hasDraggedRef.current = false;
    setIsDragging(true);
    setDragDeltaY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    let deltaY = currentY - touchStartYRef.current;

    if (Math.abs(deltaY) > 5) {
      hasDraggedRef.current = true;
    }

    // Boundary resistance: prevent dragging above FULL or below PEEK
    if (tier === 'FULL' && deltaY < 0) {
      deltaY = deltaY * 0.15;
    } else if (tier === 'PEEK' && deltaY > 0) {
      deltaY = deltaY * 0.15;
    }

    setDragDeltaY(deltaY);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaTime = Math.max(1, Date.now() - touchStartTimeRef.current);
    const velocity = dragDeltaY / deltaTime; // px/ms

    let nextTier: BottomSheetTier = tier;

    if (tier === 'PEEK') {
      if (velocity < -0.65 || dragDeltaY < -180) {
        nextTier = 'FULL';
      } else if (velocity < -0.25 || dragDeltaY < -40) {
        nextTier = 'HALF';
      }
    } else if (tier === 'HALF') {
      if (velocity < -0.25 || dragDeltaY < -45) {
        nextTier = 'FULL';
      } else if (velocity > 0.25 || dragDeltaY > 45) {
        nextTier = 'PEEK';
      }
    } else if (tier === 'FULL') {
      if (velocity > 0.65 || dragDeltaY > 180) {
        nextTier = 'PEEK';
      } else if (velocity > 0.25 || dragDeltaY > 45) {
        nextTier = 'HALF';
      }
    }

    setTier(nextTier);
    setDragDeltaY(0);
  };

  // Tap handler on header
  const handleHeaderClick = () => {
    if (hasDraggedRef.current) return;
    if (tier === 'PEEK') {
      setTier('HALF');
    } else if (tier === 'HALF') {
      setTier('FULL');
    } else {
      setTier('HALF');
    }
  };

  // Timeline list touch interception
  const handleTimelineTouchStart = (e: React.TouchEvent) => {
    listTouchStartYRef.current = e.touches[0].clientY;
    listTouchStartScrollTopRef.current = timelineContainerRef.current?.scrollTop || 0;
  };

  const handleTimelineTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - listTouchStartYRef.current;
    const currentScrollTop = timelineContainerRef.current?.scrollTop || 0;

    // Only collapse from FULL when at top of list and dragging downwards
    if (
      tier === 'FULL' &&
      listTouchStartScrollTopRef.current <= 0 &&
      currentScrollTop <= 0 &&
      deltaY > 10
    ) {
      if (!isDragging) {
        setIsDragging(true);
        touchStartYRef.current = currentY - 10;
        touchStartTimeRef.current = Date.now();
        hasDraggedRef.current = true;
      }
      setDragDeltaY(deltaY - 10);
    } else if (isDragging) {
      handleTouchMove(e);
    }
  };

  const handleTimelineTouchEnd = () => {
    if (isDragging) {
      handleTouchEnd();
    }
  };

  // Station select handler from timeline
  const handleStationClick = (seq: number) => {
    onSelectStation(seq);
    setTier('HALF');
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 flex flex-col will-change-transform pb-[env(safe-area-inset-bottom,0px)] ${className}`}
      style={{
        height: '88vh',
        maxHeight: '88vh',
        transform: isDragging
          ? `translateY(calc(${getBaseTranslateY(tier)} + ${dragDeltaY}px))`
          : `translateY(${getBaseTranslateY(tier)})`,
        transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* 1. Top Drag Handle & Peek Header Bar (~92px) */}
      <div
        className="w-full h-[92px] max-h-[92px] px-4 py-2.5 bg-white rounded-t-2xl border-b border-slate-100 cursor-pointer select-none shrink-0 flex flex-col justify-between"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleHeaderClick}
      >
        {/* Centered Drag Pill */}
        <div className="flex justify-center -mt-0.5">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Peek Row */}
        <div className="w-full flex items-center justify-between gap-2">
          {/* Station Identity */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-extrabold text-[10px] shrink-0">
              {currentStation?.direction === 'UP' ? '안양행' : '구리행'}
            </span>
            <span className="text-sm font-black text-slate-900 truncate">
              {currentStation?.stationName || '정류소를 선택하세요'}
            </span>
            {currentStation?.stationSeq != null && (
              <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                #{currentStation.stationSeq}
              </span>
            )}
          </div>

          {/* Next Bus ETA or Remaining Seats */}
          <div className="flex items-center gap-1.5 shrink-0">
            {nextBus ? (
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-[11px]">
                <Bus className="w-3 h-3 text-rose-600 shrink-0" />
                <span className="font-bold text-slate-700">
                  {nextBus.stopsRemaining === 0 ? '곧 도착' : `${nextBus.stopsRemaining}개 전`}
                </span>
                <span
                  className={`font-black text-[10px] px-1.5 py-0.2 rounded-full ${
                    nextBus.currentSeats === 0
                      ? 'bg-rose-100 text-rose-700'
                      : nextBus.currentSeats <= 15
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {nextBus.currentSeats === 0 ? '만차' : `${nextBus.currentSeats}석`}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] text-slate-500 font-semibold">
                <Bus className="w-3 h-3 text-slate-400" />
                <span>운행 중</span>
              </div>
            )}

            {/* Bookmark Star Button */}
            {currentStation && (
              <button
                type="button"
                aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 등록'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(currentStation.stationSeq);
                }}
                className="p-1.5 text-slate-300 hover:text-amber-500 transition active:scale-110"
              >
                <Star
                  className={`w-4 h-4 ${
                    isFavorite ? 'text-amber-500 fill-amber-400' : 'text-slate-300'
                  }`}
                />
              </button>
            )}

            {/* Chevron State Indicator */}
            <button
              type="button"
              aria-label={tier === 'FULL' ? '접기' : '펼치기'}
              onClick={(e) => {
                e.stopPropagation();
                if (tier === 'PEEK') setTier('HALF');
                else if (tier === 'HALF') setTier('FULL');
                else setTier('HALF');
              }}
              className="p-1 text-slate-400 hover:text-slate-600 transition"
            >
              {tier === 'FULL' ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Tier 2: Half View (SimulationCard with Queue Slider & Probabilities) */}
      <div className={`flex-1 flex-col overflow-y-auto ${tier === 'HALF' ? 'flex' : 'hidden'}`}>
        <SimulationCard
          stations={stations}
          selectedStationSeq={currentStationSeq}
          onSelectStation={onSelectStation}
          queueCount={queueCount}
          onChangeQueueCount={handleChangeQueue}
          simulationResult={effectiveSimResult}
          isLoading={effectiveIsSimLoading}
          isFavorite={isFavorite}
          onToggleFavorite={() => onToggleFavorite(currentStationSeq)}
        />
        {/* Quick button to expand full timeline */}
        <div className="p-3 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={() => setTier('FULL')}
            className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition active:scale-98 shadow-2xs"
          >
            <Route className="w-3.5 h-3.5 text-rose-600" />
            <span>전체 1650 노선 정류장 보기 ({dispStations.length}개)</span>
          </button>
        </div>
      </div>

      {/* 3. Tier 3: Full View (Direction Tabs + Full Route 1650 Station Timeline) */}
      <div
        className={`flex-1 flex-col overflow-hidden ${tier === 'FULL' ? 'flex' : 'hidden'}`}
        onTouchStart={handleTimelineTouchStart}
        onTouchMove={handleTimelineTouchMove}
        onTouchEnd={handleTimelineTouchEnd}
      >
        {/* Direction Toggle Tabs */}
        <div className="grid grid-cols-2 bg-slate-100 p-1 gap-1 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => onDirectionChange('UP')}
            className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
              activeDirection === 'UP'
                ? 'bg-white text-rose-600 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>안양역 방면</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 rounded-full text-slate-500 font-semibold">
              {upSt.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDirectionChange('DOWN')}
            className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
              activeDirection === 'DOWN'
                ? 'bg-white text-rose-600 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>구리수택 방면</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 rounded-full text-slate-500 font-semibold">
              {downSt.length}
            </span>
          </button>
        </div>

        {/* Full Station Timeline with internal scroll protection */}
        <StationTimeline
          ref={timelineContainerRef}
          stations={dispStations}
          selectedStationSeq={selectedStationSeq}
          onSelectStation={handleStationClick}
          busesByStationSeq={busesByStationSeq}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          className="flex-1"
        />
      </div>
    </div>
  );
};
