# Môi trường Staging — `stage.api.airquality.info.vn`

Stage chạy **chung VPS** với production, dùng lại network `airquality_prod`,
container `postgres` và `caddy` của infra. Khác biệt:

| | Production | Staging |
|---|---|---|
| Container API | `airquality-api` (alias `api`) | `airquality-api-stage` (alias `api-stage`) |
| Image | `…/air-quality-api:production` | `…/air-quality-api:staging` |
| Domain | `api.airquality.info.vn` | `stage.api.airquality.info.vn` |
| Database | `sky_pulse` | `sky_pulse_stage` (cùng container postgres) |
| Trigger deploy | push tag `v*` | push branch `dev` (hoặc Run workflow) |
| Path trên VPS | `/opt/airquality/api` | `/opt/airquality/api-stage` |
| CORS | domain prod | `http://localhost:*` (cho FE dev) + stage domain |

> Mục đích: cho FE dev chạy local trỏ tới một backend ổn định, có dữ liệu thật,
> mà không cần tự dựng API + Postgres ở máy mình.

---

## Các bước cài đặt (làm 1 lần)

### 1. DNS

Tạo bản ghi A: `stage.api.airquality.info.vn → 42.96.18.126` (đã làm).

### 2. Tạo database stage trong postgres chung

SSH vào VPS rồi tạo DB mới (postgres đã chạy sẵn trong infra):

```bash
cd /opt/airquality/infra
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -c "CREATE DATABASE sky_pulse_stage;"
```

> `$POSTGRES_USER` lấy từ `/opt/airquality/infra/.env`. Nếu DB đã tồn tại,
> lệnh báo lỗi "already exists" — bỏ qua.

### 3. Cập nhật Caddy (thêm route stage)

`deploy/infra/Caddyfile` đã thêm block `stage.api.airquality.info.vn`. Chạy
workflow **Deploy Infra (Production)** (`workflow_dispatch`) — nó upload Caddyfile
mới và `caddy reload` (Let's Encrypt tự cấp HTTPS cho subdomain mới).

### 4. Deploy API stage

```bash
git checkout -b dev   # nếu chưa có
git push origin dev   # mỗi lần push lên dev sẽ tự build & deploy stage
```

Hoặc vào tab **Actions → Deploy Staging → Run workflow**.

### 5. Chạy migration cho DB stage

Sau lần deploy đầu, chạy workflow **DB Migrate (Staging)** (`workflow_dispatch`)
để tạo schema trong `sky_pulse_stage`.

### 6. Cấp dữ liệu cho stage

`INGEST_ENABLED=true` nên cron sẽ tự nạp dữ liệu (mặc định mỗi 12h). Muốn có dữ
liệu ngay, exec ingest thủ công hoặc chờ cron. (Để tiết kiệm quota API ngoài thì
chỉ WAQI bị gọi gấp đôi — không đáng kể.)

---

## FE dev dùng thế nào

Trỏ base URL của FE tới:

```
https://stage.api.airquality.info.vn
```

CORS đã mở cho `http://localhost:5173`, `:5174`, `:3000`, `127.0.0.1:5173`. Cần
port khác thì thêm vào `CORS_ORIGINS` trong `.github/workflows/deploy-staging.yml`.

> Google Sign-In: thêm `https://stage.api.airquality.info.vn` (và origin localhost
> của FE) vào danh sách **Authorized JavaScript origins** trong Google Cloud Console
> nếu FE đăng nhập Google khi trỏ vào stage.

## Lưu ý

- Stage dùng **chung secrets** với production (Environment `production`): cùng JWT
  key, SMTP, VAPID, API token. Nếu muốn tách hẳn, tạo Environment `staging` riêng
  rồi đổi `environment: production` → `staging` trong 2 workflow staging.
- Stage **vẫn bật cron alert/digest**. Vì DB stage riêng và rỗng nên ban đầu không
  gửi mail/push cho ai. Tránh seed user/email thật vào stage để khỏi gửi nhầm.
- Postgres dùng chung instance: stage và prod chia sẻ RAM/CPU của container
  postgres. Với quy mô đồ án thì ổn.
