# Plan d'implémentation — Timeless Photo & Video
# Révision 2 — 2026-08-13 (corrections post-validation utilisateur)

## Source visuelle de vérité

`references/page-accueil-reproduite/` — 7 fichiers `.dc.html`.

Logo officiel : `references/logo-officiel.png`
— Monogramme T + symbole infini doré + cercle d'horloge + "Timeless PHOTO & VIDEO".
NE PAS utiliser `assets/logo-header.png` / `assets/logo-1.png` du ZIP.

---

## [CORR. 1] Polices locales — source absolue

**Aucune police chargée depuis Google Fonts ou tout service externe.**
Sources intactes dans `references/fonts/` (OFL, autorisé à auto-héberger).

### Cormorant Garamond — graisses disponibles (static + variable)

| Fichier source | Graisse | Style |
|---|---|---|
| CormorantGaramond-Light.ttf | 300 | normal |
| CormorantGaramond-LightItalic.ttf | 300 | italic |
| CormorantGaramond-Regular.ttf | 400 | normal |
| CormorantGaramond-Italic.ttf | 400 | italic |
| CormorantGaramond-Medium.ttf | 500 | normal |
| CormorantGaramond-MediumItalic.ttf | 500 | italic |
| CormorantGaramond-SemiBold.ttf | 600 | normal |
| CormorantGaramond-SemiBoldItalic.ttf | 600 | italic |
| CormorantGaramond-Bold.ttf | 700 | normal |
| CormorantGaramond-BoldItalic.ttf | 700 | italic |
| CormorantGaramond-VariableFont_wght.ttf | variable 300–700 | normal |
| CormorantGaramond-Italic-VariableFont_wght.ttf | variable 300–700 | italic |

**Graisses utilisées par les maquettes : 400 (normal+italic), 500 (normal), 600 (normal)**
→ Charger uniquement ces 4 fichiers statiques en WOFF2 + le fichier variable en fallback.

### Hanken Grotesk — graisses disponibles (static + variable)

| Fichier source | Graisse | Style |
|---|---|---|
| HankenGrotesk-ExtraLight.ttf | 200 | normal |
| HankenGrotesk-Light.ttf | 300 | normal |
| HankenGrotesk-Regular.ttf | 400 | normal |
| HankenGrotesk-Italic.ttf | 400 | italic |
| HankenGrotesk-Medium.ttf | 500 | normal |
| HankenGrotesk-SemiBold.ttf | 600 | normal |
| HankenGrotesk-Bold.ttf | 700 | normal |
| HankenGrotesk-VariableFont_wght.ttf | variable 100–900 | normal |
| HankenGrotesk-Italic-VariableFont_wght.ttf | variable 100–900 | italic |

**Graisses utilisées par les maquettes : 400 (normal), 500 (normal)**
→ Charger uniquement ces 2 fichiers statiques en WOFF2.

### Conversion TTF → WOFF2 (reproductible, non génératif)
Outil : `npx ttf2woff2` ou `woff2_compress` (Google woff2 CLI).
Script : `scripts/convert-fonts.sh` — exécuté une fois, résultat commité dans `apps/web/public/fonts/`.
Ne jamais modifier les fichiers sources dans `references/fonts/`.

### Déclaration CSS `@font-face`
```css
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/CormorantGaramond-Regular.woff2') format('woff2');
}
/* … une déclaration par fichier utilisé */
```
Preload uniquement les 2 fichiers critiques above-the-fold (Regular + Medium Cormorant).
Aucune graisse synthétique (`font-synthesis: none` dans le CSS global).

---

## [CORR. 2] Codes galerie — entropie ≥ 80 bits, cible 100–128 bits

**Ancien format** : `TL-AAAA-XXXXXXXX` (40 bits) — REMPLACÉ.

