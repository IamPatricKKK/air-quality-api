/**
 * IQAir (AirVisual) client + normalizer.
 * API docs: https://www.iqair.com/air-pollution-data-api
 *
 * Endpoint dùng:
 *   GET https://api.airvisual.com/v2/nearest_city?lat={lat}&lon={lon}&key={API_KEY}
 *
 * Free tier: 10,000 requests/month (community plan).
 * Response trả về AQI (US) hiện tại + thời tiết + thông tin thành phố gần nhất.
 *
 * IQAir được ưu tiên cao nhất (primary provider) vì:
 *  - Dữ liệu chất lượng cao (global network of sensors)
 *  - Trả về dominant pollutant (aqius scale 0-500)
 *  - Có weather data tích hợp sẵn
 *
 * IQAir chỉ trả realtime snapshot → mỗi lần fetch = 1 AqPoint + 1 WeatherPoint.
 */

import { AqPoint, WeatherPoint } from "./openmeteo";

export const IQAIR_PROVIDER_CODE = "iqair";
export const IQAIR_PROVIDER_NAME = "IQAir (AirVisual)";
export const IQAIR_PROVIDER_CATEGORY = "environmental";
export const IQAIR_PROVIDER_BASE_URL = "https://api.airvisual.com";

export const IQAIR_NEAREST_CITY_ENDPOINT_CODE = "iqair_nearest_city";
export const IQAIR_NEAREST_CITY_PARSER_KEY = "iqair.nearest_city.v2";
export const IQAIR_NEAREST_CITY_PATH = "/v2/nearest_city";

// ---------- URL builder ----------

export function buildIqairNearestCityUrl(lat: number, lng: number, apiKey: string): string {
  const url = new URL(IQAIR_NEAREST_CITY_PATH, IQAIR_PROVIDER_BASE_URL);
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lng.toFixed(4));
  url.searchParams.set("key", apiKey);
  return url.toString();
}

// ---------- Fetcher ----------

