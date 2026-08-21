# Timeless — Photo & Video

A premium wedding photography and videography studio based in Belgium.

## Prerequisites

- **Node.js**: `v24.15.0` (specified in `.nvmrc`)
- **npm**: v10+

## Installation

1. Clone the repository
2. Ensure you're on the right Node version:
   ```bash
   nvm use
   ```
3. Install dependencies cleanly:
   ```bash
   npm ci
   ```

## Development

To start the local development server:

```bash
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

*Note: The `apps/api` workspace is not yet implemented (planned for Phase 3). The `dev` command correctly runs the `apps/web` application.*

## Building for Production

To build the application for production:

```bash
npm run build
```

This compiles both the `@timeless/shared` package and the `apps/web` React Router application.

## Déploiement en Production

Pour déployer l'application en production :

1. Fournissez vos secrets via l'environnement de votre orchestrateur ou gestionnaire de services (ex: Systemd, Docker).
2. Lancez le serveur Node.js (écoute restreinte à localhost) :
   ```bash
   npm run start
   ```
   > **Note :** La commande `start` force l'écoute sur `127.0.0.1`. Vous DEVEZ déployer un reverse proxy de confiance (Nginx, Caddy, Apache) devant le serveur Node.

### Configuration du Reverse Proxy & Politique IP
La variable `TRUST_PROXY=true` est **strictement requise** en production.
Votre reverse proxy DOIT écraser l'entête HTTP entrant `X-Forwarded-For` et le remplacer par la véritable adresse IP distante du client. S'il y a plusieurs IP, l'application rejettera la requête pour prévenir toute falsification (spoofing).

### Relais SMTP
Le formulaire de contact utilise **Brevo** comme relais SMTP transactionnel sécurisé (port 587 + TLS forcé) pour transférer les messages vers l'adresse finale. Aucune donnée personnelle n'est journalisée en interne lors des envois.

### Formulaire de contact
- **Honeypot** : Si le champ caché `website` est rempli, la requête est rejetée avec une réponse d'erreur générique. Aucun e-mail n'est envoyé et aucune donnée du formulaire n'est conservée.
- **Rate limiting** : Limité par défaut à 5 envois par heure et par IP (modifiable via `CONTACT_RATE_LIMIT_MAX`).

## Testing & Quality

- **Typecheck**: `npm run typecheck`
- **Lint**: `npm run lint`
- **Unit Tests**: `npm run test`
- **End-to-End Tests**: `npm run test:e2e` (Requires building first)

## Phase 2 Corrective Architecture

- **`@timeless/shared`**: Consumed via direct source alias (`src/index.ts`) avoiding build step in dev mode.
- **Environment**: `PUBLIC_SITE_URL` is passed at runtime and dynamically handled by SSR loaders.
- **Security**: 
  - Nonce-based CSP for all scripts.
  - Client areas and gallery pages redirect via SSR loader.
- **SEO**: Canonical, `hrefLang` and `robots.txt` generated securely.

## Configuration

Duplicate `.env.example` to `.env.local` for development at the root of the repository.
In production, do not use `.env.local`; variables must be injected directly into the environment by your service manager.
