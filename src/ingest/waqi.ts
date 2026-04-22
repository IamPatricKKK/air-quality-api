/**
 * WAQI (World Air Quality Index) client + normalizer.
 * API docs: https://aqicn.org/json-api/doc/
 *
 * Endpoint dùng: /feed/geo:{lat};{lng}/?token=TOKEN
 * Trả về realtime AQI + pollutant sub-indexes cho trạm gần nhất.
 *
 * Khác với Open-Meteo (trả về chuỗi thời gian hourly),
 * WAQI chỉ trả realtime snapshot — mỗi lần fetch = 1 AqPoint.
 */

import { AqPoint } from "./openmeteo";

export const WAQI_PROVIDER_CODE = "waqi";
export const WAQI_PROVIDER_NAME = "World Air Quality Index (WAQI)";
export const WAQI_PROVIDER_CATEGORY = "environmental";
export const WAQI_PROVIDER_BASE_URL = "https://api.waqi.info";

export const WAQI_ENDPOINT_CODE = "waqi_station_feed";
export const WAQI_PARSER_KEY = "waqi.feed.v1";

// ---------- URL builder ----------

export function buildWaqiFeedUrl(lat: number, lng: number, token: string): string {
  return `${WAQI_PROVIDER_BASE_URL}/feed/geo:${lat};${lng}/?token=${encodeURIComponent(token)}`;
}

// ---------- Fetcher ----------

export async function fetchWaqi(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const bodyText = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = { raw: bodyText };
    }
    return {
      ok: res.ok && payload?.status === "ok",
      status: res.status,
      latency_ms: Date.now() - started,
      payload,
    };
  } finally {
    clearTimeout(to);
  }
}

// ---------- Types ----------

/**
 * WAQI feed response shape (simplified):
 * {
 *   status: "ok",
 *   data: {
 *     aqi: 52,
 *     idx: 12345,
 *     time: { s: "2024-01-15 14:00:00", tz: "+07:00", v: 1705305600, iso: "..." },
 *     iaqi: {
 *       pm25: { v: 12.5 },
 *       pm10: { v: 28 },
 *       o3:   { v: 35 },
 *       no2:  { v: 8 },
 *       so2:  { v: 3 },
 *       co:   { v: 0.4 },
 *       t:    { v: 28 },
 *       h:    { v: 75 },
 *       p:    { v: 1013 },
 *       w:    { v: 3.5 },
 *       ...
 *     },
 *     city: { name: "...", geo: [lat, lng], url: "..." },
 *     dominentpol: "pm25",
 *     forecast: { ... }
 *   }
 * }
 */

export interface WaqiIaqiEntry {
  v: number;
}

export interface WaqiFeedData {
  aqi: number;
  idx: number;
  time: {
    s: string;
    tz: string;
    v: number;
    iso?: string;
  };
  iaqi: Record<string, WaqiIaqiEntry>;
  city: {
    name: string;
    geo: [number, number];
    url: string;
  };
  dominentpol?: string;
}

export interface WaqiFeedResponse {
  status: string;
  data: WaqiFeedData;
}

// ---------- Normalizer ----------

function iaqiVal(iaqi: Record<string, WaqiIaqiEntry> | undefined, key: string): number | null {
  const entry = iaqi?.[key];
  if (!entry || typeof entry.v !== "number" || Number.isNaN(entry.v)) return null;
  return entry.v;
}

/**
 * Chuyển WAQI feed response thành AqPoint (cùng interface với Open-Meteo).
 * WAQI trả về 1 snapshot realtime → return mảng 0 hoặc 1 phần tử.
 */
export function normalizeWaqiAq(payload: any): AqPoint[] {
  if (payload?.status !== "ok" || !payload?.data) return [];

  const d: WaqiFeedData = payload.data;
  if (typeof d.aqi !== "number" || d.aqi < 0) return [];

  // Thời gian quan trắc
  let observedAt: string;
  if (d.time?.iso) {
    observedAt = new Date(d.time.iso).toISOString();
  } else if (d.time?.v) {
    observedAt = new Date(d.time.v * 1000).toISOString();
  } else if (d.time?.s && d.time?.tz) {
    observedAt = new Date(`${d.time.s}${d.time.tz}`).toISOString();
  } else {
    observedAt = new Date().toISOString();
  }

  return [
    {
      observed_at: observedAt,
      aqi: Math.round(d.aqi),
      european_aqi: null, // WAQI không trả EU AQI
      pm25: iaqiVal(d.iaqi, "pm25"),
      pm10: iaqiVal(d.iaqi, "pm10"),
      co: iaqiVal(d.iaqi, "co"),
      no2: iaqiVal(d.iaqi, "no2"),
      so2: iaqiVal(d.iaqi, "so2"),
      o3: iaqiVal(d.iaqi, "o3"),
      ammonia: null,     // WAQI không cung cấp
      dust: null,
      aerosol_optical_depth: null,
      uv_index: null,
    },
  ];
}

/**
 * Trích thông tin thời tiết cơ bản từ WAQI iaqi.
 * WAQI có t (temperature), h (humidity), p (pressure), w (wind).
 * Trả về object riêng (không dùng WeatherPoint vì thiếu nhiều trường).
 */
export interface WaqiWeatherSnapshot {
  observed_at: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  wind_speed_mps: number | null;
  dew_point_c: number | null;
}

export function normalizeWaqiWeather(payload: any): WaqiWeatherSnapshot | null {
  if (payload?.status !== "ok" || !payload?.data) return null;
  const d: WaqiFeedData = payload.data;
  const iaqi = d.iaqi;
  if (!iaqi) return null;

  const temp = iaqiVal(iaqi, "t");
  const hum = iaqiVal(iaqi, "h");
  // Nếu không có cả temp lẫn humidity thì bỏ qua
  if (temp === null && hum === null) return null;

  let observedAt: string;
  if (d.time?.iso) {
    observedAt = new Date(d.time.iso).toISOString();
  } else if (d.time?.v) {
    observedAt = new Date(d.time.v * 1000).toISOString();
  } else {
    observedAt = new Date().toISOString();
  }

  return {
    observed_at: observedAt,
    temperature_c: temp,
    humidity_pct: hum,
    pressure_hpa: iaqiVal(iaqi, "p"),
    wind_speed_mps: iaqiVal(iaqi, "w"),
    dew_point_c: iaqiVal(iaqi, "dew"),
  };
}