export async function fetchIqair(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const bodyText = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = { raw: bodyText };
    }
    return {
      ok: res.ok && payload?.status === "success",
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
 * IQAir nearest_city response shape:
 * {
 *   status: "success",
 *   data: {
 *     city: "Hanoi",
 *     state: "Hanoi",
 *     country: "Vietnam",
 *     location: { type: "Point", coordinates: [105.8542, 21.0285] },
 *     current: {
 *       pollution: {
 *         ts: "2024-01-15T14:00:00.000Z",
 *         aqius: 152,          // US AQI (0-500)
 *         mainus: "p2",        // PM2.5 dominant
 *         aqicn: 89,           // CN AQI
 *         maincn: "p2"
 *       },
 *       weather: {
 *         ts: "2024-01-15T14:00:00.000Z",
 *         tp: 28,              // temperature °C
 *         pr: 1013,            // pressure hPa
 *         hu: 75,              // humidity %
 *         ws: 3.5,             // wind speed m/s
 *         wd: 180,             // wind direction deg
 *         ic: "03d"            // weather icon code
 *       }
 *     }
 *   }
 * }
 *
 * IQAir mainus/maincn pollutant codes:
 *   p1 = PM10, p2 = PM2.5, o3 = O3, n2 = NO2, s2 = SO2, co = CO
 */

export interface IqairPollution {
  ts: string;
  aqius: number;
  mainus: string;
  aqicn?: number;
  maincn?: string;
}

export interface IqairWeather {
  ts: string;
  tp: number;
  pr: number;
  hu: number;
  ws: number;
  wd: number;
  ic: string;
}

export interface IqairCurrent {
  pollution: IqairPollution;
  weather: IqairWeather;
}

export interface IqairData {
  city: string;
  state: string;
  country: string;
  location: { type: string; coordinates: [number, number] };
  current: IqairCurrent;
}

export interface IqairResponse {
  status: string;
  data: IqairData;
}

// ---------- Normalizer ----------

/**
 * Map IQAir dominant pollutant code → PM2.5 estimated concentration.
 * IQAir nearest_city không trả về concentration chi tiết cho mỗi pollutant,
 * chỉ có AQI và pollutant code. Ta infer PM2.5 từ AQI nếu main=p2.
 *
 * Dùng EPA AQI breakpoints đảo ngược (approximation).
 */
function aqiToPm25(aqi: number): number | null {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  // EPA AQI breakpoints for PM2.5 (µg/m³)
  const table: Array<[number, number, number, number]> = [
    [0, 50, 0.0, 12.0],
    [51, 100, 12.1, 35.4],
    [101, 150, 35.5, 55.4],
    [151, 200, 55.5, 150.4],
    [201, 300, 150.5, 250.4],
    [301, 500, 250.5, 500.4],
  ];
  for (const [iLo, iHi, cLo, cHi] of table) {
    if (aqi >= iLo && aqi <= iHi) {
      return Number(
        (((aqi - iLo) / (iHi - iLo)) * (cHi - cLo) + cLo).toFixed(1),
      );
    }
  }
  return null;
}

function aqiToPm10(aqi: number): number | null {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  const table: Array<[number, number, number, number]> = [
    [0, 50, 0, 54],
    [51, 100, 55, 154],
    [101, 150, 155, 254],
    [151, 200, 255, 354],
    [201, 300, 355, 424],
    [301, 500, 425, 604],
  ];
  for (const [iLo, iHi, cLo, cHi] of table) {
    if (aqi >= iLo && aqi <= iHi) {
      return Number(
        (((aqi - iLo) / (iHi - iLo)) * (cHi - cLo) + cLo).toFixed(1),
      );
    }
  }
  return null;
}

/**
 * Chuyển IQAir response thành AqPoint.
 * Lưu ý: IQAir chỉ trả dominant pollutant + AQI; các pollutant còn lại để null.
 */
export function normalizeIqairAq(payload: any): AqPoint[] {
  if (payload?.status !== "success" || !payload?.data?.current?.pollution) {
    return [];
  }

  const p: IqairPollution = payload.data.current.pollution;
  if (typeof p.aqius !== "number" || p.aqius < 0) return [];

  const observedAt = p.ts ? new Date(p.ts).toISOString() : new Date().toISOString();
  const aqi = Math.round(p.aqius);

  // Infer dominant pollutant concentration từ AQI
  let pm25: number | null = null;
  let pm10: number | null = null;
  if (p.mainus === "p2") {
    pm25 = aqiToPm25(aqi);
  } else if (p.mainus === "p1") {
    pm10 = aqiToPm10(aqi);
  }

  return [
    {
      observed_at: observedAt,
      aqi,
      european_aqi: null,
      pm25,
      pm10,
      co: null,
      no2: null,
      so2: null,
      o3: null,
      ammonia: null,
      dust: null,
      aerosol_optical_depth: null,
      uv_index: null,
    },
  ];
}

/**
 * Chuyển IQAir weather thành WeatherPoint.
 */
export function normalizeIqairWeather(payload: any): WeatherPoint[] {
  if (payload?.status !== "success" || !payload?.data?.current?.weather) {
    return [];
  }
  const w: IqairWeather = payload.data.current.weather;
  const observedAt = w.ts ? new Date(w.ts).toISOString() : new Date().toISOString();

  return [
    {
      observed_at: observedAt,
      temperature_c: typeof w.tp === "number" ? w.tp : null,
      apparent_temperature_c: null,
      dew_point_c: null,
      humidity_pct: typeof w.hu === "number" ? w.hu : null,
      wind_speed_mps: typeof w.ws === "number" ? w.ws : null,
      wind_direction_deg: typeof w.wd === "number" ? w.wd : null,
      wind_gusts_mps: null,
      pressure_hpa: typeof w.pr === "number" ? w.pr : null,
      surface_pressure_hpa: null,
      visibility_km: null,
      precipitation_mm: null,
      rain_mm: null,
      cloud_cover_pct: null,
      weather_code: w.ic ?? null,
    },
  ];
}
