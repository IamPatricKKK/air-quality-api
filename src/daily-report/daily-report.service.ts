import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "../alerts/email.service";
import { PushService } from "../push/push.service";

interface UserWithLocation {
  user_id: string;
  email: string;
  push_enabled: boolean;
  email_enabled: boolean;
  daily_report_enabled: boolean;
  favorite_regions: string[];
  location_lat: number | null;
  location_lng: number | null;
}

interface StationAqi {
  station_id: string;
  station_name: string;
  station_lat: number;
  station_lng: number;
  area_name: string | null;
  aqi: number;
  pm25: number | null;
  observed_at: string;
}

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
  ) {}

  /** Send daily air quality report to all users. Returns number of users notified. */
  async sendDailyReport(): Promise<number> {
    const users = await this.getUsersWithLocation();
    if (!users.length) {
      this.logger.log("No users with location data — daily report skipped");
      return 0;
    }

    const allReadings = await this.getLatestReadings();
    if (!allReadings.length) {
      this.logger.log("No recent AQI readings — daily report skipped");
      return 0;
    }

    let notified = 0;

    for (const user of users) {
      try {
        const sent = await this.processUser(user, allReadings);
        if (sent) notified++;
      } catch (err) {
        this.logger.error(`Daily report failed for user ${user.user_id}: ${err}`);
      }
    }

    this.logger.log(`Daily report sent to ${notified}/${users.length} user(s)`);
    return notified;
  }

  private async processUser(
    user: UserWithLocation,
    allReadings: StationAqi[],
  ): Promise<boolean> {
    // Find relevant station data for user's location
    const readings = await this.findReadingsForUser(user, allReadings);
    if (!readings.length) return false;

    // Pick the primary reading (highest AQI or first)
    const primary = readings.reduce((a, b) => ((a.aqi ?? 0) >= (b.aqi ?? 0) ? a : b));
    const aqiCategory = this.getAqiCategoryCode(primary.aqi);
    const categoryLabel = this.getCategoryLabel(aqiCategory);

    const title = `Chat luong khong khi hom nay: ${categoryLabel}`;
    const body = this.buildBody(primary, readings, categoryLabel);

    // ALWAYS create in-app notification — even if user disabled notifications
    await this.createInAppNotification(user.user_id, primary.station_id, title, body, {
      aqi: primary.aqi,
      aqi_category: aqiCategory,
      stations: readings.map((r) => ({
        station_id: r.station_id,
        station_name: r.station_name,
        aqi: r.aqi,
      })),
    });

    // Email & push only if user has daily report enabled
    if (user.daily_report_enabled) {
      if (user.email_enabled && user.email) {
        await this.sendEmail(user.email, title, primary, readings, categoryLabel);
      }
      if (user.push_enabled) {
        await this.pushService.sendToUser(user.user_id, {
          title,
          body: `AQI: ${primary.aqi} (${categoryLabel}) tai ${primary.station_name}`,
          tag: "daily-report",
          stationId: primary.station_id,
          aqi: primary.aqi,
          category: aqiCategory,
          url: "/",
        });
      }
    }

    return true;
  }

  private buildBody(
    primary: StationAqi,
    readings: StationAqi[],
    categoryLabel: string,
  ): string {
    let body = `AQI: ${primary.aqi} (${categoryLabel}) tai ${primary.station_name}.`;
    if (primary.pm25 !== null) {
      body += ` PM2.5: ${primary.pm25} ug/m3.`;
    }
    body += ` ${this.getHealthAdvice(primary.aqi)}`;
    if (readings.length > 1) {
      const others = readings
        .filter((r) => r.station_id !== primary.station_id)
        .slice(0, 3)
        .map((r) => `${r.station_name}: AQI ${r.aqi}`)
        .join(", ");
      if (others) body += ` Cac tram khac: ${others}.`;
    }
    return body;
  }

  private async findReadingsForUser(
    user: UserWithLocation,
    allReadings: StationAqi[],
  ): Promise<StationAqi[]> {
    // Priority 1: favoriteRegions — find stations in those areas (including children)
    if (user.favorite_regions.length > 0) {
      const stationIds = await this.getStationIdsInAreas(user.favorite_regions);
      if (stationIds.length > 0) {
        const matched = allReadings.filter((r) => stationIds.includes(r.station_id));
        if (matched.length > 0) return matched;
      }
    }

    // Priority 2: lat/lng — find nearest station
    if (user.location_lat !== null && user.location_lng !== null) {
      const nearest = this.findNearestStation(
        allReadings,
        user.location_lat,
        user.location_lng,
      );
      if (nearest) return [nearest];
    }

    return [];
  }

  private async getStationIdsInAreas(areaIds: string[]): Promise<string[]> {
    if (!areaIds.length) return [];
    const placeholders = areaIds.map((_, i) => `$${i + 1}::uuid`).join(", ");
    const rows: any = await this.em.getConnection().execute(
      `WITH RECURSIVE area_tree AS (
         SELECT id FROM catalog.areas WHERE id IN (${placeholders})
         UNION ALL
         SELECT a.id FROM catalog.areas a JOIN area_tree t ON a.parent_id = t.id
       )
       SELECT s.id FROM catalog.stations s
       WHERE s.area_id IN (SELECT id FROM area_tree)
         AND s.is_active = true`,
      areaIds,
    );
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r: any) => r.id);
  }

  private findNearestStation(
    readings: StationAqi[],
    lat: number,
    lng: number,
  ): StationAqi | null {
    let best: StationAqi | null = null;
    let bestDist = Infinity;
    for (const r of readings) {
      const dlat = r.station_lat - lat;
      const dlng = r.station_lng - lng;
      const dist = dlat * dlat + dlng * dlng;
      if (dist < bestDist) {
        bestDist = dist;
        best = r;
      }
    }
    return best;
  }

  /** Get latest readings with station lat/lng for distance calculation */
  private async getLatestReadings(): Promise<StationAqi[]> {
    const rows: any = await this.em.getConnection().execute(`
      SELECT DISTINCT ON (s.id)
        s.id          AS station_id,
        s.name        AS station_name,
        s.lat         AS station_lat,
        s.lng         AS station_lng,
        ar.name       AS area_name,
        a.aqi,
        a.pm25,
        a.observed_at
      FROM catalog.stations s
      JOIN core.air_quality_observations a ON a.station_id = s.id
      LEFT JOIN catalog.areas ar ON s.area_id = ar.id
      WHERE a.observed_at > now() - INTERVAL '6 hours'
        AND s.is_active = true
      ORDER BY s.id, a.observed_at DESC
    `);
    return Array.isArray(rows) ? rows : (rows.rows ?? []);
  }

  /** Get all active users who have location info */
  private async getUsersWithLocation(): Promise<UserWithLocation[]> {
    const rows: any = await this.em.getConnection().execute(`
      SELECT
        u.id          AS user_id,
        u.email,
        COALESCE(p.push_enabled, true)          AS push_enabled,
        COALESCE(p.email_enabled, true)          AS email_enabled,
        COALESCE(p.daily_report_enabled, true)   AS daily_report_enabled,
        COALESCE(p.favorite_regions, '{}')       AS favorite_regions,
        p.location_lat,
        p.location_lng
      FROM iam.users u
      LEFT JOIN app.user_preferences p ON p.user_id = u.id
      WHERE u.status = 'active'
        AND (
          p.favorite_regions IS NOT NULL AND p.favorite_regions != '{}'
          OR p.location_lat IS NOT NULL
        )
    `);
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r: any) => ({
      ...r,
      favorite_regions: this.parseArray(r.favorite_regions),
    }));
  }

  private parseArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  private async createInAppNotification(
    userId: string,
    stationId: string | null,
    title: string,
    body: string,
    sourceContext: Record<string, any>,
  ): Promise<void> {
    await this.em.getConnection().execute(
      `INSERT INTO app.notifications (user_id, station_id, title, body, category, status, source_context, sent_at)
       VALUES (?, ?, ?, ?, 'daily_report', 'sent', ?::jsonb, now())`,
      [userId, stationId ?? null, title, body, JSON.stringify(sourceContext)],
    );
  }

  private async sendEmail(
    to: string,
    title: string,
    primary: StationAqi,
    readings: StationAqi[],
    categoryLabel: string,
  ): Promise<void> {
    const aqiColor = this.getAqiColor(primary.aqi);
    const stationRows = readings
      .slice(0, 5)
      .map(
        (r) => `
      <tr>
        <td style="padding: 8px; color: #e0e0e0;">${r.station_name}</td>
        <td style="padding: 8px; color: #e0e0e0;">${r.area_name ?? "-"}</td>
        <td style="padding: 8px; font-weight: bold; color: ${this.getAqiColor(r.aqi)};">${r.aqi}</td>
        <td style="padding: 8px; color: #e0e0e0;">${r.pm25 ?? "-"}</td>
      </tr>`,
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
          <h2 style="color: ${aqiColor}; margin: 0 0 4px;">
            Chat luong khong khi hom nay
          </h2>
          <p style="color: #9ca3af; margin: 0 0 16px; font-size: 13px;">
            Bao cao hang ngay — ${new Date().toLocaleDateString("vi-VN")}
          </p>

          <div style="background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 16px; text-align: center;">
            <div style="font-size: 48px; font-weight: bold; color: ${aqiColor};">${primary.aqi}</div>
            <div style="font-size: 16px; color: ${aqiColor}; margin-top: 4px;">${categoryLabel}</div>
            <div style="font-size: 13px; color: #9ca3af; margin-top: 4px;">
              Tram: ${primary.station_name}${primary.pm25 !== null ? ` · PM2.5: ${primary.pm25} ug/m3` : ""}
            </div>
          </div>

          <p style="margin: 0 0 12px; line-height: 1.6; font-size: 14px;">
            ${this.getHealthAdvice(primary.aqi)}
          </p>

          ${
            readings.length > 1
              ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px;">
            <tr style="border-bottom: 1px solid #374151;">
              <th style="padding: 8px; text-align: left; color: #9ca3af;">Tram</th>
              <th style="padding: 8px; text-align: left; color: #9ca3af;">Khu vuc</th>
              <th style="padding: 8px; text-align: left; color: #9ca3af;">AQI</th>
              <th style="padding: 8px; text-align: left; color: #9ca3af;">PM2.5</th>
            </tr>
            ${stationRows}
          </table>`
              : ""
          }

          <hr style="border: none; border-top: 1px solid #374151; margin: 16px 0;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Chat Luong Khong Khi Viet Nam — Bao cao tu dong hang ngay luc 6h sang
          </p>
        </div>
      </div>
    `;

    await this.emailService.send({
      to,
      subject: `[CLKKVN] AQI hom nay: ${primary.aqi} (${categoryLabel})`,
      html,
    });
  }

  private getAqiCategoryCode(aqi: number): string {
    if (aqi <= 50) return "good";
    if (aqi <= 100) return "moderate";
    if (aqi <= 150) return "unhealthy_sensitive";
    if (aqi <= 200) return "unhealthy";
    if (aqi <= 300) return "very_unhealthy";
    return "hazardous";
  }

  private getCategoryLabel(code: string): string {
    const labels: Record<string, string> = {
      good: "Tot",
      moderate: "Trung binh",
      unhealthy_sensitive: "Khong tot cho nhom nhay cam",
      unhealthy: "Khong tot",
      very_unhealthy: "Rat khong tot",
      hazardous: "Nguy hai",
    };
    return labels[code] ?? code;
  }

  private getAqiColor(aqi: number): string {
    if (aqi <= 50) return "#22c55e";
    if (aqi <= 100) return "#eab308";
    if (aqi <= 150) return "#f97316";
    if (aqi <= 200) return "#ef4444";
    if (aqi <= 300) return "#a855f7";
    return "#991b1b";
  }

  private getHealthAdvice(aqi: number): string {
    if (aqi <= 50)
      return "Chat luong khong khi tot, thich hop cho moi hoat dong ngoai troi.";
    if (aqi <= 100)
      return "Chat luong khong khi chap nhan duoc. Nhom nhay cam nen han che hoat dong ngoai troi keo dai.";
    if (aqi <= 150)
      return "Nhom nhay cam (tre em, nguoi gia, nguoi benh ho hap) nen han che hoat dong ngoai troi.";
    if (aqi <= 200)
      return "Moi nguoi nen han che hoat dong ngoai troi. Deo khau trang khi ra ngoai.";
    if (aqi <= 300)
      return "Canh bao suc khoe! Tranh hoat dong ngoai troi. Dong cua so, su dung may loc khong khi.";
    return "Nguy hai! Khong ra ngoai. Dong kin cua, su dung may loc khong khi.";
  }
}
