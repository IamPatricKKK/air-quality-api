# Hướng dẫn Deploy Production — Chất Lượng Không Khí Việt Nam

VPS Ubuntu 24.04 · domain `airquality.info.vn` · Docker + Caddy (HTTPS tự động).

## Kiến trúc
| Domain | Service | Container |
|---|---|---|
| `airquality.info.vn` | Web người dùng | `fe` (nginx) |
| `api.airquality.info.vn` | API NestJS + WebSocket | `api` |
| `admin.airquality.info.vn` | Trang quản trị | `admin` (nginx) |
| `be.airquality.info.vn` | Phân tích/dự báo (Python) | `be` |
| (nội bộ) | PostgreSQL | `postgres` |
| (cổng 80/443) | Reverse proxy + HTTPS | `caddy` |

---

## B0. DNS (TenTen) — 4 bản ghi A trỏ về IP VPS
```
A   @       103.95.159.57
A   api     103.95.159.57
A   admin   103.95.159.57
A   be      103.95.159.57
```

## B1. Chuẩn bị server (chạy 1 lần, quyền root)
```bash
apt update && apt upgrade -y
# Swap 4GB (RAM chỉ 2GB)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf
# Docker + firewall + git
curl -fsSL https://get.docker.com | sh
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
apt install -y git
mkdir -p /opt/airquality && cd /opt/airquality
```

## B2. SSH key cho VPS → thêm vào GitHub (repo private)
```bash
ssh-keygen -t ed25519 -C "vps-airquality" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub      # copy → GitHub > Settings > SSH keys > New
ssh -T git@github.com          # gõ yes → "Hi IamPatricKKK!"
```

## B3. Clone 4 repo (cạnh nhau trong /opt/airquality)
```bash
cd /opt/airquality
git clone git@github.com:IamPatricKKK/air-quality-api.git
git clone git@github.com:IamPatricKKK/air-quality-be.git
git clone git@github.com:IamPatricKKK/air-quality-fe.git
git clone git@github.com:IamPatricKKK/air-quality-admin.git
```

## B4. Tạo file `.env` production
```bash
cd /opt/airquality/air-quality-api/deploy
cp .env.example .env
nano .env          # điền giá trị thật (xem khối secrets mình gửi riêng)
```

## B5. Build & chạy (lần đầu sẽ lâu ~30-60' vì build trên 2GB+swap)
```bash
cd /opt/airquality/air-quality-api/deploy
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

## B6. Khởi tạo cơ sở dữ liệu (chạy migration 1 lần)
```bash
docker compose -f docker-compose.prod.yml --env-file .env exec api yarn migration:up
```
→ tạo toàn bộ schema + seed roles + trạm VN. Dữ liệu quan trắc thật sẽ tự về khi ingest chạy.

## B7. Cấu hình Google OAuth cho domain thật
Google Cloud Console → OAuth Client → **Authorized JavaScript origins**, thêm:
```
https://airquality.info.vn
https://admin.airquality.info.vn
```
Và **Publish app** (OAuth consent screen) để mọi người đăng nhập được (không chỉ test users).

## B8. Kiểm tra
```bash
docker compose -f docker-compose.prod.yml --env-file .env ps      # tất cả Up
curl -I https://airquality.info.vn                                 # 200 + HTTPS
```
- Mở `https://airquality.info.vn` → web có 🔒
- `https://api.airquality.info.vn/api/v1/health` → ok
- Thử đăng ký / đăng nhập Google / nhận email

---

## Vận hành

**Xem log:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f api
```

**Cập nhật code mới:**
```bash
cd /opt/airquality/air-quality-api && git pull   # (lặp cho repo cần update)
cd deploy && docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

**Backup DB hằng ngày (cron):** xem `backup.sh`.

**Nếu RAM căng (build OOM):** build từng service:
```bash
docker compose -f docker-compose.prod.yml --env-file .env build api
docker compose -f docker-compose.prod.yml --env-file .env build be
docker compose -f docker-compose.prod.yml --env-file .env build fe
docker compose -f docker-compose.prod.yml --env-file .env build admin
docker compose -f docker-compose.prod.yml --env-file .env up -d
```
