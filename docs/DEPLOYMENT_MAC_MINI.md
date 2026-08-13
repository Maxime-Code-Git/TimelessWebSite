# Guide de déploiement — Mac mini auto-hébergé

> Version : 2026-08 — Timeless Photo & Video

---

## 1. Prérequis matériels

### Mac mini
- macOS Ventura 13.x minimum (recommandé : Sequoia 15.x)
- Alimentation électrique stable — **onduleur recommandé** (UPS APC Be600m1 ou équivalent)
- Allumé 24h/24 : régler l'énergie → désactiver la mise en veille

### SSD externe (médias)
- Format : APFS ou HFS+ Journalisé (APFS recommandé pour la fiabilité)
- Montage persistant : nommé `TimelessMedia`, monté en `/Volumes/TimelessMedia`
- Permissions : propriétaire `timeless` (utilisateur dédié), mode `700`
- Sauvegarde : second SSD dédié à la sauvegarde, monté séparément

### Réseau
- Box Internet à vérifier : IPv4 publique (fixe ou dynamique) ou CGNAT
- **Si CGNAT** (fréquent en Belgique) → utiliser un tunnel sortant (Cloudflare Tunnel, Tailscale Funnel)
- **Si IPv4 publique** → port forwarding 80→80, 443→443 uniquement vers le Mac mini

---

## 2. Vérification du type d'accès réseau

```bash
# Vérifier l'IP publique
curl -s https://api.ipify.org

# Comparer avec l'IP de la box (interface d'admin box, ex. 192.168.x.x)
# Si IP box ≠ IP publique → probablement CGNAT → utiliser un tunnel

# Vérification CGNAT :
# Si l'IP publique commence par 100.64–100.127, c'est du CGNAT
```

---

## 3. Mode A — Tunnel sortant (recommandé si IP publique incertaine)

**Avantages** : fonctionne même avec CGNAT, pas d'ouverture de ports, certificats automatiques

### Option 3A.1 — Cloudflare Tunnel (gratuit)
```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create timeless
cloudflared tunnel route dns timeless votredomaine.be
```

Fichier `~/.cloudflared/config.yml` :
```yaml
tunnel: [TUNNEL_ID]
credentials-file: /Users/timeless/.cloudflared/[TUNNEL_ID].json
ingress:
  - hostname: votredomaine.be
    service: http://localhost:3000
  - hostname: www.votredomaine.be
    service: http://localhost:3000
  - service: http_status:404
```

Démarrage automatique :
```bash
sudo cloudflared service install
```

### Option 3A.2 — Tailscale Funnel
```bash
brew install tailscale
# Activer Funnel dans l'admin Tailscale
tailscale funnel 443
```

---

## 4. Mode B — HTTPS direct (si IPv4 publique disponible)

**Prérequis** : IPv4 publique confirmée, redirection port 80 et 443 sur le Mac mini

### Reverse proxy : Caddy (recommandé)

```bash
brew install caddy
```

`/etc/caddy/Caddyfile` :
```
votredomaine.be {
    reverse_proxy localhost:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 10
        }
    }
}
```

Caddy gère automatiquement Let's Encrypt (renouvellement compris).

---

## 5. Utilisateur système dédié

```bash
# Créer un utilisateur non-admin dédié
sudo sysadminctl -addUser timeless -fullName "Timeless Studio" -password [PASSWORD_FORT]

# Ne jamais faire tourner les services en root
# Monter le SSD avec les bonnes permissions
```

---

## 6. Installation des dépendances

```bash
# Homebrew (si pas installé)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js LTS
brew install node@22

# Docker Desktop (pour Docker Compose)
# Télécharger depuis https://docs.docker.com/desktop/mac/

# FFmpeg
brew install ffmpeg

# ImageMagick (optionnel, backup Sharp)
brew install imagemagick

# Redis (pour BullMQ, optionnel)
brew install redis
```

---

## 7. Structure des données

