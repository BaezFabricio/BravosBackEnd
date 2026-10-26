#!/usr/bin/env bash
# Backup diario: base de datos + archivos subidos. Guarda copia local (14 días) y la sube afuera del servidor.
# Si algo falla, termina con error (y avisa a HEALTHCHECK_URL si está definido, ver SERVIDOR.md).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

CARPETA="${BACKUP_LOCAL:-/var/backups/bravos}"
FECHA="$(date +%F_%H%M)"
mkdir -p "$CARPETA"
chmod 700 "$CARPETA"
umask 077

SQL="$CARPETA/bd_$FECHA.sql.gz"
ARCHIVOS="$CARPETA/uploads_$FECHA.tar.gz"

avisar_falla() { [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL/fail" >/dev/null 2>&1 || true; echo "BACKUP FALLÓ" >&2; }
trap avisar_falla ERR

docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --default-character-set=utf8mb4 "$MYSQL_DATABASE"' | gzip > "$SQL"
docker compose exec -T backend tar -C /app -cz uploads > "$ARCHIVOS"

# Comprobar que sirven: comprimidos íntegros y con contenido real
gzip -t "$SQL" "$ARCHIVOS"
[ "$(stat -c%s "$SQL")" -gt 2000 ] || { echo "El volcado de la base es sospechosamente chico" >&2; false; }
zcat "$SQL" | grep -q "CREATE TABLE" || { echo "El volcado no contiene tablas" >&2; false; }

if [ -n "${BACKUP_DESTINO:-}" ]; then
  rclone copy "$SQL" "$BACKUP_DESTINO" --quiet
  rclone copy "$ARCHIVOS" "$BACKUP_DESTINO" --quiet
  rclone delete "$BACKUP_DESTINO" --min-age 45d --quiet || true
else
  echo "AVISO: BACKUP_DESTINO vacío; la copia quedó solo en este servidor." >&2
fi

find "$CARPETA" -type f -mtime +14 -delete
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null 2>&1 || true
echo "Backup listo: $(basename "$SQL") ($(du -h "$SQL" | cut -f1)), $(basename "$ARCHIVOS") ($(du -h "$ARCHIVOS" | cut -f1))"
