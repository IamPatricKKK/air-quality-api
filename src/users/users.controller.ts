import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import { userPreferences } from "../mock/mock.data";
import { queryRows, withTransaction } from "../db/database";

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

async function readPreferences(userId?: string) {
  const rows = await queryRows<PreferencesRow>(
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
    [userId ?? null],
  );

  return rows?.[0] ?? null;
}

@Controller("users")
export class UsersController {
  @Get("preferences")
  async getPreferences(@Query("userId") userId?: string) {
    const row = await readPreferences(userId);

    if (row) {
      return mapPreferences(row);
    }

    return userPreferences;
  }

  @Patch("preferences")
  async updatePreferences(@Body() body: PreferencesPayload, @Query("userId") userIdFromQuery?: string) {
    const userId = body.userId ?? userIdFromQuery;

    const nextPreferences = await withTransaction(async (client) => {
      if (!userId) {
        return null;
      }

      const user = await client.query<{ id: string }>(
        `
          SELECT id
          FROM iam.users
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [userId],
      );

      if (user.rowCount === 0) {
        return null;
      }

      const current = await client.query<PreferencesRow>(
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

      const currentRow = current.rows[0];
      const fallbackLocation = userPreferences.location;
      const resolvedLocation =
        body.location === null
          ? null
          : body.location ?? (
              currentRow?.location_lat != null && currentRow?.location_lng != null
                ? { lat: currentRow.location_lat, lng: currentRow.location_lng }
                : fallbackLocation
            );

      const resolved = {
        notificationMode: body.notificationMode ?? currentRow?.notification_mode ?? userPreferences.notificationMode,
        favoriteRegions: body.favoriteRegions ?? currentRow?.favorite_regions ?? userPreferences.favoriteRegions,
        pushEnabled: body.pushEnabled ?? currentRow?.push_enabled ?? userPreferences.pushEnabled,
        emailEnabled: body.emailEnabled ?? currentRow?.email_enabled ?? userPreferences.emailEnabled,
        dailyReportEnabled: body.dailyReportEnabled ?? currentRow?.daily_report_enabled ?? true,
        pinnedStationIds: body.pinnedStationIds ?? currentRow?.pinned_station_ids ?? userPreferences.pinnedStationIds,
        location: resolvedLocation,
      };

      await client.query(
        `
          INSERT INTO app.user_preferences (
            user_id,
            notification_mode,
            favorite_regions,
            push_enabled,
            email_enabled,
            daily_report_enabled,
            location_lat,
            location_lng
          )
          VALUES ($1::uuid, $2, $3::text[], $4, $5, $6, $7, $8)
          ON CONFLICT (user_id) DO UPDATE SET
            notification_mode = EXCLUDED.notification_mode,
            favorite_regions = EXCLUDED.favorite_regions,
            push_enabled = EXCLUDED.push_enabled,
            email_enabled = EXCLUDED.email_enabled,
            daily_report_enabled = EXCLUDED.daily_report_enabled,
            location_lat = EXCLUDED.location_lat,
            location_lng = EXCLUDED.location_lng,
            updated_at = now()
        `,
        [
          userId,
          resolved.notificationMode,
          resolved.favoriteRegions,
          resolved.pushEnabled,
          resolved.emailEnabled,
          resolved.dailyReportEnabled,
          resolved.location?.lat ?? null,
          resolved.location?.lng ?? null,
        ],
      );

      await client.query(
        `
          DELETE FROM app.user_pinned_stations
          WHERE user_id = $1::uuid
        `,
        [userId],
      );

      for (const [index, stationId] of resolved.pinnedStationIds.entries()) {
        await client.query(
          `
            INSERT INTO app.user_pinned_stations (user_id, station_id, sort_order)
            VALUES ($1::uuid, $2::uuid, $3)
            ON CONFLICT (user_id, station_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
          `,
          [userId, stationId, index],
        );
      }

      return resolved;
    });

    if (nextPreferences) {
      return nextPreferences;
    }

    return {
      ...userPreferences,
      ...body,
    };
  }
}
