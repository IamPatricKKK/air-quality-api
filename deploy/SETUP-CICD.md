# Setup CI/CD "bấm nút deploy" — Chất Lượng Không Khí Việt Nam

Mô hình giống công ty: mỗi service deploy độc lập qua GitHub Actions → tự SSH vào
VPS → ghi `.env` từ GitHub Secrets → `docker compose pull && up`. Hạ tầng chung
(postgres + caddy) dựng riêng 1 lần.

```
GitHub Actions (build image + SSH)  →  VPS (pull GHCR + chạy container)
Secrets ở GitHub Environment "production"   →  bơm vào VPS lúc deploy
```

---

## BƯỚC A — SSH key cho GitHub → VPS (1 lần)

Trên **máy Mac**, tạo cặp key riêng để GitHub SSH vào VPS:
```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/aq_deploy -N ""
cat ~/.ssh/aq_deploy.pub      # → copy, thêm vào VPS
cat ~/.ssh/aq_deploy          # → private key, dán vào GitHub Secret VPS_SSH_KEY
```
Trên **VPS**, thêm public key:
```bash
echo "<dán nội dung aq_deploy.pub>" >> ~/.ssh/authorized_keys
```

---

## BƯỚC B — GitHub Environment "production" + Secrets

Ở **MỖI repo** (api, be, fe, admin): Settings → **Environments** → **New environment** → đặt tên `production`. Rồi thêm Secrets.

### Secrets chung (cả 4 repo)
| Secret | Giá trị |
|---|---|
| `VPS_HOST` | `103.95.159.57` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | nội dung file `~/.ssh/aq_deploy` (private key) |
| `GHCR_PAT` | GitHub token có scope `write:packages` + `read:packages` |

### Thêm cho repo **air-quality-api** (xem giá trị trong `_deploy_secrets/prod.env`)
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `JWT_PUBLIC_KEY`,
`JWT_PRIVATE_KEY`, `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WAQI_TOKEN`,
`IQAIR_API_KEY`, `OPENWEATHER_API_KEY`

> ⚠️ `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY`: dán dạng **1 dòng có `\n`** (đúng như trong `prod.env`).

### Thêm cho repo **air-quality-be**
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

### repo **air-quality-fe / air-quality-admin**
Chỉ cần 4 secret chung (URL + Google/VAPID đã hardcode trong workflow vì là giá trị public).

---

## BƯỚC C — Deploy (bấm nút trên GitHub Actions)

Thứ tự lần đầu:
1. **air-quality-api → Actions → "Mirror base images to GHCR"** → Run *(nếu chưa chạy)*
2. **air-quality-api → "Deploy Infra (Production)"** → Run → tạo mạng + postgres + caddy
3. **air-quality-api → "Deploy Production"** → Run → build + deploy api
4. **air-quality-api → "DB Migrate (Production)"** → Run → tạo schema
5. **air-quality-be / fe / admin → "Deploy Production"** → Run từng repo

→ Mở `https://airquality.info.vn`.

## Lần sau cập nhật
Chỉ cần vào repo tương ứng → **Actions → Deploy Production → Run workflow**. Xong.

---

## Điều kiện
- VPS đã cài Docker + mở port 80/443 (firewall). *(đã làm)*
- VPS pull được GHCR. *(đã test 405 = OK)*
- VPS nhận SSH từ GitHub (inbound — public IP, port 22 mở).

> Runtime: app vẫn cần VPS ra quốc tế (WAQI/Gmail/Google) để dữ liệu/email/login
> Google hoạt động đầy đủ. Web + HTTPS sẽ lên ngay; phần đó chờ route quốc tế.
