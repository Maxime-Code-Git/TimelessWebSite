# Checklist de vérification humaine des contenus légaux de Sempra

Date de mise à jour : 23 octobre 2026.
Branche : `content/finalize-legal-pages`

Ce document dresse l'état des lieux exhaustif des informations d'entreprise, des paramètres techniques et des clauses contractuelles pour les quatre pages légales bilingues de Sempra (Mentions légales, Politique de confidentialité, Conditions générales de vente, Politique relative aux cookies).

Pour garantir une gouvernance claire et éviter toute double source de vérité, cette checklist distingue cinq catégories opérationnelles strictes :
1. Données venant automatiquement de l'administration
2. Champs bloquant la publication
3. Engagements opérationnels manuels
4. Clauses à harmoniser avec les devis et contrats
5. Points nécessitant une validation humaine ou juridique

---

## 1. Données venant automatiquement de l'administration

Ces informations ne sont jamais codées en dur dans le corps des textes légaux. Elles sont injectées dynamiquement par le composant `LegalPageView` depuis les paramètres globaux d'entreprise (`siteContent.business`) gérés dans `/admin/settings` :

- **Dénomination et nom commercial** : injectés depuis `business.legalName` ou `business.tradeName` (avec fallback "Sempra").
- **Forme juridique** : injectée depuis `business.legalForm` dès qu'elle est renseignée dans les paramètres.
- **Adresse professionnelle** : injectée dynamiquement depuis `business.address` dans le bloc d'adresse légale.
- **Adresse e-mail officielle** : injectée depuis `business.email` avec lien `mailto:` accessible.
- **Numéro de téléphone officiel** : injecté depuis `business.phoneDisplay` avec lien `tel:` conforme E.164.
- **Numéro d'entreprise (BCE)** : injecté dynamiquement depuis `business.enterpriseNumber` dès qu'il est complété.
- **Numéro de TVA** : injecté dynamiquement depuis `business.vatNumber` uniquement s'il est renseigné.
- **Prestataire d'hébergement** : injecté depuis `business.hostingProvider` dans la section hébergement.
- **Inventaire des cookies nécessaires** : injecté dynamiquement depuis `document.inventory` (`__admin_session`, `sempra_gallery_session`, et services vidéo externes YouTube et Vimeo).

---

## 2. Champs bloquant la publication

Tant que les éléments ci-dessous ne sont pas dument confirmés et saisis dans l'application, les quatre documents légaux doivent impérativement demeurer à l'état de brouillon (`draft`). La publication effective est bloquée administrativement et techniquement par ces prérequis :

- **Numéro BCE (Banque-Carrefour des Entreprises)** : obligatoire en vertu du Code de droit économique belge (Livre III et Livre XII) avant toute mise en ligne officielle.
- **Statut juridique définitif** : confirmation formelle de la structure d'exercice (association de fait formalisée, indépendant à titre principal, ou société de type SRL).
- **Régime TVA ou numéro de TVA** : confirmation du numéro d'assujettissement à la TVA (format BE 0XXX.XXX.XXX) ou du régime applicable (ex. régime de la franchise pour petites entreprises, art. 56bis du Code de la TVA).
- **Adresse professionnelle** : confirmation du siège d'activité officiel de Sempra en Belgique.
- **Cohérence des acomptes, annulations et délais avec les contrats** : concordance stricte entre les conditions annoncées sur le site et les modèles de devis et contrats écrits.
- **Date d'entrée en vigueur (`effectiveDate`)** : attribution obligatoire d'une date d'effet lors du passage de l'état de brouillon à l'état publié.

---

## 3. Engagements opérationnels manuels

La politique de confidentialité et les CGV décrivent des règles qui reposent sur des contrôles et interventions manuelles de l'administration de Sempra, et non sur des purges automatiques par le code :

- **Conservation des e-mails (maximum 3 ans)** : règle d'organisation interne prévoyant la conservation dans la messagerie professionnelle pour le suivi de la relation client, soumise à une vérification périodique manuelle par l'équipe.
- **Conservation des rendez-vous visio (maximum 1 an)** : en l'absence de contrat conclu, la suppression des fiches de rendez-vous dans la base locale est réalisée manuellement par l'administration lors des contrôles périodiques de conservation des données.
- **Hébergement des galeries privées (durée de 24 mois)** : ouverture manuelle avec code secret unique (`SEMPRA-XXXX-XXXX`), suivi de l'échéance des 2 ans, et rappel aux mariés de télécharger leurs clichés en haute définition avant la clôture.
- **Traitement des demandes d'exercice de droits RGPD** : traitement sous 30 jours calendrier, avec demande d'un justificatif d'identité uniquement en cas de doute raisonnable sur l'identité du demandeur.
- **Notification des retraits de consentement vidéo** : gestion des demandes individuelles si des mariés souhaitent retirer ultérieurement une autorisation de diffusion de portraits.

---

## 4. Clauses à harmoniser avec les devis et contrats

Les CGV fixent le cadre général de vente mais renvoient expressément aux devis et contrats signés pour les paramètres commerciaux variables :

- **Montant ou pourcentage de l'acompte** : non fixé dans les CGV publiques générales ; doit être expressément mentionné sur chaque devis personnalisé (ex. 30 % ou 40 % à la réservation).
- **Calendrier de règlement du solde** : date d'exigibilité du solde (ex. la veille du mariage, le jour J, ou avant la mise à disposition de la galerie privée).
- **Barème d'indemnité en cas d'annulation** : clauses d'indemnisation graduées selon le délai avant l'événement (ex. plus de 6 mois, entre 6 et 2 mois, ou moins de 30 jours), sans clause pénale abusive.
- **Délais indicatifs de livraison** : harmonisation des délais de post-production annoncés (photos sous 4 à 6 semaines, films sous 6 à 10 semaines selon la saison).
- **Clause spécifique d'autorisation de droit à l'image** : présence impérative dans chaque contrat signé d'une case à cocher distincte pour la publication éventuelle sur le portfolio ou les réseaux sociaux de Sempra.
- **Demande expresse d'exécution anticipée** : mention manuscrite ou électronique explicite si un contrat est conclu à moins de 14 jours de la prestation.

---

## 5. Points nécessitant une validation humaine ou juridique

Avant tout passage en production, les points suivants doivent faire l'objet d'une relecture et validation finale par un conseil juridique ou les gestionnaires :

- **Plafond de responsabilité contractuelle** : validation du libellé limitant la responsabilité financière au montant perçu hors taxes, sous réserve expresse des cas d'exclusion légaux (dol, faute lourde non limitable, atteinte à l'intégrité physique, obligations essentielles).
- **Compétence juridictionnelle et droits des consommateurs** : vérification de la formulation respectant les compétences légales impératives protectrices du consommateur (Code judiciaire belge et droit européen de la consommation).
- **Absence de déséquilibre manifeste** : vérification de la réciprocité des obligations en matière de force majeure et d'empêchement fortuit.
- **Contrôle des flux transfrontaliers** : confirmation de la localisation des serveurs et de l'absence de transfert de données hors EEE sans garanties appropriées.
