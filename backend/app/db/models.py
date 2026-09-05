from datetime import datetime
from sqlalchemy import Column, String, Integer, SmallInteger, Boolean, Numeric, DateTime, ForeignKey, PrimaryKeyConstraint, Index
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class DimRoute(Base):
    __tablename__ = "dim_routes"

    route_id = Column(String(20), primary_key=True)
    route_name = Column(String(50), nullable=False, index=True)
    route_type = Column(String(30), nullable=False)
    company_name = Column(String(50))
    start_station_name = Column(String(100))
    end_station_name = Column(String(100))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    stations = relationship("DimRouteStation", back_populates="route", cascade="all, delete-orphan")

class DimStation(Base):
    __tablename__ = "dim_stations"

    station_id = Column(String(20), primary_key=True)
    station_name = Column(String(100), nullable=False)
    mobile_no = Column(String(20))
    latitude = Column(Numeric(10, 7), nullable=False)
    longitude = Column(Numeric(10, 7), nullable=False)
    region_name = Column(String(30))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    route_stations = relationship("DimRouteStation", back_populates="station")

class DimRouteStation(Base):
    __tablename__ = "dim_route_stations"

    route_id = Column(String(20), ForeignKey("dim_routes.route_id", ondelete="CASCADE"), primary_key=True)
    station_id = Column(String(20), ForeignKey("dim_stations.station_id", ondelete="CASCADE"))
    station_seq = Column(SmallInteger, primary_key=True)
    distance_meter = Column(Integer, default=0)
    cumulative_distance_meter = Column(Integer, default=0)
    is_turn_point = Column(Boolean, default=False)

    route = relationship("DimRoute", back_populates="stations")
    station = relationship("DimStation", back_populates="route_stations")

class RawBusTelemetry(Base):
    __tablename__ = "raw_bus_telemetry"

    recorded_at = Column(DateTime(timezone=True), nullable=False)
    route_id = Column(String(20), nullable=False)
    plate_no = Column(String(20), nullable=False)
    station_id = Column(String(20), nullable=False)
    station_seq = Column(SmallInteger, nullable=False)
    remain_seat_cnt = Column(SmallInteger, nullable=False)  # -1 if unknown / non-provided
    is_end_bus = Column(Boolean, default=False)
    is_low_plate = Column(Boolean, default=False)
    speed_kmh = Column(Numeric(5, 2), default=0)

    __table_args__ = (
        PrimaryKeyConstraint("recorded_at", "route_id", "plate_no", "station_seq", name="pk_raw_bus_telemetry"),
        Index("idx_telemetry_route_time", "route_id", "recorded_at"),
        Index("idx_telemetry_station_time", "station_id", "recorded_at"),
    )

class AggHourlyTravelTime(Base):
    __tablename__ = "agg_hourly_travel_time"

    route_id = Column(String(20), primary_key=True)
    from_station_seq = Column(SmallInteger, primary_key=True)
    to_station_seq = Column(SmallInteger, primary_key=True)
    day_of_week = Column(SmallInteger, primary_key=True)  # 0: Sun, 1: Mon, ..., 6: Sat
    hour_of_day = Column(SmallInteger, primary_key=True)  # 0 ~ 23
    avg_duration_sec = Column(Integer, nullable=False)
    p80_duration_sec = Column(Integer, nullable=False)
    p50_duration_sec = Column(Integer, nullable=False)
    sample_count = Column(Integer, nullable=False)
