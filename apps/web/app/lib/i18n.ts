/**
 * Internationalization dictionary for Sempra studio.
 *
 * All user-facing strings are centralized here.
 * FR and EN must share the exact same structure.
 */

export type Lang = "fr" | "en";

/* ── Navigation ─────────────────────────────────────────── */
export interface NavStrings {
  portfolio: string;
  formules: string;
  about: string;
  contact: string;
  clientArea: string;
  skipLink: string;
}

/* ── Home page ──────────────────────────────────────────── */
export interface HomeStrings {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroFilmBtn: string;
  editorialText: string;
  editorialEmphasis: string;
  portfolioTitle: string;
  portfolioPhoto: string;
  portfolioPhotoSub: string;
  portfolioFilm: string;
  portfolioFilmSub: string;
  formulesTitle: string;
  formulesPromo: string;
  formulesPromoBold: string;
  formulesCaveat: string;
  formulesContact: string;
  formulesCustom: string;
  formulesCustomEm: string;
  categoryLabels: Record<string, string>;
  studioTitle: string;
  studioText: string;
  featuredBadge: string;
}

/* ── Portfolio page ─────────────────────────────────────── */
export interface PortfolioStrings {
  title: string;
  subtitle: string;
  tabPhoto: string;
  tabVideo: string;
  filterAll: string;
  filterCeremony: string;
  filterPortraits: string;
  filterReception: string;
  videoEyebrow: string;
  videoTitle: string;
  videoSeeAll: string;
}

/* ── Formules page ──────────────────────────────────────── */
export interface FormulesStrings {
  title: string;
  subtitle: string;
  categoryLabels: {
    photo: string;
    film: string;
    duo: string;
  };

  customEyebrow: string;
  customTitle: string;
  customText: string;
  customCta: string;
  featuredBadge: string;
}



/* ── Clients page ───────────────────────────────────────── */
export interface ClientsStrings {
  title: string;
  subtitle: string;
  accessLabel: string;
  accessPlaceholder: string;
  submitBtn: string;
  helpText: string;
  helpLink: string;
  footerNote: string;
  unavailableError: string;
}

/* ── Footer ─────────────────────────────────────────────── */
export interface FooterStrings {
  contactBtn: string;
  legalLinks: Array<{ label: string; to: string }>;
  instagram: string;
  linkedin: string;
}

/* ── 404 page ───────────────────────────────────────────── */
export interface NotFoundStrings {
  title: string;
  text: string;
  backHome: string;
}

/* ── All strings ────────────────────────────────────────── */
export interface I18nStrings {
  nav: NavStrings;
  home: HomeStrings;
  portfolio: PortfolioStrings;
  formules: FormulesStrings;
  clients: ClientsStrings;
  footer: FooterStrings;
  notFound: NotFoundStrings;
}

/* ── Helpers ─────────────────────────────────────────────── */
export function getStrings(lang: Lang): I18nStrings {
  return lang === "fr" ? FR : EN;
}

/* ═══════════════════════════════════════════════════════════
   FRENCH
   ═══════════════════════════════════════════════════════════ */
const FR: I18nStrings = {
  nav: {
    portfolio: "Portfolio",
    formules: "Formules",
    about: "À propos",
    contact: "Contact",
    clientArea: "Espace clients",
    skipLink: "Aller au contenu principal",
  },
  home: {
    heroEyebrow: "Photo & Vidéo de mariage",
    heroTitle: "Arrêter le temps,\ngarder l'émotion.",
    heroSubtitle: "Un seul studio pour votre film et vos photographies.",
    heroFilmBtn: "Voir le film",
    editorialText:
      "Le jour passe en un souffle. Notre métier est de le rendre",
    editorialEmphasis: "éternel",
    portfolioTitle: "Portfolio",
    portfolioPhoto: "Photographie",
    portfolioPhotoSub: "Voir la galerie",
    portfolioFilm: "Film",
    portfolioFilmSub: "Voir les extraits",
    formulesTitle: "Nos formules",
    formulesPromo:
      "Photo et film réunis sous un même studio\u00a0: ",
    formulesPromoBold:
      "une cohérence — et un tarif — impossibles à obtenir avec deux prestataires séparés.",
    formulesCaveat:
      "* Photos et vidéos conservées et disponibles pendant 24 mois",
    formulesContact: "Nous contacter",
    formulesCustom: "Des besoins particuliers\u00a0?",
    formulesCustomEm: "Une demande sur-mesure est possible.",
    categoryLabels: {
      photo: "Photographie",
      film: "Film",
      duo: "Photo & Film",
    },
    studioTitle: "Deux regards, un seul studio.",
    studioText:
      "L'un filme, l'autre photographie — mais nous travaillons comme une seule main, présents ensemble le jour J pour ne rien manquer de votre histoire.",
    featuredBadge: "Le plus choisi",
  },
  portfolio: {
    title: "Photographie",
    subtitle:
      "Un regard sincère sur vos instants, saisis tels qu'ils se vivent.",
    tabPhoto: "Photo",
    tabVideo: "Vidéo",
    filterAll: "Tout",
    filterCeremony: "Cérémonie",
    filterPortraits: "Portraits",
    filterReception: "Réception",
    videoEyebrow: "Et en mouvement",
    videoTitle: "Découvrez le film de votre journée.",
    videoSeeAll: "Voir tous les films",
  },
  formules: {
    title: "Nos formules",
    subtitle:
      "Un seul studio pour votre photo et votre film\u00a0: une même vision, du premier rendez-vous à la livraison.",
    categoryLabels: {
      photo: "Photographie",
      film: "Film",
      duo: "Photo & Film",
    },

    customEyebrow: "Sur-mesure",
    customTitle:
      "Un très grand projet, un mariage sur plusieurs jours, des envies particulières\u00a0?",
    customText:
      "Composons ensemble une formule à la mesure de votre événement.",
    customCta: "Demander un devis sur-mesure",
    featuredBadge: "Le plus choisi",
  },
  clients: {
    title: "Votre galerie privée",
    subtitle:
      "Retrouvez ici vos photos et votre film, avec le code reçu sur votre carte.",
    accessLabel: "Votre code d'accès",
    accessPlaceholder: "Ex. TM-2026-XXXX",
    submitBtn: "Accéder à ma galerie",
    helpText: "Vous n'avez pas votre code\u00a0?",
    helpLink: "Contactez-nous",
    footerNote: "Galerie privée et sécurisée",
    unavailableError:
      "Le service d'authentification n'est pas encore disponible. Veuillez réessayer ultérieurement.",
  },
  footer: {
    contactBtn: "Nous contacter",
    legalLinks: [
      { label: "Espace clients", to: "/fr/espace-clients" },
      { label: "Mentions légales", to: "/fr/mentions-legales" },
      { label: "CGV", to: "/fr/cgv" },
      { label: "Confidentialité", to: "/fr/confidentialite" },
      { label: "Cookies", to: "/fr/cookies" },
    ],
    instagram: "Instagram",
    linkedin: "LinkedIn",
  },
  notFound: {
    title: "Page introuvable",
    text: "La page que vous recherchez n'existe pas ou a été déplacée.",
    backHome: "Retour à l'accueil",
  },
};

