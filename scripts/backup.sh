#!/usr/bin/env sh
# Backup do banco Barber Pro em servidor Linux (docker-compose.prod.yml).
# Agende no cron, por exemplo todo dia às 3h:
#   0 3 * * * /opt/barber-pro/scripts/backup.sh >> /var/log/barberpro-backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
OUT_DIR="${OUT_DIR:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$OUT_DIR/barberpro_$STAMP.dump"
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U barber -F c barberpro > "$FILE"
# Imagens enviadas pelo painel
docker compose -f docker-compose.prod.yml cp app:/data/uploads "$OUT_DIR/uploads_$STAMP" >/dev/null 2>&1 || true
echo "Backup salvo em $FILE"
# Retém 30 dias
find "$OUT_DIR" -name 'barberpro_*.dump' -mtime +30 -delete
find "$OUT_DIR" -maxdepth 1 -name 'uploads_*' -type d -mtime +30 -exec rm -rf {} +
