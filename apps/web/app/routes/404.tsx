import type { Route } from "./+types/404";
import { Link, useLocation } from "react-router";
import errorStyles from "../error.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Page introuvable — Sempra Photo & Video" },
    { name: "robots", content: "noindex" },
  ];
}

export function loader() {
  return Response.json(null, { status: 404 });
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
    <main id="main-content" className={errorStyles.errorWrap}>
      <div className={errorStyles.errorDivider} role="presentation" />
      <p className={errorStyles.errorEyebrow}>
        {content.eyebrow}
      </p>
      <h1 className={errorStyles.errorTitle}>
        {content.title}
      </h1>
      <p className={errorStyles.errorMsg}>
        {content.sub}
      </p>
      <Link to={content.href} className={`btn btn--primary ${errorStyles.errorCta}`}>
        {content.cta}
      </Link>
    </main>
  );
}
