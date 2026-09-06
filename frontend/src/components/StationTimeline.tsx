import React from 'react';
import { Station, LiveBus } from '../types';
import { isStationBookmarked, toggleStationBookmark } from '../utils/favorites';
import { Bus, Star } from 'lucide-react';

export interface StationTimelineProps {
  stations: Station[];
  selectedStationSeq: number | null;
  onSelectStation: (seq: number) => void;
  busesByStationSeq: Map<number, LiveBus[]> | Record<number, LiveBus[]>;
  favorites?: number[];
  onToggleFavorite?: (seq: number) => void;
  className?: string;
}

export const StationTimeline = React.forwardRef<HTMLDivElement, StationTimelineProps>(
  (
    {
      stations,
      selectedStationSeq,
      onSelectStation,
      busesByStationSeq,
      favorites,
      onToggleFavorite,
      className = '',
    },
    ref
  ) => {
    const getBuses = (seq: number): LiveBus[] => {
      if (!busesByStationSeq) return [];
      if (busesByStationSeq instanceof Map) {
        return busesByStationSeq.get(seq) || [];
      }
      return busesByStationSeq[seq] || [];
    };

    const isFav = (seq: number): boolean => {
      if (favorites) {
        return favorites.includes(seq);
      }
      return isStationBookmarked(seq);
    };

    const handleToggleFavorite = (e: React.MouseEvent, station: Station) => {
      e.stopPropagation();
      if (onToggleFavorite) {
        onToggleFavorite(station.stationSeq);
      } else {
        toggleStationBookmark(station.stationSeq, station.stationName, station.direction);
      }
    };

    return (
      <div
        ref={ref}
        className={`flex-1 overflow-y-auto px-4 py-3 space-y-0.5 relative select-none ${className}`}
      >
        {/* Continuous Vertical Line */}
        <div className="absolute left-[29px] top-4 bottom-4 w-0.5 bg-slate-200 -z-0" />

        {stations.map((station) => {
          const isSelected = station.stationSeq === selectedStationSeq;
          const isTurn = station.isTurnPoint;
          const busesAtStop = getBuses(station.stationSeq);
          const bookmarked = isFav(station.stationSeq);

          return (
            <div
              key={station.stationSeq}
              onClick={() => onSelectStation(station.stationSeq)}
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
                    type="button"
                    title={bookmarked ? '즐겨찾기 해제' : '즐겨찾기 등록'}
                    onClick={(e) => handleToggleFavorite(e, station)}
                    className="p-1 text-slate-300 hover:text-amber-400 opacity-40 group-hover:opacity-100 transition shrink-0"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        bookmarked
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
    );
  }
);

StationTimeline.displayName = 'StationTimeline';
