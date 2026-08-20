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

Duplicate `.env.example` to `.env.local` (for development) or `.env.production` (for production) at the root of the repository:

```
PUBLIC_SITE_URL=http://localhost:5173
TRUST_PROXY=false
```
