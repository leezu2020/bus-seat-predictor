import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { SimulationCard } from './components/SimulationCard';
import { AnalyticsModal } from './components/AnalyticsModal';
import { ByokModal } from './components/ByokModal';
import {
  fetchRoutePath,
  fetchLiveBuses,
  fetchTravelTime,
  runSimulation,
  getStoredApiKey,
} from './api/client';
import {
  getDefaultBookmark,
  toggleStationBookmark,
  isStationBookmarked,
} from './utils/favorites';
import { Station, LiveBus } from './types';
import { Bus, Clock, Calendar, X, ArrowUpDown, ChevronRight, Activity, Star } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10000,
    },
  },
});

function Dashboard() {
  // State
  const [activeDirection, setActiveDirection] = useState<'UP' | 'DOWN'>('UP'); // 'UP': 안양역 방면, 'DOWN': 구리수택차고지 방면
  const [selectedStationSeq, setSelectedStationSeq] = useState<number>(16); // 잠실역.잠실대교남단(중)
  const [queueCount, setQueueCount] = useState<number>(5);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [isByokOpen, setIsByokOpen] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(Boolean(getStoredApiKey()));
  const [bookmarkVersion, setBookmarkVersion] = useState<number>(0);

  // Load default bookmark on mount if available
  useEffect(() => {
    const def = getDefaultBookmark();
    if (def) {
      if (def.type === 'STATION' && def.stationSeq) {
        setSelectedStationSeq(def.stationSeq);
        if (def.direction) {
          setActiveDirection(def.direction);
        } else {
          setActiveDirection(def.stationSeq <= 44 ? 'UP' : 'DOWN');
        }
      } else if (def.type === 'PAIR' && def.fromSeq) {
        setSelectedStationSeq(def.fromSeq);
        setActiveDirection(def.fromSeq <= 44 ? 'UP' : 'DOWN');
      }
    }
  }, []);

  // 1. Fetch Route Path & Stations
  const { data: routeData, isLoading: isRouteLoading } = useQuery({
    queryKey: ['routePath'],
    queryFn: () => fetchRoutePath('234000050'),
  });

  // 2. Fetch Live Buses (Auto-refresh every 15 seconds)
  const {
    data: liveData,
    isLoading: isLiveLoading,
    isFetching: isLiveFetching,
    refetch: refetchLive,
  } = useQuery({
    queryKey: ['liveBuses', hasApiKey],
    queryFn: () => fetchLiveBuses('234000050'),
    refetchInterval: 15000,
  });

  // 3. Run Simulation
  const {
    data: simData,
    isLoading: isSimLoading,
    refetch: refetchSim,
  } = useQuery({
    queryKey: ['simulation', selectedStationSeq, queueCount, liveData?.buses],
    queryFn: () =>
      runSimulation(
        '234000050',
        selectedStationSeq,
        queueCount,
        liveData?.buses?.map((b) => ({
          plateNo: b.plateNo,
          currentStationSeq: b.stationSeq,
          currentSeats: b.remainSeatCnt,
          speedKmh: b.speedKmh || 35.0,
        }))
      ),
    enabled: !!routeData,
  });

  const stations: Station[] = routeData?.stations || [];
  const busPath = routeData?.busPath || [];
  const liveBuses: LiveBus[] = liveData?.buses || [];
  const isSimulatedMode = liveData?.mode !== 'LIVE_GBIS';

  // Group stations by direction
  const upStations = useMemo(() => stations.filter((s) => s.direction === 'UP'), [stations]);
  const downStations = useMemo(() => stations.filter((s) => s.direction === 'DOWN'), [stations]);
  const displayedStations = activeDirection === 'UP' ? upStations : downStations;

  // Map buses by station sequence
  const busesByStationSeq = useMemo(() => {
    const map: Record<number, LiveBus[]> = {};
    liveBuses.forEach((b) => {
      if (!map[b.stationSeq]) map[b.stationSeq] = [];
      map[b.stationSeq].push(b);
    });
    return map;
  }, [liveBuses]);

  // When direction changes, pick a sensible default station if currently selected station is in the other direction
  const handleDirectionChange = (dir: 'UP' | 'DOWN') => {
    setActiveDirection(dir);
    if (dir === 'UP' && selectedStationSeq > 44) {
      setSelectedStationSeq(16); // 잠실역
    } else if (dir === 'DOWN' && selectedStationSeq <= 44) {
      setSelectedStationSeq(76); // 잠실역 복귀
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden font-sans select-none">
      {/* Top Navigation Bar */}
      <Header
        onOpenByokModal={() => setIsByokOpen(true)}
        hasApiKey={hasApiKey}
        isSimulatedMode={isSimulatedMode}
        isFetching={isLiveFetching}
        liveBusCount={liveBuses.length}
        onRefresh={() => {
          refetchLive();
          refetchSim();
        }}
        onToggleAnalytics={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
        isAnalyticsOpen={isAnalyticsOpen}
      />

      {/* Main Split Layout: Left Sidebar + Central Map */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Route Card + Direction Tabs + Vertical Timeline + Boarding Card */}
        <aside className="w-full sm:w-[410px] lg:w-[430px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 h-full shadow-sm">
          {/* 1. Route Summary Box */}
          <div className="p-3.5 border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-rose-600 text-white font-extrabold text-xs shadow-xs">
                  직행좌석
                </span>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">1650</h2>
                <span className="text-xs font-semibold text-slate-500">경기여객</span>
              </div>
              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                실시간 {liveBuses.length}대 운행 중
              </span>
            </div>

            {/* Operating Times */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div>
                <span className="text-slate-400">구리 첫/막차: </span>
                <strong className="text-slate-800">04:10 ~ 22:35</strong>
              </div>
              <div>
                <span className="text-slate-400">안양 첫/막차: </span>
                <strong className="text-slate-800">05:25 ~ 23:55</strong>
              </div>
              <div className="col-span-2 text-slate-500">
                <span>배차간격: </span>
                <strong className="text-slate-700">평일 6~15분</strong> | 주말 15~18분
              </div>
            </div>
          </div>

          {/* 2. Direction Tabs (안양역 방면 / 구리수택차고지 방면) */}
          <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-200 p-1 gap-1">
            <button
              onClick={() => handleDirectionChange('UP')}
              className={`py-2 px-3 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
                activeDirection === 'UP'
                  ? 'bg-white text-rose-600 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>안양역 방면</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 rounded-full text-slate-500 font-semibold">
                {upStations.length}
              </span>
            </button>
            <button
              onClick={() => handleDirectionChange('DOWN')}
              className={`py-2 px-3 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
                activeDirection === 'DOWN'
                  ? 'bg-white text-rose-600 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>구리수택차고지 방면</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 rounded-full text-slate-500 font-semibold">
                {downStations.length}
              </span>
            </button>
          </div>

          {/* 3. Vertical Stop Timeline (Naver Map Transit Style) */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 relative">
            {/* Continuous Vertical Line */}
            <div className="absolute left-[29px] top-4 bottom-4 w-0.5 bg-slate-200 -z-0" />

            {displayedStations.map((station) => {
              const isSelected = station.stationSeq === selectedStationSeq;
              const isTurn = station.isTurnPoint;
              const busesAtStop = busesByStationSeq[station.stationSeq] || [];

              return (
                <div
                  key={station.stationSeq}
                  onClick={() => setSelectedStationSeq(station.stationSeq)}
                  className={`group relative flex items-start gap-3.5 py-2 px-2 rounded-xl cursor-pointer transition ${
                    isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Timeline Node */}
                  <div className="relative z-10 mt-1">
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-black">
                        {station.stationSeq}
                      </div>
                    ) : isTurn ? (
                      <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-xs flex items-center justify-center text-white text-[8px] font-bold">
                        회
                      </div>
                    ) : (
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 transition ${
                          station.isNonStop
                            ? 'bg-slate-200 border-slate-300'
                            : 'bg-white border-rose-500 group-hover:bg-rose-50'
                        }`}
                      />
                    )}
                  </div>

                  {/* Stop Name & Badges & Favorite Star */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span
                          className={`text-xs tracking-tight ${
                            isSelected
                              ? 'font-black text-blue-900'
                              : 'font-semibold text-slate-800 group-hover:text-rose-600'
                          }`}
                        >
                          {station.stationName}
                        </span>
                        {isTurn && (
                          <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                            회차지
                          </span>
                        )}
                        {station.isNonStop && (
                          <span className="text-[10px] text-slate-400 font-medium">미정차</span>
                        )}
                      </div>
                      <button
                        title={isStationBookmarked(station.stationSeq) ? '즐겨찾기 해제' : '즐겨찾기 등록'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStationBookmark(station.stationSeq, station.stationName, station.direction);
                          setBookmarkVersion((v) => v + 1);
                        }}
                        className="p-1 text-slate-300 hover:text-amber-400 opacity-40 group-hover:opacity-100 transition shrink-0"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            isStationBookmarked(station.stationSeq)
                              ? 'text-amber-500 fill-amber-400 opacity-100'
                              : ''
                          }`}
                        />
                      </button>
                    </div>
                    {station.mobileNo && station.mobileNo !== '-' && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {station.mobileNo}
                      </div>
                    )}

                    {/* LIVE BUS BADGE AT THIS STOP */}
                    {busesAtStop.map((b) => {
                      const seats = b.remainSeatCnt;
                      const shortPlate = b.plateNo.replace(/[^0-9]/g, '').slice(-4) || b.plateNo;
                      return (
                        <div
                          key={b.plateNo}
                          className="mt-1.5 inline-flex items-center gap-1.5 bg-rose-600 text-white pl-2 pr-2.5 py-0.5 rounded-full shadow-md text-xs animate-fadeIn"
                        >
                          <Bus className="w-3 h-3 text-white" />
                          <span className="font-bold">{shortPlate}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full font-black text-[10px] ${
                              seats === 0
                                ? 'bg-white text-rose-700'
                                : seats <= 15
                                ? 'bg-amber-300 text-slate-900'
                                : 'bg-emerald-300 text-slate-900'
                            }`}
                          >
                            {seats === 0 ? '만차' : `${seats}석`}
                          </span>
                          {b.lowPlate && (
                            <span className="text-[9px] bg-white/20 px-1 rounded">저상</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. Commuter Boarding Prediction Widget (Fixed at bottom of left panel) */}
          <SimulationCard
            stations={stations}
            selectedStationSeq={selectedStationSeq}
            onSelectStation={(seq) => setSelectedStationSeq(seq)}
            queueCount={queueCount}
            onChangeQueueCount={(q) => setQueueCount(q)}
            simulationResult={simData || null}
            isLoading={isSimLoading}
            isFavorite={isStationBookmarked(selectedStationSeq)}
            onToggleFavorite={() => {
              const st = stations.find((s) => s.stationSeq === selectedStationSeq);
              if (st) {
                toggleStationBookmark(st.stationSeq, st.stationName, st.direction);
                setBookmarkVersion((v) => v + 1);
              }
            }}
          />
        </aside>

        {/* Center / Right: Interactive Map */}
        <main className="flex-1 h-full relative">
          <MapView
            stations={stations}
            busPath={busPath}
            liveBuses={liveBuses}
            selectedStationSeq={selectedStationSeq}
            onSelectStation={(seq) => setSelectedStationSeq(seq)}
          />
        </main>

        {/* Analytics & Favorites Modal */}
        <AnalyticsModal
          isOpen={isAnalyticsOpen}
          onClose={() => setIsAnalyticsOpen(false)}
          stations={stations}
          currentStationSeq={selectedStationSeq}
          onSelectStation={(seq) => {
            setSelectedStationSeq(seq);
            const st = stations.find((s) => s.stationSeq === seq);
            if (st?.direction) setActiveDirection(st.direction);
          }}
        />
      </div>

      {/* BYOK Key Setting Modal */}
      <ByokModal
        isOpen={isByokOpen}
        onClose={() => setIsByokOpen(false)}
        onSaved={() => {
          setHasApiKey(Boolean(getStoredApiKey()));
          refetchLive();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
