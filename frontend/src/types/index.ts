export interface Station {
  stationSeq: number;
  stationId: string;
  stationName: string;
  mobileNo?: string;
  latitude: number;
  longitude: number;
  distanceMeter: number;
  cumulativeDistanceMeter: number;
  isTurnPoint: boolean;
  direction?: 'UP' | 'DOWN';
  isNonStop?: boolean;
}

export interface RoutePathResponse {
  routeId: string;
  routeName: string;
  routeType: string;
  companyName: string;
  startStationName: string;
  endStationName: string;
  turningSeq?: number;
  firstTimeUp?: string;
  lastTimeUp?: string;
  firstTimeDown?: string;
  lastTimeDown?: string;
  intervalWeekday?: string;
  intervalWeekend?: string;
  stations: Station[];
  busPath?: [number, number][]; // [[lng, lat], ...]
}

export interface LiveBus {
  plateNo: string;
  stationId: string;
  stationSeq: number;
  stationName: string;
  latitude: number;
  longitude: number;
  remainSeatCnt: number;
  lowPlate: boolean;
  endBus?: boolean;
  speedKmh?: number;
  isSimulated?: boolean;
}

export interface LiveBusesResponse {
  routeId: string;
  routeName?: string;
  mode: string;
  buses: LiveBus[];
}

export interface SimulatedBusInfo {
  plateNo: string;
  currentStationSeq: number;
  currentStationName: string;
  currentSeats: number;
  predictedSeats: number;
  stopsRemaining: number;
  intervalProbabilities: number[];
  firstBusInstantSuccessProb?: number;
}

export interface SimulationResult {
  routeId: string;
  targetStationSeq: number;
  targetStationName: string;
  waitingQueueCount: number;
  latencyMs: number;
  buses: SimulatedBusInfo[];
  cumulativeSuccess: {
    oneBus: number;
    twoBuses: number;
    threeBuses: number;
  };
  expectedPassedBuses: number;
  passedBusesDistribution: {
    "0": number;
    "1": number;
    "2": number;
    "3_or_more": number;
  };
  recommendation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CorridorHeatmapItem {
  corridorId: number;
  corridorName: string;
  hour: number;
  medianDurationSec: number;
  p80DurationSec: number;
  boxPlot: [number, number, number, number, number];
}

export interface MareyPoint {
  timeMin: number;
  distKm: number;
  stationSeq: number;
  stationName: string;
  speedKmh: number;
}

export interface MareyRun {
  runId: string;
  plateNo: string;
  departureTime: string;
  points: MareyPoint[];
}

export interface TravelTimeResponse {
  routeId: string;
  corridors: { id: number; name: string; fromSeq: number; toSeq: number; baseSec: number }[];
  heatmap: CorridorHeatmapItem[];
  mareyRuns: MareyRun[];
  totalDistanceKm: number;
}

export interface SeatStatsResponse {
  routeId: string;
  stationSeq: number;
  distribution: {
    mean: number;
    variance: number;
    p10: number;
    p50: number;
    p90: number;
    fullProbability: number;
    sampleCount: number;
  };
  hourlyTrend: { hour: number; meanSeats: number; fullProbability: number }[];
}

export interface StationArrivalItem {
  runIndex: number;
  arrivalTime: string;
  meanSeats: number;
  p10Seats: number;
  p90Seats: number;
  fullBusRate: number;
  crowdLevel: 'COMFORTABLE' | 'MODERATE' | 'CROWDED' | 'FULL';
  sampleWeeks: number;
}

export interface StationScheduleResponse {
  routeId: string;
  stationSeq: number;
  stationName: string;
  direction: 'UP' | 'DOWN';
  dayOfWeek: number;
  targetHour: number;
  timeRangeStr: string;
  dayProfileTip?: string;
  rollingWindowDays?: number;
  windowStartDate?: string;
  windowEndDate?: string;
  lastUpdated?: string;
  arrivals: StationArrivalItem[];
  summary: {
    totalArrivals: number;
    avgHeadwayMin: number;
    avgSeats: number;
    sampleWeeks: number;
    samplePeriodStr?: string;
    windowStartDate?: string;
    windowEndDate?: string;
    lastUpdated?: string;
    dayProfileTip?: string;
  };
}

export interface OdHourlyPoint {
  hour: number;
  medianMinutes: number;
  p80Minutes: number;
  speedKmh: number;
}

export interface OdBenchmarkItem {
  label: string;
  medianMinutes: number;
  p80Minutes: number;
  delayVsNormalMin: number;
}

export interface OdTravelTimeResponse {
  routeId: string;
  fromStation: {
    stationSeq: number;
    stationName: string;
    direction: 'UP' | 'DOWN';
  };
  toStation: {
    stationSeq: number;
    stationName: string;
    direction: 'UP' | 'DOWN';
  };
  dayOfWeek: number;
  distanceKm: number;
  corridors: string[];
  dayProfileTip?: string;
  samplePeriodStr?: string;
  windowStartDate?: string;
  windowEndDate?: string;
  lastUpdated?: string;
  hourlyTrend: OdHourlyPoint[];
  benchmarks: {
    morningRush: OdBenchmarkItem;
    regularDay: OdBenchmarkItem;
    eveningRush: OdBenchmarkItem;
  };
}

export type BookmarkType = 'STATION' | 'PAIR';

export interface BookmarkItem {
  id: string;
  type: BookmarkType;
  title: string;
  stationSeq?: number;
  stationName?: string;
  direction?: 'UP' | 'DOWN';
  fromSeq?: number;
  fromName?: string;
  toSeq?: number;
  toName?: string;
  isDefault?: boolean;
}

