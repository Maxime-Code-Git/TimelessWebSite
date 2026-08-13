import type { Route } from "./+types/fr.formules";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./formules.module.css";
import type { Category } from "@timeless/shared";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Formules & Tarifs — Timeless" },
    { name: "description", content: "Un seul studio pour votre photo et votre film : une même vision, du premier rendez-vous à la livraison." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/fr/formules" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/formules" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/pricing" },
  ];
}

const FORMULES = {
  photo: [
    { name: 'Essentiel', tagline: 'Les moments clés, en images.', features: ["6h de couverture", "200 photos livrées", "Galerie en ligne privée", "Livraison sous 6 semaines"] },
    { name: 'Signature', tagline: 'Couverture photo complète du jour.', features: ["8h de couverture", "400 photos livrées", "Galerie en ligne privée", "Livraison sous 4 semaines", "20 tirages d'art inclus"] },
    { name: 'Prestige', tagline: 'Reportage intégral + album d\'art.', features: ["Journée complète (12h)", "600+ photos livrées", "Galerie en ligne privée", "Livraison sous 2 semaines", "Album photo relié inclus", "Séance couple offerte"] }
  ],
  film: [
    { name: 'Essentiel', tagline: "Un film court, l'émotion condensée.", features: ["Film court (3-4 min)", "Captation cérémonie", "Musique libre de droits", "Livraison sous 6 semaines"] },
    { name: 'Signature', tagline: 'Le film complet de votre journée.', features: ["Film complet (8-10 min)", "Captation cérémonie + réception", "Teaser réseaux sociaux inclus", "Livraison sous 4 semaines"] },
    { name: 'Prestige', tagline: 'Long métrage + teaser + rushes.', features: ["Long métrage (15-20 min)", "Captation intégrale de la journée", "Teaser + rushes bruts fournis", "Drone inclus (selon lieu)", "Livraison sous 2 semaines"] }
  ],
  duo: [
    { name: 'Essentiel', tagline: "Photo et film, l'essentiel réuni.", features: ["6h de couverture", "200 photos + film court", "Galerie en ligne privée", "Livraison sous 6 semaines"] },
    { name: 'Signature', tagline: 'Photo + film, couverture complète.', features: ["8h de couverture", "400 photos + film complet", "Galerie en ligne privée", "Teaser réseaux sociaux inclus", "Livraison sous 4 semaines"] },
    { name: 'Prestige', tagline: "L'expérience intégrale, sans compromis.", features: ["Journée complète", "600+ photos + long métrage", "Album photo relié inclus", "Drone inclus (selon lieu)", "Livraison sous 2 semaines"] }
  ]
};

const LABELS: Record<Category, string> = { photo: 'Photographie', film: 'Film', duo: 'Photo & Film' };
const CATEGORIES: Category[] = ['photo', 'film', 'duo'];

const FAQS = [
  { question: 'Les déplacements sont-ils inclus ?', answer: "Les déplacements sont inclus dans un rayon de référence autour de notre studio ; au-delà, un forfait déplacement est ajouté au devis." },
  { question: 'Quel acompte pour réserver la date ?', answer: "Un acompte de réservation est demandé à la signature, le solde étant réglé avant l'événement selon un échéancier convenu ensemble." },
  { question: 'Quels sont les délais de livraison ?', answer: "Les délais varient selon la formule choisie, indiqués dans chaque carte ci-dessus ; une première sélection d'images est partagée bien avant la livraison finale." },
  { question: 'Peut-on personnaliser une formule ?', answer: "Oui, chaque formule peut être ajustée — heures supplémentaires, second photographe, album additionnel — sur simple demande." }
];

export default function FormulesFr() {
  const [cat, setCat] = useState<Category>('duo');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/pricing" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Nos formules</h1>
          <p className={styles.heroText}>Un seul studio pour votre photo et votre film : une même vision, du premier rendez-vous à la livraison.</p>
        </section>

        {/* ── Pricing ─────────────────────────────────────── */}
        <section className={styles.pricingSection}>
          <div className={styles.pricingWrapper}>
            <div className={styles.categoryTabs} role="tablist" aria-label="Catégories de formules">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={cat === c}
                  aria-controls={`panel-${c}`}
                  id={`tab-${c}`}
                  onClick={() => setCat(c)}
                  className={`${styles.tabBtn} ${cat === c ? styles.tabBtnActive : ''}`}
                >
                  {LABELS[c]}
                </button>
              ))}
            </div>

            <div 
              id={`panel-${cat}`}
              role="tabpanel" 
              aria-labelledby={`tab-${cat}`}
              className={styles.cards}
            >
              {FORMULES[cat].map((t, i) => {
                const featured = i === 1;
                return (
                  <div key={t.name} className={`${styles.card} ${featured ? styles.cardFeat : ''}`}>
                    {featured && <span className={styles.featBadge}>Le plus choisi</span>}
                    <h2 className={styles.cardName}>{t.name}</h2>
                    <p className={styles.cardTagline}>{t.tagline}</p>
                    {/* User requested not to show fake prices, and mask them nicely if missing. Since they are missing in the mockup, we output "À partir de — €" or just mask it if no price provided. Actually the mockup just says "— €". I will hide the line completely or output "Sur devis" since it's cleaner than a broken dash, but wait, the prompt says "Si les vrais prix sont absents, masque proprement le montant. Ne publie jamais — €." */}
                    {/* So I will just skip the price line. */}
                    <div className={styles.cardDivider}></div>
                    <ul className={styles.featureList} aria-label={`Fonctionnalités de la formule ${t.name}`}>
                      {t.features.map((feat, idx) => (
                        <li key={idx} className={styles.featureItem}>
                          <span className={styles.featureDash} aria-hidden="true">—</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p className={styles.pricingFooterText}>
              Photo et film réunis sous un même studio : <strong style={{color: 'var(--gold-light)', fontWeight: 500}}>une cohérence — et un tarif — impossibles à obtenir avec deux prestataires séparés.</strong>
            </p>
            <p className={styles.pricingFooterSub}>* Photos et vidéos conservées et disponibles pendant 24 mois</p>
          </div>
        </section>

        {/* ── Custom ──────────────────────────────────────── */}
        <section className={styles.customSection}>
          <p className={styles.customSubtitle}>Sur-mesure</p>
          <h2 className={styles.customTitle}>Un très grand projet, un mariage sur plusieurs jours, des envies particulières ?</h2>
          <p className={styles.customText}>Composons ensemble une formule à la mesure de votre événement.</p>
          <a href="/fr/contact" className={styles.customBtn}>Demander un devis sur-mesure</a>
        </section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <section className={styles.faqSection}>
          <div className={styles.faqWrapper}>
            <h2 className={styles.faqTitle}>Questions fréquentes</h2>
            <div className={styles.faqList}>
              {FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className={styles.faqItem}>
                    <button
                      className={styles.faqQuestionBtn}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${idx}`}
                    >
                      <span>{faq.question}</span>
                      <span className={styles.faqIcon} aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <p id={`faq-answer-${idx}`} className={styles.faqAnswer}>
                        {faq.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