```
/Volumes/TimelessMedia/
  originals/          # Photos et vidéos en pleine résolution (MODE 700)
  web/                # Aperçus Web générés (MODE 755)
  zips/               # Archives ZIP pré-générées (MODE 700)
  tmp/                # Temporaire traitement (vidé au démarrage)

/Users/timeless/timeless/
  data/database/       # Fichier SQLite + WAL
```

### Montage persistant du SSD

Dans `System Settings > General > Login Items`, ajouter un script :
```bash
#!/bin/bash
# mount-media-ssd.sh
if [ ! -d "/Volumes/TimelessMedia" ]; then
  diskutil mount /dev/diskXsY  # Remplacer par l'identifiant réel
fi
```

Identifier le disque : `diskutil list`

---

## 8. Docker Compose

Fichier `infra/docker-compose.yml` :
```yaml
version: '3.9'

services:
  api:
    build: ./apps/api
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"    # Jamais exposé publiquement directement
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/data/database/timeless.db
      - MEDIA_PATH=/data/media
    env_file:
      - .env.production
    volumes:
      - /Users/timeless/timeless/data/database:/data/database
      - /Volumes/TimelessMedia:/data/media:ro  # API lit, worker écrit
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    build: ./apps/api
    command: node dist/worker.js
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - /Users/timeless/timeless/data/database:/data/database
      - /Volumes/TimelessMedia:/data/media  # Worker a accès en écriture

  web:
    build: ./apps/web
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:80"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

---

## 9. Démarrage automatique après reboot

### Via launchd (macOS natif)

Fichier `/Library/LaunchDaemons/be.timeless.studio.plist` :
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>be.timeless.studio</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>compose</string>
        <string>-f</string>
        <string>/Users/timeless/timeless/infra/docker-compose.yml</string>
        <string>up</string>
        <string>-d</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>/Users/timeless/timeless</string>
    <key>StandardOutPath</key>
    <string>/var/log/timeless-startup.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/timeless-startup-error.log</string>
</dict>
</plist>
```

```bash
sudo launchctl load /Library/LaunchDaemons/be.timeless.studio.plist
```

---

## 10. Pare-feu macOS

```bash
# Activer le pare-feu
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Autoriser uniquement les ports nécessaires (80 et 443 gérés par Caddy/tunnel)
# Ne jamais ouvrir : 5432, 6379, 22 (SSH admin), 3000, 3001 vers l'extérieur

# Pour accès SSH de maintenance : utiliser Tailscale VPN uniquement
# Ne jamais exposer SSH sur le port 22 public
```

---

## 11. DNS et domaine

1. Enregistrer `votredomaine.be` chez un registrar (Gandi, OVH, Combell...)
2. Configurer les enregistrements DNS :
   - `A` → IP publique du Mac mini (ou CNAME → tunnel Cloudflare)
   - `www` → redirect vers l'apex
   - `MX` → serveur e-mail du relais SMTP

Si IP dynamique : utiliser un service DDNS (DuckDNS, No-IP) avec mise à jour automatique via script cron.

---

## 12. Surveillance

### Script de surveillance disque (cron quotidien)

```bash
#!/bin/bash
# /Users/timeless/scripts/check-disk.sh
THRESHOLD_WARN=70
THRESHOLD_ALERT=85
THRESHOLD_CRITICAL=95

USAGE=$(df /Volumes/TimelessMedia | tail -1 | awk '{print $5}' | tr -d '%')

if [ $USAGE -ge $THRESHOLD_CRITICAL ]; then
  mail -s "[CRITIQUE] SSD TimelessMedia à ${USAGE}%" admin@votredomaine.be < /dev/null
elif [ $USAGE -ge $THRESHOLD_ALERT ]; then
  mail -s "[ALERTE] SSD TimelessMedia à ${USAGE}%" admin@votredomaine.be < /dev/null
elif [ $USAGE -ge $THRESHOLD_WARN ]; then
  mail -s "[AVERTISSEMENT] SSD TimelessMedia à ${USAGE}%" admin@votredomaine.be < /dev/null
fi
```

### Surveillance température

```bash
brew install osx-cpu-temp
# Ajouter dans le cron :
# */30 * * * * osx-cpu-temp | awk '{if ($1+0 > 85) system("mail -s \"[TEMP] Mac mini surchauffe\" admin@...")}' 
```

