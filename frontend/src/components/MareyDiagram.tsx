import React from 'react';
import ReactECharts from 'echarts-for-react';
import { MareyRun } from '../types';
import { Activity, Info } from 'lucide-react';

interface MareyDiagramProps {
  runs: MareyRun[];
  totalDistanceKm: number;
}

export const MareyDiagram: React.FC<MareyDiagramProps> = ({ runs, totalDistanceKm }) => {
  // Format minutes to HH:mm
  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Build ECharts series from Marey runs
  const series = runs.map((run, idx) => {
    // Highlight rush hour runs
    const isRushRun = (run.departureTime >= '07:00' && run.departureTime <= '09:00') ||
                      (run.departureTime >= '17:30' && run.departureTime <= '19:30');

    const data = run.points.map((p) => [p.timeMin, p.distKm, p.stationName, p.speedKmh, run.plateNo]);

    return {
      name: `${run.plateNo} (${run.departureTime} 발)`,
      type: 'line',
      showSymbol: false,
      hoverAnimation: true,
      lineStyle: {
        width: isRushRun ? 2.5 : 1.5,
        color: isRushRun ? '#f43f5e' : '#38bdf8',
        opacity: isRushRun ? 0.9 : 0.6,
      },
      emphasis: {
        lineStyle: {
          width: 4,
          color: '#fbbf24',
          shadowColor: 'rgba(251, 191, 36, 0.5)',
          shadowBlur: 10,
        },
      },
      data,
    };
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0f172a',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: any) => {
        const d = params.data;
        if (!d) return '';
        const timeStr = formatTime(d[0]);
        return `
          <div style="font-weight:bold;color:#38bdf8;margin-bottom:4px;">${d[4]}</div>
          <div>정류소: <strong>${d[2]}</strong></div>
          <div>통과 시각: <strong>${timeStr}</strong></div>
          <div>누적 거리: ${d[1]} km</div>
          <div>통행 속도: <strong style="color:${d[3] < 25 ? '#f43f5e' : '#10b981'}">${d[3]} km/h</strong></div>
        `;
      },
    },
    grid: {
      top: 40,
      right: 30,
      bottom: 50,
      left: 70,
    },
    xAxis: {
      type: 'value',
      name: '운행 시각 (24H)',
      nameLocation: 'middle',
      nameGap: 30,
      min: 300, // 05:00
      max: 1320, // 22:00
      interval: 60,
      axisLabel: {
        formatter: (val: number) => formatTime(val),
        color: '#94a3b8',
      },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: '기점 기준 누적 거리 (km)',
      min: 0,
      max: Math.ceil(totalDistanceKm || 54),
      axisLabel: {
        color: '#94a3b8',
        formatter: '{value} km',
      },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
    },
    // Shaded areas for morning and evening rush congestion
    series: [
      {
        type: 'line',
        markArea: {
          silent: true,
          itemStyle: {
            color: 'rgba(244, 63, 94, 0.08)',
          },
          data: [
            [
              { name: '출근 첨두 (07:00 ~ 09:30)', xAxis: 420 },
              { xAxis: 570 },
            ],
            [
              { name: '퇴근 첨두 (17:30 ~ 20:00)', xAxis: 1050 },
              { xAxis: 1200 },
            ],
          ],
        },
      },
      ...series,
    ],
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              시공간 마레 다이어그램 (Marey Diagram)
            </h3>
            <p className="text-xs text-slate-400">
              수직 Y축: 누적 거리(km) ↔ 수평 X축: 24시간 타임라인. 선의 기울기가 완만할수록 정체 구간입니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
            <span className="w-3 h-0.5 bg-rose-500" /> 출퇴근 첨두 차량
          </span>
          <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
            <span className="w-3 h-0.5 bg-sky-400" /> 일반 시간대 차량
          </span>
        </div>
      </div>

      <div className="w-full h-[450px] relative">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-200">다이어그램 해석:</strong> 출근 시간대(07:30~08:45) 인덕원역~청계영업소 진입 구간과 송파대로 진입 구간에서 선의 기울기가 수평에 가깝게 누워있는 형상을 볼 수 있으며, 이는 급격한 통행 속도 저하(18 km/h 이하)와 승객 승하차에 따른 장시간 지연을 의미합니다.
        </div>
      </div>
    </div>
  );
};
