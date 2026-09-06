import {
  RoutePathResponse,
  LiveBusesResponse,
  TravelTimeResponse,
  SeatStatsResponse,
  SimulationResult,
  StationScheduleResponse,
  OdTravelTimeResponse,
} from '../types';

const RENDER_PROD_API = 'https://bus-seat-predictor-api.onrender.com';
const API_BASE = (
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
    : (import.meta.env.PROD ? RENDER_PROD_API : '')
) + '/api/v1';
export const STORAGE_KEY_BYOK = 'bus_byok_api_key';

export const DEFAULT_USER_KEY = 'CKyLU7WpUcNBXIUKMzYPM53tsCXlp1ybg7YxKmp1MHaItmBxnfGSKxXFKgkgWxRFcrRcgZ1vlySJ2LNc3OAYrg%3D%3D';

export function getStoredApiKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_BYOK);
    if (saved !== null && saved !== undefined) {
      return saved;
    }
    return DEFAULT_USER_KEY;
  } catch {
    return DEFAULT_USER_KEY;
  }
}

export function setStoredApiKey(key: string | null): void {
  try {
    if (key !== null && key !== undefined) {
      localStorage.setItem(STORAGE_KEY_BYOK, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_BYOK);
    }
  } catch (e) {
    console.error('Failed to store API key', e);
  }
}

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = getStoredApiKey();
  if (key) {
    headers['X-Public-API-Key'] = key;
  }
  return headers;
}

export async function fetchRoutePath(routeId: string = '234000050'): Promise<RoutePathResponse> {
  const res = await fetch(`${API_BASE}/routes/${routeId}/path`);
  if (!res.ok) throw new Error('노선 경로 데이터를 불러오지 못했습니다.');
  return res.json();
}

export async function fetchLiveBuses(routeId: string = '234000050'): Promise<LiveBusesResponse> {
  const res = await fetch(`${API_BASE}/routes/${routeId}/live`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('공공데이터포털 일일 호출 한도(Quota)가 초과되었습니다 (Error 22).');
    if (res.status === 401) throw new Error('등록되지 않은 공공데이터 API 키입니다 (Error 30).');
    throw new Error('실시간 버스 정보를 불러오지 못했습니다.');
  }
  return res.json();
}

export async function fetchTravelTime(routeId: string = '234000050'): Promise<TravelTimeResponse> {
  const res = await fetch(`${API_BASE}/analytics/travel-time?routeId=${routeId}`);
  if (!res.ok) throw new Error('통행 소요 시간 데이터를 불러오지 못했습니다.');
  return res.json();
}

export async function fetchSeatStats(
  routeId: string = '234000050',
  stationSeq: number,
  dayOfWeek: number = 1,
  timeBucket: number = 48
): Promise<any> {
  const res = await fetch(
    `${API_BASE}/analytics/stats/seats?routeId=${routeId}&stationSeq=${stationSeq}&dayOfWeek=${dayOfWeek}&timeBucket=${timeBucket}`
  );
  if (!res.ok) throw new Error('잔여좌석 통계를 불러오지 못했습니다.');
  return res.json();
}

export async function runSimulation(
  routeId: string = '234000050',
  targetStationSeq: number,
  waitingQueueCount: number,
  trackedBuses?: any[]
): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/simulation/boarding`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      routeId,
      targetStationSeq,
      waitingQueueCount,
      trackedBuses,
    }),
  });
  if (!res.ok) throw new Error('승차 시뮬레이션 연산에 실패했습니다.');
  return res.json();
}

export async function fetchStationScheduleStats(
  routeId: string = '234000050',
  stationSeq: number,
  dayOfWeek: number = 0,
  targetHour: number = 8
): Promise<StationScheduleResponse> {
  const res = await fetch(
    `${API_BASE}/analytics/station-schedule?routeId=${routeId}&stationSeq=${stationSeq}&dayOfWeek=${dayOfWeek}&targetHour=${targetHour}`
  );
  if (!res.ok) throw new Error('정류소 도착 예정 및 잔여좌석 통계를 불러오지 못했습니다.');
  return res.json();
}

export async function fetchOdTravelTime(
  routeId: string = '234000050',
  fromSeq: number,
  toSeq: number,
  dayOfWeek: number = 0
): Promise<OdTravelTimeResponse> {
  const res = await fetch(
    `${API_BASE}/analytics/od-travel-time?routeId=${routeId}&fromSeq=${fromSeq}&toSeq=${toSeq}&dayOfWeek=${dayOfWeek}`
  );
  if (!res.ok) throw new Error('구간 소요시간 통계를 불러오지 못했습니다.');
  return res.json();
}

export async function syncRecentRollingData(): Promise<{ status: string; message: string; metadata: any }> {
  const res = await fetch(`${API_BASE}/analytics/sync-recent-data`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('최근 3개월 실데이터 동기화에 실패했습니다.');
  return res.json();
}
