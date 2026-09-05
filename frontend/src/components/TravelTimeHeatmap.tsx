import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { CorridorHeatmapItem } from '../types';
import { Clock, TrendingUp, Info } from 'lucide-react';

interface TravelTimeHeatmapProps {
  corridors: { id: number; name: string; fromSeq: number; toSeq: number; baseSec: number }[];
  heatmapData: CorridorHeatmapItem[];
}

export const TravelTimeHeatmap: React.FC<TravelTimeHeatmapProps> = ({ corridors, heatmapData }) => {
  const [selectedCell, setSelectedCell] = useState<CorridorHeatmapItem | null>(null);

  const hours = Array.from({ length: 24 }, (_, i) => `${i}시`);
  const corridorNames = corridors.map((c) => c.name);

  // Heatmap matrix format: [hourIndex, corridorIndex, valueInMinutes]
  const data = heatmapData.map((item) => {
    const cIdx = corridors.findIndex((c) => c.id === item.corridorId);
    const minutes = Math.round(item.medianDurationSec / 60);
    return [item.hour, cIdx, minutes, item];
  });

  const heatmapOption = {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      backgroundColor: '#0f172a',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: any) => {
        const d = params.data;
        if (!d) return '';
        const item = d[3] as CorridorHeatmapItem;
        return `
          <div style="font-weight:bold;color:#38bdf8;margin-bottom:4px;">${item.corridorName}</div>
          <div>시간대: <strong>${item.hour}시</strong></div>
          <div>중간값 소요시간: <strong>${Math.floor(item.medianDurationSec / 60)}분 ${item.medianDurationSec % 60}초</strong></div>
          <div>상위 80% 승객 소요: <strong>${Math.floor(item.p80DurationSec / 60)}분 ${item.p80DurationSec % 60}초</strong></div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">클릭하여 90일 소요시간 박스플롯 보기</div>
        `;
      },
    },
    grid: {
      top: 20,
      right: 20,
      bottom: 60,
      left: 170,
    },
    xAxis: {
      type: 'category',
      data: hours,
      splitArea: { show: true, areaStyle: { color: ['rgba(30,41,59,0.2)', 'transparent'] } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'category',
      data: corridorNames,
      splitArea: { show: true },
      axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 500 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    visualMap: {
      min: 5,
      max: 30,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 5,
      text: ['정체(30분+)', '원활(5분)'],
      textStyle: { color: '#94a3b8' },
      inRange: {
        color: ['#065f46', '#0284c7', '#d97706', '#dc2626'],
      },
    },
    series: [
      {
        name: '소요시간(분)',
        type: 'heatmap',
        data,
        label: {
          show: false,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.8)',
            borderColor: '#ffffff',
            borderWidth: 1.5,
          },
        },
      },
    ],
  };

  const onChartClick = (params: any) => {
    if (params.data && params.data[3]) {
      setSelectedCell(params.data[3]);
    }
  };

  // Boxplot chart option for selected corridor
  const boxplotOption = selectedCell
    ? {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 30, left: 60 },
        xAxis: {
          type: 'category',
          data: [`${selectedCell.hour}시`],
          axisLabel: { color: '#cbd5e1' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          name: '소요시간(분)',
          axisLabel: { color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
          splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        },
        series: [
          {
            name: '소요시간 분포',
            type: 'boxplot',
            data: [
              selectedCell.boxPlot.map((sec) => Math.round(sec / 60)), // [min, Q1, median, Q3, max] in minutes
            ],
            itemStyle: {
              color: '#38bdf8',
              borderColor: '#0284c7',
              borderWidth: 2,
            },
          },
        ],
      }
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              주요 구간별 통행 소요 시간 히트맵
            </h3>
            <p className="text-xs text-slate-400">
              최근 3개월 시계열 궤적 데이터로부터 집계된 시간대별 중간값 소요 시간 매트릭스
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          <span>셀을 클릭하면 과거 90일 변동 분포(박스플롯)가 표출됩니다</span>
        </div>
      </div>

      <div className="w-full h-[380px]">
        <ReactECharts
          option={heatmapOption}
          style={{ height: '100%', width: '100%' }}
          onEvents={{ click: onChartClick }}
        />
      </div>

      {/* Selected Boxplot Modal / Detail Panel */}
      {selectedCell && (
        <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="space-y-1.5 flex-1">
            <div className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
              과거 90일 소요시간 통계 상세
            </div>
            <div className="text-base font-bold text-white">
              {selectedCell.corridorName} ({selectedCell.hour}시 버킷)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">최소 소요:</span>
                <strong className="text-emerald-400 font-mono">
                  {Math.round(selectedCell.boxPlot[0] / 60)}분
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">중간값 (50%):</span>
                <strong className="text-sky-400 font-mono">
                  {Math.round(selectedCell.boxPlot[2] / 60)}분
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">지연 지표 (P80):</span>
                <strong className="text-amber-400 font-mono">
                  {Math.round(selectedCell.p80DurationSec / 60)}분
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">최대 지체:</span>
                <strong className="text-rose-400 font-mono">
                  {Math.round(selectedCell.boxPlot[4] / 60)}분
                </strong>
              </div>
            </div>
          </div>

          <div className="w-48 h-28 flex-shrink-0">
            {boxplotOption && (
              <ReactECharts
                option={boxplotOption}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
