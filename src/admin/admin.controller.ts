import { Controller, Get } from "@nestjs/common";
import { adminUsers, notifications, stations } from "../mock/mock.data";
import { queryRows } from "../db/database";

@Controller("admin")
export class AdminController {
  @Get("dashboard")
  async getDashboard() {
    const counts = await queryRows<{
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

    const latestStations = await queryRows<{
      station_id: string;
      station_code: string;
      station_name: string;
      area_id: string | null;
      lat: number;
      lng: number;
      aqi: number | null;
      source_provider_code: string | null;
    }>(`
      SELECT *
      FROM app.v_station_latest_air_quality
      ORDER BY observed_at DESC NULLS LAST
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
          region: "N/A",
          city: "N/A",
          lat: station.lat,
          lng: station.lng,
          latestAqi: station.aqi ?? 0,
          isActive: true,
          sourceProvider: station.source_provider_code ?? "unknown",
        })),
      };
    }

    return {
      users: adminUsers.length,
      stations: stations.length,
      providers: 4,
      pipelinesRunning: 1,
      recentRuns: [],
      latestStations: stations,
    };
  }

  @Get("users")
  async getUsers() {
    const rows = await queryRows<{
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

    if (rows) {
      return rows.map((row) => {
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

    return adminUsers;
  }

  @Get("stations")
  async getStations() {
    const rows = await queryRows<{
      station_id: string;
      station_code: string;
      station_name: string;
      lat: number;
      lng: number;
      aqi: number | null;
      source_provider_code: string | null;
    }>(`
      SELECT *
      FROM app.v_station_latest_air_quality
      ORDER BY station_name
    `);

    if (rows) {
      return rows.map((row) => ({
        id: row.station_id,
        code: row.station_code,
        name: row.station_name,
        region: "N/A",
        city: "N/A",
        lat: row.lat,
        lng: row.lng,
        latestAqi: row.aqi ?? 0,
        isActive: true,
        sourceProvider: row.source_provider_code ?? "unknown",
      }));
    }

    return stations;
  }

  @Get("notifications")
  async getNotifications() {
    const rows = await queryRows<{
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

    if (rows) {
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        audience: row.audience ?? "unknown",
        channel: row.channel ?? "in_app",
        status: row.status,
        createdAt: row.created_at,
      }));
    }

    return notifications;
  }
}
