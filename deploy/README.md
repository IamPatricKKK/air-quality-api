# Deploy Production (CI/CD qua GHCR) — Chất Lượng Không Khí Việt Nam

**Mô hình:** GitHub Actions **build** mọi image rồi đẩy lên **GHCR** (`ghcr.io/iampatrickkk/air-quality-*`). VPS **chỉ PULL** image dựng sẵn rồi chạy — **không build trên VPS**.

Lợi ích: VPS 2GB nhẹ tênh, không cần npm/pip/Docker Hub, build chạy trên hạ tầng GitHub (mạng quốc tế tốt).

| Domain | Image GHCR |
|---|---|
| `airquality.info.vn` | `air-quality-fe` |
| `api.airquality.info.vn` | `air-quality-api` |
| `admin.airquality.info.vn` | `air-quality-admin` |
| `be.airquality.info.vn` | `air-quality-be` |
| (nội bộ) postgres, caddy | mirror sang GHCR |

---

## PHẦN 1 — Trên GitHub (build & publish image)

### 1.1. Mirror base image (postgres, caddy) — chạy 1 lần
GitHub repo `air-quality-api` → tab **Actions** → workflow **"Mirror base images to GHCR"** → **Run workflow**.
→ đẩy `postgres:16-alpine` + `caddy:2-alpine` lên GHCR.

### 1.2. Build 4 app image
Cách A — tạo release tag (khuyến nghị), chạy trên máy bạn:
```bash
cd /Users/truongpham/Documents/code/ntu_projects/DATN
for r in air-quality-api air-quality-be air-quality-fe air-quality-admin; do
  git -C $r tag v1.0.0 && git -C $r push origin v1.0.0
done
```
Cách B — vào **Actions → "Build & Push Docker" → Run workflow** ở từng repo.

→ Chờ Actions xanh (mỗi repo ~3-8'). Sau đó có image `:latest` trên GHCR.

### 1.3. Cho phép VPS kéo image private — tạo GitHub Token
GitHub → Settings → Developer settings → **Personal access tokens (classic)** → Generate
- Scope: **`read:packages`**
- Copy token (dạng `ghp_...`) — dùng ở Phần 2.

---

## PHẦN 2 — Trên VPS (chỉ pull & chạy)

### 2.1. Chuẩn bị (1 lần) — swap, Docker, firewall *(đã làm)*

### 2.2. Đưa 3 file deploy lên VPS
Chỉ cần **3 file** (không cần clone source): `docker-compose.prod.yml`, `Caddyfile`, `.env`.
```bash
# Cách 1: clone repo api (chứa deploy/)
cd /opt/airquality && git clone git@github.com:IamPatricKKK/air-quality-api.git
cd air-quality-api/deploy
# rồi tải .env lên (từ máy bạn): scp _deploy_secrets/prod.env root@IP:/opt/airquality/air-quality-api/deploy/.env
```

### 2.3. Đăng nhập GHCR
```bash
docker login ghcr.io -u IamPatricKKK
# Password: dán GitHub Token (ghp_...) ở bước 1.3
```

### 2.4. Pull & chạy
```bash
cd /opt/airquality/air-quality-api/deploy
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### 2.5. Tạo database (1 lần)
```bash
docker compose -f docker-compose.prod.yml --env-file .env exec api yarn migration:up
```

### 2.6. Kiểm tra
```bash
docker compose -f docker-compose.prod.yml --env-file .env ps      # tất cả Up
curl -I https://airquality.info.vn                                 # 200 + HTTPS
```

---

## PHẦN 3 — Google OAuth
Google Cloud Console → OAuth Client → **Authorized JavaScript origins** thêm
`https://airquality.info.vn` + `https://admin.airquality.info.vn` → **Publish app**.

---

## Cập nhật phiên bản mới
```bash
# Máy bạn: tag mới → GitHub build lại
git -C air-quality-api tag v1.0.1 && git -C air-quality-api push origin v1.0.1
# VPS: kéo bản mới
cd /opt/airquality/air-quality-api/deploy
docker compose -f docker-compose.prod.yml --env-file .env pull && \
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

---

## ⚠️ Điều kiện tiên quyết: VPS phải kéo được GHCR
Kiểm tra: `curl -sI --max-time 15 https://ghcr.io/v2/ -o /dev/null -w "%{http_code}\n"`
- Ra số (401/200) → OK, kéo được.
- Timeout → VPS không vào được GHCR → cần sửa route quốc tế (Long Vân) hoặc đổi VPS.

> Lưu ý runtime: app vẫn cần VPS gọi WAQI/IQAir (dữ liệu), Gmail (email), Google (login) lúc chạy.
> Nếu VPS chưa ra được quốc tế, web vẫn lên + HTTPS OK, nhưng dữ liệu/email/login Google sẽ lỗi cho tới khi route quốc tế được sửa.
