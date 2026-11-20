# Hélior · Cinematic rebuild — audit et plan de production

État au 20 novembre 2026. Ce document couvre l'audit du site existant et la méthode de production image → vidéo → scroll. Il fixe aussi les points d'arrêt budgétaires. **Aucune génération payante n'a été lancée.**

## 1. État Git et version de référence

| Élément | Valeur |
| --- | --- |
| Dépôt | `sempehugo03-jpg/fabrya-immersion-factory` |
| Branche | `claude/fabrya-watchmaker-immersive-0tx1e6` (synchronisée avec `origin`) |
| Commits Hélior conservés | `58fb8fb` site initial · `7f2f68f` passe photoréaliste · `34481ea` passe cinéma · `c9588e2` mode photo (path tracing) |
| Version de référence | tag local `helior-reference-claude-v4` → `c9588e2` |
| Captures de référence | `production/reference/site-v4/chapter-0…6-1440x900.webp` |
| Plaques de référence | `production/reference/plates/plate-chapter-{0,1,2,4}-1200.webp` : montre seule, centrée, sans interface, générées avec `?hq&nophoto&plate` |

La branche principale, fabrya.fr et Stripe n'ont pas été touchés.

## 2. Audit du site existant

### Architecture

- `index.html` : 7 chapitres (`[data-chapter]`) en HTML statique. Ils contiennent le texte, les specs, le sélecteur de cadran et le formulaire local. L'interface reste séparée de la scène, qui est un `<canvas>` fixe.
- `app.js` (~1 300 lignes), en deux blocs :
  1. **Moteur de scroll indépendant du WebGL** : `measure()` / `scrollT()` convertissent la position de défilement en temps `t ∈ [0, 6]`, aligné sur le centre de chaque chapitre. S'y ajoutent la molette inertielle (`stepWheel`), la navigation par chiffres romains et la jauge de réserve de marche. Ce bloc est **réutilisable tel quel** pour piloter une séquence vidéo.
  2. **Scène three.js r170** : montre procédurale (environ 190 pièces générées par code) et timeline `K[]` à une clé par chapitre (orientation, point visé, distance, focale, décalage écran, éclatement `e`, retrait du cadran `e2`, flou). Un ressort amorti lisse `t`. Le post-traitement enchaîne MSAA, GTAO, bokeh, bloom et étalonnage. Une qualité adaptative à 4 paliers protège la fluidité. Le mode photo (three-gpu-pathtracer) affine l'image à l'arrêt.
- `styles.css` : direction artistique bleu nuit / champagne, Bodoni Moda, Manrope et IBM Plex Mono.
- `vendor/` : three r170, addons (post-traitement, EXR, GTAO), HDRI studio CC0 et bundle du path tracer.

### Chorégraphie (référence narrative à conserver)

| t | Chapitre | Événement visuel | Interaction |
| --- | --- | --- | --- |
| 0 | XII Ouverture | Montre de face, longue focale. La couronne tourne et les aiguilles avancent au scroll. | Scroll ↔ heure, jauge 0 → 72 h |
| 1 | I La boîte | Rotation vers le profil, couronne crantée | Scroll |
| 2 | II Vue éclatée | 9 niveaux qui se séparent, étiquettes projetées depuis la 3D | Scroll, étiquettes HTML |
| 3 | III Le cœur | Le cadran s'écarte. Macro sur le balancier, l'ancre et l'échappement, avec un ralenti ×4 | Scroll, son optionnel |
| 4 | IV Finitions | Plan rasant sur la platine perlée, les Côtes de Genève et les vis bleuies | Scroll |
| 5 | V Cadrans | Retour de face, 3 cadrans au choix | **Branche** : clic sur le cadran |
| 6 | VI Rendez-vous | 3/4 face, retour à l'heure exacte, formulaire | Formulaire local |

### Diagnostic qualité (pourquoi l'image reste « schématique »)

La lumière n'est plus en cause : HDRI, path tracing et ombres de contact sont en place. Ce sont **les formes** qui trahissent la 3D procédurale :

- engrenages extrudés à dents trapézoïdales, sans pignons ni chanfreins de dents ;
- ponts trop épais et trop larges, sans creusures ni anglage incurvé ;
- chatons et rubis surdimensionnés ;
- boîte tournée sans facettes de cornes ni transition polie/satinée nette ;
- surfaces sans micro-défauts.

Les captures `site-v4` le montrent. Ces défauts ne se corrigent ni par la résolution ni par la lumière.

## 3. Quelle méthode pour quelle scène