**Nouveau format** : `TL-XXXXX-XXXXX-XXXXX-XXXXX`
- 20 caractères aléatoires en Base32 Crockford (alphabet : 0-9, A-Z sauf I/L/O/U)
- Entropie : 20 × log2(32) = **100 bits**
- Lisible par groupes de 5 séparés par tirets : `TL-ABCDE-12345-FGHIJ-67890`
- Génération : `crypto.randomBytes(13)` → encodage Base32 Crockford (13 × 8 = 104 bits)
- Stockage : **uniquement le hash Argon2id** du code brut, jamais le code en clair
- Rate limiting : 5 essais / 15 min / IP, 20 essais / heure globalement (table `rate_limit_attempts`)
- Rotation : nouveau code → hash remplacé → toutes sessions galerie précédentes invalidées
- Révocation : hash mis à NULL ou ligne supprimée → sessions invalidées immédiatement
- Message d'erreur uniforme : ne révèle pas si la galerie existe

---

## [CORR. 3] Upload avec reprise — spécification concrète

**Protocole** : upload multipart TUS-compatible (implémentation serveur maison en Hono, ou `tus-node-server`).

### Flux complet

```
Client                          Serveur
  │                               │
  ├─ POST /api/upload/init ───────►│
  │   {filename, size, sha256,     │
  │    galleryId, mimeType}        │
  │◄─────────────────── 201 ───────┤
  │   {uploadId, chunkSize: 5MB}   │
  │                               │
  ├─ PATCH /api/upload/{uploadId} ─►│  chunk 0
  │   Content-Range: 0-5242879    │
  │   X-Chunk-Sha256: {hash}      │
  │◄─────────────────── 200 ───────┤ {offset: 5242880}
  │                               │
  ├─ (fermeture navigateur)       │
  │                               │
  ├─ GET /api/upload/{uploadId} ──►│  reprise
  │◄─────────────────── 200 ───────┤ {offset: 5242880}  ← reprend ici
  │                               │
  ├─ PATCH /api/upload/{uploadId} ─►│  chunk 1
  │   Content-Range: 5242880-...  │
  │◄─────────────────── 200 ───────┤ {offset: ..., complete: true}
  │                               │
  │◄─────────────────── 200 ───────┤ {mediaId: "uuid", status: "queued"}
```

### Table `upload_sessions`
```sql
CREATE TABLE upload_sessions (
  id            TEXT PRIMARY KEY,          -- UUID v4
  gallery_id    TEXT REFERENCES galleries,
  filename_hash TEXT NOT NULL,             -- sha256 du nom original
  total_size    INTEGER NOT NULL,
  received_size INTEGER NOT NULL DEFAULT 0,
  sha256_full   TEXT NOT NULL,             -- checksum attendu du fichier complet
  mime_type     TEXT NOT NULL,
  tmp_path      TEXT NOT NULL,             -- chemin fichier fragmenté temp
  status        TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress|complete|failed|expired
  chunk_size    INTEGER NOT NULL DEFAULT 5242880,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME NOT NULL          -- +24h, nettoyage cron
);
```

### Garanties
- **Idempotence** : PATCH avec même Content-Range → réponse 200 sans ré-écriture si checksum identique
- **Checksum par chunk** : `X-Chunk-Sha256` vérifié avant acceptation
- **Checksum final** : sha256 du fichier complet vérifié après assemblage
- **Reprise** : GET `/api/upload/{uploadId}` retourne l'offset actuel ; client reprend à cet offset
- **Retries** : côté client, max 3 retentatives par chunk avec backoff 1s/2s/4s
- **Nettoyage** : cron quotidien supprime les `upload_sessions` expirées + fichiers temp associés
- **Progression** : offset persiste en base → rechargement page = progression visible

---

## [CORR. 4] Queue Sharp/FFmpeg/ZIP — persistante SQLite

**Pas de queue uniquement en mémoire.** La queue est la table `processing_jobs` en SQLite.

