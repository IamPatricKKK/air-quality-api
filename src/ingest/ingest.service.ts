import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import {
  AQ_BASE_URL,
  AQ_ENDPOINT_CODE,
  AQ_PARSER_KEY,
  AQ_PATH,
  AqPoint,
  DEFAULT_AQ_FIELDS,
  DEFAULT_WEATHER_FIELDS,
  OPENMETEO_PROVIDER_BASE_URL,
  OPENMETEO_PROVIDER_CATEGORY,
  OPENMETEO_PROVIDER_CODE,
  OPENMETEO_PROVIDER_NAME,
  WEATHER_BASE_URL,
  WEATHER_ENDPOINT_CODE,
  WEATHER_PARSER_KEY,
  WEATHER_PATH,
  WeatherPoint,
  buildAqUrl,
  buildWeatherUrl,
  fetchOpenMeteo,
  normalizeAq,
  normalizeWeather,
  sha256Hex,
} from "./openmeteo";
import {
  WAQI_PROVIDER_CODE,
  WAQI_PROVIDER_NAME,
  WAQI_PROVIDER_CATEGORY,
  WAQI_PROVIDER_BASE_URL,
  WAQI_ENDPOINT_CODE,
  WAQI_PARSER_KEY,
  buildWaqiFeedUrl,
  fetchWaqi,
  normalizeWaqiAq,
} from "./waqi";
import {
  IQAIR_PROVIDER_CODE,
  IQAIR_PROVIDER_NAME,
  IQAIR_PROVIDER_CATEGORY,
  IQAIR_PROVIDER_BASE_URL,
  IQAIR_NEAREST_CITY_ENDPOINT_CODE,
  IQAIR_NEAREST_CITY_PARSER_KEY,
  IQAIR_NEAREST_CITY_PATH,
  buildIqairNearestCityUrl,
  fetchIqair,
  normalizeIqairAq,
  normalizeIqairWeather,
} from "./iqair";
import {
  OPENWEATHER_PROVIDER_CODE,
  OPENWEATHER_PROVIDER_NAME,
  OPENWEATHER_PROVIDER_CATEGORY,
  OPENWEATHER_PROVIDER_BASE_URL,
  OPENWEATHER_AIR_POLLUTION_ENDPOINT_CODE,
  OPENWEATHER_AIR_POLLUTION_PARSER_KEY,
  OPENWEATHER_AIR_POLLUTION_PATH,
  OPENWEATHER_WEATHER_ENDPOINT_CODE,
  OPENWEATHER_WEATHER_PARSER_KEY,
  OPENWEATHER_WEATHER_PATH,
  buildOpenweatherAirPollutionUrl,
  buildOpenweatherWeatherUrl,
  fetchOpenweather,
  normalizeOpenweatherAq,
  normalizeOpenweatherWeather,
} from "./openweather";
import {
  OPENAQ_PROVIDER_CODE,
  OPENAQ_PROVIDER_NAME,
  OPENAQ_PROVIDER_CATEGORY,
  OPENAQ_PROVIDER_BASE_URL,
  OPENAQ_ENDPOINT_CODE,
  OPENAQ_PARSER_KEY,
  buildOpenaqNearestLocationUrl,
  buildOpenaqLatestUrl,
  fetchOpenaq,
  normalizeOpenaqAq,
  parseNearestLocationId,
} from "./openaq";
import {
  SourceProvider,
  SourceEndpoint,
  StationSourceBinding,
  PipelineRun,
  OutboundRequest,
  RawPayload,
  NormalizeRun,
  AirQualityObservation,
  WeatherObservation,
  Station,
} from "../entities";

interface StationRow {
  id: string;
  code: string;
  lat: number;
  lng: number;
  timezone: string | null;
}

export interface SyncResult {
  pipeline_run_id: string;
  stations: number;
  aq_points: number;
  weather_points: number;
  errors: string[];
}

export interface MultiSyncResult {
  openmeteo: SyncResult | null;
  waqi: SyncResult | null;
  iqair: SyncResult | null;
  openweather: SyncResult | null;
  openaq: SyncResult | null;
  total_aq_points: number;
  total_weather_points: number;
  total_errors: string[];
}

