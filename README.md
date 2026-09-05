# 🚌 광역버스(1650번) 잔여좌석 예측 및 통행 분석 플랫폼

수도권 광역교통망의 입석 금지 규제 하에서 발생하는 정류소 도착 시점($t_1$) 잔여좌석 수급 불일치 및 현장 대기열($q$) 탈락 문제를 해결하기 위해 구축된 **머신러닝 & 이산 합성곱(Discrete Convolution) 기반 올인원 교통 관제 대시보드**입니다.

---

## 🎯 핵심 기능 및 특장점

1. **대상 노선 정밀 모델링**:
   - 경기 직행좌석버스 **1650번** (안양 호계동 ↔ 범계 ↔ 인덕원 ↔ 수도권제1순환고속도로 ↔ 송파 ↔ 잠실역)
   - 39개 정류소 실제 WGS84 위경도 좌표, 누적 주행 거리(km), 회차점(잠실역) 마스터 데이터 탑재.
2. **45개 피처 ML 앙상블 회귀 & 14구간 다항 분류기**:
   - 3종 트리 앙상블: `0.40 * HistGradientBoosting + 0.40 * ExtraTrees + 0.20 * LightGBM`
   - 저잔여 구간(0~10석) 1석 단위 고해상도 클래스 및 14구간 확률분포 추정 후 46개 이산 확률질량함수($P(S=s)$) 복원
   - **$P95 < 400\text{ms}$** 초고속 추론 지연시간 충족
3. **대기열($q$) 연동 다중 버스 이산 합성곱 시뮬레이터**:
   - $P(\text{Board } B_1 \mid q) = \sum_{s=q+1}^{45} P(S_{B_1} = s)$
   - 후속 차량 총 공급 좌석 $Z_k$에 대한 다중 버스 이산 합성곱 $(P_{X_1} * P_{X_2})(z)$ 연산
   - 첫 차 즉시 탑승 확률, 2대/3대 이내 누적 승차 확률, 예상 통과 대수($E[N_{pass}]$) 및 상황별 가이드 제공
4. **시공간 마레 다이어그램 (Marey Diagram)**:
   - Y축: 누적 거리(km) ↔ X축: 24시간 타임라인
   - 개별 운행 버스의 시공간 주행 궤적 스트링 시각화 (선의 기울기 = 속도, 정체 시 완만해짐)
   - 출퇴근 시간대 인덕원~청계 및 송파대로 병목 구간의 지연 파급 과정을 직관적으로 분석
5. **구간 소요 시간 히트맵 & 박스플롯 (ECharts)**:
   - 24시간 x 6대 핵심 구간별 중간값 소요 시간 매트릭스
   - 셀 클릭 시 90일 소요시간 변동 폭(최소, Q1, 중간값, Q3, 최대, 80분위수) 박스플롯 표출
6. **BYOK (Bring Your Own Key) 무상태 프록시**:
   - 공공데이터포털 API Key를 중앙 서버 DB나 로그에 절대 기록하지 않고 클라이언트 브라우저 로컬 스토리지에만 격리 보관
   - 쿼터 초과(에러 22) 및 미등록 키(에러 30) 감지 시 429/401 변환 및 모의 스트림 자동 페일오버

---

## 🏗️ 시스템 아키텍처

```
joyful-archimedes/
├── docker-compose.yml        # 공식 TimescaleDB (PostgreSQL 16) 하이퍼테이블 컨테이너
├── backend/
│   ├── init.sql              # TimescaleDB DDL (1일 청크, 7일 컬럼압축, 90일 보존)
│   ├── requirements.txt      # FastAPI, scikit-learn, lightgbm, sqlalchemy, pytest 등
│   ├── app/
│   │   ├── api/              # routes, live, analytics, simulation
│   │   ├── core/             # config, settings
│   │   ├── db/               # models, session
│   │   ├── ml/               # 45-feature extractor, ensemble models, convolution, train
│   │   └── services/         # gbis_client, mock_stream, seed_service
│   └── tests/                # 11개 단위 및 수학적 정합성 테스트 (100% 통과)
└── frontend/
    ├── src/
    │   ├── api/client.ts     # TanStack Query & BYOK 헤더 주입 클라이언트
    │   ├── components/       # Header, MapView(MapLibre GL), SimulationCard, MareyDiagram, TravelTimeHeatmap, ByokModal
    │   └── App.tsx           # 올인원 반응형 대시보드
```

---

## 🚀 실행 가이드

### 1. 백엔드 실행
```powershell
# 가상환경 활성화 및 백엔드 실행
.\run_backend.ps1
# 또는 직접 실행:
$env:PYTHONPATH = "backend"
backend\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- Swagger API 문서: `http://localhost:8000/docs`

### 2. 프런트엔드 실행
```powershell
.\run_frontend.ps1
# 또는:
cd frontend
npm run dev
```
- 웹 대시보드: `http://localhost:5173`

### 3. 단위 테스트 실행
```powershell
$env:PYTHONPATH = "backend"
backend\.venv\Scripts\pytest backend/tests -v
```
