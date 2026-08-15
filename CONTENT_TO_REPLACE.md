# Contenus à remplacer avant la mise en production

Ce fichier recense tous les contenus "bouchons" (placeholders) qui doivent être remplacés par le contenu réel avant le lancement officiel du site.

## 1. Textes "À Propos" (FR & EN)
- **Fichiers** : `fr.about.tsx` et `en.about.tsx`
- Les noms sont actuellement masqués si non configurés dans `BUSINESS`. Il faudra configurer les prénoms/noms.
- L'histoire détaillée et la philosophie devront être rédigées. Actuellement, la maquette affiche une version par défaut.

## 2. Textes "Mentions Légales", "CGV", "Confidentialité"
- Les clauses actuelles (sans acompte de 30%) sont une version neutre.
- Les données comme l'hébergeur, l'adresse de l'entreprise, le numéro d'entreprise devront être configurés dans `BUSINESS`.

## 3. Coordonnées de Contact
- Configurer les vraies valeurs dans `business-config.ts` (email, téléphone) pour qu'elles s'affichent publiquement sur la page de contact et dans le Footer.

## 4. Photos de la Galerie Publique (Portfolio)
- Actuellement, des "div" simulent les photos. Les vraies images WebP/AVIF avec filigrane doivent être chargées via le script de watermark et insérées dans `fr.portfolio.tsx` / `en.portfolio.tsx`.

## 5. Tarifs et Formules
- Dans `fr._index.tsx`, `en._index.tsx`, `fr.formules.tsx` et `en.pricing.tsx`, les grilles tarifaires et inclusions devront provenir de la base de données en Phase 3, mais le contenu initial doit être revu.

## 6. Favicon et Médias
- `public/favicon.ico` doit être généré depuis le vrai logo.
- `public/logo-officiel.png` doit être validé.
- Vidéo d'arrière-plan de la page d'accueil (Hero) à intégrer.
