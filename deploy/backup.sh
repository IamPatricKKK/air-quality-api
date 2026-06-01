#!/usr/bin/env bash
# Sao lưu PostgreSQL ra /opt/airquality/backups, giữ 7 ngày gần nhất.
# Cài cron chạy 3h sáng hằng ngày:
#   crontab -e
#   0 3 * * * /opt/airquality/air-quality-api/deploy/backup.sh >> /var/log/aq-backup.log 2>&1
set -euo pipefail

DEPLOY_DIR="/opt/airquality/air-quality-api/deploy"
BACKUP_DIR="/opt/airquality/backups"
COMPOSE="docker compose -f ${DEPLOY_DIR}/docker-compose.prod.yml --env-file ${DEPLOY_DIR}/.env"

mkdir -p "$BACKUP_DIR"
# Lấy tên DB/user từ .env
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB)=' "${DEPLOY_DIR}/.env")

TS=$(date +%Y%m%d_%H%M%S)
OUT="${BACKUP_DIR}/sky_pulse_${TS}.sql.gz"

$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
echo "[$(date)] Backup -> $OUT ($(du -h "$OUT" | cut -f1))"

# Xóa backup cũ hơn 7 ngày
find "$BACKUP_DIR" -name 'sky_pulse_*.sql.gz' -mtime +7 -delete
