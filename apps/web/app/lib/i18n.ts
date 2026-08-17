/**
 * Internationalization dictionary for Timeless studio.
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
  categoryLabels: Record<string, string>;
  promo: string;
  promoBold: string;
  caveat: string;
  customEyebrow: string;
  customTitle: string;
  customText: string;
  customCta: string;
  faqTitle: string;
  faqs: Array<{ question: string; answer: string }>;
  featuredBadge: string;
}

/* ── Formules features per category per tier ─────────────── */
export interface FormuleFeaturesMap {
  photo: string[][];
  film: string[][];
  duo: string[][];
}

/* ── About page ─────────────────────────────────────────── */
export interface AboutStrings {
  heroTitle: string;
  heroSubtitle: string;
  duoTitle: string;
  personRole1: string;
  personRole2: string;
  personBio: string;
  personNamePlaceholder: string;
  approachTitle: string;
  principles: Array<{ title: string; text: string }>;
  differenceTitle: string;
  differenceText: string;
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
  formuleFeatures: FormuleFeaturesMap;
  about: AboutStrings;
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
    faqTitle: "Questions fréquentes",
    faqs: [
      {
        question: "Les déplacements sont-ils inclus\u00a0?",
        answer:
          "Les déplacements sont inclus dans un rayon de référence autour de notre studio\u00a0; au-delà, un forfait déplacement est ajouté au devis.",
      },
      {
        question: "Quel acompte pour réserver la date\u00a0?",
        answer:
          "Un acompte de réservation est demandé à la signature, le solde étant réglé avant l'événement selon un échéancier convenu ensemble.",
      },
      {
        question: "Quels sont les délais de livraison\u00a0?",
        answer:
          "Les délais varient selon la formule choisie, indiqués dans chaque carte ci-dessus\u00a0; une première sélection d'images est partagée bien avant la livraison finale.",
      },
      {
        question: "Peut-on personnaliser une formule\u00a0?",
        answer:
          "Oui, chaque formule peut être ajustée — heures supplémentaires, second photographe, album additionnel — sur simple demande.",
      },
    ],
    featuredBadge: "Le plus choisi",
  },
  formuleFeatures: {
    photo: [
      ["6h de couverture", "200 photos livrées", "Galerie en ligne privée", "Livraison sous 6 semaines"],
      ["8h de couverture", "400 photos livrées", "Galerie en ligne privée", "Livraison sous 4 semaines", "20 tirages d'art inclus"],
      ["Journée complète (12h)", "600+ photos livrées", "Galerie en ligne privée", "Livraison sous 2 semaines", "Album photo relié inclus", "Séance couple offerte"],
    ],
    film: [
      ["Film court (3-4 min)", "Captation cérémonie", "Musique libre de droits", "Livraison sous 6 semaines"],
      ["Film complet (8-10 min)", "Captation cérémonie + réception", "Teaser réseaux sociaux inclus", "Livraison sous 4 semaines"],
      ["Long métrage (15-20 min)", "Captation intégrale de la journée", "Teaser + rushes bruts fournis", "Drone inclus (selon lieu)", "Livraison sous 2 semaines"],
    ],
    duo: [
      ["6h de couverture", "200 photos + film court", "Galerie en ligne privée", "Livraison sous 6 semaines"],
      ["8h de couverture", "400 photos + film complet", "Galerie en ligne privée", "Teaser réseaux sociaux inclus", "Livraison sous 4 semaines"],
      ["Journée complète", "600+ photos + long métrage", "Album photo relié inclus", "Drone inclus (selon lieu)", "Livraison sous 2 semaines"],
    ],
  },
  about: {
    heroTitle: "Arrêter le temps, rendre le jour éternel.",
    heroSubtitle:
      "Deux regards, une même exigence\u00a0: capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.",
    duoTitle: "Nous deux",
    personRole1: "Photographe",
    personRole2: "Vidéaste",
    personBio:
      "Quelques lignes de présentation\u00a0: son parcours, sa sensibilité, ce qui guide son regard le jour d'un mariage.",
    personNamePlaceholder: "Prénom Nom",
    approachTitle: "Notre approche",
    principles: [
      {
        title: "Discrétion le jour J",
        text: "Présents sans jamais s'imposer, pour que vous viviez votre journée pleinement.",
      },
      {
        title: "Un seul studio",
        text: "Photo et film pensés ensemble, pour une même sensibilité du début à la fin.",
      },
      {
        title: "Un rendu intemporel",
        text: "Des choix sobres et durables, qui vieillissent bien — loin des effets de mode.",
      },
    ],
    differenceTitle: "Notre différence",
    differenceText:
      "Réunir la photo et le film sous un même studio, c'est une cohérence de regard du premier au dernier plan — et une présence commune le jour J, pour ne rien manquer de votre histoire.",
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
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        question: "Is travel included?",
        answer:
          "Travel is included within a reference radius from our studio; beyond that, a travel fee is added to the quote.",
      },
      {
        question: "What deposit is required to book the date?",
        answer:
          "A booking deposit is required at signing, with the balance settled before the event according to an agreed schedule.",
      },
      {
        question: "What are the delivery times?",
        answer:
          "Delivery times vary by package, as indicated in each card above; an initial selection of images is shared well before the final delivery.",
      },
      {
        question: "Can a package be customised?",
        answer:
          "Yes, each package can be adjusted — extra hours, second photographer, additional album — on request.",
      },
    ],
    featuredBadge: "Most popular",
  },
  formuleFeatures: {
    photo: [
      ["6h coverage", "200 photos delivered", "Private online gallery", "Delivery within 6 weeks"],
      ["8h coverage", "400 photos delivered", "Private online gallery", "Delivery within 4 weeks", "20 fine-art prints included"],
      ["Full day (12h)", "600+ photos delivered", "Private online gallery", "Delivery within 2 weeks", "Bound photo album included", "Complimentary couple session"],
    ],
    film: [
      ["Short film (3-4 min)", "Ceremony capture", "Royalty-free music", "Delivery within 6 weeks"],
      ["Full film (8-10 min)", "Ceremony + reception capture", "Social media teaser included", "Delivery within 4 weeks"],
      ["Feature film (15-20 min)", "Full day capture", "Teaser + raw footage provided", "Drone included (venue permitting)", "Delivery within 2 weeks"],
    ],
    duo: [
      ["6h coverage", "200 photos + short film", "Private online gallery", "Delivery within 6 weeks"],
      ["8h coverage", "400 photos + full film", "Private online gallery", "Social media teaser included", "Delivery within 4 weeks"],
      ["Full day", "600+ photos + feature film", "Bound photo album included", "Drone included (venue permitting)", "Delivery within 2 weeks"],
    ],
  },
  about: {
    heroTitle: "Stop time, make the day eternal.",
    heroSubtitle:
      "Two perspectives, one standard: capturing your day with precision, so it comes back to you intact in thirty years.",
    duoTitle: "The two of us",
    personRole1: "Photographer",
    personRole2: "Videographer",
    personBio:
      "A few lines of introduction: their background, their sensitivity, what guides their eye on a wedding day.",
    personNamePlaceholder: "First Last",
    approachTitle: "Our approach",
    principles: [
      {
        title: "Discretion on the day",
        text: "Present without ever imposing, so you can live your day fully.",
      },
      {
        title: "One studio",
        text: "Photo and film conceived together, for the same sensitivity from start to finish.",
      },
      {
        title: "A timeless result",
        text: "Sober and lasting choices that age well — far from passing trends.",
      },
    ],
    differenceTitle: "Our difference",
    differenceText:
      "Uniting photo and film under one studio means a coherent vision from the first to the last frame — and a shared presence on the day, to miss nothing of your story.",
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
