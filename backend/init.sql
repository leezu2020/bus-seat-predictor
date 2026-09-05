-- TimescaleDB and Bus Telemetry Database Initialization Script

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. Dim Routes (노선 마스터)
CREATE TABLE IF NOT EXISTS dim_routes (
    route_id VARCHAR(20) PRIMARY KEY,
    route_name VARCHAR(50) NOT NULL,
    route_type VARCHAR(30) NOT NULL,
    company_name VARCHAR(50),
    start_station_name VARCHAR(100),
    end_station_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dim_routes_name ON dim_routes (route_name);

-- 2. Dim Stations (정류소 마스터)
CREATE TABLE IF NOT EXISTS dim_stations (
    station_id VARCHAR(20) PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    mobile_no VARCHAR(20),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    region_name VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dim_stations_coords ON dim_stations (latitude, longitude);

-- 3. Dim Route Stations (노선 경유 정류소 순번 및 거리 매핑)
CREATE TABLE IF NOT EXISTS dim_route_stations (
    route_id VARCHAR(20) NOT NULL REFERENCES dim_routes(route_id) ON DELETE CASCADE,
    station_id VARCHAR(20) NOT NULL REFERENCES dim_stations(station_id) ON DELETE CASCADE,
    station_seq SMALLINT NOT NULL,
    distance_meter INT DEFAULT 0,
    cumulative_distance_meter INT DEFAULT 0,
    is_turn_point BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (route_id, station_seq)
);
CREATE INDEX IF NOT EXISTS idx_dim_route_stations_station ON dim_route_stations (station_id);

-- 4. Raw Bus Telemetry (1분 주기 원시 버스 운행 및 잔여석 로그)
CREATE TABLE IF NOT EXISTS raw_bus_telemetry (
    recorded_at TIMESTAMPTZ NOT NULL,
    route_id VARCHAR(20) NOT NULL,
    plate_no VARCHAR(20) NOT NULL,
    station_id VARCHAR(20) NOT NULL,
    station_seq SMALLINT NOT NULL,
    remain_seat_cnt SMALLINT NOT NULL,
    is_end_bus BOOLEAN DEFAULT FALSE,
    is_low_plate BOOLEAN DEFAULT FALSE,
    speed_kmh NUMERIC(5, 2) DEFAULT 0,
    CONSTRAINT pk_raw_bus_telemetry PRIMARY KEY (recorded_at, route_id, plate_no, station_seq)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_route_time ON raw_bus_telemetry (route_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_station_time ON raw_bus_telemetry (station_id, recorded_at DESC);

-- 하이퍼테이블 변환 (1일 청크)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('raw_bus_telemetry', by_range('recorded_at', INTERVAL '1 day'), if_not_exists => TRUE);
        
        -- 압축 설정 (7일 경과 데이터 컬럼 압축)
        ALTER TABLE raw_bus_telemetry SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'route_id, plate_no',
            timescaledb.compress_orderby = 'recorded_at DESC'
        );
        PERFORM add_compression_policy('raw_bus_telemetry', INTERVAL '7 days', if_not_exists => TRUE);
        
        -- 데이터 보존 정책 (90일 이후 자동 삭제)
        PERFORM add_retention_policy('raw_bus_telemetry', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB hypertable or policy setup deferred: %', SQLERRM;
END $$;

-- 5. Agg Hourly Travel Time (구간별, 요일별, 시간대별 소요시간 집계)
CREATE TABLE IF NOT EXISTS agg_hourly_travel_time (
    route_id VARCHAR(20) NOT NULL,
    from_station_seq SMALLINT NOT NULL,
    to_station_seq SMALLINT NOT NULL,
    day_of_week SMALLINT NOT NULL,  -- 0: Sun, 1: Mon, ..., 6: Sat
    hour_of_day SMALLINT NOT NULL,  -- 0 ~ 23
    avg_duration_sec INT NOT NULL,
    p80_duration_sec INT NOT NULL,
    p50_duration_sec INT NOT NULL,
    sample_count INT NOT NULL,
    PRIMARY KEY (route_id, from_station_seq, to_station_seq, day_of_week, hour_of_day)
);
