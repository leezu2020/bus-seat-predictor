import React from 'react';
import { SimulationResult, Station } from '../types';
import { Users, AlertTriangle, CheckCircle, Clock, Bus, ChevronRight, HelpCircle, Star } from 'lucide-react';

interface SimulationCardProps {
  stations: Station[];
  selectedStationSeq: number;
  onSelectStation: (seq: number) => void;
  queueCount: number;
  onChangeQueueCount: (q: number) => void;
  simulationResult: SimulationResult | null;
  isLoading: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export const SimulationCard: React.FC<SimulationCardProps> = ({
  stations,
  selectedStationSeq,
  queueCount,
  onChangeQueueCount,
  simulationResult,
  isLoading,
  isFavorite,
  onToggleFavorite,
}) => {
  const currentStation = stations.find((s) => s.stationSeq === selectedStationSeq);

  const getRiskBadge = (risk?: string) => {
    switch (risk) {
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> 탑승/착석 원활
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> 대기 권장 (보통)
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> 혼잡 (첫 차 만차 위험)
          </span>
        );
      case 'CRITICAL':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> 극심 (무정차 통과 위험)
          </span>
        );
    }
  };

  const p1 = simulationResult?.cumulativeSuccess.oneBus ?? 0;
  const p2 = simulationResult?.cumulativeSuccess.twoBuses ?? 0;
  const p3 = simulationResult?.cumulativeSuccess.threeBuses ?? 0;

  return (
    <div className="bg-white border-t border-slate-200 p-4 flex flex-col gap-3 shadow-lg">
      {/* Station Name & Risk Badge */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
              선택 정류소
            </span>
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
              {currentStation?.stationName || '정류소를 선택하세요'}
              {onToggleFavorite && currentStation && (
                <button
                  onClick={onToggleFavorite}
                  title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 등록 (최초 진입 시 자동 선택)'}
                  className="p-1 text-slate-300 hover:text-amber-500 transition hover:scale-110"
                >
                  <Star
                    className={`w-4 h-4 ${
                      isFavorite ? 'text-amber-500 fill-amber-400' : 'hover:text-amber-400'
                    }`}
                  />
                </button>
              )}
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {currentStation?.direction === 'UP' ? '안양역 방면' : '구리수택차고지 방면'} • 순번 #{currentStation?.stationSeq}
          </p>
        </div>
        {simulationResult && getRiskBadge(simulationResult.riskLevel)}
      </div>

      {/* Queue Counter Slider (Commuter Friendly) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-bold text-slate-700 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            내 앞 대기 줄 인원
          </span>
          <span className="font-extrabold text-blue-600 text-sm">{queueCount}명</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChangeQueueCount(Math.max(0, queueCount - 1))}
            className="w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm shadow-2xs"
          >
            -
          </button>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={queueCount}
            onChange={(e) => onChangeQueueCount(Number(e.target.value))}
            className="flex-1 accent-rose-600 cursor-pointer"
          />
          <button
            onClick={() => onChangeQueueCount(Math.min(30, queueCount + 1))}
            className="w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm shadow-2xs"
          >
            +
          </button>
        </div>
      </div>

      {/* Boarding Probabilities */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>도착 예정 버스별 탑승 예측</span>
          <span className="text-[11px] text-slate-400 font-normal">
            연산 지연: {simulationResult?.latencyMs ? `${simulationResult.latencyMs}ms` : '<10ms'}
          </span>
        </div>

        {/* Bus 1 */}
        <div className="border border-slate-200 rounded-lg p-2.5 bg-white flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1">
              <Bus className="w-3.5 h-3.5 text-rose-600" /> 첫 번째 버스
              {simulationResult?.buses[0] && (
                <span className="text-[10px] text-slate-500 font-normal">
                  ({simulationResult.buses[0].plateNo.replace(/[^0-9]/g, '').slice(-4)} •{' '}
                  {simulationResult.buses[0].stopsRemaining === 0
                    ? '곧 도착'
                    : `${simulationResult.buses[0].stopsRemaining}개 전`}
                  )
                </span>
              )}
            </span>
            <span
              className={`font-extrabold ${
                p1 === 0
                  ? 'text-rose-600'
                  : p1 >= 0.7
                  ? 'text-emerald-600'
                  : 'text-slate-900'
              }`}
            >
              {Math.round(p1 * 100)}% {p1 === 0 && <span className="text-[10px] font-bold text-rose-600">(만차 통과)</span>}
            </span>
          </div>
          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                p1 >= 0.8
                  ? 'bg-emerald-500'
                  : p1 >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.round(p1 * 100))}%` }}
            />
          </div>
          {simulationResult?.buses[0] && (
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                현재{' '}
                {simulationResult.buses[0].currentSeats === 0 ? (
                  <strong className="text-rose-600 font-bold">만차 (0석)</strong>
                ) : (
                  <strong className="text-slate-700">{simulationResult.buses[0].currentSeats}석</strong>
                )}
              </span>
              <span>
                도착 시 예상:{' '}
                {simulationResult.buses[0].predictedSeats === 0 ? (
                  <strong className="text-rose-600 font-bold">만차 (0석)</strong>
                ) : (
                  <strong className="text-slate-800">{simulationResult.buses[0].predictedSeats}석</strong>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Bus 2 & 3 Cumulative */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50/50 flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-medium flex items-center gap-1">
                2번째 누적
                {simulationResult?.buses[1] && (
                  <span className="text-[10px] text-slate-400">
                    ({simulationResult.buses[1].plateNo.replace(/[^0-9]/g, '').slice(-4)})
                  </span>
                )}
              </span>
              <strong className="text-slate-900">{Math.round(p2 * 100)}%</strong>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round(p2 * 100))}%` }}
              />
            </div>
            {simulationResult?.buses[1] && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                <span>{simulationResult.buses[1].stopsRemaining}개 전</span>
                <span>
                  {simulationResult.buses[1].currentSeats === 0 ? (
                    <span className="text-rose-500 font-semibold">만차 (0석)</span>
                  ) : (
                    `현재 ${simulationResult.buses[1].currentSeats}석`
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50/50 flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-medium flex items-center gap-1">
                3번째 누적
                {simulationResult?.buses[2] && (
                  <span className="text-[10px] text-slate-400">
                    ({simulationResult.buses[2].plateNo.replace(/[^0-9]/g, '').slice(-4)})
                  </span>
                )}
              </span>
              <strong className="text-slate-900">{Math.round(p3 * 100)}%</strong>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round(p3 * 100))}%` }}
              />
            </div>
            {simulationResult?.buses[2] && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                <span>{simulationResult.buses[2].stopsRemaining}개 전</span>
                <span>
                  {simulationResult.buses[2].currentSeats === 0 ? (
                    <span className="text-rose-500 font-semibold">만차 (0석)</span>
                  ) : (
                    `현재 ${simulationResult.buses[2].currentSeats}석`
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendation Text */}
      {simulationResult?.recommendation && (
        <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-blue-900 font-medium leading-relaxed">
          💡 {simulationResult.recommendation}
        </div>
      )}
    </div>
  );
};
