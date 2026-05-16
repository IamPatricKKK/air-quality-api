/**
 * OpenAQ v3 client + normalizer.
 * API docs: https://docs.openaq.org/
 *
 * OpenAQ = kho dữ liệu trạm chính phủ + đại sứ quán toàn cầu (open-source).
 * Vietnam có ~10-30 trạm (US Embassy Hà Nội/HCM, trạm chính phủ...).
 *
 * Mô hình giống WAQI: với mỗi catalog.stations, query OpenAQ location gần nhất
 * trong bán kính, lấy measurements mới nhất → 1 AqPoint.
 *
 * OpenAQ trả nồng độ thô (µg/m³) → tính US AQI bằng công thức EPA (PM2.5/PM10),
 * lấy MAX hai chỉ số (đúng convention EPA, cùng cách openweather.ts làm).
 *
 * Cần OPENAQ_API_KEY (free: https://explore.openaq.org/register).
 * Không có key → runOpenaq() skip sạch, KHÔNG ảnh hưởng các provider khác.
 */

import { AqPoint } from "./openmeteo";

export const OPENAQ_PROVIDER_CODE = "openaq";
export const OPENAQ_PROVIDER_NAME = "OpenAQ (Government & Reference Stations)";
export const OPENAQ_PROVIDER_CATEGORY = "environmental";
export const OPENAQ_PROVIDER_BASE_URL = "https://api.openaq.org";

export const OPENAQ_ENDPOINT_CODE = "openaq_location_latest";
export const OPENAQ_PARSER_KEY = "openaq.latest.v3";

// Bán kính tìm trạm OpenAQ gần catalog station (m). OpenAQ v3 cap = 25000.
export const OPENAQ_SEARCH_RADIUS_M = 25000;

// ---------- URL builders ----------

export function buildOpenaqNearestLocationUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    coordinates: `${lat},${lng}`,
    radius: String(OPENAQ_SEARCH_RADIUS_M),
    limit: "1",
    order_by: "distance",
    sort_order: "asc",
  });
  return `${OPENAQ_PROVIDER_BASE_URL}/v3/locations?${params.toString()}`;
}

export function buildOpenaqLatestUrl(locationId: number | string): string {
  return `${OPENAQ_PROVIDER_BASE_URL}/v3/locations/${locationId}/latest`;
}

// ---------- Fetcher ----------

export async function fetchOpenaq(url: string, apiKey: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "X-API-Key": apiKey },
    });
    const bodyText = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = { raw: bodyText };
    }
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - started,
      payload,
    };
  } finally {
    clearTimeout(to);
  }
}

// ---------- EPA AQI helpers (PM2.5 / PM10) ----------

function pm25ToAqi(pm25: number): number | null {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  const bp: Array<[number, number, number, number]> = [
    [0.0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (pm25 >= cLo && pm25 <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (pm25 - cLo) + iLo);
    }
  }
  if (pm25 > 500.4) return 500;
  return null;
}

function pm10ToAqi(pm10: number): number | null {
  if (!Number.isFinite(pm10) || pm10 < 0) return null;
  const bp: Array<[number, number, number, number]> = [
    [0, 54, 0, 50],
    [55, 154, 51, 100],
    [155, 254, 101, 150],
    [255, 354, 151, 200],
    [355, 424, 201, 300],
    [425, 604, 301, 500],
  ];
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (pm10 >= cLo && pm10 <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (pm10 - cLo) + iLo);
    }
  }
  if (pm10 > 604) return 500;
  return null;
}

// ---------- Types ----------

export interface OpenaqLocationsResponse {
  results?: Array<{ id: number; name?: string; coordinates?: { latitude: number; longitude: number } }>;
}

export interface OpenaqLatestItem {
  datetime?: { utc?: string };
  value?: number;
  parameter?: { name?: string };
  // OpenAQ v3 đôi khi trả parameter dạng string id hoặc object — handle cả hai.
  parameterName?: string;
}

export interface OpenaqLatestResponse {
  results?: OpenaqLatestItem[];
}

// ---------- Helpers ----------

export function parseNearestLocationId(payload: any): number | null {
  const results = payload?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const id = results[0]?.id;
  return typeof id === "number" ? id : null;
}

function paramName(item: OpenaqLatestItem): string | null {
  const n = item.parameter?.name ?? item.parameterName;
  return typeof n === "string" ? n.toLowerCase() : null;
}

/**
 * Chuyển OpenAQ /latest response thành AqPoint (cùng interface Open-Meteo).
 * Gom các parameter (pm25, pm10, o3, no2, so2, co) thành 1 snapshot.
 * AQI = MAX(AQI_pm25, AQI_pm10) theo EPA. Bỏ qua nếu không có PM nào.
 */
export function normalizeOpenaqAq(payload: any): AqPoint[] {
  const results: OpenaqLatestItem[] = payload?.results ?? [];
  if (!Array.isArray(results) || results.length === 0) return [];

  const vals: Record<string, number> = {};
  let latestTime: string | null = null;
  for (const item of results) {
    const name = paramName(item);
    if (!name || typeof item.value !== "number" || Number.isNaN(item.value)) continue;
    vals[name] = item.value;
    const t = item.datetime?.utc;
    if (t && (!latestTime || t > latestTime)) latestTime = t;
  }

  const pm25 = vals["pm25"] ?? null;
  const pm10 = vals["pm10"] ?? null;
  const aqiPm25 = pm25 !== null ? pm25ToAqi(pm25) : null;
  const aqiPm10 = pm10 !== null ? pm10ToAqi(pm10) : null;
  const aqi = Math.max(aqiPm25 ?? 0, aqiPm10 ?? 0);
  if (aqi <= 0) return [];

  return [
    {
      observed_at: latestTime
        ? new Date(latestTime).toISOString()
        : new Date().toISOString(),
      aqi,
      european_aqi: null,
      pm25,
      pm10,
      co: vals["co"] ?? null,
      no2: vals["no2"] ?? null,
      so2: vals["so2"] ?? null,
      o3: vals["o3"] ?? null,
      ammonia: vals["nh3"] ?? null,
      dust: null,
      aerosol_optical_depth: null,
      uv_index: null,
    },
  ];
}
