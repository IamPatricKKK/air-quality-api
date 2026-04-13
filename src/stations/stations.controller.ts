import { Controller, Get, Param, Query } from "@nestjs/common";
import { stationHistory, stations } from "../mock/mock.data";
import { queryRows } from "../db/database";

@Controller("stations")
export class StationsController {
  @Get()
  async getStations() {
    const rows = await queryRows<{
      station_id: string;
      station_code: string;
      station_name: string;
      lat: number;
      lng: number;
      aqi: number | null;
      pm25: number | null;
      pm10: number | null;
      o3: number | null;
      no2: number | null;
      so2: number | null;
      co: number | null;
      temperature_c: number | null;
      humidity_pct: number | null;
      wind_speed_mps: number | null;
      observed_at: string | null;
    }>(`
      SELECT *
      FROM app.v_station_latest_air_quality
      ORDER BY station_name
    `);

    if (rows) {
      return rows.map((row) => ({
        id: row.station_id,
        name: row.station_name,
        region: "N/A",
        city: "N/A",
        lat: row.lat,
        lng: row.lng,
        waqi_station_id: null,
        is_active: true,
        aqi: row.aqi ?? 0,
        pm25: row.pm25 ?? 0,
        pm10: row.pm10 ?? 0,
        o3: row.o3 ?? 0,
        no2: row.no2 ?? 0,
        so2: row.so2 ?? 0,
        co: row.co ?? 0,
        temperature: row.temperature_c ?? 0,
        humidity: row.humidity_pct ?? 0,
        wind_speed: row.wind_speed_mps ?? 0,
        recorded_at: row.observed_at ?? new Date().toISOString(),
      }));
    }

    return stations;
  }

  @Get(":id/history")
  async getStationHistory(@Param("id") id: string, @Query("hours") hours?: string) {
    const limitHours = Number(hours ?? 24);
    const rows = await queryRows<{
      recorded_at: string;
      aqi: number;
      pm25: number | null;
      pm10: number | null;
    }>(`
      SELECT
        observed_at AS recorded_at,
        aqi,
        pm25,
        pm10
      FROM core.air_quality_observations
      WHERE station_id = $1
        AND observed_at >= now() - ($2::text || ' hours')::interval
      ORDER BY observed_at ASC
    `, [id, limitHours]);

    if (rows) {
      return rows;
    }

    return stationHistory[id] ?? [];
  }
}
