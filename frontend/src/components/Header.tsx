import React from 'react';
import { Bus, Key, RefreshCw, BarChart2, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onOpenByokModal: () => void;
  hasApiKey: boolean;
  isSimulatedMode: boolean;
  isFetching: boolean;
  liveBusCount: number;
  onRefresh: () => void;
  onToggleAnalytics: () => void;
  isAnalyticsOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenByokModal,
  hasApiKey,
  isSimulatedMode,
  isFetching,
  liveBusCount,
  onRefresh,
  onToggleAnalytics,
  isAnalyticsOpen,
}) => {
  return (
    <header className="px-2.5 sm:px-4 flex items-center justify-between h-14 bg-white border-b border-slate-200 z-30 select-none shadow-xs">
      {/* Left: Brand / Bus Info */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md shadow-xs">
          <Bus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="font-black text-xs sm:text-sm tracking-tight">1650</span>
        </div>
        <div className="hidden sm:flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">직행좌석 1650번</span>
            <span className="text-xs text-slate-500 font-medium">경기여객 (구리시)</span>
          </div>
          <span className="text-[11px] text-slate-400">구리수택차고지 ↔ 잠실역 ↔ 안양역</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Live Status Pill */}
        <div
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-semibold border ${
            !isSimulatedMode
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              !isSimulatedMode ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          {!isSimulatedMode ? (
            <>
              <span className="hidden sm:inline">GBIS 실시간 ({liveBusCount}대 운행)</span>
              <span className="sm:hidden font-bold">실시간 {liveBusCount}대</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">모의 스트림 ({liveBusCount}대)</span>
              <span className="sm:hidden font-bold">모의 {liveBusCount}대</span>
            </>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          title="새로고침"
          className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-xs flex items-center justify-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFetching ? 'animate-spin text-rose-600' : ''}`} />
        </button>

        {/* Analytics Drawer Toggle Button */}
        <button
          onClick={onToggleAnalytics}
          title="3개월 통행 분석 & 즐겨찾기"
          className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold transition shadow-xs border flex items-center gap-1.5 ${
            isAnalyticsOpen
              ? 'bg-rose-600 text-white border-rose-700 shadow-rose-500/20'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span className="hidden md:inline">3개월 통행 분석 & 즐겨찾기</span>
          <span className="hidden sm:inline md:hidden">통행분석</span>
        </button>

        {/* BYOK Button */}
        <button
          onClick={onOpenByokModal}
          title="API 키 관리"
          className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold transition shadow-xs border flex items-center gap-1.5 ${
            hasApiKey
              ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
          }`}
        >
          <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
          <span className="hidden sm:inline">{hasApiKey ? 'API 키 관리' : 'Key 등록'}</span>
        </button>
      </div>
    </header>
  );
};