### Surveillance service

```bash
# Health check toutes les 5 minutes via cron
*/5 * * * * curl -sf http://localhost:3000/healthz || mail -s "[DOWN] API Timeless" admin@...
```

---

## 13. Sauvegarde 3-2-1

| Copie | Support | Méthode |
|---|---|---|
| 1 — Active | SSD principal | Données vivantes |
| 2 — Locale | SSD de sauvegarde dédié | rsync nocturne + Litestream SQLite |
| 3 — Hors site | Backblaze B2 ou Hetzner Storage Box | rclone chiffré (AES-256) |

```bash
# Script sauvegarde quotidienne (cron 3h00)
# 1. SQLite : Litestream réplique en continu
# 2. Médias → SSD backup
rsync -av --checksum /Volumes/TimelessMedia/originals/ /Volumes/TimelessBackup/originals/
# 3. Médias → hors site (chiffré)
rclone sync /Volumes/TimelessMedia/originals/ b2:timeless-backup/originals/ --crypt-password-file=/etc/timeless/backup.key
```

### Commande de restauration

```bash
# Restauration test (ne jamais restaurer en production sans confirmation)
rclone sync b2:timeless-backup/originals/ /tmp/restore-test/ --crypt-password-file=/etc/timeless/backup.key
sha256sum -c /tmp/restore-test/checksums.sha256
```

---

## 14. Mise à jour sans perte de données

```bash
# 1. Sauvegarder manuellement avant toute mise à jour
./scripts/backup-now.sh

# 2. Tirer la nouvelle version
git pull origin main

# 3. Construire les images
docker compose -f infra/docker-compose.yml build

# 4. Appliquer les migrations base de données
docker compose run --rm api node dist/migrate.js

# 5. Redémarrer les services (zero downtime si blue-green)
docker compose -f infra/docker-compose.yml up -d

# Retour arrière si problème :
git checkout [TAG_PRÉCÉDENT]
docker compose -f infra/docker-compose.yml up -d
```

---

## 15. Comportement lors d'incidents

| Incident | Comportement attendu |
|---|---|
| Coupure Internet | Site inaccessible, données intactes, service reprend automatiquement |
| Redémarrage Mac mini | launchd relance Docker Compose automatiquement après boot |
| Débranchement SSD médias | API détecte l'absence du montage au démarrage et affiche une erreur maîtrisée ; PAS de démarrage en production sans SSD |
| SSD médias plein | Avertissements à 70%/85%/95%, uploads bloqués à 95% |
| Expiration certificat TLS | Caddy renouvelle automatiquement ; alerte si renouvellement échoue |

---

## 16. Accès distant de maintenance

**Ne jamais** exposer SSH sur le port 22 publiquement.

Option recommandée : **Tailscale** (VPN mesh privé)
```bash
brew install tailscale
tailscale up
# Ajouter le Mac mini au réseau Tailscale
# SSH uniquement via adresse Tailscale (100.x.x.x)
```

Option alternative : clés SSH sur port non-standard, restreint à une IP fixe via pare-feu.

---

## 17. Checklist de mise en production

- [ ] Variables d'environnement de production configurées (`.env.production`)
- [ ] Mot de passe admin hashé (Argon2id) via `./scripts/set-admin-password.sh`
- [ ] URL d'administration configurée (aléatoire, non devinable)
- [ ] SSD médias monté et permissions vérifiées
- [ ] SSD de sauvegarde monté et script cron configuré
- [ ] Tunnel ou ports forwarding configurés
- [ ] DNS propagé et HTTPS fonctionnel
- [ ] Certificat TLS valide (Caddy log vérifié)
- [ ] Health check répond 200
- [ ] Test upload d'une photo → watermark vérifié
- [ ] Test création galerie → code accès → session → téléchargement
- [ ] Test formulaire contact → notification e-mail reçue
- [ ] Test sauvegarde + restauration
- [ ] Surveillance disque configurée
- [ ] Onduleur connecté
