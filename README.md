# air-quality-api

Service backend **CHÍNH** (NestJS) — đảm nhận:

- auth / session / RBAC (JWT RS256 + JWKS)
- **ingestion dữ liệu từ 4 provider bên thứ ba** (IQAir, OpenWeather, Open-Meteo, WAQI)
- user-facing curated APIs (cho `air-quality-fe`)
- admin business APIs (cho khu "Vận hành" của `air-quality-admin`)
- notification dispatch (email SMTP)

Repo này vừa ghi raw payloads + normalized observations xuống PostgreSQL, vừa đọc dữ liệu phục vụ FE/Admin. Service analytics riêng biệt (`air-quality-be`) đọc dữ liệu này và ghi predictions/analytics ngược lại DB.

## Provider matrix (priority từ cao xuống thấp)

| Priority | Provider | Loại | Token | Free tier | Cron mặc định |
|---|---|---|---|---|---|
| 50  | **IQAir (AirVisual)** | AQI + Weather realtime | Bắt buộc | 10k/tháng | 6h/lần |
| 100 | Open-Meteo | AQI + Weather hourly | Không | Không giới hạn hợp lý | 12h/lần |
| 150 | **OpenWeatherMap** | AQI + Weather current | Bắt buộc | 1k/ngày | 3h/lần |
| 200 | WAQI | AQI realtime | Bắt buộc | Rate-limited | 12h/lần |

Khi cả 4 provider cùng có dữ liệu cho 1 station × 1 giờ, view `core.v_aq_observations_fused` sẽ chọn dữ liệu theo thứ tự ưu tiên trên.

## Tech stack

- NestJS 11 (+ @nestjs/schedule cho cron)
- MikroORM 6 + PostgreSQL 16
- Docker Compose

## Prerequisites

- Node.js >= 20
- yarn >= 1.22
- Docker Desktop hoặc Colima

## Files quan trọng

- `docker-compose.yml`: chạy API + PostgreSQL local
- `db/schema.sql`: schema local bootstrap
- `db/seed.bootstrap.sql`: bootstrap users, stations và binding cho dữ liệu thật
- `openapi/api.yaml`: đặc tả API hiện tại

## Quick start

### 1. Cài dependencies

```bash
yarn install
```

### 2. Tạo file môi trường

```bash
cp .env.example .env
```

### 3. Khởi động PostgreSQL local

```bash
docker compose up -d postgres
```

Kiểm tra DB đã sẵn sàng:

```bash
docker compose exec postgres psql -U postgres -d sky_pulse -c "SELECT current_database();"
```

### 4. Chạy API local

```bash
yarn start:dev
```

API mặc định chạy tại:

- `http://localhost:3002/api/v1/health`
- `http://localhost:3002/api/v1/.well-known/jwks.json`

## Chạy full stack bằng Docker

```bash
cp .env.example .env
docker compose up --build
```

Compose này sẽ:

- start PostgreSQL 16 với schema + bootstrap seed
- build image `air-quality-api`
- inject `DATABASE_URL` nội bộ trỏ tới service `postgres`

## Bootstrap data

Sau khi DB được init lần đầu, bạn có thể login bằng các tài khoản bootstrap:

- `admin@skypulse.local` / `Admin@123`
- `ops@skypulse.local` / `Ops@123`
- `analyst@skypulse.local` / `Analyst@123`
- `user@skypulse.local` / `User@123`

Lưu ý:

- bootstrap seed không nạp observation, pipeline run, prediction hay notification giả
- `air-quality-fe` chỉ hiển thị dữ liệu sau khi `air-quality-be` ingest observation thật xuống DB

Test nhanh:

```bash
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@skypulse.local","password":"Admin@123"}'
```

Token access trả về là JWT `RS256`. Public key tương ứng được publish tại:

- `http://localhost:3002/api/v1/.well-known/jwks.json`

Các endpoint cần Bearer token:

- `GET /api/v1/auth/me`
- `GET|PATCH /api/v1/users/preferences`
- `GET /api/v1/notifications`
- `GET /api/v1/admin/*`

## Scripts

- `yarn start:dev`: chạy NestJS watch mode
- `yarn build`: build production
- `yarn start`: chạy bản build

## PostgreSQL notes

- DB mặc định: `sky_pulse`
- Host port mặc định: `5432`
- Nếu máy đang dùng `5432`, đổi `POSTGRES_PORT` trong `.env` sang cổng khác trước khi chạy `docker compose up`
- Nếu cần reset toàn bộ schema + bootstrap seed:

```bash
docker compose down -v
docker compose up -d postgres
```

- Nếu bạn đang chạy một PostgreSQL dùng chung cho nhiều repo khác trong workspace, chỉ cần sửa `DATABASE_URL` trong `.env` để trỏ sang DB đó và không cần bật service `postgres` của repo này.

## Cấu trúc local DB

Schema và seed được copy từ nguồn chuẩn của workspace `sky-pulse-monitor` để repo có thể bootstrap độc lập mà không phụ thuộc mount chéo thư mục.
