import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

// Preload critical fonts (above-the-fold)
const PRELOAD_FONTS = [
  "/fonts/CormorantGaramond-Regular.woff2",
  "/fonts/CormorantGaramond-Medium.woff2",
  "/fonts/HankenGrotesk-Regular.woff2",
];

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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Aller au contenu principal
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
    <main
      id="main-content"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "24px",
        background: "var(--ivory)",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
        padding: "40px 28px",
      }}
    >
      <div
        style={{
          height: "1px",
          width: "44px",
          background: "var(--gold)",
          marginInline: "auto",
        }}
      />
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "clamp(28px, 4vw, 42px)",
          color: "var(--forest-deep)",
          fontWeight: 500,
        }}
      >
        Une erreur s'est produite
      </h1>
      <p style={{ color: "var(--green)", fontSize: "14px", maxWidth: "400px" }}>
        {message}
      </p>
      {details && (
        <pre
          style={{
            fontSize: "12px",
            color: "var(--sage)",
            maxWidth: "600px",
            overflowX: "auto",
          }}
        >
          {details}
        </pre>
      )}
      <a href="/" className="btn btn--primary">
        Retour à l'accueil
      </a>
    </main>
  );
}
