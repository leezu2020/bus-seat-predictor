import React, { useState, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import {
  Station,
  StationScheduleResponse,
  OdTravelTimeResponse,
  BookmarkItem,
} from '../types';
import {
  getBookmarks,
  toggleStationBookmark,
  togglePairBookmark,
  setAsDefault,
  removeBookmark,
  isStationBookmarked,
  isPairBookmarked,
} from '../utils/favorites';
import {
  X,
  Clock,
  TrendingUp,
  Star,
  Bus,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  fetchStationScheduleStats,
  fetchOdTravelTime,
  syncRecentRollingData,
} from '../api/client';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stations: Station[];
  currentStationSeq: number;
  onSelectStation: (seq: number) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: '월' },
  { value: 1, label: '화' },
  { value: 2, label: '수' },
  { value: 3, label: '목' },
  { value: 4, label: '금' },
  { value: 5, label: '토' },
  { value: 6, label: '일' },
];

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  stations,
  currentStationSeq,
  onSelectStation,
}) => {
  const [activeTab, setActiveTab] = useState<'SCHEDULE' | 'OD_TRAVEL'>('SCHEDULE');
  const [selectedDay, setSelectedDay] = useState<number>(0); // Monday default
  const [targetHour, setTargetHour] = useState<number>(8); // 08:00 default
  const [activeStationSeq, setActiveStationSeq] = useState<number>(currentStationSeq);

  // OD pair state
  const [fromSeq, setFromSeq] = useState<number>(currentStationSeq);
  const [toSeq, setToSeq] = useState<number>(() => {
    // Default to Jamsil station if fromSeq <= 44, or Anyang station if fromSeq > 44
    if (currentStationSeq <= 44) {
      const jamsil = stations.find((s) => s.stationName.includes('잠실역'));
      return jamsil?.stationSeq || (stations.length > 20 ? 16 : 1);
    } else {
      const jamsil = stations.find((s) => s.stationName.includes('잠실역') && s.stationSeq > 44);
      return jamsil?.stationSeq || 76;
    }
  });

  // Bookmarks reactive state
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);

  const refreshBookmarks = () => {
    setBookmarks(getBookmarks());
  };

  useEffect(() => {
    refreshBookmarks();
  }, [isOpen]);

  useEffect(() => {
    setActiveStationSeq(currentStationSeq);
  }, [currentStationSeq]);

  const currentStation = stations.find((s) => s.stationSeq === activeStationSeq);
  const fromStation = stations.find((s) => s.stationSeq === fromSeq);
  const toStation = stations.find((s) => s.stationSeq === toSeq);

  const isCurrentStationFav = isStationBookmarked(activeStationSeq);
  const isCurrentPairFav = isPairBookmarked(fromSeq, toSeq);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // 1. Fetch Station Schedule Stats
  const { data: scheduleData, isLoading: isScheduleLoading, refetch: refetchSchedule } = useQuery<StationScheduleResponse>({
    queryKey: ['stationSchedule', activeStationSeq, selectedDay, targetHour],
    queryFn: () => fetchStationScheduleStats('234000050', activeStationSeq, selectedDay, targetHour),
    enabled: isOpen && activeTab === 'SCHEDULE',
  });

  // 2. Fetch OD Travel Time
  const { data: odData, isLoading: isOdLoading, refetch: refetchOd } = useQuery<OdTravelTimeResponse>({
    queryKey: ['odTravelTime', fromSeq, toSeq, selectedDay],
    queryFn: () => fetchOdTravelTime('234000050', fromSeq, toSeq, selectedDay),
    enabled: isOpen && activeTab === 'OD_TRAVEL',
  });

  const handleSyncRollingData = async () => {
    try {
      setIsSyncing(true);
      await syncRecentRollingData();
      await Promise.all([refetchSchedule(), refetchOd()]);
      setSyncSuccessMsg('최근 3개월 실데이터 롤링 갱신 완료!');
      setTimeout(() => setSyncSuccessMsg(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle station bookmark toggle
  const handleToggleStationFav = () => {
    if (!currentStation) return;
    toggleStationBookmark(currentStation.stationSeq, currentStation.stationName, currentStation.direction);
    refreshBookmarks();
  };

  // Handle pair bookmark toggle
  const handleTogglePairFav = () => {
    if (!fromStation || !toStation) return;
    togglePairBookmark(fromStation.stationSeq, fromStation.stationName, toStation.stationSeq, toStation.stationName);
    refreshBookmarks();
  };

  // Swap OD
  const handleSwapOd = () => {
    const temp = fromSeq;
    setFromSeq(toSeq);
    setToSeq(temp);
  };

  // Apply a bookmark
  const handleApplyBookmark = (b: BookmarkItem) => {
    if (b.type === 'STATION' && b.stationSeq) {
      setActiveStationSeq(b.stationSeq);
      onSelectStation(b.stationSeq);
      setActiveTab('SCHEDULE');
    } else if (b.type === 'PAIR' && b.fromSeq && b.toSeq) {
      setFromSeq(b.fromSeq);
      setToSeq(b.toSeq);
      onSelectStation(b.fromSeq);
      setActiveTab('OD_TRAVEL');
    }
  };

  // ECharts Option for 24h OD Travel Time
  const odChartOption = useMemo(() => {
    if (!odData || !odData.hourlyTrend) return {};

    const hours = odData.hourlyTrend.map((p) => `${p.hour}시`);
    const medianData = odData.hourlyTrend.map((p) => p.medianMinutes);
    const p80Data = odData.hourlyTrend.map((p) => p.p80Minutes);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#1e293b', fontSize: 12 },
        formatter: (params: any) => {
          const hour = params[0]?.name;
          const med = params[0]?.value;
          const p80 = params[1]?.value;
          return `
            <div style="font-weight:bold;margin-bottom:4px;color:#0f172a;">${hour} 출발 기준 소요시간</div>
            <div style="display:flex;justify-content:space-between;gap:12px;">
              <span style="color:#2563eb;">• 예상 중간값:</span>
              <strong>${med}분</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px;">
              <span style="color:#f59e0b;">• 정체 시 상위 80%:</span>
              <strong>${p80}분</strong>
            </div>
          `;
        },
      },
      legend: {
        data: ['예상 소요시간(중간값)', '정체 시 상위 80% 소요시간'],
        bottom: 0,
        textStyle: { color: '#64748b', fontSize: 11 },
      },
      grid: {
        top: 25,
        left: 45,
        right: 20,
        bottom: 40,
      },
      xAxis: {
        type: 'category',
        data: hours,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 10, interval: 2 },
      },
      yAxis: {
        type: 'value',
        name: '소요(분)',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b', fontSize: 11 },
      },
      series: [
        {
          name: '예상 소요시간(중간값)',
          type: 'line',
          smooth: true,
          data: medianData,
          itemStyle: { color: '#2563eb' },
          lineStyle: { width: 2.5 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(37, 99, 235, 0.25)' },
                { offset: 1, color: 'rgba(37, 99, 235, 0.02)' },
              ],
            },
          },
        },
        {
          name: '정체 시 상위 80% 소요시간',
          type: 'line',
          smooth: true,
          data: p80Data,
          itemStyle: { color: '#f59e0b' },
          lineStyle: { width: 2, type: 'dashed' },
        },
      ],
    };
  }, [odData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-extrabold text-sm shadow-2xs border border-rose-100">
              <Bus className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white">
                  1650번
                </span>
                <h2 className="text-base font-black text-slate-900">
                  맞춤 통행 & 잔여좌석 분석실
                </h2>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  (최근 3개월 시계열 빅데이터)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                정류소별 3개월 도착주기·잔여좌석 및 출퇴근 두 정류소 간 요일별 실제 과거 소요시간
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                3개월 롤링: <strong>{scheduleData?.windowStartDate || '최근 90일'} ~ {scheduleData?.windowEndDate || '오늘'}</strong>
              </span>
            </div>
            <button
              onClick={handleSyncRollingData}
              disabled={isSyncing}
              title="최근 실데이터 3개월치로 롤링 갱신"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-rose-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? '갱신 중...' : '실데이터 갱신'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Success Alert */}
        {syncSuccessMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-1.5 text-xs text-emerald-800 font-bold flex items-center gap-1.5 animate-fadeIn">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {syncSuccessMsg}
          </div>
        )}

        {/* Quick Bookmarks Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="font-bold text-slate-600 flex items-center gap-1 shrink-0">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            내 즐겨찾기:
          </span>
          {bookmarks.length === 0 ? (
            <span className="text-slate-400">등록된 즐겨찾기가 없습니다. 별표(★)를 눌러 등록해보세요!</span>
          ) : (
            bookmarks.map((b) => (
              <div
                key={b.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-all ${
                  b.isDefault
                    ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
                onClick={() => handleApplyBookmark(b)}
              >
                <span>{b.title}</span>
                {b.isDefault && (
                  <span className="text-[9px] bg-rose-600 text-white px-1 py-0.2 rounded-full font-bold">
                    기본
                  </span>
                )}
                <button
                  title="즐겨찾기 삭제"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBookmark(b.id);
                    refreshBookmarks();
                  }}
                  className="text-slate-300 hover:text-slate-500 ml-0.5"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {/* Main Tab Bar */}
        <div className="border-b border-slate-200 bg-white px-4 flex items-center gap-6">
          <button
            onClick={() => setActiveTab('SCHEDULE')}
            className={`py-3 text-sm font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'SCHEDULE'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            [1] 정류소별 도착 예정 & 잔여좌석 (최근 3개월)
          </button>
          <button
            onClick={() => setActiveTab('OD_TRAVEL')}
            className={`py-3 text-sm font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'OD_TRAVEL'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            [2] 두 정류장 구간 소요시간 분석 (출발 ↔ 도착)
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {/* TAB 1: 정류소별 도착예정 & 잔여좌석 */}
          {activeTab === 'SCHEDULE' && (
            <div className="flex flex-col gap-4">
              {/* Controls Bar: Station Selector + Day of Week + Target Hour */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                {/* Station Selection */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 shrink-0">분석 정류소:</span>
                  <select
                    value={activeStationSeq}
                    onChange={(e) => {
                      const seq = Number(e.target.value);
                      setActiveStationSeq(seq);
                      onSelectStation(seq);
                    }}
                    className="bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs rounded-lg px-2.5 py-1.5 focus:outline-rose-500 max-w-[240px]"
                  >
                    {stations.map((s) => (
                      <option key={s.stationSeq} value={s.stationSeq}>
                        #{s.stationSeq} {s.stationName} ({s.direction === 'UP' ? '안양역행' : '구리행'})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleToggleStationFav}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition-all ${
                      isCurrentStationFav
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        isCurrentStationFav ? 'text-amber-500 fill-amber-400' : 'text-slate-400'
                      }`}
                    />
                    {isCurrentStationFav ? '즐겨찾기됨' : '즐겨찾기'}
                  </button>
                </div>

                {/* Day of Week Selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500 mr-1 shrink-0">요일:</span>
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDay(d.value)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                        selectedDay === d.value
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Target Hour Picker */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500 shrink-0">기준 시각:</span>
                  <select
                    value={targetHour}
                    onChange={(e) => setTargetHour(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs rounded-lg px-2 py-1.5 focus:outline-rose-500"
                  >
                    {Array.from({ length: 19 }, (_, i) => i + 5).map((h) => (
                      <option key={h} value={h}>
                        {h < 10 ? `0${h}:00` : `${h}:00`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Station Meta & 3-Month Summary Box */}
              {scheduleData && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold">분석 시간대 범위</span>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                      {scheduleData.timeRangeStr}
                    </p>
                    <span className="text-[10px] text-blue-600">기준 시각 전후 1시간</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold">예상 도착 버스 수</span>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                      총 {scheduleData.summary.totalArrivals}대
                    </p>
                    <span className="text-[10px] text-emerald-600">
                      평균 배차 ~{scheduleData.summary.avgHeadwayMin}분
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold">해당 시간대 평균 잔여석</span>
                    <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                      {scheduleData.summary.avgSeats}석
                    </p>
                    <span className="text-[10px] text-slate-500">
                      최근 3개월(12주) {DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label}요일 기준
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">안내</span>
                    <p className="text-[11px] text-slate-600 font-medium leading-tight">
                      좌석 1석 이하는 만차 통과 확률이 매우 높으므로 여유 버스 탑승을 권장합니다.
                    </p>
                  </div>
                </div>
              )}

              {/* Day-of-Week Tip Banner */}
              {scheduleData?.dayProfileTip && (
                <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-rose-50/60 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 shadow-2xs">
                  <div className="p-1 rounded-lg bg-amber-500/10 text-amber-700 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-extrabold text-amber-900 mr-1.5">[3개월 통계 인사이트]</span>
                    {scheduleData.dayProfileTip}
                  </div>
                </div>
              )}

              {/* Arrivals Timetable Card List */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                    예상 도착 시각별 3개월 평균 잔여석 및 만차율
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {scheduleData?.arrivals.length || 0}개 버스 운행 기록 집계 (12주 표본)
                  </span>
                </div>

                {isScheduleLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                    <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                    <span>최근 3개월(12주)간의 정류소 도착 통계를 집계하고 있습니다...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {scheduleData?.arrivals.map((arr) => {
                      const isFull = arr.crowdLevel === 'FULL';
                      const isCrowded = arr.crowdLevel === 'CROWDED';
                      const isModerate = arr.crowdLevel === 'MODERATE';

                      return (
                        <div
                          key={arr.runIndex}
                          className={`p-3 rounded-xl border transition-all ${
                            isFull
                              ? 'bg-rose-50/50 border-rose-200'
                              : isCrowded
                              ? 'bg-amber-50/40 border-amber-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-black text-slate-900 flex items-center gap-1">
                              <Bus className={`w-3.5 h-3.5 ${isFull ? 'text-rose-600' : 'text-slate-600'}`} />
                              {arr.arrivalTime} 도착
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                isFull
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                  : isCrowded
                                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                  : isModerate
                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                              }`}
                            >
                              {isFull
                                ? '만차 위험'
                                : isCrowded
                                ? '혼잡'
                                : isModerate
                                ? '보통'
                                : '여유'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-500">평균 잔여좌석</span>
                            <span className={`font-extrabold ${isFull ? 'text-rose-600' : 'text-slate-900'}`}>
                              {arr.meanSeats === 0 ? '만차 (0석)' : `${arr.meanSeats}석`}
                            </span>
                          </div>

                          {/* Seat progress bar */}
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                            <div
                              className={`h-full rounded-full ${
                                isFull ? 'bg-rose-500' : isCrowded ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.round((arr.meanSeats / 45) * 100))}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>범위: {arr.p10Seats}~{arr.p90Seats}석</span>
                            <span className={arr.fullBusRate >= 0.7 ? 'text-rose-600 font-bold' : ''}>
                              만차 발생률 {Math.round(arr.fullBusRate * 100)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 두 정류장 구간 소요시간 분석 */}
          {activeTab === 'OD_TRAVEL' && (
            <div className="flex flex-col gap-4">
              {/* Origin-Destination Selection Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                {/* From Station */}
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs font-bold text-slate-500 shrink-0">출발:</span>
                  <select
                    value={fromSeq}
                    onChange={(e) => setFromSeq(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs rounded-lg px-2.5 py-1.5 focus:outline-rose-500"
                  >
                    {stations.map((s) => (
                      <option key={s.stationSeq} value={s.stationSeq}>
                        #{s.stationSeq} {s.stationName} ({s.direction === 'UP' ? '안양역행' : '구리행'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap button */}
                <button
                  onClick={handleSwapOd}
                  className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"
                  title="출발/도착 반전"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>

                {/* To Station */}
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs font-bold text-slate-500 shrink-0">도착:</span>
                  <select
                    value={toSeq}
                    onChange={(e) => setToSeq(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs rounded-lg px-2.5 py-1.5 focus:outline-rose-500"
                  >
                    {stations.map((s) => (
                      <option key={s.stationSeq} value={s.stationSeq}>
                        #{s.stationSeq} {s.stationName} ({s.direction === 'UP' ? '안양역행' : '구리행'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Day of Week Selector */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-bold text-slate-500 mr-1 shrink-0">요일:</span>
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDay(d.value)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                        selectedDay === d.value
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Bookmark Button */}
                <button
                  onClick={handleTogglePairFav}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0 transition-all ${
                    isCurrentPairFav
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      isCurrentPairFav ? 'text-amber-500 fill-amber-400' : 'text-slate-400'
                    }`}
                  />
                  {isCurrentPairFav ? '구간 즐겨찾기됨' : '출퇴근 구간 즐겨찾기'}
                </button>
              </div>

              {/* Day-of-Week OD Tip Banner */}
              {odData?.dayProfileTip && (
                <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/70 to-sky-50/60 border border-blue-200/80 rounded-xl p-3 flex items-start gap-2.5 shadow-2xs">
                  <div className="p-1 rounded-lg bg-blue-500/10 text-blue-700 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-extrabold text-blue-900 mr-1.5">[3개월 구간 통행 인사이트]</span>
                    {odData.dayProfileTip}
                  </div>
                </div>
              )}

              {/* 3 Major Commute Benchmarks */}
              {odData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white border border-rose-200 rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-rose-700 mb-1">
                      <span>🌅 {odData.benchmarks.morningRush.label}</span>
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-bold">
                        +{odData.benchmarks.morningRush.delayVsNormalMin}분 지연
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-1">
                      {odData.benchmarks.morningRush.medianMinutes}분
                      <span className="text-xs font-normal text-slate-500 ml-1.5">
                        (정체 시 최대 {odData.benchmarks.morningRush.p80Minutes}분)
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>☀️ {odData.benchmarks.regularDay.label}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold">
                        원활 기준
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-1">
                      {odData.benchmarks.regularDay.medianMinutes}분
                      <span className="text-xs font-normal text-slate-500 ml-1.5">
                        (정체 시 {odData.benchmarks.regularDay.p80Minutes}분)
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-amber-200 rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-700 mb-1">
                      <span>🌆 {odData.benchmarks.eveningRush.label}</span>
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded font-bold">
                        +{odData.benchmarks.eveningRush.delayVsNormalMin}분 지연
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-1">
                      {odData.benchmarks.eveningRush.medianMinutes}분
                      <span className="text-xs font-normal text-slate-500 ml-1.5">
                        (정체 시 최대 {odData.benchmarks.eveningRush.p80Minutes}분)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 24-Hour Travel Time ECharts Curve */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                      24시간 시간대별 이동 소요시간 추이 (이동 거리: {odData?.distanceKm} km)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      최근 3개월(12주)간의 실제 시공간 주행 궤적 기반 중간값 및 안전 여유 소요시간
                    </p>
                  </div>
                  {odData?.corridors && odData.corridors.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end">
                      <span className="text-[10px] text-slate-400 font-semibold">통과 주요 구간:</span>
                      {odData.corridors.map((c, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isOdLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>최근 3개월간의 구간 소요시간 통계를 산출하고 있습니다...</span>
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ReactECharts
                      option={odChartOption}
                      style={{ height: '100%', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>💡 브라우저에 저장된 즐겨찾기 정류소는 다음 접속 시 자동으로 선택됩니다.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-2xs transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
