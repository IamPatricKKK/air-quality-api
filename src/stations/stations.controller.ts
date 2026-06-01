import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { EntityManager } from "@mikro-orm/postgresql";
import { Station, Area, AirQualityObservation } from "../entities";

type LatestRow = {
  station_id: string;
  station_code: string;
  station_name: string;
  area_name: string | null;
  is_active: boolean;
  lat: number;
  lng: number;
  aqi: number;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_speed_mps: number | null;
  observed_at: string;
  quality_status: string | null;
};

function mapStation(row: LatestRow) {
  return {
    id: row.station_id,
    name: row.station_name,
    region: row.area_name ?? row.station_code,
    city: row.area_name ?? row.station_code,
    lat: row.lat,
    lng: row.lng,
    waqi_station_id: null,
    is_active: row.is_active,
    aqi: row.aqi,
    category: row.quality_status ?? null,
    pm25: row.pm25 ?? 0,
    pm10: row.pm10 ?? 0,
    o3: row.o3 ?? 0,
    no2: row.no2 ?? 0,
    so2: row.so2 ?? 0,
    co: row.co ?? 0,
    temperature: row.temperature_c ?? 0,
    humidity: row.humidity_pct ?? 0,
    wind_speed: row.wind_speed_mps ?? 0,
    recorded_at: row.observed_at,
  };
}

@Controller("stations")
export class StationsController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async getStations() {
    const rows: any = await this.em.getConnection().execute(`
      SELECT
        latest.station_id,
        latest.station_code,
        latest.station_name,
        latest.is_active,
        latest.lat,
        latest.lng,
        latest.aqi,
        latest.pm25,
        latest.pm10,
        latest.o3,
        latest.no2,
        latest.so2,
        latest.co,
        latest.temperature_c,
        latest.humidity_pct,
        latest.wind_speed_mps,
        latest.observed_at,
        latest.quality_status,
        area.name AS area_name
      FROM app.v_station_latest_air_quality latest
      LEFT JOIN catalog.areas area ON area.id = latest.area_id
      WHERE latest.observed_at IS NOT NULL
      ORDER BY station_name
    `);
    return (rows ?? []).map(mapStation);
  }

  @Get(":id/history")
  async getStationHistory(@Param("id") id: string, @Query("hours") hours?: string) {
    const limitHours = Number(hours ?? 24);
    const rows = await this.em.getConnection().execute<{
      recorded_at: string;
      aqi: number;
      pm25: number | null;
      pm10: number | null;
      o3: number | null;
      no2: number | null;
    }>(
      `
      SELECT observed_at AS recorded_at, aqi, pm25, pm10, o3, no2
      FROM core.air_quality_observations
      WHERE station_id = ?
        AND observed_at >= now() - (?::text || ' hours')::interval
      ORDER BY observed_at ASC
      `,
      [id, limitHours],
    );
    return rows ?? [];
  }

  @Get(":id/history.csv")
  async exportHistoryCsv(
    @Param("id") id: string,
    @Query("hours") hours: string | undefined,
    @Res() res: Response,
  ) {
    const limitHours = Math.min(Math.max(Number(hours ?? 24), 1), 24 * 30);
    const stationRows = await this.em.getConnection().execute<{ code: string; name: string }>(
      `SELECT code, name FROM catalog.stations WHERE id = ? LIMIT 1`,
      [id],
    );
    const station = stationRows?.[0];
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    const rows = await this.em.getConnection().execute<{
      observed_at: string;
      aqi: number;
      pm25: number | null;
      pm10: number | null;
      o3: number | null;
      no2: number | null;
      so2: number | null;
      co: number | null;
    }>(
      `SELECT observed_at, aqi, pm25, pm10, o3, no2, so2, co
       FROM core.air_quality_observations
       WHERE station_id = ?
         AND observed_at >= now() - (?::text || ' hours')::interval
       ORDER BY observed_at ASC`,
      [id, limitHours],
    );

    const header = "observed_at,aqi,pm25,pm10,o3,no2,so2,co\n";
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const body = list
      .map((r) =>
        [
          r.observed_at,
          r.aqi ?? "",
          r.pm25 ?? "",
          r.pm10 ?? "",
          r.o3 ?? "",
          r.no2 ?? "",
          r.so2 ?? "",
          r.co ?? "",
        ].join(","),
      )
      .join("\n");

    const filename = `air-quality-${station.code}-${limitHours}h.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("﻿" + header + body);
  }

  @Get(":id/analytics")
  async getStationAnalytics(@Param("id") id: string) {
    const rows = await this.em.getConnection().execute<any>(
      `SELECT * FROM app.v_station_analytics WHERE station_id = ?`,
      [id],
    );
    const row = rows?.[0];
    if (!row) throw new NotFoundException(`Station ${id} not found`);
    return {
      station: { id: row.station_id, code: row.station_code, name: row.station_name },
      current: {
        aqi: row.current_aqi,
        category: row.current_category,
        pm25: row.pm25,
        pm10: row.pm10,
        o3: row.o3,
        no2: row.no2,
        so2: row.so2,
        co: row.co,
        temperature: row.temperature_c,
        humidity: row.humidity_pct,
        wind_speed: row.wind_speed_mps,
        observed_at: row.observed_at,
      },
      summary_24h: {
        samples: Number(row.samples_24h ?? 0),
        aqi_avg: row.aqi_avg !== null ? Number(row.aqi_avg) : null,
        aqi_min: row.aqi_min,
        aqi_max: row.aqi_max,
        pm25_avg: row.pm25_avg !== null ? Number(row.pm25_avg) : null,
        pm10_avg: row.pm10_avg !== null ? Number(row.pm10_avg) : null,
        category: row.avg_category_24h,
      },
      forecast: {
        slope_per_hour:
          row.forecast_slope_per_hour !== null ? Number(row.forecast_slope_per_hour) : null,
        aqi_next_1h: row.aqi_next_1h,
        aqi_next_3h: row.aqi_next_3h,
        aqi_next_6h: row.aqi_next_6h,
        category_6h: row.forecast_category_6h,
      },
    };
  }
}
