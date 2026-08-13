import type { Route } from "./+types/404";
import { Link, useLocation } from "react-router";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Page introuvable — Timeless Photo & Video" },
    { name: "robots", content: "noindex" },
  ];
}

export default function NotFound() {
  const location = useLocation();
  // Detect lang from URL prefix
  const lang = location.pathname.startsWith("/en") ? "en" : "fr";

  const content = {
    fr: {
      eyebrow: "Erreur 404",
      title: "Cette page n'existe pas.",
      sub: "La page que vous cherchez a peut-être été déplacée ou supprimée.",
      cta: "Retour à l'accueil",
      href: "/fr/",
    },
    en: {
      eyebrow: "Error 404",
      title: "This page doesn't exist.",
      sub: "The page you're looking for may have been moved or removed.",
      cta: "Back to home",
      href: "/en/",
    },
  }[lang];

  return (
    <main
      id="main-content"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "var(--ivory)",
        padding: "80px 28px",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          height: "1px",
          width: "44px",
          background: "var(--gold)",
          marginInline: "auto",
          marginBottom: "28px",
        }}
        role="presentation"
      />
      <p
        style={{
          fontSize: "11px",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          marginBottom: "16px",
          fontFamily: "var(--font-sans)",
        }}
      >
        {content.eyebrow}
      </p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: "clamp(28px, 4vw, 48px)",
          color: "var(--forest-deep)",
          marginBottom: "16px",
          lineHeight: 1.1,
        }}
      >
        {content.title}
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "var(--green)",
          maxWidth: "400px",
          marginBottom: "36px",
          lineHeight: 1.7,
        }}
      >
        {content.sub}
      </p>
      <Link to={content.href} className="btn btn--primary">
        {content.cta}
      </Link>
    </main>
  );
}