| Chapitre | Image IA → vidéo IA | Raison | Méthode recommandée |
| --- | --- | --- | --- |
| XII Ouverture (plan de beauté) | **Oui** | Objet fixe, lumière qui glisse, mouvement de caméra lent | Image premium + vidéo IA (balayage de lumière, léger travelling) |
| XII Aiguilles liées au scroll | Partiel | Une IA vidéo ne garantit pas une rotation d'aiguilles exacte | Séquence vidéo pour la caméra. Les aiguilles avancent dans le rendu (pas l'heure réelle) |
| I La boîte (rotation face → profil) | **Oui, meilleur candidat pour la preuve B** | Orbite de caméra autour d'un objet rigide : point fort des modèles image → vidéo avec images de début et de fin | Image de début (face) + image de fin (profil) → vidéo IA |
| II Vue éclatée | **Non, ou très risqué** | 9 niveaux qui se séparent : l'IA invente ou fusionne des pièces | Hybride : géométrie 3D détaillée (ou modèle glTF professionnel) en rendu précalculé, textures et étalonnage alignés sur les images IA |
| III Le cœur (balancier à 4 Hz) | Risqué | Oscillation mécanique précise : déformation probable du spiral et des dents | À tester après la preuve B. Sinon : macro IA quasi fixe + balancier en 3D détaillée incrusté |
| IV Finitions | **Oui** | Macro d'une surface avec un travelling lent : aucune contrainte mécanique | Images macro + vidéo IA |
| V Cadrans | Branche explicite | Il faut 3 versions du même plan, identiques sauf le cadran | Une image maîtresse + 2 retouches du cadran seul (inpainting), avec le même cadrage. Fondu enchaîné entre états de **la même** image |
| VI Rendez-vous | **Oui** | Plan de beauté 3/4 ou porté | Image + vidéo courte |

Il serait faux d'affirmer qu'une vidéo générative remplacera toutes les interactions. Les étiquettes de la vue éclatée, le choix du cadran et le lien exact entre scroll et heure exigent soit de la géométrie, soit des branches gérées explicitement.

## 4. Pipeline par preuves (arrêt après chaque échec)

### Preuve A : image de référence premium

- **Entrée** : `plate-chapter-0-1200.webp`, utilisée comme référence de forme (édition guidée par image). Les proportions, le cadran bleu nuit, les index or, la petite seconde à 6 h, la couronne à 3 h et le bracelet cuir surpiqué sont ainsi conservés.
- **Sortie** : 1 image au minimum en 1536 × 1024 native, inspectée à 100 %.
- **Critères d'acceptation** :
  - engrenages, boîte et cadran crédibles en gros plan ;
  - texte « HÉLIOR » lisible et correctement orthographié ;
  - aucune pièce inventée incohérente (seconde couronne, index doublés…) ;
  - reflets cohérents avec un studio sombre à bandes lumineuses.
- **Comparaison** : côte à côte avec `site-v4/chapter-0`.
- **En cas d'échec** : diagnostiquer avant de relancer (prompt, référence, modèle). Pas de séries de tirages au hasard.

