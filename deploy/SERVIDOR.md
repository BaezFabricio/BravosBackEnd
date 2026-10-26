# Servidor de Bravos (Contabo u otro VPS)

Probado en una PC con Docker: se levantó todo, se restauró una base, se hizo un backup real y se volvió a restaurar.
Sirve igual en cualquier proveedor con Ubuntu 24.04. Mudarse = repetir la parte 1 (cambia solo la IP) y la parte 3.

## 0. Antes de contratar
- Comprá el **dominio aparte** (no en el proveedor del VPS) y ponelo en Cloudflare (DNS gratis).
- Elegí mensual, **sin** el backup automático del proveedor (los hacemos nosotros, afuera del servidor).
- Apenas contrates, avisá la baja del mes siguiente si es una prueba (Contabo pide 4 semanas de aviso).

## 1. Dejar el servidor seguro (una sola vez, ~20 minutos)
Entrá como root por SSH y ejecutá:

```bash
adduser bravos && usermod -aG sudo bravos          # usuario propio, no root
mkdir -p /home/bravos/.ssh && cp ~/.ssh/authorized_keys /home/bravos/.ssh/ && chown -R bravos:bravos /home/bravos/.ssh
```
Desde **tu PC**, generá una clave si no tenés (`ssh-keygen -t ed25519`) y subila (`ssh-copy-id bravos@IP`). Probá entrar
con `ssh bravos@IP` **antes** de seguir. Después, en el servidor:

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
sudo apt update && sudo apt -y upgrade && sudo apt -y install ufw fail2ban unattended-upgrades curl rclone
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
sudo timedatectl set-timezone America/Argentina/Buenos_Aires
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker bravos   # cerrar y abrir sesión
```
Reglas: MySQL **nunca** abre puerto a internet (el compose ya no lo publica) y **no se instala phpMyAdmin** en el servidor.
Si el proveedor tiene firewall propio en el panel, abrí solo 22, 80 y 443.

## 2. Poner la app
```bash
git clone https://github.com/BaezFabricio/BravosBackEnd.git ~/bravos && cd ~/bravos/deploy
cp .env.example .env && chmod 600 .env && nano .env
```
Completá el `.env` (las claves **no** se pegan en el chat ni van a git):
- `DOMINIO`, `DB_ROOT_PASSWORD` (larga y aleatoria), `JWT_SECRET` (`openssl rand -hex 32`).
- Las **mismas** claves VAPID que hoy (si se cambian, los celulares ya suscriptos dejan de recibir avisos).
- Mercado Pago, correo (contraseña de aplicación nueva de Google) y Cloudinary (secreto rotado).

Apuntá el DNS del dominio a la IP del servidor (registro A, en Cloudflare **sin** proxy naranja al principio).

**Frontend:** compilarlo en tu PC y copiarlo (el servidor no necesita Node):
```bash
# en tu PC, carpeta BravosFrontEnd  (sin VITE_API_BASE_URL: la app y la API comparten dominio)
npm run build
scp -r dist/* bravos@IP:~/bravos/deploy/web/
```
El `.env` del frontend de tu PC tiene datos de desarrollo (ngrok): armá el build con un `.env` sin `VITE_API_BASE_URL`.

## 3. Pasar los datos (la base tiene que existir ANTES de arrancar el backend)
En tu PC, sacá una copia de la base actual:
```bash
docker exec bravos_mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers bravosdata' | gzip > bd_migracion.sql.gz
scp bd_migracion.sql.gz bravos@IP:~/bravos/deploy/
```
En el servidor:
```bash
cd ~/bravos/deploy && chmod +x scripts/*.sh
docker compose up -d db
./scripts/restaurar.sh bd_migracion.sql.gz       # pide escribir RESTAURAR
docker compose up -d --build
docker compose ps                                # los tres en "Up"; el backend "healthy"
```
Si se levanta todo junto sin la base, el backend se reinicia en bucle (falta la tabla `usuario`): es esperado, se arregla restaurando.
Borrá `bd_migracion.sql.gz` del servidor y de tu PC cuando termines (tiene datos personales).

## 4. Backups (obligatorio antes de usarlo con alumnos)
Los documentos de los alumnos incluyen datos de salud: el destino externo tiene que ser **privado y cifrado**.
```bash
rclone config                      # crear destino "gdrive" (Google Drive) y, encima, uno "bravoscifrado" de tipo crypt
nano .env                          # BACKUP_DESTINO=bravoscifrado:bravos-backups
sudo ./scripts/instalar-backup-diario.sh   # todos los días 03:00
./scripts/backup.sh                # probarlo YA, y mirar que aparezca el archivo afuera
```
Opcional: crear un chequeo en healthchecks.io (gratis) y poner `HEALTHCHECK_URL=` en el `.env`: te avisa por mail si un día no hubo backup.
**Hacé una restauración de prueba** (en una PC, con `restaurar.sh`) al terminar la primera semana. Un backup sin probar no cuenta.

## 5. Después de arrancar
1. Mercado Pago: cambiar la URL del webhook a `https://TU-DOMINIO/api/vv1/pagos/webhook` (la misma ruta que hoy, con el dominio nuevo) y probar un pago chico.
2. Entrar como admin y cambiar la contraseña de Fernando.
3. Probar desde un celular: instalar la app, reservar una clase y activar los avisos (llega una push de prueba).
4. En Cloudflare, cuando todo ande, activar el proxy naranja es opcional (no hace falta para empezar).

## 6. Rutina del mes de prueba
- Semanal: `docker compose ps`, `df -h` (espacio) y `tail /var/log/bravos-backup.log`.
- Actualizar el sistema: `git pull && docker compose up -d --build` (el backend; el frontend se vuelve a copiar con scp).
- Anotar cortes, lentitud y reinicios del proveedor: con eso se decide si seguir o mudarse.
- **Modo emergencia:** si el servidor cae en horario de clases, el último backup se levanta en tu PC con Docker
  (`docker compose up -d` + `restaurar.sh`) y se expone con un túnel (ngrok o Cloudflare Tunnel) mientras se arregla.

## 7. Mudarse a otro proveedor
Crear el servidor nuevo, repetir las partes 1 y 2, restaurar el último backup (parte 3), probar con la IP, y recién entonces
cambiar el registro A del dominio. Bajá el TTL del DNS a 5 minutos el día anterior. Dejá el servidor viejo una semana más.
