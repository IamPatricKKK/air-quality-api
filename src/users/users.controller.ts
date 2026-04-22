import { Body, Controller, Get, Headers, Patch, Query } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { wrap } from "@mikro-orm/core";
import { User, UserPreference, UserPinnedStation, Station } from "../entities";
import { requireAuth, resolveActingUserId } from "../auth/jwt";

interface PreferencesRow {
  notification_mode: string;
  favorite_regions: string[] | null;
  push_enabled: boolean;
  email_enabled: boolean;
  daily_report_enabled: boolean;
  location_lat: number | null;
  location_lng: number | null;
  pinned_station_ids: string[] | null;
}

interface PreferencesPayload {
  userId?: string;
  notificationMode?: string;
  favoriteRegions?: string[];
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  dailyReportEnabled?: boolean;
  pinnedStationIds?: string[];
  location?: {
    lat: number;
    lng: number;
  } | null;
}

const DEFAULT_PREFERENCES = {
  notificationMode: "all",
  favoriteRegions: [] as string[],
  pushEnabled: true,
  emailEnabled: true,
  dailyReportEnabled: true,
  pinnedStationIds: [] as string[],
  location: undefined as { lat: number; lng: number } | undefined,
};

function mapPreferences(row: PreferencesRow) {
  return {
    notificationMode: row.notification_mode,
    favoriteRegions: row.favorite_regions ?? [],
    pushEnabled: row.push_enabled,
    emailEnabled: row.email_enabled,
    dailyReportEnabled: row.daily_report_enabled,
    pinnedStationIds: row.pinned_station_ids ?? [],
    location:
      row.location_lat != null && row.location_lng != null
        ? { lat: row.location_lat, lng: row.location_lng }
        : undefined,
  };
}

@Controller("users")
export class UsersController {
  constructor(private readonly em: EntityManager) {}

  @Get("preferences")
  async getPreferences(@Headers("authorization") authHeader?: string, @Query("userId") userId?: string) {
    const claims = requireAuth(authHeader);
    const effectiveUserId = resolveActingUserId(userId, claims);

    const rows = await this.em.getConnection().execute<PreferencesRow>(
      `
        SELECT
          up.notification_mode,
          up.favorite_regions,
          up.push_enabled,
          up.email_enabled,
          up.daily_report_enabled,
          up.location_lat,
          up.location_lng,
          ARRAY_REMOVE(ARRAY_AGG(ups.station_id::text ORDER BY ups.sort_order), NULL) AS pinned_station_ids
        FROM app.user_preferences up
        LEFT JOIN app.user_pinned_stations ups ON ups.user_id = up.user_id
        WHERE ($1::uuid IS NULL OR up.user_id = $1::uuid)
        GROUP BY up.user_id, up.notification_mode, up.favorite_regions, up.push_enabled, up.email_enabled, up.daily_report_enabled, up.location_lat, up.location_lng, up.created_at
        ORDER BY up.created_at ASC
        LIMIT 1
      `,
      [effectiveUserId ?? null],
    );

    const row = rows?.[0];
    if (row) {
      return mapPreferences(row);
    }

    return DEFAULT_PREFERENCES;
  }

  @Patch("preferences")
  async updatePreferences(
    @Headers("authorization") authHeader?: string,
    @Body() body?: PreferencesPayload,
    @Query("userId") userIdFromQuery?: string,
  ) {
    const claims = requireAuth(authHeader);
    const payload = body ?? {};
    const userId = resolveActingUserId(payload.userId ?? userIdFromQuery, claims);

    const nextPreferences = await this.em.transactional(async (em) => {
      const user = await em.findOne(User, { id: userId });

      if (!user) {
        return null;
      }

      const currentRows = await em.getConnection().execute<PreferencesRow>(
        `
          SELECT
            up.notification_mode,
            up.favorite_regions,
            up.push_enabled,
            up.email_enabled,
            up.daily_report_enabled,
            up.location_lat,
            up.location_lng,
            ARRAY_REMOVE(ARRAY_AGG(ups.station_id::text ORDER BY ups.sort_order), NULL) AS pinned_station_ids
          FROM app.user_preferences up
          LEFT JOIN app.user_pinned_stations ups ON ups.user_id = up.user_id
          WHERE up.user_id = $1::uuid
          GROUP BY up.user_id, up.notification_mode, up.favorite_regions, up.push_enabled, up.email_enabled, up.daily_report_enabled, up.location_lat, up.location_lng, up.created_at
          LIMIT 1
        `,
        [userId],
      );

      const currentRow = currentRows?.[0];
      const resolvedLocation =
        payload.location === null
          ? null
          : payload.location ?? (
              currentRow?.location_lat != null && currentRow?.location_lng != null
                ? { lat: currentRow.location_lat, lng: currentRow.location_lng }
                : DEFAULT_PREFERENCES.location
            );

      const resolved = {
        notificationMode: payload.notificationMode ?? currentRow?.notification_mode ?? DEFAULT_PREFERENCES.notificationMode,
        favoriteRegions: payload.favoriteRegions ?? currentRow?.favorite_regions ?? DEFAULT_PREFERENCES.favoriteRegions,
        pushEnabled: payload.pushEnabled ?? currentRow?.push_enabled ?? DEFAULT_PREFERENCES.pushEnabled,
        emailEnabled: payload.emailEnabled ?? currentRow?.email_enabled ?? DEFAULT_PREFERENCES.emailEnabled,
        dailyReportEnabled: payload.dailyReportEnabled ?? currentRow?.daily_report_enabled ?? true,
        pinnedStationIds: payload.pinnedStationIds ?? currentRow?.pinned_station_ids ?? DEFAULT_PREFERENCES.pinnedStationIds,
        location: resolvedLocation,
      };

      let pref = await em.findOne(UserPreference, { user: userId });

      if (!pref) {
        pref = em.create(UserPreference, {
          user: userId,
          notificationMode: resolved.notificationMode,
          favoriteRegions: resolved.favoriteRegions,
          pushEnabled: resolved.pushEnabled,
          emailEnabled: resolved.emailEnabled,
          dailyReportEnabled: resolved.dailyReportEnabled,
          locationLat: resolved.location?.lat ?? null,
          locationLng: resolved.location?.lng ?? null,
        });
        await em.persistAndFlush(pref);
      } else {
        wrap(pref).assign({
          notificationMode: resolved.notificationMode,
          favoriteRegions: resolved.favoriteRegions,
          pushEnabled: resolved.pushEnabled,
          emailEnabled: resolved.emailEnabled,
          dailyReportEnabled: resolved.dailyReportEnabled,
          locationLat: resolved.location?.lat ?? null,
          locationLng: resolved.location?.lng ?? null,
        });
        await em.flush();
      }

      const existingPinned = await em.find(UserPinnedStation, { user: userId });
      for (const pinned of existingPinned) {
        await em.removeAndFlush(pinned);
      }

      for (const [index, stationId] of resolved.pinnedStationIds.entries()) {
        const pinned = em.create(UserPinnedStation, {
          user: userId,
          station: stationId,
          sortOrder: index,
        });
        await em.persistAndFlush(pinned);
      }

      return resolved;
    });

    if (nextPreferences) {
      return nextPreferences;
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...payload,
    };
  }
}
