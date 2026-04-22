/**
 * OpenWeatherMap Air Pollution + Weather client + normalizer.
 * API docs: https://openweathermap.org/api/air-pollution
 *          https://openweathermap.org/current
 *
 * Endpoints dùng:
 *   GET https://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={KEY}
 *   GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={KEY}&units=metric
 *
 * Free tier: 1,000 calls/day (60 calls/minute).
 *
 * OpenWeather được dùng làm provider PHỤ (fallback), priority thấp hơn IQAir.
 *
 * OpenWeather Air Pollution trả AQI ở thang 1-5 (Good → Very Poor) + concentration
 * của 7 pollutants (CO, NO, NO2, O3, SO2, PM2.5, PM10, NH3). Ta dùng concentration
 * để tính lại US AQI (0-500) cho nhất quán với providers khác.
 */

import { AqPoint, WeatherPoint } from "./openmeteo";

export const OPENWEATHER_PROVIDER_CODE = "openweathermap";
export const OPENWEATHER_PROVIDER_NAME = "OpenWeatherMap";
export const OPENWEATHER_PROVIDER_CATEGORY = "environmental";
export const OPENWEATHER_PROVIDER_BASE_URL = "https://api.openweathermap.org";

export const OPENWEATHER_AIR_POLLUTION_ENDPOINT_CODE = "openweather_air_pollution";
export const OPENWEATHER_AIR_POLLUTION_PATH = "/data/2.5/air_pollution";
export const OPENWEATHER_AIR_POLLUTION_PARSER_KEY = "openweather.air_pollution.v2_5";

export const OPENWEATHER_WEATHER_ENDPOINT_CODE = "openweather_current_weather";
export const OPENWEATHER_WEATHER_PATH = "/data/2.5/weather";
export const OPENWEATHER_WEATHER_PARSER_KEY = "openweather.weather.v2_5";

// ---------- URL builders ----------

export function buildOpenweatherAirPollutionUrl(
  lat: number,
  lng: number,
  apiKey: string,
): string {
  const url = new URL(OPENWEATHER_AIR_POLLUTION_PATH, OPENWEATHER_PROVIDER_BASE_URL);
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lng.toFixed(4));
  url.searchParams.set("appid", apiKey);
  return url.toString();
}

export function buildOpenweatherWeatherUrl(
  lat: number,
  lng: number,
  apiKey: string,
): string {
  const url = new URL(OPENWEATHER_WEATHER_PATH, OPENWEATHER_PROVIDER_BASE_URL);
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lng.toFixed(4));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");
  return url.toString();
}

// ---------- Fetcher ----------

