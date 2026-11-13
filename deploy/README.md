# Betrieb auf einem VPS

Ein Linux-Server mit Docker reicht: Caddy liefert die App aus, holt das HTTPS-Zertifikat
selbst (Let's Encrypt) und leitet `/api` und `/ws` an den Spielserver weiter. Die Daten
(SQLite, Push-Schlüssel, tägliche Backups) liegen im Docker-Volume `tavli-data`.

## Voraussetzungen

- VPS mit 1–2 GB RAM, Ubuntu/Debian, Root- oder sudo-Zugang per SSH
- Eine (Sub-)Domain, z. B. `tavli.example.com`, mit A-Record (und ggf. AAAA) auf die IP des VPS
- Offene Ports 80 und 443 (Firewall des Anbieters und `ufw`)

## Einmalig einrichten

```sh
# Docker installieren (offizielles Skript)
curl -fsSL https://get.docker.com | sh

# Firewall (falls ufw aktiv)
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Code holen
git clone https://github.com/roqz/backgammon-tavli.git /opt/tavli
cd /opt/tavli && git checkout rewrite/foundation

# Konfiguration
cd deploy
cp .env.example .env
nano .env                     # DOMAIN, VAPID_SUBJECT, ADMIN_TOKEN, Betreiberangaben
openssl rand -hex 32          # Wert für ADMIN_TOKEN

# Starten (der erste Build dauert einige Minuten)
docker compose up -d --build
docker compose ps             # beide Dienste "healthy" / "running"
curl https://tavli.example.com/api/health
```

## Aktualisieren

```sh
cd /opt/tavli && git pull && cd deploy && docker compose up -d --build
```

Laufende Live-Partien brechen dabei ab (Turnierpartien werden neu angesetzt);
Fernpartien, Ligen, Ratings und Profile bleiben erhalten.

## Betrieb

- Logs: `docker compose logs -f server`
- Backups: täglich in `/data/backups` im Volume (14 Stück). Zusätzlich vom Server holen, z. B.
  `docker compose cp server:/data/backups ./backups` und per `rsync`/`scp` sichern.
- Moderation: `curl -H "X-Admin-Token: $ADMIN_TOKEN" https://tavli.example.com/api/admin/reports`
- Ohne `DOMAIN` läuft alles per HTTP auf Port 80 (nur zum Ausprobieren; Push braucht HTTPS).

## Fertige Images (ohne Build auf dem Server)

Jeder Push auf `master` oder `rewrite/foundation` baut die Images und legt sie in der GitHub
Container Registry ab (`.github/workflows/images.yml`):

- `ghcr.io/roqz/tavli-server:latest` – Spielserver (Daten in `/data`, läuft als Nutzer 1000)
- `ghcr.io/roqz/tavli-web:latest` – App mit eigenem Caddy, leitet `/api` und `/ws` weiter

Hinter einem bestehenden Reverse Proxy (gemeinsames Caddy, das TLS übernimmt):

| Dienst | Variable | Wert |
| --- | --- | --- |
| web | `DOMAIN` | `:80` |
| web | `TRUSTED_PROXIES` | `private_ranges` (Client-Adresse vom vorderen Proxy übernehmen) |
| web | `SERVER_UPSTREAM` | Name:Port des Servers, z. B. `tavli-server:2567` |
| web | `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL`, `HOSTING` | Impressum/Datenschutz |
| server | `TRUST_PROXY` | `2` (zwei Proxys vor dem Server) |
| server | `VAPID_SUBJECT`, `ADMIN_TOKEN`, `BACKUP_DIR=/data/backups` | wie oben |

Ein Bind-Mount für `/data` muss dem Nutzer 1000 gehören (`chown -R 1000:1000 data`).