function pastHours(): number {
  const v = Number(process.env.OPENMETEO_PAST_HOURS ?? 24);
  return Math.min(168, Math.max(1, Number.isFinite(v) ? v : 24));
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly runningProviders = new Set<string>();

  constructor(
    private readonly em: EntityManager,
    private readonly realtime: RealtimeGateway,
  ) {}

  isRunning(provider?: string) {
    if (provider) return this.runningProviders.has(provider);
    return this.runningProviders.size > 0;
  }

  async ensureProviderAndEndpoints() {
    // Upsert provider using raw SQL (ON CONFLICT support)
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_providers (code, name, category, base_url, is_active, config)
       VALUES (?,?,?,?,TRUE,?::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [OPENMETEO_PROVIDER_CODE, OPENMETEO_PROVIDER_NAME, OPENMETEO_PROVIDER_CATEGORY, OPENMETEO_PROVIDER_BASE_URL, '{}'],
    );

    const provider = await this.em.findOne(
      SourceProvider,
      { code: OPENMETEO_PROVIDER_CODE },
    );
    if (!provider) throw new Error("Failed to ensure provider");
    const providerId = provider.id;

    const upsertEndpoint = async (
      code: string,
      name: string,
      baseUrl: string,
      path: string,
      parserKey: string,
      kind: string = 'air_quality',
    ) => {
      await this.em.getConnection().execute(
        `INSERT INTO ingest.source_endpoints
          (provider_id, code, name, kind, http_method, path, parser_key, is_active, config)
        VALUES (?,?,?,?,'GET',?,?,TRUE,'{}'::jsonb)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            path = EXCLUDED.path,
            parser_key = EXCLUDED.parser_key,
            is_active = TRUE`,
        [providerId, code, name, kind, path, parserKey],
      );
    };

    await upsertEndpoint(
      AQ_ENDPOINT_CODE,
      "Open-Meteo Air Quality (hourly)",
      AQ_BASE_URL,
      AQ_PATH,
      AQ_PARSER_KEY,
      'air_quality',
    );
    await upsertEndpoint(
      WEATHER_ENDPOINT_CODE,
      "Open-Meteo Weather Forecast (hourly)",
      WEATHER_BASE_URL,
      WEATHER_PATH,
      WEATHER_PARSER_KEY,
      'weather',
    );

    const endpoints = await this.em.find(
      SourceEndpoint,
      { code: { $in: [AQ_ENDPOINT_CODE, WEATHER_ENDPOINT_CODE] } },
    );

    const map: Record<string, string> = {};
    for (const e of endpoints) map[e.code] = e.id;
    return { providerId, aqEndpointId: map[AQ_ENDPOINT_CODE], weatherEndpointId: map[WEATHER_ENDPOINT_CODE] };
  }

  async ensureBindings(
    stations: StationRow[],
    providerId: string,
    aqEndpointId: string,
    weatherEndpointId: string,
  ) {
    for (const s of stations) {
      for (const endpointId of [aqEndpointId, weatherEndpointId]) {
        await this.em.getConnection().execute(
          `INSERT INTO ingest.station_source_bindings
            (station_id, endpoint_id, external_object_id, is_enabled, priority, valid_from, config)
          VALUES (?,?,'',TRUE,100,now(),'{}'::jsonb)
          ON CONFLICT (station_id, endpoint_id) DO NOTHING`,
          [s.id, endpointId],
        );
      }
    }
  }

  /**
   * Đảm bảo có 1 pipeline definition "default" cho mỗi provider (cần vì
   * schema yêu cầu pipeline_runs.pipeline_definition_id NOT NULL).
   * Cache in-memory theo providerId để không query lặp.
   */
  private pipelineDefCache = new Map<string, string>();

  private async ensureDefaultPipelineDefinition(
    providerId: string,
    providerCode: string,
  ): Promise<string> {
    const cached = this.pipelineDefCache.get(providerId);
    if (cached) return cached;

    const code = `${providerCode}-default`;
    const name = `${providerCode} default pipeline`;

    await this.em.getConnection().execute(
      `INSERT INTO ingest.pipeline_definitions
         (code, name, pipeline_type, owner_service, is_active, config)
       VALUES (?, ?, 'ingest', 'be_api', TRUE, '{}'::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [code, name],
    );

    const result: any = await this.em.getConnection().execute(
      `SELECT id::text FROM ingest.pipeline_definitions WHERE code=?`,
      [code],
    );
    const defId: string | undefined = Array.isArray(result) ? result[0]?.id : result?.rows?.[0]?.id;
    if (!defId) throw new Error(`Failed to ensure pipeline definition ${code}`);
    this.pipelineDefCache.set(providerId, defId);
    return defId;
  }

  private async createPipelineRun(
    providerId: string,
    endpointId: string,
    triggerType: string,
    providerCode = "unknown",
  ): Promise<string> {
    const definitionId = await this.ensureDefaultPipelineDefinition(providerId, providerCode);
    const result: any = await this.em.getConnection().execute(
      `INSERT INTO ingest.pipeline_runs
         (pipeline_definition_id, source_endpoint_id, trigger_type, status, started_at, metrics)
       VALUES (?, ?, ?, 'running', now(), '{}'::jsonb)
       RETURNING id`,
      [definitionId, endpointId, triggerType],
    );
    const row = result.rows ? result.rows[0] : result[0]; return row.id;
  }

  private async finalizePipelineRun(
    runId: string,
    status: "success" | "failed" | "partial",
    stats: Record<string, unknown>,
    errorMessage?: string,
  ) {
    await this.em.getConnection().execute(
      `UPDATE ingest.pipeline_runs
         SET status = ?,
             finished_at = now(),
             metrics = ?::jsonb,
             error_summary = ?
       WHERE id = ?`,
      [status, JSON.stringify(stats), errorMessage ?? null, runId],
    );
  }

  private async recordOutbound(
    pipelineRunId: string,
    providerId: string,
    endpointId: string,
    url: string,
    statusCode: number,
    latencyMs: number,
    ok: boolean,
  ): Promise<string> {
    const statusEnum = ok ? "success" : "failed";
    const result: any = await this.em.getConnection().execute(
      `INSERT INTO ingest.outbound_requests
         (pipeline_run_id, source_provider_id, source_endpoint_id,
          request_url, request_method, request_params,
          http_status, status, latency_ms, request_started_at, response_received_at)
       VALUES (?, ?, ?, ?, 'GET', '{}'::jsonb, ?, ?::public.request_status_enum, ?, now(), now())
       RETURNING id`,
      [pipelineRunId, providerId, endpointId, url, statusCode, statusEnum, latencyMs],
    );
    const row = result.rows ? result.rows[0] : result[0]; return row.id;
  }

  private async storeRawPayload(
    pipelineRunId: string,
    outboundId: string,
    providerId: string,
    endpointId: string,
    stationId: string,
    payload: unknown,
  ): Promise<string> {
    const body = JSON.stringify(payload);
    const hash = sha256Hex(`${endpointId}:${stationId}:${body}`);

    const result: any = await this.em.getConnection().execute(
      `INSERT INTO ingest.raw_payloads
         (pipeline_run_id, outbound_request_id, source_provider_id, source_endpoint_id, station_id,
          payload_format, payload_json, payload_hash, fetched_at)
       VALUES (?, ?, ?, ?, ?, 'json', ?::jsonb, ?, now())
       ON CONFLICT (source_provider_id, payload_hash) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
       RETURNING id`,
      [pipelineRunId, outboundId, providerId, endpointId, stationId, body, hash],
    );
    const row = result.rows ? result.rows[0] : result[0]; return row.id;
  }

  private async createNormalizeRun(
    pipelineRunId: string,
    rawPayloadId: string,
  ): Promise<string> {
    const result: any = await this.em.getConnection().execute(
      `INSERT INTO ingest.normalize_runs
         (pipeline_run_id, raw_payload_id, status, records_in, records_out)
       VALUES (?, ?, 'running', 0, 0)
       RETURNING id`,
      [pipelineRunId, rawPayloadId],
    );
    const row = result.rows ? result.rows[0] : result[0]; return row.id;
  }

  private async finalizeNormalizeRun(id: string, inserted: number) {
    await this.em.getConnection().execute(
      `UPDATE ingest.normalize_runs
         SET status = 'success', records_out = ?
       WHERE id = ?`,
      [inserted, id],
    );
  }

  private async insertAqObservations(
    station: StationRow,
    providerId: string,
    endpointId: string,
    pipelineRunId: string,
    rawPayloadId: string,
    normalizeRunId: string,
    points: AqPoint[],
  ): Promise<number> {
    let inserted = 0;
    for (const p of points) {
      // Use raw SQL for complex ON CONFLICT with many field updates
      const result: any = await this.em.getConnection().execute(
        `INSERT INTO core.air_quality_observations
          (station_id, source_provider_id, source_endpoint_id, pipeline_run_id, raw_payload_id, normalize_run_id,
           observed_at, aqi, pm25, pm10, o3, no2, so2, co, lineage)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'{}'::jsonb)
        ON CONFLICT (station_id, observed_at, source_endpoint_id) DO UPDATE SET
          aqi = EXCLUDED.aqi,
          pm25 = EXCLUDED.pm25,
          pm10 = EXCLUDED.pm10,
          o3 = EXCLUDED.o3,
          no2 = EXCLUDED.no2,
          so2 = EXCLUDED.so2,
          co = EXCLUDED.co,
          raw_payload_id = EXCLUDED.raw_payload_id,
          normalize_run_id = EXCLUDED.normalize_run_id,
          pipeline_run_id = EXCLUDED.pipeline_run_id,
          fetched_at = now()
        RETURNING id`,
        [
          station.id, providerId, endpointId, pipelineRunId, rawPayloadId, normalizeRunId,
          p.observed_at, p.aqi, p.pm25, p.pm10, p.o3, p.no2, p.so2, p.co,
        ],
      );
      if (result.rowCount || (Array.isArray(result) && result.length > 0)) inserted++;
    }
    if (inserted > 0 && points.length > 0) {
      const latest = points[points.length - 1];
      this.realtime.broadcastObservations([
        {
          station_id: station.id,
          station_code: station.code,
          aqi: latest.aqi ?? null,
          pm25: latest.pm25 ?? null,
          pm10: latest.pm10 ?? null,
          observed_at: latest.observed_at,
          provider: endpointId,
        },
      ]);
    }
    return inserted;
  }

  private async insertWeatherObservations(
    station: StationRow,
    providerId: string,
    endpointId: string,
    pipelineRunId: string,
    rawPayloadId: string,
    normalizeRunId: string,
    points: WeatherPoint[],
  ): Promise<number> {
    let inserted = 0;
    for (const p of points) {
      // Use raw SQL for complex ON CONFLICT with many field updates
      const result: any = await this.em.getConnection().execute(
        `INSERT INTO core.weather_observations
          (station_id, source_provider_id, source_endpoint_id, pipeline_run_id, raw_payload_id, normalize_run_id,
           observed_at, temperature_c, feels_like_c, humidity_pct, wind_speed_mps, wind_direction_deg, pressure_hpa,
           visibility_km, precipitation_mm, cloud_cover_pct, weather_code, lineage)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'{}'::jsonb)
        ON CONFLICT (station_id, observed_at, source_endpoint_id) DO UPDATE SET
          temperature_c = EXCLUDED.temperature_c,
          feels_like_c = EXCLUDED.feels_like_c,
          humidity_pct = EXCLUDED.humidity_pct,
          wind_speed_mps = EXCLUDED.wind_speed_mps,
          wind_direction_deg = EXCLUDED.wind_direction_deg,
          pressure_hpa = EXCLUDED.pressure_hpa,
          visibility_km = EXCLUDED.visibility_km,
          precipitation_mm = EXCLUDED.precipitation_mm,
          cloud_cover_pct = EXCLUDED.cloud_cover_pct,
          weather_code = EXCLUDED.weather_code,
          raw_payload_id = EXCLUDED.raw_payload_id,
          normalize_run_id = EXCLUDED.normalize_run_id,
          pipeline_run_id = EXCLUDED.pipeline_run_id,
          fetched_at = now()
        RETURNING id`,
        [
          station.id, providerId, endpointId, pipelineRunId, rawPayloadId, normalizeRunId,
          p.observed_at, p.temperature_c, p.apparent_temperature_c ?? null, p.humidity_pct, p.wind_speed_mps, p.wind_direction_deg,
          p.pressure_hpa, p.visibility_km, p.precipitation_mm, p.cloud_cover_pct, p.weather_code,
        ],
      );
      if (result.rowCount || (Array.isArray(result) && result.length > 0)) inserted++;
    }
    return inserted;
  }

  // ---------- WAQI provider setup ----------

  async ensureWaqiProviderAndEndpoint() {
    // Upsert provider
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_providers (code, name, category, base_url, is_active, config)
       VALUES (?,?,?,?,TRUE,?::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [WAQI_PROVIDER_CODE, WAQI_PROVIDER_NAME, WAQI_PROVIDER_CATEGORY, WAQI_PROVIDER_BASE_URL,
       JSON.stringify({ requires_token: true, rate_limit_rpm: 1000 })],
    );

    const provider = await this.em.findOne(
      SourceProvider,
      { code: WAQI_PROVIDER_CODE },
    );
    if (!provider) throw new Error("Failed to ensure WAQI provider");
    const providerId = provider.id;

    // Upsert endpoint
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_endpoints
         (provider_id, code, name, kind, http_method, path, parser_key, is_active, config)
       VALUES (?,?,?,'air_quality','GET',?,?,TRUE,'{}'::jsonb)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, parser_key = EXCLUDED.parser_key, is_active = TRUE`,
      [providerId, WAQI_ENDPOINT_CODE, "WAQI Station Feed (realtime)",
       "/feed/geo:{lat};{lng}/", WAQI_PARSER_KEY],
    );

    const endpoint = await this.em.findOne(
      SourceEndpoint,
      { code: WAQI_ENDPOINT_CODE },
    );
    if (!endpoint) throw new Error("Failed to ensure WAQI endpoint");

    return { providerId, endpointId: endpoint.id };
  }

  // ---------- WAQI ingest ----------

  async runWaqi(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const waqiToken = process.env.WAQI_TOKEN;
    if (!waqiToken) {
      this.logger.warn("WAQI_TOKEN not set — skipping WAQI ingest");
      return { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: ["WAQI_TOKEN not configured"] };
    }

    const started = Date.now();
    const errors: string[] = [];
    let stations: StationRow[] = [];
    let aqCount = 0;
    let pipelineRunId = "";

    try {
      // Setup provider, endpoint, stations, and bindings in transaction
      const setup = await this.em.transactional(async (em) => {
        const { providerId, endpointId } = await this.ensureWaqiProviderAndEndpoint();
        const stationsResult = await em.find(
          Station,
          { isActive: true },
          { orderBy: { code: "ASC" } },
        );
        stations = stationsResult.map(s => ({
          id: s.id,
          code: s.code,
          lat: s.lat,
          lng: s.lng,
          timezone: s.timezone,
        }));

        // Ensure bindings
        for (const s of stations) {
          await em.getConnection().execute(
            `INSERT INTO ingest.station_source_bindings
               (station_id, endpoint_id, external_object_id, is_enabled, priority, valid_from, config)
             VALUES (?,?,'',TRUE,200,now(),'{}'::jsonb)
             ON CONFLICT (station_id, endpoint_id) DO NOTHING`,
            [s.id, endpointId],
          );
        }

        const runId = await this.createPipelineRun(providerId, endpointId, triggerType, WAQI_PROVIDER_CODE);
        return { providerId, endpointId, runId };
      });
      if (!setup) throw new Error("Database not configured");
      pipelineRunId = setup.runId;
      const { providerId, endpointId, runId } = setup;

      // WAQI rate-limit: 1 request per station, with small delay
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        try {
          const url = buildWaqiFeedUrl(s.lat, s.lng, waqiToken);
          const safeUrl = url.replace(/token=[^&]+/, "token=***");
          const res = await fetchWaqi(url);

          const count = await this.em.transactional(async (em) => {
            const outId = await this.recordOutbound(
              runId, providerId, endpointId, safeUrl, res.status, res.latency_ms, res.ok,
            );
            if (!res.ok) throw new Error(`WAQI HTTP ${res.status}: ${res.payload?.data ?? "unknown"}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, endpointId, s.id, res.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeWaqiAq(res.payload);
            const inserted = await this.insertAqObservations(
              s, providerId, endpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          aqCount += count ?? 0;

          // Rate-limit delay
          if (i < stations.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (e: any) {
          errors.push(`[${s.code}][waqi] ${e?.message ?? e}`);
          this.logger.warn(`WAQI failed for ${s.code}: ${e?.message}`);
        }
      }

      const status: "success" | "partial" | "failed" =
        errors.length === 0 ? "success" : aqCount > 0 ? "partial" : "failed";
      await this.em.transactional(async (em) => {
        await this.finalizePipelineRun(pipelineRunId, status, {
          stations: stations.length,
          aq_points: aqCount,
          weather_points: 0,
          errors_count: errors.length,
          duration_ms: Date.now() - started,
        }, errors.length ? errors.slice(0, 5).join("; ") : undefined);
      });

      return { pipeline_run_id: pipelineRunId, stations: stations.length, aq_points: aqCount, weather_points: 0, errors };
    } catch (e: any) {
      this.logger.error(`WAQI ingest failed: ${e?.message}`);
      if (pipelineRunId) {
        await this.em.transactional(async (em) => {
          await this.finalizePipelineRun(pipelineRunId, "failed", {}, String(e?.message ?? e));
        });
      }
      throw e;
    }
  }

  // ---------- OpenAQ provider setup ----------

  async ensureOpenaqProviderAndEndpoint() {
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_providers (code, name, category, base_url, is_active, config)
       VALUES (?,?,?,?,TRUE,?::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [OPENAQ_PROVIDER_CODE, OPENAQ_PROVIDER_NAME, OPENAQ_PROVIDER_CATEGORY, OPENAQ_PROVIDER_BASE_URL,
       JSON.stringify({ requires_token: true, rate_limit_rpm: 60, free_tier: true, priority: "reference" })],
    );

    const provider = await this.em.findOne(SourceProvider, { code: OPENAQ_PROVIDER_CODE });
    if (!provider) throw new Error("Failed to ensure OpenAQ provider");
    const providerId = provider.id;

    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_endpoints
         (provider_id, code, name, kind, http_method, path, parser_key, is_active, config)
       VALUES (?,?,?,'air_quality','GET',?,?,TRUE,'{}'::jsonb)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, parser_key = EXCLUDED.parser_key, is_active = TRUE`,
      [providerId, OPENAQ_ENDPOINT_CODE, "OpenAQ Location Latest (government stations)",
       "/v3/locations/{id}/latest", OPENAQ_PARSER_KEY],
    );

    const endpoint = await this.em.findOne(SourceEndpoint, { code: OPENAQ_ENDPOINT_CODE });
    if (!endpoint) throw new Error("Failed to ensure OpenAQ endpoint");
    return { providerId, endpointId: endpoint.id };
  }

  // ---------- OpenAQ ingest ----------

  async runOpenaq(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const apiKey = process.env.OPENAQ_API_KEY;
    if (!apiKey) {
      this.logger.warn("OPENAQ_API_KEY not set — skipping OpenAQ ingest");
      return { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: ["OPENAQ_API_KEY not configured"] };
    }

    const started = Date.now();
    const errors: string[] = [];
    let stations: StationRow[] = [];
    let aqCount = 0;
    let pipelineRunId = "";

    try {
      const setup = await this.em.transactional(async (em) => {
        const { providerId, endpointId } = await this.ensureOpenaqProviderAndEndpoint();
        const stationsResult = await em.find(Station, { isActive: true }, { orderBy: { code: "ASC" } });
        stations = stationsResult.map(s => ({
          id: s.id, code: s.code, lat: s.lat, lng: s.lng, timezone: s.timezone,
        }));
        for (const s of stations) {
          await em.getConnection().execute(
            `INSERT INTO ingest.station_source_bindings
               (station_id, endpoint_id, external_object_id, is_enabled, priority, valid_from, config)
             VALUES (?,?,'',TRUE,150,now(),'{}'::jsonb)
             ON CONFLICT (station_id, endpoint_id) DO NOTHING`,
            [s.id, endpointId],
          );
        }
        const runId = await this.createPipelineRun(providerId, endpointId, triggerType, OPENAQ_PROVIDER_CODE);
        return { providerId, endpointId, runId };
      });
      if (!setup) throw new Error("Database not configured");
      pipelineRunId = setup.runId;
      const { providerId, endpointId, runId } = setup;

      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        try {
          // Bước 1: tìm OpenAQ location gần nhất trong bán kính.
          const locUrl = buildOpenaqNearestLocationUrl(s.lat, s.lng);
          const locRes = await fetchOpenaq(locUrl, apiKey);
          const locId = locRes.ok ? parseNearestLocationId(locRes.payload) : null;
          if (locId === null) {
            // Không có trạm OpenAQ gần → bỏ qua station này (không phải lỗi).
            if (i < stations.length - 1) await new Promise(r => setTimeout(r, 150));
            continue;
          }

          // Bước 2: lấy measurements mới nhất của location đó.
          const latestUrl = buildOpenaqLatestUrl(locId);
          const res = await fetchOpenaq(latestUrl, apiKey);

          const count = await this.em.transactional(async (em) => {
            const outId = await this.recordOutbound(
              runId, providerId, endpointId, latestUrl, res.status, res.latency_ms, res.ok,
            );
            if (!res.ok) throw new Error(`OpenAQ HTTP ${res.status}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, endpointId, s.id, res.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeOpenaqAq(res.payload);
            const inserted = await this.insertAqObservations(
              s, providerId, endpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          aqCount += count ?? 0;

          if (i < stations.length - 1) await new Promise(r => setTimeout(r, 150));
        } catch (e: any) {
          errors.push(`[${s.code}][openaq] ${e?.message ?? e}`);
          this.logger.warn(`OpenAQ failed for ${s.code}: ${e?.message}`);
        }
      }

      const status: "success" | "partial" | "failed" =
        errors.length === 0 ? "success" : aqCount > 0 ? "partial" : "failed";
      await this.em.transactional(async (em) => {
        await this.finalizePipelineRun(pipelineRunId, status, {
          stations: stations.length,
          aq_points: aqCount,
          weather_points: 0,
          errors_count: errors.length,
          duration_ms: Date.now() - started,
        }, errors.length ? errors.slice(0, 5).join("; ") : undefined);
      });

      return { pipeline_run_id: pipelineRunId, stations: stations.length, aq_points: aqCount, weather_points: 0, errors };
    } catch (e: any) {
      this.logger.error(`OpenAQ ingest failed: ${e?.message}`);
      if (pipelineRunId) {
        await this.em.transactional(async (em) => {
          await this.finalizePipelineRun(pipelineRunId, "failed", {}, String(e?.message ?? e));
        });
      }
      throw e;
    }
  }

  // ---------- IQAir provider setup ----------

  async ensureIqairProviderAndEndpoint() {
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_providers (code, name, category, base_url, is_active, config)
       VALUES (?,?,?,?,TRUE,?::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [
        IQAIR_PROVIDER_CODE,
        IQAIR_PROVIDER_NAME,
        IQAIR_PROVIDER_CATEGORY,
        IQAIR_PROVIDER_BASE_URL,
        JSON.stringify({ requires_token: true, rate_limit_rpm: 5, free_tier_monthly: 10000, priority: "primary" }),
      ],
    );

    const provider = await this.em.findOne(SourceProvider, { code: IQAIR_PROVIDER_CODE });
    if (!provider) throw new Error("Failed to ensure IQAir provider");
    const providerId = provider.id;

    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_endpoints
         (provider_id, code, name, kind, http_method, path, parser_key, is_active, config)
       VALUES (?,?,?,'mixed','GET',?,?,TRUE,'{}'::jsonb)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, parser_key = EXCLUDED.parser_key, is_active = TRUE`,
      [
        providerId,
        IQAIR_NEAREST_CITY_ENDPOINT_CODE,
        "IQAir Nearest City (realtime AQI + weather)",
        IQAIR_NEAREST_CITY_PATH,
        IQAIR_NEAREST_CITY_PARSER_KEY,
      ],
    );

    const endpoint = await this.em.findOne(SourceEndpoint, { code: IQAIR_NEAREST_CITY_ENDPOINT_CODE });
    if (!endpoint) throw new Error("Failed to ensure IQAir endpoint");
    return { providerId, endpointId: endpoint.id };
  }

  // ---------- IQAir ingest ----------

  async runIqair(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const apiKey = process.env.IQAIR_API_KEY;
    if (!apiKey) {
      this.logger.warn("IQAIR_API_KEY not set — skipping IQAir ingest");
      return { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: ["IQAIR_API_KEY not configured"] };
    }

    const started = Date.now();
    const errors: string[] = [];
    let stations: StationRow[] = [];
    let aqCount = 0;
    let weatherCount = 0;
    let pipelineRunId = "";

    try {
      const setup = await this.em.transactional(async (em) => {
        const { providerId, endpointId } = await this.ensureIqairProviderAndEndpoint();
        const stationsResult = await em.find(
          Station,
          { isActive: true },
          { orderBy: { code: "ASC" } },
        );
        stations = stationsResult.map((s) => ({
          id: s.id,
          code: s.code,
          lat: s.lat,
          lng: s.lng,
          timezone: s.timezone,
        }));

        // IQAir = primary provider → priority 50 (thấp số = cao ưu tiên)
        for (const s of stations) {
          await em.getConnection().execute(
            `INSERT INTO ingest.station_source_bindings
               (station_id, endpoint_id, external_object_id, is_enabled, priority, valid_from, config)
             VALUES (?,?,'',TRUE,50,now(),'{}'::jsonb)
             ON CONFLICT (station_id, endpoint_id) DO NOTHING`,
            [s.id, endpointId],
          );
        }

        const runId = await this.createPipelineRun(providerId, endpointId, triggerType, IQAIR_PROVIDER_CODE);
        return { providerId, endpointId, runId };
      });
      if (!setup) throw new Error("Database not configured");
      pipelineRunId = setup.runId;
      const { providerId, endpointId, runId } = setup;

      // IQAir rate-limit: ~5 req/minute on community free tier, nên delay 300ms giữa mỗi station
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        try {
          const url = buildIqairNearestCityUrl(s.lat, s.lng, apiKey);
          const safeUrl = url.replace(/key=[^&]+/, "key=***");
          const res = await fetchIqair(url);

          const counts = await this.em.transactional(async (em) => {
            const outId = await this.recordOutbound(
              runId, providerId, endpointId, safeUrl, res.status, res.latency_ms, res.ok,
            );
            if (!res.ok) {
              const msg = res.payload?.data?.message ?? res.payload?.message ?? `HTTP ${res.status}`;
              throw new Error(`IQAir: ${msg}`);
            }
            const rawId = await this.storeRawPayload(runId, outId, providerId, endpointId, s.id, res.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const aqPoints = normalizeIqairAq(res.payload);
            const weatherPoints = normalizeIqairWeather(res.payload);
            const aqInserted = await this.insertAqObservations(
              s, providerId, endpointId, runId, rawId, normId, aqPoints,
            );
            const weatherInserted = await this.insertWeatherObservations(
              s, providerId, endpointId, runId, rawId, normId, weatherPoints,
            );
            await this.finalizeNormalizeRun(normId, aqInserted + weatherInserted);
            return { aq: aqInserted, weather: weatherInserted };
          });
          aqCount += counts?.aq ?? 0;
          weatherCount += counts?.weather ?? 0;

          // Rate-limit delay (IQAir community: ~5 req/min)
          if (i < stations.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } catch (e: any) {
          errors.push(`[${s.code}][iqair] ${e?.message ?? e}`);
          this.logger.warn(`IQAir failed for ${s.code}: ${e?.message}`);
        }
      }

      const status: "success" | "partial" | "failed" =
        errors.length === 0 ? "success" : aqCount + weatherCount > 0 ? "partial" : "failed";
      await this.em.transactional(async () => {
        await this.finalizePipelineRun(pipelineRunId, status, {
          stations: stations.length,
          aq_points: aqCount,
          weather_points: weatherCount,
          errors_count: errors.length,
          duration_ms: Date.now() - started,
        }, errors.length ? errors.slice(0, 5).join("; ") : undefined);
      });

      return { pipeline_run_id: pipelineRunId, stations: stations.length, aq_points: aqCount, weather_points: weatherCount, errors };
    } catch (e: any) {
      this.logger.error(`IQAir ingest failed: ${e?.message}`);
      if (pipelineRunId) {
        await this.em.transactional(async () => {
          await this.finalizePipelineRun(pipelineRunId, "failed", {}, String(e?.message ?? e));
        });
      }
      throw e;
    }
  }

  // ---------- OpenWeather provider setup ----------

  async ensureOpenweatherProviderAndEndpoints() {
    await this.em.getConnection().execute(
      `INSERT INTO ingest.source_providers (code, name, category, base_url, is_active, config)
       VALUES (?,?,?,?,TRUE,?::jsonb)
       ON CONFLICT (code) DO NOTHING`,
      [
        OPENWEATHER_PROVIDER_CODE,
        OPENWEATHER_PROVIDER_NAME,
        OPENWEATHER_PROVIDER_CATEGORY,
        OPENWEATHER_PROVIDER_BASE_URL,
        JSON.stringify({ requires_token: true, free_tier_daily: 1000, priority: "secondary" }),
      ],
    );

    const provider = await this.em.findOne(SourceProvider, { code: OPENWEATHER_PROVIDER_CODE });
    if (!provider) throw new Error("Failed to ensure OpenWeather provider");
    const providerId = provider.id;

    const upsertEndpoint = async (code: string, name: string, path: string, parserKey: string, kind: string) => {
      await this.em.getConnection().execute(
        `INSERT INTO ingest.source_endpoints
           (provider_id, code, name, kind, http_method, path, parser_key, is_active, config)
         VALUES (?,?,?,?,'GET',?,?,TRUE,'{}'::jsonb)
         ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, path = EXCLUDED.path,
             parser_key = EXCLUDED.parser_key, is_active = TRUE`,
        [providerId, code, name, kind, path, parserKey],
      );
    };

    await upsertEndpoint(
      OPENWEATHER_AIR_POLLUTION_ENDPOINT_CODE,
      "OpenWeather Air Pollution (current)",
      OPENWEATHER_AIR_POLLUTION_PATH,
      OPENWEATHER_AIR_POLLUTION_PARSER_KEY,
      'air_quality',
    );
    await upsertEndpoint(
      OPENWEATHER_WEATHER_ENDPOINT_CODE,
      "OpenWeather Current Weather",
      OPENWEATHER_WEATHER_PATH,
      OPENWEATHER_WEATHER_PARSER_KEY,
      'weather',
    );

    const endpoints = await this.em.find(SourceEndpoint, {
      code: {
        $in: [OPENWEATHER_AIR_POLLUTION_ENDPOINT_CODE, OPENWEATHER_WEATHER_ENDPOINT_CODE],
      },
    });
    const map: Record<string, string> = {};
    for (const e of endpoints) map[e.code] = e.id;
    return {
      providerId,
      airEndpointId: map[OPENWEATHER_AIR_POLLUTION_ENDPOINT_CODE],
      weatherEndpointId: map[OPENWEATHER_WEATHER_ENDPOINT_CODE],
    };
  }

  // ---------- OpenWeather ingest ----------

  async runOpenweather(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      this.logger.warn("OPENWEATHER_API_KEY not set — skipping OpenWeather ingest");
      return { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: ["OPENWEATHER_API_KEY not configured"] };
    }

    const started = Date.now();
    const errors: string[] = [];
    let stations: StationRow[] = [];
    let aqCount = 0;
    let weatherCount = 0;
    let pipelineRunId = "";

    try {
      const setup = await this.em.transactional(async (em) => {
        const { providerId, airEndpointId, weatherEndpointId } =
          await this.ensureOpenweatherProviderAndEndpoints();
        const stationsResult = await em.find(
          Station,
          { isActive: true },
          { orderBy: { code: "ASC" } },
        );
        stations = stationsResult.map((s) => ({
          id: s.id,
          code: s.code,
          lat: s.lat,
          lng: s.lng,
          timezone: s.timezone,
        }));

        // OpenWeather = secondary → priority 150 (sau IQAir=50, OpenMeteo=100)
        for (const s of stations) {
          for (const endpointId of [airEndpointId, weatherEndpointId]) {
            await em.getConnection().execute(
              `INSERT INTO ingest.station_source_bindings
                 (station_id, endpoint_id, external_object_id, is_enabled, priority, valid_from, config)
               VALUES (?,?,'',TRUE,150,now(),'{}'::jsonb)
               ON CONFLICT (station_id, endpoint_id) DO NOTHING`,
              [s.id, endpointId],
            );
          }
        }

        const runId = await this.createPipelineRun(providerId, airEndpointId, triggerType, OPENWEATHER_PROVIDER_CODE);
        return { providerId, airEndpointId, weatherEndpointId, runId };
      });
      if (!setup) throw new Error("Database not configured");
      pipelineRunId = setup.runId;
      const { providerId, airEndpointId, weatherEndpointId, runId } = setup;

      for (const s of stations) {
        // Air pollution
        try {
          const url = buildOpenweatherAirPollutionUrl(s.lat, s.lng, apiKey);
          const safeUrl = url.replace(/appid=[^&]+/, "appid=***");
          const res = await fetchOpenweather(url);
          const count = await this.em.transactional(async () => {
            const outId = await this.recordOutbound(
              runId, providerId, airEndpointId, safeUrl, res.status, res.latency_ms, res.ok,
            );
            if (!res.ok) throw new Error(`OpenWeather AQ HTTP ${res.status}: ${res.payload?.message ?? "unknown"}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, airEndpointId, s.id, res.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeOpenweatherAq(res.payload);
            const inserted = await this.insertAqObservations(
              s, providerId, airEndpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          aqCount += count ?? 0;
        } catch (e: any) {
          errors.push(`[${s.code}][openweather_aq] ${e?.message ?? e}`);
          this.logger.warn(`OpenWeather AQ failed for ${s.code}: ${e?.message}`);
        }

        // Weather
        try {
          const url = buildOpenweatherWeatherUrl(s.lat, s.lng, apiKey);
          const safeUrl = url.replace(/appid=[^&]+/, "appid=***");
          const res = await fetchOpenweather(url);
          const count = await this.em.transactional(async () => {
            const outId = await this.recordOutbound(
              runId, providerId, weatherEndpointId, safeUrl, res.status, res.latency_ms, res.ok,
            );
            if (!res.ok) throw new Error(`OpenWeather Weather HTTP ${res.status}: ${res.payload?.message ?? "unknown"}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, weatherEndpointId, s.id, res.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeOpenweatherWeather(res.payload);
            const inserted = await this.insertWeatherObservations(
              s, providerId, weatherEndpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          weatherCount += count ?? 0;
        } catch (e: any) {
          errors.push(`[${s.code}][openweather_weather] ${e?.message ?? e}`);
          this.logger.warn(`OpenWeather weather failed for ${s.code}: ${e?.message}`);
        }

        // Light rate-limit (60 req/min free tier = 1000ms safe; ta chỉ delay 100ms)
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const status: "success" | "partial" | "failed" =
        errors.length === 0 ? "success" : aqCount + weatherCount > 0 ? "partial" : "failed";
      await this.em.transactional(async () => {
        await this.finalizePipelineRun(pipelineRunId, status, {
          stations: stations.length,
          aq_points: aqCount,
          weather_points: weatherCount,
          errors_count: errors.length,
          duration_ms: Date.now() - started,
        }, errors.length ? errors.slice(0, 5).join("; ") : undefined);
      });

      return { pipeline_run_id: pipelineRunId, stations: stations.length, aq_points: aqCount, weather_points: weatherCount, errors };
    } catch (e: any) {
      this.logger.error(`OpenWeather ingest failed: ${e?.message}`);
      if (pipelineRunId) {
        await this.em.transactional(async () => {
          await this.finalizePipelineRun(pipelineRunId, "failed", {}, String(e?.message ?? e));
        });
      }
      throw e;
    }
  }

  // ---------- Multi-provider orchestrator ----------

  async runAll(triggerType: "scheduled" | "manual" = "manual"): Promise<MultiSyncResult> {
    // Priority order: IQAir (primary) → OpenWeather (secondary) → Open-Meteo → WAQI

    // 1) IQAir (primary)
    let iqairResult: SyncResult | null = null;
      if (process.env.IQAIR_API_KEY) {
        try {
          iqairResult = await this.runIqair(triggerType);
        } catch (e: any) {
          this.logger.error(`IQAir ingest error: ${e?.message}`);
          iqairResult = { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: [e?.message] };
        }
      }

      // 2) OpenWeather (secondary)
      let owmResult: SyncResult | null = null;
      if (process.env.OPENWEATHER_API_KEY) {
        try {
          owmResult = await this.runOpenweather(triggerType);
        } catch (e: any) {
          this.logger.error(`OpenWeather ingest error: ${e?.message}`);
          owmResult = { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: [e?.message] };
        }
      }

      // 3) Open-Meteo (free, no token)
      let omResult: SyncResult | null = null;
      try {
        omResult = await this.runOpenMeteo(triggerType);
      } catch (e: any) {
        this.logger.error(`Open-Meteo ingest error: ${e?.message}`);
        omResult = { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: [e?.message] };
      }

      // 4) WAQI (optional)
      let waqiResult: SyncResult | null = null;
      if (process.env.WAQI_TOKEN) {
        try {
          waqiResult = await this.runWaqi(triggerType);
        } catch (e: any) {
          this.logger.error(`WAQI ingest error: ${e?.message}`);
          waqiResult = { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: [e?.message] };
        }
      }

      // 5) OpenAQ (optional — government/reference stations)
      let openaqResult: SyncResult | null = null;
      if (process.env.OPENAQ_API_KEY) {
        try {
          openaqResult = await this.runOpenaq(triggerType);
        } catch (e: any) {
          this.logger.error(`OpenAQ ingest error: ${e?.message}`);
          openaqResult = { pipeline_run_id: "", stations: 0, aq_points: 0, weather_points: 0, errors: [e?.message] };
        }
      }

      const totalAq =
        (iqairResult?.aq_points ?? 0) +
        (owmResult?.aq_points ?? 0) +
        (omResult?.aq_points ?? 0) +
        (waqiResult?.aq_points ?? 0) +
        (openaqResult?.aq_points ?? 0);
      const totalWeather =
        (iqairResult?.weather_points ?? 0) +
        (owmResult?.weather_points ?? 0) +
        (omResult?.weather_points ?? 0);
      const totalErrors = [
        ...(iqairResult?.errors ?? []),
        ...(owmResult?.errors ?? []),
        ...(omResult?.errors ?? []),
        ...(waqiResult?.errors ?? []),
        ...(openaqResult?.errors ?? []),
      ];

      this.logger.log(
        `Multi-provider ingest done: ` +
          `IQAir=${iqairResult?.aq_points ?? 0}aq+${iqairResult?.weather_points ?? 0}w, ` +
          `OpenWeather=${owmResult?.aq_points ?? 0}aq+${owmResult?.weather_points ?? 0}w, ` +
          `OpenMeteo=${omResult?.aq_points ?? 0}aq+${omResult?.weather_points ?? 0}w, ` +
          `WAQI=${waqiResult?.aq_points ?? 0}aq, ` +
          `OpenAQ=${openaqResult?.aq_points ?? 0}aq, errors=${totalErrors.length}`,
      );

      return {
        openmeteo: omResult,
        waqi: waqiResult,
        iqair: iqairResult,
        openweather: owmResult,
        openaq: openaqResult,
        total_aq_points: totalAq,
        total_weather_points: totalWeather,
        total_errors: totalErrors,
      };
  }

  // ---------- Open-Meteo ingest ----------

  async runOpenMeteo(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const started = Date.now();
    const errors: string[] = [];
    let stations: StationRow[] = [];
    let aqCount = 0;
    let weatherCount = 0;
    let pipelineRunId = "";

    try {
      const setup = await this.em.transactional(async (em) => {
        const { providerId, aqEndpointId, weatherEndpointId } =
          await this.ensureProviderAndEndpoints();
        const stationsResult = await em.find(
          Station,
          { isActive: true },
          { orderBy: { code: "ASC" } },
        );
        stations = stationsResult.map(s => ({
          id: s.id,
          code: s.code,
          lat: s.lat,
          lng: s.lng,
          timezone: s.timezone,
        }));
        await this.ensureBindings(stations, providerId, aqEndpointId, weatherEndpointId);
        const runId = await this.createPipelineRun(providerId, aqEndpointId, triggerType, OPENMETEO_PROVIDER_CODE);
        return { providerId, aqEndpointId, weatherEndpointId, runId };
      });
      if (!setup) throw new Error("Database not configured");
      pipelineRunId = setup.runId;
      const { providerId, aqEndpointId, weatherEndpointId, runId } = setup;

      for (const s of stations) {
        const tz = s.timezone ?? "UTC";

        // Air quality
        try {
          const aqUrl = buildAqUrl({
            lat: s.lat,
            lng: s.lng,
            timezone: tz,
            past_hours: pastHours(),
            fields: DEFAULT_AQ_FIELDS,
          });
          const resAq = await fetchOpenMeteo(aqUrl);
          const count = await this.em.transactional(async (em) => {
            const outId = await this.recordOutbound(
              runId, providerId, aqEndpointId, aqUrl, resAq.status, resAq.latency_ms, resAq.ok,
            );
            if (!resAq.ok) throw new Error(`AQ HTTP ${resAq.status}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, aqEndpointId, s.id, resAq.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeAq(resAq.payload);
            const inserted = await this.insertAqObservations(
              s, providerId, aqEndpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          aqCount += count ?? 0;
        } catch (e: any) {
          errors.push(`[${s.code}][aq] ${e?.message ?? e}`);
          this.logger.warn(`AQ failed for ${s.code}: ${e?.message}`);
        }

        // Weather
        try {
          const wUrl = buildWeatherUrl({
            lat: s.lat,
            lng: s.lng,
            timezone: tz,
            past_hours: pastHours(),
            fields: DEFAULT_WEATHER_FIELDS,
          });
          const resW = await fetchOpenMeteo(wUrl);
          const count = await this.em.transactional(async (em) => {
            const outId = await this.recordOutbound(
              runId, providerId, weatherEndpointId, wUrl, resW.status, resW.latency_ms, resW.ok,
            );
            if (!resW.ok) throw new Error(`Weather HTTP ${resW.status}`);
            const rawId = await this.storeRawPayload(runId, outId, providerId, weatherEndpointId, s.id, resW.payload);
            const normId = await this.createNormalizeRun(runId, rawId);
            const points = normalizeWeather(resW.payload);
            const inserted = await this.insertWeatherObservations(
              s, providerId, weatherEndpointId, runId, rawId, normId, points,
            );
            await this.finalizeNormalizeRun(normId, inserted);
            return inserted;
          });
          weatherCount += count ?? 0;
        } catch (e: any) {
          errors.push(`[${s.code}][weather] ${e?.message ?? e}`);
          this.logger.warn(`Weather failed for ${s.code}: ${e?.message}`);
        }
      }

      const status: "success" | "partial" | "failed" =
        errors.length === 0 ? "success" : aqCount + weatherCount > 0 ? "partial" : "failed";
      await this.em.transactional(async (em) => {
        await this.finalizePipelineRun(
          pipelineRunId,
          status,
          {
            stations: stations.length,
            aq_points: aqCount,
            weather_points: weatherCount,
            errors_count: errors.length,
            duration_ms: Date.now() - started,
          },
          errors.length ? errors.slice(0, 5).join("; ") : undefined,
        );
      });

      return {
        pipeline_run_id: pipelineRunId,
        stations: stations.length,
        aq_points: aqCount,
        weather_points: weatherCount,
        errors,
      };
    } catch (e: any) {
      this.logger.error(`OpenMeteo ingest failed: ${e?.message}`);
      if (pipelineRunId) {
        await this.em.transactional(async (em) => {
          await this.finalizePipelineRun(pipelineRunId, "failed", {}, String(e?.message ?? e));
        });
      }
      throw e;
    }
  }

  /**
   * Backward-compatible run() — delegates to runAll() for multi-provider.
   */
  async run(triggerType: "scheduled" | "manual" = "manual"): Promise<SyncResult> {
    const multi = await this.runAll(triggerType);
    return {
      pipeline_run_id: multi.openmeteo?.pipeline_run_id ?? "",
      stations: multi.openmeteo?.stations ?? 0,
      aq_points: multi.total_aq_points,
      weather_points: multi.total_weather_points,
      errors: multi.total_errors,
    };
  }
}
