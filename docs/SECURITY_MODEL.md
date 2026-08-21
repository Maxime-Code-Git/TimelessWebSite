# Modèle de sécurité — Timeless Photo & Video

> Dernière mise à jour : 2026-08-13
> Niveau de confidentialité : usage interne / propriétaire

---

## 1. Principes fondateurs

1. **Défense en profondeur** : chaque couche protège indépendamment des autres.
2. **Moindre privilège** : chaque composant n'accède qu'à ce dont il a besoin.
3. **Aucun secret dans le code** : toutes les valeurs sensibles viennent de variables d'environnement.
4. **Originaux jamais publics** : aucune URL directe vers un fichier original.
5. **Watermark pixel** : filigrane incrusté dans les pixels côté serveur, pas CSS.

---

## 2. Authentification admin

- **Hash** : Argon2id (libsodium, params 2026 : m=65536, t=3, p=4)
- **Secret initial** : fourni via `ADMIN_PASSWORD` en variable d'environnement, jamais stocké en clair
- **Session** : token opaque 256 bits, haché en base, cookie `HttpOnly; Secure; SameSite=Strict`
- **Durée** : 8 heures, renouvelée automatiquement sur activité
- **Rate limiting** : 5 tentatives / 15 min / IP, puis backoff exponentiel
- **Invalidation** : déconnexion explicite, expiration, rotation manuelle possible
- **URL cachée** : chemin non devinable, non présent dans sitemap, robots.txt, bundle public
- **Journal** : toutes les tentatives (succès/échec) sans log du mot de passe

---

## 3. Authentification galerie client

