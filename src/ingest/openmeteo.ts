/**
 * Open-Meteo client + normalizer.
 * Port từ live_ingest.py (FastAPI) sang NestJS/TypeScript.
 *
 * 2 endpoint, không cần API key:
 *  - air-quality-api.open-meteo.com/v1/air-quality  (hourly AQ)
 *  - api.open-meteo.com/v1/forecast                 (hourly weather)
 */

export const OPENMETEO_PROVIDER_CODE = "openmeteo";
export const OPENMETEO_PROVIDER_NAME = "Open-Meteo";
export const OPENMETEO_PROVIDER_CATEGORY = "environmental";
export const OPENMETEO_PROVIDER_BASE_URL = "https://open-meteo.com";

export const AQ_ENDPOINT_CODE = "openmeteo_air_quality";
export const WEATHER_ENDPOINT_CODE = "openmeteo_weather";

export const AQ_BASE_URL = "https://air-quality-api.open-meteo.com";
export const AQ_PATH = "/v1/air-quality";
export const AQ_PARSER_KEY = "openmeteo.air_quality.v1";

export const WEATHER_BASE_URL = "https://api.open-meteo.com";
export const WEATHER_PATH = "/v1/forecast";
export const WEATHER_PARSER_KEY = "openmeteo.weather.v1";

export const DEFAULT_AQ_FIELDS = [
  "us_aqi",
  "european_aqi",
  "pm2_5",
  "pm10",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "ammonia",
  "dust",
  "aerosol_optical_depth",
  "uv_index",
];

export const DEFAULT_WEATHER_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "dew_point_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "pressure_msl",
  "surface_pressure",
  "visibility",
  "precipitation",
  "rain",
  "cloud_cover",
  "weather_code",
];

export interface OpenMeteoParams {
  lat: number;
  lng: number;
  timezone?: string;
  past_hours?: number;
  forecast_hours?: number;
  fields: string[];
}

function buildUrl(base: string, path: string, params: OpenMeteoParams): string {
  const url = new URL(path, base);
  url.searchParams.set("latitude", params.lat.toString());
  url.searchParams.set("longitude", params.lng.toString());
  url.searchParams.set("timezone", params.timezone ?? "UTC");
  if (params.past_hours) url.searchParams.set("past_hours", String(params.past_hours));
  if (params.forecast_hours) url.searchParams.set("forecast_hours", String(params.forecast_hours));
  url.searchParams.set("hourly", params.fields.join(","));
  return url.toString();
}

export function buildAqUrl(p: OpenMeteoParams): string {
  return buildUrl(AQ_BASE_URL, AQ_PATH, p);
}

export function buildWeatherUrl(p: OpenMeteoParams): string {
  return buildUrl(WEATHER_BASE_URL, WEATHER_PATH, p);
}

export async function fetchOpenMeteo(url: string, timeoutMs = 15000) {
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
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - started,
      payload,
    };
  } finally {
    clearTimeout(to);
  }
}

// ---------- Normalizers ----------
export interface AqPoint {
  observed_at: string;
  aqi: number;
  european_aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  ammonia: number | null;
  dust: number | null;
  aerosol_optical_depth: number | null;
  uv_index: number | null;
}

export interface WeatherPoint {
  observed_at: string;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  dew_point_c: number | null;
  humidity_pct: number | null;
  wind_speed_mps: number | null;
  wind_direction_deg: number | null;
  wind_gusts_mps: number | null;
  pressure_hpa: number | null;
  surface_pressure_hpa: number | null;
  visibility_km: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  cloud_cover_pct: number | null;
  weather_code: string | null;
}

function num(arr: any, i: number): number | null {
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

// Open-Meteo trả cả giờ DỰ BÁO (tương lai). Quan trắc chỉ được tính tới
// giờ hiện tại — nếu lưu giờ forecast, observed_at > now() sẽ làm méo cửa
// sổ "tươi" của fusion (loại nhầm dữ liệu trạm thật WAQI). Cho phép trễ
// +1h để dung sai ranh giới giờ/lệch đồng hồ.
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

function isFuture(isoTime: string): boolean {
  return new Date(isoTime + "Z").getTime() > Date.now() + FUTURE_TOLERANCE_MS;
}

export function normalizeAq(payload: any): AqPoint[] {
  const h = payload?.hourly ?? {};
  const times: string[] = h.time ?? [];
  const out: AqPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const aqi = num(h.us_aqi, i);
    if (aqi === null) continue; // bỏ điểm không có AQI
    if (isFuture(times[i])) continue; // bỏ giờ dự báo (tương lai)
    out.push({
      observed_at: new Date(times[i] + "Z").toISOString(),
      aqi: Math.round(aqi),
      european_aqi: num(h.european_aqi, i),
      pm25: num(h.pm2_5, i),
      pm10: num(h.pm10, i),
      co: num(h.carbon_monoxide, i),
      no2: num(h.nitrogen_dioxide, i),
      so2: num(h.sulphur_dioxide, i),
      o3: num(h.ozone, i),
      ammonia: num(h.ammonia, i),
      dust: num(h.dust, i),
      aerosol_optical_depth: num(h.aerosol_optical_depth, i),
      uv_index: num(h.uv_index, i),
    });
  }
  return out;
}

export function normalizeWeather(payload: any): WeatherPoint[] {
  const h = payload?.hourly ?? {};
  const times: string[] = h.time ?? [];
  const out: WeatherPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = num(h.temperature_2m, i);
    if (t === null) continue;
    if (isFuture(times[i])) continue; // bỏ giờ dự báo (tương lai)
    const vis = num(h.visibility, i);
    out.push({
      observed_at: new Date(times[i] + "Z").toISOString(),
      temperature_c: t,
      apparent_temperature_c: num(h.apparent_temperature, i),
      dew_point_c: num(h.dew_point_2m, i),
      humidity_pct: num(h.relative_humidity_2m, i),
      wind_speed_mps: num(h.wind_speed_10m, i),
      wind_direction_deg: num(h.wind_direction_10m, i),
      wind_gusts_mps: num(h.wind_gusts_10m, i),
      pressure_hpa: num(h.pressure_msl, i),
      surface_pressure_hpa: num(h.surface_pressure, i),
      visibility_km: vis !== null ? vis / 1000 : null,
      precipitation_mm: num(h.precipitation, i),
      rain_mm: num(h.rain, i),
      cloud_cover_pct: num(h.cloud_cover, i),
      weather_code: h.weather_code?.[i] != null ? String(h.weather_code[i]) : null,
    });
  }
  return out;
}

export function sha256Hex(input: string): string {
  // use Node crypto
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto");
  return createHash("sha256").update(input).digest("hex");
}
