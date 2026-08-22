import type { Route } from "./+types/root";
import { data } from "react-router";
import stylesheet from "./app.css?url";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from "react-router";
import errorStyles from "./error.module.css";

// Preload critical fonts (above-the-fold)
const PRELOAD_FONTS = [
  "/fonts/CormorantGaramond-Regular.woff2",
  "/fonts/CormorantGaramond-Medium.woff2",
  "/fonts/HankenGrotesk-Regular.woff2",
];

import { getSiteContent } from "./lib/site-content.server";

export function loader() {
  const url = process.env.PUBLIC_SITE_URL || "http://localhost:5173";
  const siteContent = getSiteContent();
  // Remove trailing slash if any
  return data({
    PUBLIC_SITE_URL: url.replace(/\/$/, ""),
    siteContent,
  });
}

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  // Preload critical fonts
  ...PRELOAD_FONTS.map((href) => ({
    rel: "preload" as const,
    href,
    as: "font" as const,
    type: "font/woff2",
    crossOrigin: "anonymous" as const,
  })),
  // Favicon (will be generated from logo)
  { rel: "icon", href: "/favicon.ico" },
];

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Timeless — Photo & Video de mariage en Belgique" },
    {
      name: "description",
      content:
        "Studio de photographie et vidéo de mariage haut de gamme en Belgique. Deux regards, un seul studio — pour que votre journée reste éternelle.",
    },
  ];
}

/**
 * Determine the HTML lang attribute from the current route path.
 * Routes starting with /en/ use lang="en", all others default to lang="fr".
 * This is derived from the route id pattern (e.g. "routes/en._index").
 */
function useHtmlLang(): "fr" | "en" {
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  if (lastMatch?.id?.startsWith("routes/en")) return "en";
  if (lastMatch?.pathname?.startsWith("/en")) return "en";
  return "fr";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const lang = useHtmlLang();

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          {lang === "en" ? "Skip to main content" : "Aller au contenu principal"}
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = "Une erreur inattendue s'est produite.";
  let details = "";

  if (error instanceof Error) {
    // Never expose stack traces in production
    if (process.env.NODE_ENV === "development") {
      details = error.message;
    }
  }

  return (
    <main id="main-content" className={errorStyles.errorWrap}>
      <div className={errorStyles.errorDivider} />
      <h1 className={errorStyles.errorTitle}>
        Une erreur s'est produite
      </h1>
      <p className={errorStyles.errorMsg}>
        {message}
      </p>
      {details && (
        <pre className={errorStyles.errorDetails}>
          {details}
        </pre>
      )}
      <a href="/" className="btn btn--primary">
        Retour à l'accueil
      </a>
    </main>
  );
}