/* ═══════════════════════════════════════════════════════════
   ENGLISH
   ═══════════════════════════════════════════════════════════ */
const EN: I18nStrings = {
  nav: {
    portfolio: "Portfolio",
    formules: "Pricing",
    about: "About",
    contact: "Contact",
    clientArea: "Client area",
    skipLink: "Skip to main content",
  },
  home: {
    heroEyebrow: "Wedding Photo & Video",
    heroTitle: "Stop time,\nkeep the emotion.",
    heroSubtitle: "One studio for your film and your photographs.",
    heroFilmBtn: "Watch the film",
    editorialText:
      "The day passes in a heartbeat. Our craft is to make it",
    editorialEmphasis: "eternal",
    portfolioTitle: "Portfolio",
    portfolioPhoto: "Photography",
    portfolioPhotoSub: "View gallery",
    portfolioFilm: "Film",
    portfolioFilmSub: "Watch highlights",
    formulesTitle: "Our packages",
    formulesPromo:
      "Photo and film united under one studio: ",
    formulesPromoBold:
      "a consistency — and a price — impossible to achieve with two separate providers.",
    formulesCaveat:
      "* Photos and videos stored and available for 24 months",
    formulesContact: "Contact us",
    formulesCustom: "Special requirements?",
    formulesCustomEm: "A bespoke package is possible.",
    categoryLabels: {
      photo: "Photography",
      film: "Film",
      duo: "Photo & Film",
    },
    studioTitle: "Two perspectives, one studio.",
    studioText:
      "One films, the other photographs — but we work as one, present together on the day to capture every moment of your story.",
    featuredBadge: "Most popular",
  },
  portfolio: {
    title: "Photography",
    subtitle:
      "An honest look at your moments, captured as they are lived.",
    tabPhoto: "Photo",
    tabVideo: "Video",
    filterAll: "All",
    filterCeremony: "Ceremony",
    filterPortraits: "Portraits",
    filterReception: "Reception",
    videoEyebrow: "In motion",
    videoTitle: "Discover the film of your day.",
    videoSeeAll: "See all films",
  },
  formules: {
    title: "Our packages",
    subtitle:
      "One studio for your photo and your film: one vision, from the first meeting to delivery.",
    categoryLabels: {
      photo: "Photography",
      film: "Film",
      duo: "Photo & Film",
    },

    customEyebrow: "Bespoke",
    customTitle:
      "A grand project, a multi-day wedding, or unique wishes?",
    customText:
      "Let's create a package tailored to your event together.",
    customCta: "Request a bespoke quote",
    featuredBadge: "Most popular",
  },
  clients: {
    title: "Your private gallery",
    subtitle:
      "Access your photos and film here, with the code from your card.",
    accessLabel: "Your access code",
    accessPlaceholder: "E.g. TM-2026-XXXX",
    submitBtn: "Access my gallery",
    helpText: "Don't have your code?",
    helpLink: "Contact us",
    footerNote: "Private and secure gallery",
    unavailableError:
      "The authentication service is not yet available. Please try again later.",
  },
  footer: {
    contactBtn: "Contact us",
    legalLinks: [
      { label: "Client area", to: "/en/client-area" },
      { label: "Legal notice", to: "/en/legal" },
      { label: "Terms", to: "/en/terms" },
      { label: "Privacy", to: "/en/privacy" },
      { label: "Cookies", to: "/en/cookies" },
    ],
    instagram: "Instagram",
    linkedin: "LinkedIn",
  },
  notFound: {
    title: "Page not found",
    text: "The page you are looking for does not exist or has been moved.",
    backHome: "Back to home",
  },
};
