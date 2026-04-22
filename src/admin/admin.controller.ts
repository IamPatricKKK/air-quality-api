import { Controller, Get, Post, Put, Delete, Body, Param, Headers, HttpException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { User, UserProfile, UserRole, Station, Area, Notification, Role } from "../entities";
import { ADMIN_ROLES, requireAuth } from "../auth/jwt";
import { AreaLevel, StationType } from "../entities/iam/enums";

@Controller("admin")
export class AdminController {
  constructor(private readonly em: EntityManager) {}

  @Get("dashboard")
  async getDashboard(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);

    const counts = await this.em.getConnection().execute<{
      users: string;
      stations: string;
      providers: string;
      pipelines_running: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM iam.users) AS users,
        (SELECT COUNT(*) FROM catalog.stations) AS stations,
        (SELECT COUNT(*) FROM ingest.source_providers WHERE is_active = TRUE) AS providers,
        (SELECT COUNT(*) FROM ingest.pipeline_runs WHERE status = 'running') AS pipelines_running
    `);

    const latestStations = await this.em.getConnection().execute<{
      station_id: string;
      station_code: string;
      station_name: string;
      area_id: string | null;
      area_name: string | null;
      lat: number;
      lng: number;
      aqi: number;
      source_provider_code: string | null;
    }>(`
      SELECT
        latest.station_id,
        latest.station_code,
        latest.station_name,
        latest.area_id,
        area.name AS area_name,
        latest.lat,
        latest.lng,
        latest.aqi,
        latest.source_provider_code
      FROM app.v_station_latest_air_quality latest
      LEFT JOIN catalog.areas area ON area.id = latest.area_id
      WHERE latest.observed_at IS NOT NULL
      ORDER BY latest.observed_at DESC
      LIMIT 5
    `);

    if (counts?.[0]) {
      return {
        users: Number(counts[0].users),
        stations: Number(counts[0].stations),
        providers: Number(counts[0].providers),
        pipelinesRunning: Number(counts[0].pipelines_running),
        recentRuns: [],
        latestStations: (latestStations ?? []).map((station) => ({
          id: station.station_id,
          code: station.station_code,
          name: station.station_name,
          region: station.area_name ?? station.station_code,
          city: station.area_name ?? station.station_code,
          lat: station.lat,
          lng: station.lng,
          latestAqi: station.aqi,
          isActive: true,
          sourceProvider: station.source_provider_code ?? null,
        })),
      };
    }

    return {
      users: 0,
      stations: 0,
      providers: 0,
      pipelinesRunning: 0,
      recentRuns: [],
      latestStations: [],
    };
  }

  @Get("users")
  async getUsers(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);

    const rows = await this.em.getConnection().execute<{
      id: string;
      email: string;
      display_name: string | null;
      status: string;
      created_at: string;
      last_login_at: string | null;
      roles: string[] | null;
    }>(`
      SELECT
        u.id,
        u.email,
        up.display_name,
        u.status,
        u.created_at,
        u.last_login_at,
        ARRAY_REMOVE(ARRAY_AGG(r.code), NULL) AS roles
      FROM iam.users u
      LEFT JOIN iam.user_profiles up ON up.user_id = u.id
      LEFT JOIN iam.user_roles ur ON ur.user_id = u.id
      LEFT JOIN iam.roles r ON r.id = ur.role_id
      GROUP BY u.id, up.display_name
      ORDER BY u.created_at DESC
    `);

    return (rows ?? []).map((row) => {
      const effectiveRole = (row.roles ?? []).find((role) => role !== "user") ?? "user";
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name ?? row.email.split("@")[0],
        role: effectiveRole,
        status: row.status,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at ?? row.created_at,
      };
    });
  }

  @Get("stations")
  async getStations(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);

    const rows = await this.em.getConnection().execute<{
      station_id: string;
      station_code: string;
      station_name: string;
      area_name: string | null;
      lat: number;
      lng: number;
      aqi: number | null;
      source_provider_code: string | null;
    }>(`
      SELECT
        latest.station_id,
        latest.station_code,
        latest.station_name,
        area.name AS area_name,
        latest.lat,
        latest.lng,
        latest.aqi,
        latest.source_provider_code
      FROM app.v_station_latest_air_quality latest
      LEFT JOIN catalog.areas area ON area.id = latest.area_id
      ORDER BY station_name
    `);

    return (rows ?? []).map((row) => ({
      id: row.station_id,
      code: row.station_code,
      name: row.station_name,
      region: row.area_name ?? row.station_code,
      city: row.area_name ?? row.station_code,
      lat: row.lat,
      lng: row.lng,
      latestAqi: row.aqi,
      isActive: true,
      sourceProvider: row.source_provider_code ?? null,
    }));
  }

  @Get("notifications")
  async getNotifications(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);

    const rows = await this.em.getConnection().execute<{
      id: string;
      title: string;
      audience: string | null;
      channel: string | null;
      status: string;
      created_at: string;
    }>(`
      SELECT
        id,
        title,
        COALESCE(source_context->>'audience', category) AS audience,
        COALESCE(source_context->>'channel', 'in_app') AS channel,
        status,
        created_at
      FROM app.notifications
      ORDER BY created_at DESC
      LIMIT 100
    `);

    return (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      audience: row.audience ?? "unknown",
      channel: row.channel ?? "in_app",
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  // ─── Area CRUD ──────────────────────────────────

  @Get("areas")
  async getAreas(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const areas = await this.em.find(Area, {}, { orderBy: { sortOrder: "ASC", name: "ASC" } });
    return areas;
  }

  @Post("areas")
  async createArea(
    @Headers("authorization") authHeader: string,
    @Body() body: { level: string; code: string; name: string; parentId?: string; centerLat?: number; centerLng?: number },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const area = this.em.create(Area, {
      level: body.level as AreaLevel,
      code: body.code,
      name: body.name,
      parent: body.parentId ? this.em.getReference(Area, body.parentId) : undefined,
      centerLat: body.centerLat,
      centerLng: body.centerLng,
    });
    await this.em.persistAndFlush(area);
    return area;
  }

  @Put("areas/:id")
  async updateArea(
    @Headers("authorization") authHeader: string,
    @Param("id") id: string,
    @Body() body: { name?: string; code?: string; centerLat?: number; centerLng?: number; sortOrder?: number },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const area = await this.em.findOne(Area, { id });
    if (!area) throw new HttpException("Area not found", 404);
    this.em.assign(area, body);
    await this.em.flush();
    return area;
  }

  // ─── Station CRUD ──────────────────────────────

  @Get("stations/all")
  async getAllStations(@Headers("authorization") authHeader?: string) {
    requireAuth(authHeader, ADMIN_ROLES);
    const stations = await this.em.find(Station, {}, { populate: ["area"], orderBy: { name: "ASC" } });
    return stations.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      areaId: s.area?.id ?? null,
      areaName: s.area?.name ?? null,
      lat: s.lat,
      lng: s.lng,
      timezone: s.timezone,
      stationType: s.stationType,
      isActive: s.isActive,
      metadata: s.metadata,
      createdAt: s.createdAt,
    }));
  }

  @Post("stations")
  async createStation(
    @Headers("authorization") authHeader: string,
    @Body()
    body: {
      code: string;
      name: string;
      lat: number;
      lng: number;
      areaId?: string;
      timezone?: string;
      stationType?: string;
      address?: string;
      elevationM?: number;
      metadata?: Record<string, any>;
    },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);

    // Check unique code
    const existing = await this.em.findOne(Station, { code: body.code });
    if (existing) throw new HttpException(`Station code '${body.code}' already exists`, 409);

    const station = this.em.create(Station, {
      code: body.code,
      name: body.name,
      lat: body.lat,
      lng: body.lng,
      area: body.areaId ? this.em.getReference(Area, body.areaId) : undefined,
      timezone: body.timezone ?? "Asia/Ho_Chi_Minh",
      stationType: (body.stationType as StationType) ?? StationType.MONITORING,
      address: body.address,
      elevationM: body.elevationM,
      metadata: body.metadata ?? {},
    });
    await this.em.persistAndFlush(station);
    return {
      id: station.id,
      code: station.code,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      isActive: station.isActive,
    };
  }

  @Put("stations/:id")
  async updateStation(
    @Headers("authorization") authHeader: string,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      lat?: number;
      lng?: number;
      areaId?: string;
      timezone?: string;
      isActive?: boolean;
      address?: string;
      metadata?: Record<string, any>;
    },
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const station = await this.em.findOne(Station, { id });
    if (!station) throw new HttpException("Station not found", 404);

    if (body.areaId !== undefined) {
      station.area = body.areaId ? this.em.getReference(Area, body.areaId) : undefined;
    }
    const { areaId, ...rest } = body;
    this.em.assign(station, rest);
    await this.em.flush();
    return { id: station.id, code: station.code, name: station.name, isActive: station.isActive };
  }

  @Delete("stations/:id")
  async deleteStation(
    @Headers("authorization") authHeader: string,
    @Param("id") id: string,
  ) {
    requireAuth(authHeader, ADMIN_ROLES);
    const station = await this.em.findOne(Station, { id });
    if (!station) throw new HttpException("Station not found", 404);
    await this.em.removeAndFlush(station);
    return { ok: true };
  }
}
