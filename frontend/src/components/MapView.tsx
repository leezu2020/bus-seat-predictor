import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Station, LiveBus } from '../types';
import { LocateFixed, Bus, Layers } from 'lucide-react';

interface MapViewProps {
  stations: Station[];
  busPath?: [number, number][]; // [[lng, lat], ...]
  liveBuses: LiveBus[];
  selectedStationSeq: number;
  onSelectStation: (seq: number) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  stations,
  busPath,
  liveBuses,
  selectedStationSeq,
  onSelectStation,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const busMarkersRef = useRef<maplibregl.Marker[]>([]);
  const stationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hasFittedBoundsRef = useRef<boolean>(false);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [127.03, 37.45], // Center between Guri and Anyang
      zoom: 11,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      // Draw road-following polyline
      const lineCoords = (busPath && busPath.length > 0)
        ? busPath
        : stations.map((s) => [s.longitude, s.latitude]);

      if (lineCoords.length > 0) {
        map.addSource('route-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: lineCoords,
            },
          },
        });

        // Outer glow/casing
        map.addLayer({
          id: 'route-line-casing',
          type: 'line',
          source: 'route-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#f43f5e',
            'line-width': 7,
            'line-opacity': 0.25,
          },
        });

        // Core road line
        map.addLayer({
          id: 'route-line-core',
          type: 'line',
          source: 'route-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#e11d48', // Red bus transit color
            'line-width': 4,
          },
        });

        // Fit bounds once
        if (!hasFittedBoundsRef.current && lineCoords.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          lineCoords.forEach((coord) => bounds.extend(coord as [number, number]));
          map.fitBounds(bounds, { padding: 40 });
          hasFittedBoundsRef.current = true;
        }
      }
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [busPath, stations]);

  // Update Polyline when busPath changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    const lineCoords = (busPath && busPath.length > 0)
      ? busPath
      : stations.map((s) => [s.longitude, s.latitude]);

    const source = map.getSource('route-line') as maplibregl.GeoJSONSource;
    if (source && lineCoords.length > 0) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: lineCoords,
        },
      });
    }
  }, [busPath, stations]);

  // Update Station Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || stations.length === 0) return;

    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];

    stations.forEach((station) => {
      const isSelected = station.stationSeq === selectedStationSeq;
      const isTurn = station.isTurnPoint;

      const el = document.createElement('div');
      el.className = 'cursor-pointer flex flex-col items-center group';
      
      const dot = document.createElement('div');
      if (isSelected) {
        dot.className =
          'w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-lg shadow-blue-500/50 flex items-center justify-center text-[10px] font-black text-white ring-4 ring-blue-300 animate-bounce';
        dot.innerText = `${station.stationSeq}`;
      } else if (isTurn) {
        dot.className =
          'w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-md flex items-center justify-center text-[8px] font-bold text-white';
        dot.innerText = '회';
      } else {
        dot.className =
          'w-3 h-3 rounded-full bg-white border-2 border-rose-500 shadow-xs group-hover:scale-150 transition-transform';
      }

      el.appendChild(dot);

      // Tooltip label on hover or if selected
      if (isSelected || isTurn) {
        const label = document.createElement('div');
        label.className = `mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shadow-sm border ${
          isSelected
            ? 'bg-blue-600 text-white border-blue-700'
            : 'bg-white text-slate-800 border-slate-300'
        }`;
        label.innerText = station.stationName;
        el.appendChild(label);
      }

      el.addEventListener('click', () => {
        onSelectStation(station.stationSeq);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([station.longitude, station.latitude])
        .addTo(map);

      stationMarkersRef.current.push(marker);
    });
  }, [stations, selectedStationSeq, onSelectStation]);

  // Update Live Bus Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    busMarkersRef.current.forEach((m) => m.remove());
    busMarkersRef.current = [];

    liveBuses.forEach((bus) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer flex flex-col items-center group transition-transform hover:scale-110';

      const seats = bus.remainSeatCnt;
      let seatBadgeClass = 'bg-emerald-600 text-white';
      let seatText = `${seats}석`;

      if (seats === 0) {
        seatBadgeClass = 'bg-rose-600 text-white font-bold';
        seatText = '만차';
      } else if (seats <= 15) {
        seatBadgeClass = 'bg-amber-500 text-white';
      }

      // Compact vehicle number (e.g. 경기74사1068 -> 1068)
      const shortPlate = bus.plateNo.replace(/[^0-9]/g, '').slice(-4) || bus.plateNo;

      el.innerHTML = `
        <div class="flex items-center gap-1 bg-white border border-slate-300 rounded-full pl-1.5 pr-2 py-0.5 shadow-md">
          <div class="w-4 h-4 rounded-full bg-rose-600 flex items-center justify-center text-white text-[9px]">
            🚌
          </div>
          <span class="text-[11px] font-bold text-slate-800">${shortPlate}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.2 rounded-full ${seatBadgeClass}">${seatText}</span>
        </div>
        <div class="w-2 h-2 bg-rose-600 rotate-45 -mt-1 shadow-sm"></div>
      `;

      el.addEventListener('click', () => {
        onSelectStation(bus.stationSeq);
        map.flyTo({
          center: [bus.longitude, bus.latitude],
          zoom: 14,
          speed: 1.2,
        });
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([bus.longitude, bus.latitude])
        .addTo(map);

      busMarkersRef.current.push(marker);
    });
  }, [liveBuses, onSelectStation]);

  // Smooth pan to selected station
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const st = stations.find((s) => s.stationSeq === selectedStationSeq);
    if (st) {
      map.flyTo({
        center: [st.longitude, st.latitude],
        zoom: Math.max(map.getZoom(), 13),
        speed: 1.2,
      });
    }
  }, [selectedStationSeq, stations]);

  const handleResetBounds = () => {
    const map = mapInstance.current;
    if (!map) return;
    const lineCoords = (busPath && busPath.length > 0)
      ? busPath
      : stations.map((s) => [s.longitude, s.latitude]);

    if (lineCoords.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      lineCoords.forEach((coord) => bounds.extend(coord as [number, number]));
      map.fitBounds(bounds, { padding: 50, duration: 800 });
    }
  };

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full bg-slate-100" />
      
      {/* Floating Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={handleResetBounds}
          title="전체 노선 보기"
          className="p-2 bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
        >
          <LocateFixed className="w-4 h-4 text-rose-600" />
        </button>
      </div>

      {/* Naver Map Style Legend at Bottom-Left */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-md px-3 py-2 rounded-lg shadow-md border border-slate-200 text-[11px] text-slate-600 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>여유 (16석+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>보통 (1~15석)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
          <span>만차 (0석)</span>
        </div>
      </div>
    </div>
  );
};
