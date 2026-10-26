#!/usr/bin/env bash
# Deja el backup corriendo todos los días a las 03:00 (hora Argentina). Se ejecuta una sola vez, como root.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$RAIZ"/scripts/*.sh
cat > /etc/cron.d/bravos-backup <<CRON
CRON_TZ=America/Argentina/Buenos_Aires
0 3 * * * root $RAIZ/scripts/backup.sh >> /var/log/bravos-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/bravos-backup
echo "Backup diario instalado (03:00). Probalo ahora con:  $RAIZ/scripts/backup.sh"
