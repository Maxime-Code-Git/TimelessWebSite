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
  promo: string;
  promoBold: string;
  caveat: string;
  customEyebrow: string;
  customTitle: string;
  customText: string;
  customCta: string;
  featuredBadge: string;
}



/* ── Contact page ───────────────────────────────────────── */
export interface ContactStrings {
  heroTitle: string;
  heroSubtitle: string;
  callTitle: string;
  callSubtitle: string;
  callBadges: string[];
  bookingTitle: string;
  bookingSubtitle: string;
  bookingDescription: string;
  bookingNote: string;
  slotsTitle: string;
  slotsEmpty: string;
  confirmBtn: string;
  recapPrefix: string;
  recapNone: string;
  recapChooseTime: string;
  formPrompt: string;
  formLabels: {
    names: string;
    email: string;
    phone: string;
    date: string;
    location: string;
    formula: string;
    message: string;
    submit: string;
  };
  formPlaceholders: {
    names: string;
    email: string;
    phone: string;
    location: string;
    formulaDefault: string;
    formulaSurMesure: string;
    formulaDontKnow: string;
    message: string;
  };
  coordTitle: string;
  coordLabels: {
    email: string;
    phone: string;
    area: string;
    social: string;
  };
  coordResponseTime: string;
  bannerText: string;
  bannerLink: string;
  submitUnavailable: string;
  weekdays: string[];
  months: string[];
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
  contact: ContactStrings;
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
    promo:
      "Photo et film réunis sous un même studio\u00a0: ",
    promoBold:
      "une cohérence — et un tarif — impossibles à obtenir avec deux prestataires séparés.",
    caveat:
      "* Photos et vidéos conservées et disponibles pendant 24 mois",
    customEyebrow: "Sur-mesure",
    customTitle:
      "Un très grand projet, un mariage sur plusieurs jours, des envies particulières\u00a0?",
    customText:
      "Composons ensemble une formule à la mesure de votre événement.",
    customCta: "Demander un devis sur-mesure",
    featuredBadge: "Le plus choisi",
  },
  contact: {
    heroTitle: "Racontons votre jour.",
    heroSubtitle:
      "Écrivez-nous, sans engagement — nous prendrons le temps de vous répondre.",
    callTitle: "Envie de nous parler de vive voix\u00a0?",
    callSubtitle:
      "Un appel découverte gratuit, sans engagement, pour faire connaissance et parler de votre mariage.",
    callBadges: ["30 minutes", "Sans engagement", "En visio ou par téléphone"],
    bookingTitle: "Rendez-vous",
    bookingSubtitle: "Choisissez votre créneau",
    bookingDescription:
      "Sélectionnez le jour et l'heure qui vous conviennent pour un appel de 30 minutes.",
    bookingNote: "Appels disponibles les mardis et jeudis.",
    slotsTitle: "Créneaux disponibles",
    slotsEmpty:
      "Sélectionnez d'abord un mardi ou un jeudi dans le calendrier.",
    confirmBtn: "Confirmer le rendez-vous",
    recapPrefix: "Votre appel\u00a0: ",
    recapNone: "aucun créneau sélectionné",
    recapChooseTime: "— choisissez une heure",
    formPrompt:
      "Vous préférez écrire\u00a0? Remplissez le formulaire ci-dessous.",
    formLabels: {
      names: "Prénom(s) des futurs mariés",
      email: "Adresse e-mail",
      phone: "Téléphone (optionnel)",
      date: "Date du mariage",
      location: "Lieu / région du mariage",
      formula: "Formule qui vous intéresse",
      message: "Votre message",
      submit: "Envoyer",
    },
    formPlaceholders: {
      names: "Camille & Antoine",
      email: "vous@exemple.com",
      phone: "04XX XX XX XX",
      location: "Bruxelles, Namur…",
      formulaDefault: "Sélectionner…",
      formulaSurMesure: "Sur-mesure",
      formulaDontKnow: "Je ne sais pas encore",
      message:
        "Racontez-nous votre projet, vos envies, votre journée…",
    },
    coordTitle: "Coordonnées",
    coordLabels: {
      email: "E-mail",
      phone: "Téléphone",
      area: "Zone d'intervention",
      social: "Réseaux",
    },
    coordResponseTime: "Nous répondons sous 48h.",
    bannerText: "Envie d'en savoir plus sur nos formules\u00a0?",
    bannerLink: "Voir nos formules",
    submitUnavailable: "La réservation en ligne est temporairement indisponible. Veuillez nous écrire directement via le formulaire ou par e-mail.",
    weekdays: ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"],
    months: [
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
    ],
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
    promo:
      "Photo and film united under one studio: ",
    promoBold:
      "a consistency — and a price — impossible to achieve with two separate providers.",
    caveat:
      "* Photos and videos stored and available for 24 months",
    customEyebrow: "Bespoke",
    customTitle:
      "A grand project, a multi-day wedding, or unique wishes?",
    customText:
      "Let's create a package tailored to your event together.",
    customCta: "Request a bespoke quote",
    featuredBadge: "Most popular",
  },
  contact: {
    heroTitle: "Let's tell your day.",
    heroSubtitle:
      "Write to us, no commitment — we'll take the time to reply.",
    callTitle: "Want to speak in person?",
    callSubtitle:
      "A free discovery call, no commitment, to get to know each other and discuss your wedding.",
    callBadges: ["30 minutes", "No commitment", "Video call or phone"],
    bookingTitle: "Appointment",
    bookingSubtitle: "Choose your slot",
    bookingDescription:
      "Select the day and time that suit you for a 30-minute call.",
    bookingNote: "Calls available on Tuesdays and Thursdays.",
    slotsTitle: "Available slots",
    slotsEmpty:
      "First select a Tuesday or Thursday in the calendar.",
    confirmBtn: "Confirm appointment",
    recapPrefix: "Your call: ",
    recapNone: "no slot selected",
    recapChooseTime: "— choose a time",
    formPrompt:
      "Prefer to write? Fill out the form below.",
    formLabels: {
      names: "Names of the couple",
      email: "Email address",
      phone: "Phone (optional)",
      date: "Wedding date",
      location: "Wedding venue / region",
      formula: "Package of interest",
      message: "Your message",
      submit: "Send",
    },
    formPlaceholders: {
      names: "Camille & Antoine",
      email: "you@example.com",
      phone: "+32 4XX XX XX XX",
      location: "Brussels, Namur…",
      formulaDefault: "Select…",
      formulaSurMesure: "Bespoke",
      formulaDontKnow: "I don't know yet",
      message:
        "Tell us about your project, your wishes, your day…",
    },
    coordTitle: "Contact details",
    coordLabels: {
      email: "Email",
      phone: "Phone",
      area: "Service area",
      social: "Social",
    },
    coordResponseTime: "We reply within 48h.",
    bannerText: "Want to learn more about our packages?",
    bannerLink: "View our packages",
    submitUnavailable: "Online booking is temporarily unavailable. Please contact us directly via the form or by email.",
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    months: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
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
