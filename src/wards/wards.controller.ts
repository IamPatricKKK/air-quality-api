import { Controller, Get, Query } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { TtlCache } from "../common/ttl-cache";

/**
 * Danh sách xã/phường (catalog.areas level='ward') kèm AQI ĐÃ PHÂN TÍCH
 * (analytics.ward_aqi_observations — do air-quality-be suy bằng IDW từ trạm
 * thật). Phục vụ dashboard "Chất lượng không khí theo địa phương".
 *
 * KHÔNG phải trạm trên bản đồ; chỉ trả các xã đã có kết quả phân tích
 * (LEFT JOIN + WHERE o.ward_id IS NOT NULL → bỏ xã không đủ dữ liệu).
 * Public GET (giống StationsController), không cần auth.
 */
type WardRow = {
  ward_id: string;
  ward_code: string;
  ward_name: string;
  province_code: string | null;
  province_name: string | null;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  confidence_score: number | null;
  station_count: number | null;
  nearest_km: number | null;
  observed_at: string | null;
};

@Controller("wards")
export class WardsController {
  constructor(private readonly em: EntityManager) {}

  // Cache 60s, tách theo tham số province (data ward đổi theo cron BE ~3h).
  private static readonly listCache = new TtlCache<unknown[]>(60_000);

  @Get()
  async getWards(@Query("province") province?: string) {
    const cacheKey = province?.trim() || "__all__";
    const cached = WardsController.listCache.get(cacheKey);
    if (cached) return cached;

    const params: unknown[] = [];
    let provinceFilter = "";
    if (province && province.trim()) {
      params.push(province.trim());
      provinceFilter = `AND p.code = ?`;
    }

    const rows: WardRow[] = await this.em.getConnection().execute(
      `
      SELECT
        w.id::text                       AS ward_id,
        w.code                           AS ward_code,
        w.name                           AS ward_name,
        p.code                           AS province_code,
        p.name                           AS province_name,
        o.aqi                            AS aqi,
        o.pm25                           AS pm25,
        o.pm10                           AS pm10,
        o.confidence_score               AS confidence_score,
        o.station_count                  AS station_count,
        o.nearest_km                     AS nearest_km,
        o.observed_at                    AS observed_at
      FROM catalog.areas w
      LEFT JOIN catalog.areas p ON p.id = w.parent_id AND p.level = 'province'
      JOIN analytics.ward_aqi_observations o ON o.ward_id = w.id
      WHERE w.level = 'ward'
        ${provinceFilter}
      ORDER BY p.name NULLS LAST, o.aqi DESC NULLS LAST, w.name
      `,
      params,
    );

    const result = (rows ?? []).map((r) => ({
      id: r.ward_id,
      code: r.ward_code,
      name: r.ward_name,
      provinceCode: r.province_code,
      provinceName: r.province_name,
      aqi: r.aqi,
      pm25: r.pm25,
      pm10: r.pm10,
      confidence: r.confidence_score,
      stationCount: r.station_count,
      nearestKm: r.nearest_km,
      analyzedAt: r.observed_at,
      source: "idw_stations",
    }));
    WardsController.listCache.set(cacheKey, result);
    return result;
  }
}
