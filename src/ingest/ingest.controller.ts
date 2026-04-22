import { Controller, Get, Headers, HttpException, Post, Query } from "@nestjs/common";
import { ADMIN_ROLES, requireAuth } from "../auth/jwt";
import { queryRows } from "../db/database";
import { IngestService } from "./ingest.service";

@Controller("ingest")
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post("run")
  async trigger(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    if (this.ingest.isRunning()) {
      throw new HttpException("Ingest already running", 409);
    }
    try {
      const result = await this.ingest.runAll("manual");
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Ingest failed", 500);
    }
  }

  @Post("run/waqi")
  async triggerWaqi(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    if (this.ingest.isRunning()) {
      throw new HttpException("Ingest already running", 409);
    }
    try {
      const result = await this.ingest.runWaqi("manual");
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Ingest failed", 500);
    }
  }

  @Get("source-compare")
  async sourceCompare(
    @Headers("authorization") authHeader?: string,
    @Query("stationId") stationId?: string,
    @Query("hours") hours?: string,
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const h = Math.min(168, Math.max(1, Number(hours) || 24));
    const rows = await queryRows<{
      station_id: string;
      station_name: string;
      hour: string;
      provider_code: string;
      aqi: number | null;
      pm25: number | null;
      pm10: number | null;
      o3: number | null;
      no2: number | null;
      so2: number | null;
      co: number | null;
      fetched_at: string;
    }>(
      `SELECT
         o.station_id,
         s.name AS station_name,
         date_trunc('hour', o.observed_at) AS hour,
         sp.code AS provider_code,
         o.aqi, o.pm25, o.pm10, o.o3, o.no2, o.so2, o.co,
         o.fetched_at
       FROM core.air_quality_observations o
       JOIN ingest.source_providers sp ON sp.id = o.source_provider_id
       JOIN catalog.stations s ON s.id = o.station_id
       WHERE o.observed_at >= now() - ($1 || ' hours')::interval
         ${stationId ? "AND o.station_id = $2" : ""}
       ORDER BY o.station_id, hour DESC, sp.code
       LIMIT 500`,
      stationId ? [h, stationId] : [h],
    );
    return rows ?? [];
  }

  @Get("providers")
  async providers(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows = await queryRows<{
      id: string;
      code: string;
      name: string;
      category: string;
      base_url: string;
      is_active: boolean;
    }>(`SELECT id, code, name, category, base_url, is_active FROM ingest.source_providers ORDER BY code`);
    return rows ?? [];
  }

  @Get("status")
  async status(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows =
      (await queryRows<{
        id: string;
        status: string;
        trigger_type: string;
        started_at: string;
        finished_at: string | null;
        stats: any;
        error_message: string | null;
      }>(`
        SELECT id, status, trigger_type, started_at, finished_at, stats, error_message
        FROM ingest.pipeline_runs
        ORDER BY started_at DESC
        LIMIT 20
      `)) ?? [];
    return { running: this.ingest.isRunning(), recent_runs: rows };
  }
}
