# Contenus à remplacer avant publication — Timeless Photo & Video

> Ce document liste tous les placeholders, données fictives et informations manquantes
> identifiées dans les fichiers de référence. Ces valeurs DOIVENT être remplacées
> par les données réelles via l'interface d'administration avant toute publication.

---

## ⚠️ CRITIQUE — À remplacer AVANT tout déploiement public

### Identité légale du studio

| Champ | Valeur fictive dans les maquettes | Valeur réelle attendue |
|---|---|---|
| Nom légal de l'entreprise | — | Nom officiel (SPRL/SRL/indépendant) |
| Numéro d'entreprise BCE | — | Format : BE XXXX.XXX.XXX |
| Adresse du siège social | — | Adresse complète |
| Responsable(s) légaux | — | Nom(s) et prénom(s) |
| Forme juridique | — | SRL / SPRL / Auto-entrepreneur / ... |

### Contact

| Champ | Valeur fictive | À remplacer par |
|---|---|---|
| E-mail | `bonjour@timelessmemory.fr` | Adresse réelle du studio |
| Téléphone (footer/contact) | `+32 4XX XX XX XX` / `06 00 00 00 00` | Numéro réel belge |
| Zone d'intervention | « France entière & mariages à l'étranger » | Zone réelle (Belgique + pays voisins) |

### Réseaux sociaux

| Réseau | URL actuelle | À remplacer par |
|---|---|---|
| Instagram | `#` (placeholder) | URL profil réel |
| LinkedIn | `#` (placeholder) | URL profil réel ou page studio |

---

## IMPORTANT — Avant publication, à remplacer via l'admin

### Équipe du studio

| Champ | Valeur fictive | À remplacer par |
|---|---|---|
| Photographe — Prénom | « Prénom Nom » | Prénom réel |
| Photographe — Nom | « Prénom Nom » | Nom réel |
| Photographe — Biographie (FR) | « Quelques lignes de présentation... » | Biographie réelle |
| Photographe — Biographie (EN) | idem | Traduction naturelle |
| Photographe — Portrait | `image-slot` placeholder sage | Photo portrait réelle |
| Vidéaste — Prénom | « Prénom Nom » | Prénom réel |
| Vidéaste — Nom | « Prénom Nom » | Nom réel |
| Vidéaste — Biographie (FR) | « Quelques lignes de présentation... » | Biographie réelle |
| Vidéaste — Biographie (EN) | idem | Traduction naturelle |
| Vidéaste — Portrait | `image-slot` placeholder sage | Photo portrait réelle |

### Formules — tarifs

> Règle : si aucun tarif n'est renseigné, afficher « Sur demande » — JAMAIS « — € »

| Formule | Tarif actuel | À renseigner |
|---|---|---|
| Photo Essentiel | `— €` (non renseigné) | À partir de X € |
| Photo Signature | `— €` | À partir de X € |
| Photo Prestige | `— €` | À partir de X € |
| Film Essentiel | `— €` | À partir de X € |
| Film Signature | `— €` | À partir de X € |
| Film Prestige | `— €` | À partir de X € |
| Photo & Film Essentiel | `— €` | À partir de X € |
| Photo & Film Signature | `— €` | À partir de X € |
| Photo & Film Prestige | `— €` | À partir de X € |

### FAQ — réponses partielles

Les réponses contiennent des formulations génériques à adapter :

| Question | Adaptation recommandée |
|---|---|
| « Les déplacements sont-ils inclus ? » | Préciser le rayon kilométrique exact et le tarif km |
| « Quel acompte pour réserver la date ? » | Préciser le pourcentage exact |
| « Quels sont les délais de livraison ? » | Confirmer les délais par formule |
| « Peut-on personnaliser une formule ? » | Adapter selon la politique réelle |

### Rendez-vous — créneaux

Les créneaux de la maquette (mardis et jeudis, 10h–16h) sont fictifs.
Configurer les jours et horaires réels dans l'administration.

---

## MODÉRÉ — À compléter dans les semaines suivant le lancement

### Portfolio

| Champ | État actuel | Action requise |
|---|---|---|
| Photos portfolio photographie | Placeholders gris | Uploader les vraies photos par catégorie |
| Vidéo portfolio (extrait public) | Placeholder vidéo | Uploader une version publique watermarkée |
| Catégories portfolio | Tout/Cérémonie/Portraits/Réception | Adapter si nécessaire |

### Galerie démo (optionnel)

Si une galerie de démonstration est souhaitée pour les futurs clients :
- Créer une galerie admin avec photos autorisées (consentement écrit requis)
- Générer un code de démonstration distinct
- Ne jamais utiliser les photos d'un vrai mariage sans accord explicite

---

## LÉGAL — À rédiger avec un professionnel

> ⚠️ Les pages légales ci-dessous sont à faire rédiger ou valider par un juriste
> spécialisé en droit belge (RGPD, CGV prestataire événementiel, droit à l'image).

| Page | État | Action |
|---|---|---|
| Mentions légales | À créer | Inclure : éditeur, hébergeur, propriétaire |
| Politique de confidentialité | À créer | RGPD belge, DPO si applicable |
| Conditions générales de vente | À créer | Acompte, annulation, droits d'auteur, livraison |

---

## NOTES SUR LE NOM DU STUDIO

- Le nom commercial est : **Timeless** (avec descriptif « Photo & Video »)
- « Timeless Memory » est le nom des FICHIERS DE RÉFÉRENCE uniquement
- Aucune occurrence de « Timeless Memory » ne doit apparaître sur le site public
- Vérification obligatoire avant publication via grep sur le bundle final

---

## Mise à jour 2026-08-13

### Statut juridique du studio (corr. 10)

| Champ | Valeur fictive | À remplacer par |
|---|---|---|
| Statut juridique | — | Indépendant en personne physique ou société (ex. SRL) |
| Numéro d'entreprise | — | Numéro BCE belge |
| Adresse siège | — | Adresse réelle |

### Domaine

| Champ | État | Action |
|---|---|---|
| Domaine public | Non défini | Configurer via `PUBLIC_DOMAIN` en variable d'environnement |

### Créneaux RDV

Les mardis/jeudis des maquettes sont provisoires.
Configurer les jours et horaires réels dans l'administration.
