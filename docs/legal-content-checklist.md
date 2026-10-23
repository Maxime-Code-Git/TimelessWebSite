# Checklist de verification humaine des contenus legaux de Sempra

Date de creation : 23 octobre 2026.
Branche : `content/finalize-legal-pages`

Ce document dresse l'etat des lieux exhaustif des informations d'entreprise et des clauses contractuelles pour les quatre pages legales de Sempra (Mentions legales, Politique de confidentialite, Conditions generales de vente, Politique relative aux cookies). Il distingue les donnees dument verifiees, les champs indispensables restant a completer avant publication, et les points de conformite a confronter avec les devis et contrats reels.

---

## 1. Informations deja verifiees dans l'administration et le code

Les informations suivantes proviennent directement des parametres enregistres dans l'application (`apps/web/data/site-content.json` et `apps/web/app/lib/site-content.server.ts`), de l'infrastructure ou du fonctionnement technique reel du site :

- **Nom commercial** : Sempra
- **Forme juridique actuelle** : Association de fait
- **Co-gestionnaires et representants legaux** : Maxime Schneider et Ludovic Bariaux
- **Co-directeurs de la publication** : Maxime Schneider et Ludovic Bariaux
- **Adresse professionnelle et siege d'exploitation** : Chaussée d'Alsemberg 721, Uccle, Belgique
- **Adresse e-mail de contact** : contact@sempra.be (e-mail principal)
- **Numero de telephone de contact** : +32 477 86 37 42 (format international : +32477863742)
- **Hebergeur du site** : Sempra (site auto-heberge sur infrastructure serveur privee)
- **Adresse physique du serveur d'hebergement** : Chaussée d'Alsemberg 721, Uccle, Belgique
- **Domaine public officiel** : https://sempra.be
- **Reseau social verifie** : https://www.instagram.com/sempra.studio/
- **Zone de couverture principale** : Belgique et mariages a l'etranger
- **Prestataire de routage SMTP des e-mails** : Brevo (societe francaise, serveurs au sein de l'UE)
- **Traitement des formulaires de contact** : acheminement par SMTP sans enregistrement dans la base de donnees du site web
- **Stockage des rendez-vous visio** : base SQLite locale (`bookings.db`), securisee avec permissions restreintes
- **Stockage et acces aux galeries privees** : base SQLite locale (`galleries.db`), acces par code secret dedie (`SEMPRA-XXXX-XXXX`) et session temporaire
- **Duree d'hebergement par defaut des galeries en ligne** : 24 mois (2 ans) a compter de la mise en ligne
- **Protection anti-brute force et rate limiting** : empreinte hachee HMAC-SHA256 de l'adresse IP avec purge automatique sous 1 heure (aucune IP en clair stockee)
- **Lecteurs video externes** : YouTube (`youtube-nocookie.com`) et Vimeo (`dnt=1`), charges exclusivement apres clic volontaire de l'internaute (mode 2 clics)
- **Absence de traceurs publicitaires ou analytics** : aucun pixel Meta, aucun cookie publicitaire, aucun outil d'audience tiers invasif depose par defaut

---

## 2. Informations a completer avant publication

Les documents legaux sont actuellement enregistres en mode brouillon (`draft`). La publication definitive necessite de renseigner prealablement les donnees suivantes dans l'onglet Parametres de l'administration (`/admin/settings`) :

- **Numero d'entreprise (BCE / CBE)** : obligatoire en vertu du Code de droit economique belge (Livre XII et Livre III). Dans le brouillon actuel, la mention de substitution est : `À compléter avant publication` (FR) / `To be completed before publication` (EN).
- **Numero de TVA intracommunautaire** : obligatoire si l'entreprise est assujettie a la TVA (ex. BE 0XXX.XXX.XXX) ou mention specifique d'exemption (ex. regime de la franchise pour petites entreprises, art. 56bis du Code de la TVA). Mention actuelle : `À compléter avant publication` / `To be completed before publication`.
- **Statut juridique definitif** : confirmer si l'activite reste en `Association de fait` ou si une societe (ex. SRL) ou deux statuts d'independant a titre principal / complementaire sont constitues.
- **Acompte (pourcentage ou montant standard)** : le parametre `depositPercent` est actuellement non defini (`null`). A renseigner dans les parametres et a formaliser sur chaque devis.
- **Adresse e-mail juridique dediee** : confirmer si `contact@sempra.be` fait office d'adresse officielle pour les notifications juridiques et l'exercice des droits RGPD, ou si une adresse specialisee (ex. `legal@sempra.be`) doit etre creee.
- **Identite d'un eventuel hebergeur tiers de secours** : si une passerelle cloud, un DNS externe ou un proxy WAF additionnel est utilise en production (ex. Cloudflare), s'assurer que ses coordonnees figurent dans les sous-traitants.

> [!IMPORTANT]
> Le systeme technique d'administration `/admin/legal` bloque automatiquement la publication d'un document si l'adresse, le numero d'entreprise ou l'hebergeur sont manquants dans les parametres.

---

## 3. Verifications contractuelles recommandees (Devis et Contrats Sempra)

Avant la mise en ligne des Conditions generales de vente (CGV), les points suivants doivent etre confrontes avec les modeles de devis et contrats personnalises reellement envoyes aux maries :

1. **Modalites precises de l'acompte et des echeances** :
   - Verifier si l'acompte exige a la signature est de 30 %, 40 % ou 50 % ;
   - Verifier l'echeance du solde : a la veille du mariage, le jour J, ou a la livraison des photos/films.

2. **Politique d'annulation et indemnites** :
   - Verifier le sort de l'acompte en cas d'annulation par les maries a plus de 6 mois, entre 6 et 2 mois, ou a moins de 30 jours du mariage ;
   - S'assurer que les clauses ne creent pas de desequilibre manifeste entre les parties.

3. **Delais d'execution et de livraison** :
   - Confirmer les delais annonces selon les formules : ex. galerie photo sous 4 a 8 semaines, film de mariage sous 8 a 12 semaines selon la saison.

4. **Droit de retractation et demande d'execution anticipee** :
   - Si un contrat est signe a moins de 14 jours de l'evenement (ou d'une seance engagement), verifier que le devis ou contrat papier contient bien la mention expresse de demande d'execution anticipee conformement aux articles VI.46 et VI.51 du CDE.

5. **Droit a l'image et publication dans le portfolio** :
   - S'assurer que le bon de commande ou contrat comporte une case a cocher specifique et distincte permettant aux maries d'autoriser ou de refuser la publication d'extraits sur le site internet et les reseaux sociaux de Sempra.
   - Ne jamais presumer l'accord des maries par defaut.

6. **Mediation de la consommation** :
   - Les CGV mentionnent le Service de Mediation pour le Consommateur (Belgique). Verifier si Sempra adhere a une commission sectorielle specifique ou s'appuie sur le service universel de mediation.