### Table `processing_jobs`
```sql
CREATE TABLE processing_jobs (
  id            TEXT PRIMARY KEY,   -- UUID v4
  type          TEXT NOT NULL,      -- 'watermark'|'thumbnail'|'video_transcode'|'zip_prepare'|'exif_strip'
  payload       TEXT NOT NULL,      -- JSON : {mediaId, galleryId, ...}
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued|running|done|failed|dead
  priority      INTEGER NOT NULL DEFAULT 5,      -- 1=haute, 10=basse
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  error         TEXT,               -- dernier message d'erreur
  locked_by     TEXT,               -- identifiant du worker (hostname+pid)
  locked_at     DATETIME,           -- timestamp du verrou
  run_after     DATETIME,           -- pour backoff exponentiel
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  done_at       DATETIME
);
CREATE INDEX idx_jobs_status_priority ON processing_jobs(status, priority, run_after);
```

### Worker SQLite
```
1. SELECT … WHERE status='queued' AND run_after <= now() ORDER BY priority, created_at LIMIT 1
2. UPDATE … SET status='running', locked_by=worker_id, locked_at=now(), attempts=attempts+1
3. Exécuter Sharp/FFmpeg/zip
4a. Succès → UPDATE status='done', done_at=now()
4b. Échec récupérable → UPDATE status='queued', run_after=now()+2^attempts*60s
4c. Échec définitif (attempts >= max_attempts) → UPDATE status='dead', error=...
```

### Garanties
- **Verrou SQL** : `UPDATE … WHERE status='queued'` est atomique en SQLite WAL
- **Reprise après redémarrage** : au démarrage, reset `status='queued'` pour les jobs `running` dont `locked_at` > 5 min (verrous orphelins)
- **Dead-letter** : jobs `dead` conservés 30 jours, accessibles dans l'admin avec log d'erreur
- **Pas de perte** : si le worker crash entre 2 et 4, le verrou expire et un autre worker reprend
- **ZIP sans explosion mémoire** : archivage en streaming (node:stream + archiver ou yazl), jamais de Buffer global

---

## [CORR. 5] Versions Node et dépendances — verrouillage au moment de l'installation

Node actuel installé : **v26.5.1** (LTS actif — utilisé tel quel).
npm actuel : **11.17.0**.

Versions stables à verrouiller au moment du `npm install` initial (seront précisées dans `package.json` avec `^` ou épinglées dans `package-lock.json`).
`.nvmrc` ou `.node-version` commité avec la version exacte de Node installée.

**Règle** : utiliser les versions stables disponibles au moment du `npm install`, puis verrouiller via `package-lock.json`. Aucune version codée en dur dans les docs au-delà de Node 26.5.1 actuel.

---

## [CORR. 6] Rendu SSR/SSG pour les pages publiques

**Pages publiques FR/EN** : rendu côté serveur (SSR) ou pré-rendu (SSG) obligatoire.
→ Le contenu, les balises `<title>`, meta description, Open Graph et hreflang doivent être présents sans exécution JavaScript.

**Solution retenue** : **React Router v7 (framework mode)** avec SSR.
- Pages publiques : rendu serveur via les loaders React Router
- Administration et galeries privées : SPA classique (pas de SEO requis)
- Hydratation côté client pour l'interactivité

**Alternative** si React Router v7 pose problème : **Vite + vite-plugin-ssr** ou **Astro** pour le frontend public uniquement.

Chaque page publique expose :
```html
<title>[Titre page] — Timeless Photo & Video</title>
<meta name="description" content="...">
<link rel="canonical" href="https://domaine.be/fr/page">
<link rel="alternate" hreflang="fr" href="https://domaine.be/fr/page">
<link rel="alternate" hreflang="en" href="https://domaine.be/en/page">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="[image publique non privée]">
```

---

## [CORR. 7] Sauvegarde SQLite et médias — stratégies séparées

### 7a — SQLite (base de données)