- **Codes** : format `TL-AAAA-XXXXXXXX` (8 chars alphanum aléatoires, 40 bits d'entropie)
- **Stockage** : uniquement le hash Argon2id du code, jamais le code en clair
- **Session galerie** : cookie `HttpOnly; Secure; SameSite=Strict`, durée 7 jours
- **Rate limiting** : 5 essais / 15 min / IP, message d'erreur uniforme (ne révèle pas si galerie existe)
- **Rotation** : nouveau code → hash remplacé → toutes sessions galerie précédentes invalidées
- **Révocation** : suppression du hash → toutes sessions invalidées immédiatement
- **Partage de code** : documenté comme risque accepté (pas de compte individuel par design)

---

## 4. Protection des médias

### 4.1 Originaux

```
data/media/originals/{uuid}.{ext}     # Hors tout dossier HTTP
```

- Identifiants UUID v4 aléatoires, aucune info personnelle
- Aucun chemin disque ne provient d'une entrée utilisateur
- Toute lecture vérifie la session (galerie ou admin) côté serveur
- Téléchargements via tokens JWT signés (secret `MEDIA_SIGNING_KEY`), TTL 10 minutes
- Invalidation immédiate lors de la révocation du code

### 4.2 Aperçus Web

```
data/media/web/{uuid}-{variant}.webp    # Servi via API authentifiée
```

Générés par Sharp lors de l'upload :
- Dimensions max : 2400px côté long (Retina sans qualité impression)
- EXIF/IPTC/GPS supprimés
- Orientation corrigée avant suppression des métadonnées
- Filigrane pixel « Timeless » intégré en diagonal

### 4.3 Filigrane pixel

- Rendu via Sharp (`sharp.composite()` avec SVG texte ou layer PNG pré-généré)
- Texte « Timeless » en diagonal à 45°
- Répété toutes les 300px (configurable admin : 200–500px)
- Opacité : 35% par défaut (configurable : 20–60%)
- Taille police : 5% de la hauteur de l'image (configurable)
- JAMAIS une couche CSS, pseudoélément ou élément DOM retirable

### 4.4 Vidéos

- Version publique extraite par FFmpeg avec filigrane incrusté (`drawtext`)
- Débit raisonnable (H.264, CRF 23, max 1080p)
- Fichier original non accessible via URL publique
- Lecture en ligne via streaming authentifié avec support HTTP Range

---

## 5. Sécurité Web

### En-têtes HTTP

```
Content-Security-Policy:
  default-src 'self';
  font-src 'self' https://fonts.gstatic.com;
  style-src 'self' https://fonts.googleapis.com 'nonce-{random}';
  img-src 'self' data:;
  media-src 'self' blob:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'self';

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Protection CSRF

- Token double-submit pour toutes les mutations authentifiées
- Cookie `csrf-token` + header `X-CSRF-Token`

### Validation des uploads

1. Magic bytes (fichier signature réelle)
2. Type MIME vérifié par bibliothèque (pas l'en-tête client)
3. Extension dans liste blanche : `.jpg .jpeg .png .webp .mp4 .mov .heic`
4. Dimensions : 100×100px min, 20000×20000px max
5. Taille : 100MB max photo, 4GB max vidéo
6. Noms remplacés par UUID, jamais utilisé en chemin disque

### Autres protections

- Pas de CORS large : same-origin par défaut
- Pas de stack traces vers le client
- Pas de chemins disques dans les réponses d'erreur
- Pas de variables d'environnement exposées
- Toutes les sorties HTML echappées (pas de dangerouslySetInnerHTML avec contenu admin)

---

## 6. Formulaire de contact

- **Honeypot** : champ caché `website` — si rempli, requête silencieusement ignorée
- **Rate limiting** : 3 soumissions / heure / IP
- **Validation serveur** : chaque champ validé indépendamment du client
- **Stockage provisoire** : le contenu du formulaire n'est pas conservé durablement en base SQLite tant que sa durée de conservation RGPD n'a pas été décidée. Le message est conservé dans la boîte Gmail du studio. La base SQLite ne conserve actuellement que le hash des IP pour le rate limiting.
- **E-mails** : Les messages sont transmis au relais SMTP sécurisé **Brevo** (sur le port 587 avec TLS forcé) pour être livrés. Aucune donnée personnelle, trace SMTP brute ou IP n'est journalisée en cas d'erreur.

---

## 7. Administration

- Inaccessible depuis une IP externe sans authentification
- Idéalement exposée uniquement sur localhost ou via VPN
- Aucune information sur son existence dans sitemap, robots.txt, bundle public
- Suppressions importantes : confirmation explicite requise
- Suppression de médias : corbeille 30 jours avant suppression définitive

---

## 8. Données personnelles (RGPD)

- **Logs** : aucun e-mail, nom, code galerie, mot de passe ou token signé
- **IPs** : L'application écoute uniquement sur `127.0.0.1`. En production, elle fait confiance exclusivement à l'en-tête `X-Forwarded-For` fourni par le reverse proxy (activé via `TRUST_PROXY=true`). Les IPs sont hashées avec un secret HMAC avant stockage dans les tables de rate limiting et audit. L'IP brute n'est jamais conservée.
- **Cookies** : session opaque uniquement — pas de tracking, pas d'analytics tiers par défaut
- **Galeries** : accès limité dans le temps (24 mois), expiration documentée
- **Sauvegardes** : chiffrées, accès restreint

---

## 9. Sauvegardes

- Base SQLite : Litestream (streaming vers stockage local + hors site)
- Médias : rsync incrémental vers SSD de sauvegarde, rclone vers stockage hors site chiffré (Backblaze B2 ou équivalent)
- Fréquence : base quotidienne + continue via Litestream, médias quotidien
- Rétention : 30 jours locaux, 90 jours hors site
- Chiffrement : AES-256 via rclone (clé dans `BACKUP_ENCRYPTION_KEY`)
- Vérification : checksums SHA-256 vérifiés après chaque sauvegarde
- Test restauration : mensuel sur répertoire temporaire

---

## 10. Ce qui n'est PAS une protection

(Mesures friction UX acceptables mais NON présentées comme sécurité)

- Désactivation du clic droit
- Désactivation du glisser-déposer
- Layers CSS sur les images
- Désactivation des DevTools
- Watermark CSS/pseudoélément

Ces mesures peuvent être ajoutées comme friction légère UX uniquement, et ne remplacent aucune des mesures serveur ci-dessus.

---

## Corrections et mises à jour — 2026-08-13

### Codes galerie (remplace §3)

Format : `TL-XXXXX-XXXXX-XXXXX-XXXXX`
- 20 caractères Base32 Crockford (alphabet 0-9 + A-Z sans I/L/O/U)
- Entropie : 100 bits (crypto.randomBytes(13) → encodage Base32)
- Hash : Argon2id uniquement
- Rate limiting : 5 essais / 15 min / IP, 20 / heure globalement
- Message d'erreur uniforme (ne révèle pas l'existence de la galerie)

### Tokens de téléchargement (remplace §4.1 partiellement)

Chaque token JWT signé (HMAC-SHA256) est lié à :
- `galleryId` : galerie autorisée
- `mediaId` : média précis ou 'zip'
- `action` : 'download' | 'stream' | 'zip'
- `exp` : TTL 10 minutes
- `jti` : identifiant unique (prévient la réutilisation)

Révocation du code galerie → invalide immédiatement tous les tokens liés.
Streaming vidéo : HTTP Range requests (206 Partial Content) supportées.

### Administration (renforce §7)

- CSRF token double-submit sur toutes les mutations
- Rate limiting progressif (backoff exponentiel : 1s, 2s, 4s, 8s…)
- Entrée séparée sur port interne (127.0.0.1:3001) si possible
- Absent du sitemap, robots.txt, bundle public, navigation
