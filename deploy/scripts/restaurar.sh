#!/usr/bin/env bash
# Restaura la base (y opcionalmente los archivos) desde un backup. REEMPLAZA los datos actuales.
# Uso:  ./scripts/restaurar.sh bd_2026-11-01_0300.sql.gz [uploads_2026-11-01_0300.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

SQL="${1:?Indicá el archivo .sql.gz de la base}"
ARCHIVOS="${2:-}"
[ -f "$SQL" ] || { echo "No existe $SQL" >&2; exit 1; }
gzip -t "$SQL"

echo "Esto REEMPLAZA la base '${DB_DATABASE:-bravosdata}' actual por el contenido de $SQL."
read -r -p 'Para continuar escribí RESTAURAR: ' RESP
[ "$RESP" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

docker compose up -d db
docker compose stop backend || true
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4;"'
zcat "$SQL" | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

if [ -n "$ARCHIVOS" ]; then
  gzip -t "$ARCHIVOS"
  docker compose up -d backend
  docker compose exec -T backend tar -C /app -xz < "$ARCHIVOS"
fi

docker compose up -d
echo "Restauración lista. Probá entrar a la app y revisá los datos."
