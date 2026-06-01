import { Body, Controller, Get, Headers, HttpException, Param, Patch, Post, Query } from "@nestjs/common";
import { ADMIN_ROLES, requireAuth } from "../auth/jwt";
import { queryRow, queryRows } from "../db/database";
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

  @Post("discover/waqi")
  async discoverWaqi(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    try {
      const result = await this.ingest.discoverWaqiStations();
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Discovery failed", 500);
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

  @Post("run/iqair")
  async triggerIqair(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    if (this.ingest.isRunning()) {
      throw new HttpException("Ingest already running", 409);
    }
    try {
      const result = await this.ingest.runIqair("manual");
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Ingest failed", 500);
    }
  }

  @Post("run/openweather")
  async triggerOpenweather(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    if (this.ingest.isRunning()) {
      throw new HttpException("Ingest already running", 409);
    }
    try {
      const result = await this.ingest.runOpenweather("manual");
      return { ok: true, ...result };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Ingest failed", 500);
    }
  }

  @Post("run/openaq")
  async triggerOpenaq(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    if (this.ingest.isRunning()) {
      throw new HttpException("Ingest already running", 409);
    }
    try {
      const result = await this.ingest.runOpenaq("manual");
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
       WHERE o.observed_at >= now() - (? || ' hours')::interval
         ${stationId ? "AND o.station_id = ?" : ""}
       ORDER BY o.station_id, hour DESC, sp.code
       LIMIT 500`,
      stationId ? [h, stationId] : [h],
    );
    return rows ?? [];
  }

  // ---------- Providers (CRUD) ----------
  // GET shape khớp với interface ProviderSummary ở air-quality-admin.

  @Get("providers")
  async providers(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows = await queryRows<Record<string, any>>(
      `SELECT
         sp.id::text                            AS "id",
         sp.code,
         sp.name,
         sp.category,
         sp.base_url                            AS "baseUrl",
         NULL::text                             AS "authType",
         NULL::int                              AS "rateLimitPerMinute",
         NULL::int                              AS "timeoutSeconds",
         sp.is_active                           AS "isActive",
         COALESCE(last_payload.fetched_at,
                  last_run.finished_at,
                  last_run.started_at,
                  sp.updated_at,
                  sp.created_at)                AS "lastFetchedAt",
         last_run.started_at                    AS "lastRunAt",
         last_run.status::text                  AS "lastRunStatus"
       FROM ingest.source_providers sp
       LEFT JOIN LATERAL (
         SELECT pr.started_at, pr.finished_at, pr.status
         FROM ingest.outbound_requests req
         JOIN ingest.pipeline_runs pr ON pr.id = req.pipeline_run_id
         WHERE req.source_provider_id = sp.id
         ORDER BY pr.started_at DESC
         LIMIT 1
       ) last_run ON TRUE
       LEFT JOIN LATERAL (
         SELECT fetched_at
         FROM ingest.raw_payloads rp
         WHERE rp.source_provider_id = sp.id
         ORDER BY fetched_at DESC
         LIMIT 1
       ) last_payload ON TRUE
       ORDER BY sp.code`,
    );
    return rows ?? [];
  }

  @Patch("providers/:id")
  async updateProvider(
    @Headers("authorization") authHeader: string | undefined,
    @Param("id") id: string,
    @Body()
    body: {
      isActive?: boolean;
      timeoutSeconds?: number;
      rateLimitPerMinute?: number;
      config?: Record<string, any>;
    },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const row = await queryRow<Record<string, any>>(
      `UPDATE ingest.source_providers
       SET
         is_active = COALESCE(?, is_active),
         config = CASE WHEN ?::jsonb IS NULL THEN config ELSE config || ?::jsonb END,
         updated_at = now()
       WHERE id = ?::uuid
       RETURNING
         id::text                     AS "id",
         code,
         name,
         category,
         base_url                     AS "baseUrl",
         NULL::text                   AS "authType",
         NULL::int                    AS "rateLimitPerMinute",
         NULL::int                    AS "timeoutSeconds",
         is_active                    AS "isActive",
         updated_at                   AS "lastFetchedAt",
         updated_at                   AS "lastRunAt",
         NULL::text                   AS "lastRunStatus"`,
      [id, body.isActive, body.config ? JSON.stringify(body.config) : null],
    );
    if (!row) throw new HttpException("Provider not found", 404);
    return row;
  }

  // ---------- Endpoints (CRUD) ----------

  @Get("endpoints")
  async endpoints(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows = await queryRows<Record<string, any>>(
      `SELECT
         se.id::text                         AS "id",
         sp.code                             AS "providerCode",
         se.code,
         se.name,
         COALESCE(se.kind::text, 'unknown')  AS kind,
         se.http_method                      AS "httpMethod",
         se.path,
         se.schedule_expression              AS "scheduleExpression",
         se.parser_key                       AS "parserKey",
         se.is_active                        AS "isActive",
         se.updated_at                       AS "updatedAt"
       FROM ingest.source_endpoints se
       JOIN ingest.source_providers sp ON sp.id = se.provider_id
       ORDER BY sp.code, se.code`,
    );
    return rows ?? [];
  }

  @Patch("endpoints/:id")
  async updateEndpoint(
    @Headers("authorization") authHeader: string | undefined,
    @Param("id") id: string,
    @Body()
    body: {
      isActive?: boolean;
      scheduleExpression?: string;
      parserKey?: string;
      config?: Record<string, any>;
    },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const row = await queryRow<Record<string, any>>(
      `UPDATE ingest.source_endpoints
       SET
         is_active = COALESCE(?, is_active),
         schedule_expression = COALESCE(?, schedule_expression),
         parser_key = COALESCE(?, parser_key),
         config = CASE WHEN ?::jsonb IS NULL THEN config ELSE config || ?::jsonb END,
         updated_at = now()
       WHERE id = ?::uuid
       RETURNING
         id::text                         AS "id",
         (SELECT code FROM ingest.source_providers WHERE id = provider_id) AS "providerCode",
         code,
         name,
         COALESCE(kind::text, 'unknown')  AS kind,
         http_method                      AS "httpMethod",
         path,
         schedule_expression              AS "scheduleExpression",
         parser_key                       AS "parserKey",
         is_active                        AS "isActive",
         updated_at                       AS "updatedAt"`,
      [
        id,
        body.isActive,
        body.scheduleExpression,
        body.parserKey,
        body.config ? JSON.stringify(body.config) : null,
      ],
    );
    if (!row) throw new HttpException("Endpoint not found", 404);
    return row;
  }

  // ---------- Source bindings (CRUD) ----------

  @Get("source-bindings")
  async sourceBindings(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows = await queryRows<Record<string, any>>(
      `SELECT
         ssb.id::text                  AS "id",
         s.id::text                    AS "stationId",
         s.name                        AS "stationName",
         sp.code                       AS "providerCode",
         se.code                       AS "endpointCode",
         ssb.external_object_id        AS "externalObjectId",
         ssb.priority,
         ssb.is_enabled                AS "isEnabled",
         ssb.valid_from                AS "validFrom",
         ssb.valid_to                  AS "validTo",
         ssb.updated_at                AS "updatedAt"
       FROM ingest.station_source_bindings ssb
       JOIN catalog.stations s        ON s.id = ssb.station_id
       JOIN ingest.source_endpoints se ON se.id = ssb.source_endpoint_id
       JOIN ingest.source_providers sp ON sp.id = ssb.source_provider_id
       ORDER BY s.name, ssb.priority, se.code`,
    );
    return rows ?? [];
  }

  @Patch("source-bindings/:id")
  async updateSourceBinding(
    @Headers("authorization") authHeader: string | undefined,
    @Param("id") id: string,
    @Body()
    body: {
      isEnabled?: boolean;
      priority?: number;
      validTo?: string | null;
      config?: Record<string, any>;
    },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const row = await queryRow<Record<string, any>>(
      `UPDATE ingest.station_source_bindings ssb
       SET
         is_enabled = COALESCE(?, is_enabled),
         priority   = COALESCE(?, priority),
         valid_to   = COALESCE(?::timestamptz, valid_to),
         config     = CASE WHEN ?::jsonb IS NULL THEN config ELSE config || ?::jsonb END,
         updated_at = now()
       WHERE ssb.id = ?::uuid
       RETURNING
         ssb.id::text                                                        AS "id",
         (SELECT s.id::text FROM catalog.stations s WHERE s.id = ssb.station_id) AS "stationId",
         (SELECT s.name      FROM catalog.stations s WHERE s.id = ssb.station_id) AS "stationName",
         (SELECT sp.code FROM ingest.source_providers sp WHERE sp.id = ssb.source_provider_id) AS "providerCode",
         (SELECT se.code FROM ingest.source_endpoints se WHERE se.id = ssb.source_endpoint_id) AS "endpointCode",
         ssb.external_object_id                                              AS "externalObjectId",
         ssb.priority,
         ssb.is_enabled                                                      AS "isEnabled",
         ssb.valid_from                                                      AS "validFrom",
         ssb.valid_to                                                        AS "validTo",
         ssb.updated_at                                                      AS "updatedAt"`,
      [
        id,
        body.isEnabled,
        body.priority,
        body.validTo,
        body.config ? JSON.stringify(body.config) : null,
      ],
    );
    if (!row) throw new HttpException("Source binding not found", 404);
    return row;
  }

  // ---------- Pipeline runs (list) ----------
  //
  // Trả về detail counts (requests / payloads / normalized / analysis /
  // prediction). Admin UI hiển thị trong trang "Data Ops".

  @Get("pipeline-runs")
  async pipelineRuns(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const rows = await queryRows<Record<string, any>>(
      `SELECT
         pr.id::text                                   AS "id",
         COALESCE(pd.code, se.code, 'unknown')         AS "pipelineCode",
         pr.status::text                               AS status,
         pr.trigger_type                               AS "triggerType",
         pr.started_at                                 AS "startedAt",
         pr.finished_at                                AS "finishedAt",
         se.code                                       AS "endpointCode",
         pr.error_summary                              AS "errorSummary",
         COALESCE(req.request_count, 0)                AS "requestCount",
         COALESCE(payloads.payload_count, 0)           AS "payloadCount",
         COALESCE(norm.normalize_count, 0)             AS "normalizeCount",
         COALESCE(analysis.analysis_count, 0)          AS "analysisCount",
         COALESCE(pred.prediction_count, 0)            AS "predictionCount"
       FROM ingest.pipeline_runs pr
       LEFT JOIN ingest.pipeline_definitions pd ON pd.id = pr.pipeline_definition_id
       LEFT JOIN ingest.source_endpoints se     ON se.id = pr.source_endpoint_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS request_count
         FROM ingest.outbound_requests x WHERE x.pipeline_run_id = pr.id
       ) req ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS payload_count
         FROM ingest.raw_payloads x WHERE x.pipeline_run_id = pr.id
       ) payloads ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS normalize_count
         FROM ingest.normalize_runs x WHERE x.pipeline_run_id = pr.id
       ) norm ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS analysis_count
         FROM analytics.analysis_runs x WHERE x.pipeline_run_id = pr.id
       ) analysis ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS prediction_count
         FROM forecast.prediction_runs x WHERE x.pipeline_run_id = pr.id
       ) pred ON TRUE
       ORDER BY pr.started_at DESC
       LIMIT 50`,
    );
    return rows ?? [];
  }

  // ---------- Status (simple recent runs, dùng cho health check) ----------

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
        SELECT id, status, trigger_type, started_at, finished_at, metrics AS stats, error_summary AS error_message
        FROM ingest.pipeline_runs
        ORDER BY started_at DESC
        LIMIT 20
      `)) ?? [];
    return { running: this.ingest.isRunning(), recent_runs: rows };
  }
}