Prompt prêt (édition d'image, référence = plaque 0) :

> Photorealistic advertising photograph of a luxury mechanical wristwatch, keep the exact design and proportions of the reference image: 40 mm round case in polished and satin-brushed steel, thin mirror-polished bezel, slightly domed sapphire crystal with faint blue anti-reflective sheen, midnight-blue sunburst dial, applied faceted 18k yellow-gold baton indices with a double index at 12, gold dauphine hour and minute hands, small seconds sub-dial at 6 o'clock with concentric azurage and a thin blued-steel hand, printed wordmark "HÉLIOR" and "MANUFACTURE" under 12, "CALIBRE H-01" above the sub-dial, railway minute track with 5-minute numerals, fluted crown at 3 o'clock, straight lugs, dark brown calfskin strap with cream saddle stitching. Black studio set with a deep navy gradient, long softbox strip highlights along the case flanks, soft contact shadow, 100 mm macro lens, f/11, the whole watch tack-sharp, true-to-life micro-textures and machining marks, no extra logos, no additional text, no watermark.

### Preuve B : transformation animée (chapitre I, face → profil)

1. Image de fin « profil » obtenue par **édition de l'image A** (même éclairage, même montre) en s'appuyant sur `plate-chapter-1`, pour garantir le raccord.
2. Vidéo image-de-début + image-de-fin, 5 s, 1080p, caméra en orbite lente. **Interdits** : zoom seul et parallaxe 2D.
3. **Analyse** : extraction de 1 image sur 6. Contrôle de la forme (boîte ronde, nombre d'index, couronne unique, texte), du clignotement des reflets et de la stabilité du bracelet.
4. Si l'identité dérive, pas de nouveaux tirages au hasard : passage au plan hybride (point 3).

### Preuve C : lecteur scroll

- La vidéo validée est convertie en **séquence d'images** (WebP/AVIF, une image par trame), car une vidéo H.264 classique saute mal en arrière.
- La séquence est pilotée par le `scrollT()` existant et par le ressort amorti : avance et recul exacts, image stable à l'arrêt, même trame pour une même position.
- **Diffusion selon le terminal** :
  - ordinateur : 1920 px de large ;
  - tablette et téléphone : 1080 px ;
  - image fixe plein format affichée immédiatement, séquence chargée ensuite par paquets.
  - Aucun téléphone ne télécharge le master UHD.
- **Mesures** :
  - latence entre le geste et l'image ;
  - images par seconde au scroll (ordinateur et mobile émulé) ;
  - poids total et mémoire décodée ;
  - inversions rapides du sens de défilement.

### Preuve D : intégration dans Hélior

- Le chapitre I bascule sur la séquence. Les autres chapitres gardent la scène 3D tant qu'ils n'ont pas leur propre preuve.
- Les raccords entre chapitres se font sur des images de jonction identiques : la dernière trame du chapitre I doit correspondre à la première du chapitre II.
- Le HTML (texte, étiquettes, cadrans, formulaire) reste au-dessus du média, comme aujourd'hui.

## 5. Budget (estimations à confirmer sur les pages tarifaires officielles)

Tarifs relevés publiquement le 20/11/2026 (sources tierces, divergentes) :

- **Images** :
  - OpenAI gpt-image « high » : environ 0,05 à 0,21 USD par image 1024² selon le modèle ;
  - format 1536 × 1024 : un peu plus cher.
- **Vidéo, Kling 3.0 / 4.0 image → vidéo** :
  - environ 0,08 à 0,24 USD par seconde en 1080p selon la version et le revendeur ;
  - 4K : environ 0,42 USD par seconde.
- **Vidéo, Runway API** :
  - Gen-4 Turbo : environ 0,05 USD par seconde ;
  - Gen-4.5 : environ 0,12 USD par seconde ;
  - 1 crédit = 0,01 USD ;
  - recharge minimale possiblement requise.

| Étape | Contenu | Estimation |
| --- | --- | --- |
| Preuve A | 2 à 4 images haute qualité (dont 1 retouche) | 0,2 à 0,9 USD |
| Preuve B | 2 tirages × 5 s en 1080p (Kling Pro) ou 2 × 5 s (Runway Gen-4.5) | 1,0 à 2,4 USD (Kling) · 1,2 USD (Runway) |
| **Total preuves A + B** | | **environ 1,5 à 3,5 USD** |
| Production complète (après validation) | environ 10 plans × 5 s, 1 à 2 tirages chacun, plus images et cadrans | environ 12 à 35 USD |

## 6. Ce qui bloque l'exécution

1. **Réseau** : la politique de cet environnement refuse `api.openai.com`, `api.dev.runwayml.com`, `api.klingai.com`, `fal.run` et `api.replicate.com` (le proxy répond 403 à la connexion).
2. **Clés** : aucune clé fournisseur n'est configurée dans la session.
3. **Autorisation** : pas d'enveloppe validée pour cette mission. L'autorisation précédente de 5 € ne vaut pas pour celle-ci.

Il faut donc :

- choisir les fournisseurs (image et vidéo) ;
- autoriser un plafond pour les preuves A et B ;
- autoriser l'ouverture des hôtes correspondants et saisir les clés dans le formulaire sécurisé de l'environnement (jamais dans le chat).

## 7. Méthode réutilisable FABRYA (résumé)

1. **Plaques 3D** : la scène procédurale, ou le modèle client, fournit forme et cadrage, ce qui donne des proportions constantes.
2. **Images IA guidées** par ces plaques : la matière et le réalisme viennent de l'IA, la forme vient de la 3D.
3. **Vidéo IA** entre deux images de raccord, uniquement pour les plans sans contrainte mécanique.
4. **3D détaillée en rendu précalculé** pour les plans mécaniques exacts (vue éclatée, échappement).
5. **Lecteur scroll** à séquences d'images bidirectionnelles, alimenté par le moteur `scrollT()` existant, avec une variante par terminal.
6. **HTML séparé** pour l'interface et le parcours commercial.