export async function fetchOpenweather(url: string, timeoutMs = 15000) {
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
      ok: res.ok && payload && !payload.cod && !payload.error,
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
 * OpenWeather Air Pollution response shape:
 * {
 *   coord: { lon, lat },
 *   list: [
 *     {
 *       main: { aqi: 1 | 2 | 3 | 4 | 5 },   // 1=Good, 5=Very Poor
 *       components: {
 *         co: 230.31,        // µg/m³
 *         no: 0.89,
 *         no2: 9.41,
 *         o3: 68.66,
 *         so2: 1.16,
 *         pm2_5: 4.51,
 *         pm10: 7.37,
 *         nh3: 0.86
 *       },
 *       dt: 1705305600       // Unix timestamp
 *     }
 *   ]
 * }
 *
 * OpenWeather current weather response:
 * {
 *   coord: {lon, lat},
 *   weather: [{id, main, description, icon}],
 *   main: {temp, feels_like, temp_min, temp_max, pressure, humidity},
 *   wind: {speed, deg, gust},
 *   clouds: {all},
 *   visibility, dt,
 *   sys: {...},
 *   rain: {"1h": ...},
 *   snow: {"1h": ...}
 * }
 */

export interface OwmAirComponents {
  co?: number;
  no?: number;
  no2?: number;
  o3?: number;
  so2?: number;
  pm2_5?: number;
  pm10?: number;
  nh3?: number;
}

export interface OwmAirItem {
  main: { aqi: number };
  components: OwmAirComponents;
  dt: number;
}

export interface OwmAirResponse {
  coord: { lon: number; lat: number };
  list: OwmAirItem[];
}

// ---------- AQI calculator (EPA US AQI from PM2.5) ----------

/**
 * Compute US AQI từ nồng độ PM2.5 (µg/m³) theo EPA breakpoints.
 * Ưu điểm: so sánh được với IQAir, WAQI, Open-Meteo.
 */
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

// ---------- Normalizer ----------

export function normalizeOpenweatherAq(payload: any): AqPoint[] {
  const list: OwmAirItem[] = payload?.list ?? [];
  if (!Array.isArray(list) || list.length === 0) return [];

  return list
    .map((item) => {
      const c = item.components ?? {};
      const pm25 = typeof c.pm2_5 === "number" ? c.pm2_5 : null;
      const pm10 = typeof c.pm10 === "number" ? c.pm10 : null;

      // US AQI: lấy MAX của AQI tính từ PM2.5 và PM10 (theo EPA convention)
      const aqiPm25 = pm25 !== null ? pm25ToAqi(pm25) : null;
      const aqiPm10 = pm10 !== null ? pm10ToAqi(pm10) : null;
      const aqi = Math.max(aqiPm25 ?? 0, aqiPm10 ?? 0);

      return {
        observed_at: item.dt
          ? new Date(item.dt * 1000).toISOString()
          : new Date().toISOString(),
        aqi: aqi > 0 ? aqi : 0,
        european_aqi: null,
        pm25,
        pm10,
        co: typeof c.co === "number" ? c.co : null,
        no2: typeof c.no2 === "number" ? c.no2 : null,
        so2: typeof c.so2 === "number" ? c.so2 : null,
        o3: typeof c.o3 === "number" ? c.o3 : null,
        ammonia: typeof c.nh3 === "number" ? c.nh3 : null,
        dust: null,
        aerosol_optical_depth: null,
        uv_index: null,
      };
    })
    .filter((p) => p.aqi > 0);
}

export function normalizeOpenweatherWeather(payload: any): WeatherPoint[] {
  if (!payload || typeof payload !== "object") return [];
  const main = payload.main ?? {};
  const wind = payload.wind ?? {};
  const clouds = payload.clouds ?? {};
  const rain = payload.rain ?? {};
  const weather = Array.isArray(payload.weather) ? payload.weather[0] : null;

  const temp = typeof main.temp === "number" ? main.temp : null;
  if (temp === null) return [];

  const observedAt = payload.dt
    ? new Date(payload.dt * 1000).toISOString()
    : new Date().toISOString();

  const visibility = typeof payload.visibility === "number" ? payload.visibility : null;

  return [
    {
      observed_at: observedAt,
      temperature_c: temp,
      apparent_temperature_c: typeof main.feels_like === "number" ? main.feels_like : null,
      dew_point_c: null,
      humidity_pct: typeof main.humidity === "number" ? main.humidity : null,
      wind_speed_mps: typeof wind.speed === "number" ? wind.speed : null,
      wind_direction_deg: typeof wind.deg === "number" ? wind.deg : null,
      wind_gusts_mps: typeof wind.gust === "number" ? wind.gust : null,
      pressure_hpa: typeof main.pressure === "number" ? main.pressure : null,
      surface_pressure_hpa: null,
      visibility_km: visibility !== null ? visibility / 1000 : null,
      precipitation_mm: typeof rain["1h"] === "number" ? rain["1h"] : null,
      rain_mm: typeof rain["1h"] === "number" ? rain["1h"] : null,
      cloud_cover_pct: typeof clouds.all === "number" ? clouds.all : null,
      weather_code: weather?.icon ? String(weather.icon) : null,
    },
  ];
}