| Outil | Mécanisme | Fréquence |
|---|---|---|
| Litestream | Réplication WAL en continu | Quasi-temps-réel |
| + dump SQLite | `sqlite3 db.sqlite .dump > db.sql.gz` | Quotidien à 02h00 |
| Rétention locale | 30 jours | — |
| Rétention hors site (rclone chiffré) | 90 jours | — |

### 7b — Médias (SSD externe) — DISTINCT de SQLite

- **Outil** : `rsync --checksum --archive` vers SSD de sauvegarde local
- **Fréquence** : quotidien à 03h00 (incrémental, uniquement les nouveaux fichiers)
- **Versionnage** : snapshots datés conservés 30 jours locaux, 90 jours hors site
- **Chiffrement hors site** : `rclone crypt` (AES-256-CTR + HMAC-SHA256)
- **Checksums** : sha256 de chaque fichier généré après copie et vérifié
- **Hors site** : Backblaze B2, Hetzner Storage Box, ou équivalent ; configuré via `BACKUP_REMOTE`
- **Taille** : avertissement à 70%/85%/95% du SSD média

### Test de restauration réel
```bash
# scripts/test-restore.sh — à exécuter mensuellement
rclone sync "$BACKUP_REMOTE/originals/" /tmp/restore-test-media/ --crypt-password-file=...
sha256sum -c /tmp/restore-test-media/checksums.sha256
sqlite3 /tmp/restore-test.db ".read /tmp/restore-test-db.sql"
echo "Restauration testée le $(date)" >> /var/log/timeless-restore-tests.log
```

---

## [CORR. 8] Administration — sécurité renforcée

- **URL cachée** : chemin non devinable (ex. `/admin-[random-16chars]`), configurable via `ADMIN_PATH`
- **Défense primaire** : authentification Argon2id, pas l'obscurité de l'URL
- **Session** : cookie `HttpOnly; Secure; SameSite=Strict`, durée 8h, renouvelée sur activité
- **CSRF** : token double-submit sur toutes les mutations (POST/PUT/PATCH/DELETE)
- **Rate limiting** : 5 essais / 15 min / IP + délai progressif (1s, 2s, 4s, 8s…)
- **Journal sécurité** : tentatives (succès/échec) avec IP hashée, sans log du mot de passe
- **Invalidation** : déconnexion explicite + expiration + rotation manuelle
- **Exclusions** : absent du sitemap, absent de `robots.txt`, absent du bundle JS public, non lié dans la navigation
- **Entrée séparée** (si applicable) : route admin sur port interne uniquement (`127.0.0.1:3001`), jamais exposé par le reverse proxy public

---

## [CORR. 9] Tokens de téléchargement — liaison galerie+média+action

### Structure du token JWT signé
```typescript
interface DownloadToken {
  galleryId: string;   // galerie autorisée
  mediaId: string;     // média précis (ou 'zip' pour archive)
  action: 'download' | 'stream' | 'zip';
  iat: number;         // émis à
  exp: number;         // expire à (iat + 600 = 10 minutes)
  jti: string;         // identifiant unique du token (prévient la réutilisation)
}
```

- **Signé** avec `MEDIA_SIGNING_KEY` (HMAC-SHA256, 256 bits)
- **TTL** : 10 minutes, non renouvelable
- **Révocation du code galerie** → invalide immédiatement tous les tokens de cette galerie (vérification de la session galerie active à chaque requête de média)
- **JTI** : le token ne peut pas être réutilisé (table `used_download_tokens` ou Redis SET)
- **Streaming vidéo** : support complet des `Range requests` (HTTP 206 Partial Content)
  - Vérification du token à chaque requête Range
  - `Accept-Ranges: bytes` dans les en-têtes
  - Pas de mise en cache côté client des URLs signées

---

## [CORR. 10] Statut juridique du studio

La question "auto-entrepreneur ou société" est remplacée par :
**"indépendant en personne physique ou société (ex. SRL)"** — à renseigner dans l'administration et dans `CONTENT_TO_REPLACE.md`.

---

## Réponses aux questions ouvertes

- **IP/CGNAT** : inconnu. Les deux modes sont préparés (voir DEPLOYMENT_MAC_MINI.md). Aucun port ouvert tant que le diagnostic n'est pas réalisé. Tunnel sortant sécurisé privilégié par défaut.
- **Domaine** : à définir. Configurable via `PUBLIC_DOMAIN` en variable d'environnement.
- **Créneaux RDV** : mardis et jeudis des maquettes sont provisoires. Les jours et horaires sont entièrement configurables dans l'administration.
- **Portfolio** : aucun faux média publié. Les vrais médias seront ajoutés via l'admin après lancement.
- **Statut juridique** : à renseigner dans l'admin (mentions légales) et dans `CONTENT_TO_REPLACE.md`.

---

## Architecture technique finale

```
timeless/
  apps/
    web/        # React Router v7 SSR + TypeScript + CSS Modules
    api/        # Node.js LTS + Hono + TypeScript
  packages/
    shared/     # Types partagés, tokens CSS, validation schemas
    ui/         # Composants réutilisables (Header, Footer, ImageSlot…)
  data/
    database/   # SQLite WAL + Drizzle ORM + migrations versionnées
    media/      # → /Volumes/TimelessMedia (lien symbolique, non commité)
  docs/         # Documentation
  references/   # Maquettes + polices sources (non commité en prod)
  infra/
    docker-compose.yml
    caddy/
  scripts/
    convert-fonts.sh    # TTF → WOFF2 reproductible
    set-admin-password.sh
    backup-db.sh
    backup-media.sh
    test-restore.sh
    cleanup-uploads.sh  # Nettoyage sessions upload expirées
  .env.example
  .nvmrc             # Version Node exacte
```

## Design tokens

```css
:root {
  --ivory:       #FBF6F0;
  --forest-deep: #072421;
  --forest:      #0D3A35;
  --green:       #276152;
  --gold:        #BA996B;
  --gold-light:  #E4C99A;
  --gold-dark:   #9B7846;
  --sage:        #B1B7AB;
  --footer-bg:   #04211D;
  --footer-link: #5F8177;
}
```

## Pages

| Route FR | Route EN | Rendu | Source |
|---|---|---|---|
| /fr/ | /en/ | SSR | Accueil.dc.html |
| /fr/portfolio | /en/portfolio | SSR | Portfolio Photographie.dc.html |
| /fr/formules | /en/pricing | SSR | Formules.dc.html |
| /fr/a-propos | /en/about | SSR | A Propos.dc.html |
| /fr/contact | /en/contact | SSR | Contact.dc.html |
| /fr/espace-clients | /en/client-area | SSR | Espace Clients.dc.html |
| /fr/galerie/:id | /en/gallery/:id | SPA | Ma Galerie.dc.html |
| /fr/mentions-legales | /en/legal | SSR | À créer |
| /fr/confidentialite | /en/privacy | SSR | À créer |
| /fr/cgv | /en/terms | SSR | À créer |
| [ADMIN_PATH] | — | SPA | Administration |

## Phases

1. Monorepo + design system + polices WOFF2 + SSR setup
2. Pages publiques fidèles (SSR, FR+EN, tokens CSS)
3. Backend + BDD + upload avec reprise + queue SQLite
4. Sharp watermark + FFmpeg + génération variantes
5. Galeries clients + tokens de téléchargement + streaming Range
6. Administration (URL cachée, Argon2id, CSRF, rate limiting)
7. Contact + rendez-vous + SMTP relais
8. Sécurité, tests (Vitest + Playwright), audit headers
9. Déploiement Mac mini + sauvegarde séparée DB+médias
10. Contrôle visuel final + corrections
