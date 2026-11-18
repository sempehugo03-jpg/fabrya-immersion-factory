# FABRYA · Cinematic Production Pipeline Benchmark

## Verdict

**Le lecteur réversible et l’interaction locale sont démontrés. Le seuil artistique Apex reste non validé.** Résonance améliore fortement la lumière, les matières et la définition perçue par rapport à Atelier Serein. La caméra dévoile réellement des zones masquées de l’établi au passage du vase de premier plan. La scène est toutefois une composition de deux images fixes à deux profondeurs. La pièce et l’établi n’ont pas une géométrie exploitable sur 360°, et les reflets restent attachés aux deux visuels. Il n’y a ni personne, ni performance d’un geste métier. L’essai ne prouve pas une production de la complexité d’Apex.

**Décision d’architecture.** Séparer le film de l’interface. Conserver un master indépendant et horodater les événements métier. Essayer d’abord le MP4 à GOP court pour le poids et l’accès à la position mesurés ici. Conserver les images progressives avec canvas pour les séquences où le seek, les actions ou la compatibilité du navigateur imposent un contrôle plus strict. Porter la fiche du mode C sur le transport vidéo uniquement après avoir vérifié en production le lien entre l’horodatage rendu et la position, par exemple avec `requestVideoFrameCallback` lorsqu’il est disponible. Le master vidéo généré à partir de références reste le test de production manquant.

## 1. Base FABRYA auditée

Après consultation du dépôt GitHub, `main` pointe toujours sur `192bf0d2977ff07a9c34fa9a483a86f5b2dfd275`. Le commit `290939a` se trouve sur la branche locale `experiment/apex-scroll-benchmark` et dans le bundle précédent. Le distant expose uniquement `main`. La nouvelle branche `experiment/cinematic-production-pipeline` part de `290939a`. Le dépôt étant public, le commit d’expérience est remis dans un bundle Git privé. Le nouveau code est isolé sous `experiments/cinematic-pipeline/`.

Atelier Serein avait prouvé la réversibilité avec 96 images WebP 448 × 672, 3,37 Mo au total, un rendu Cycles procédural et un formulaire local. Le temps de rendu était de 8 min 56 s. Le défaut bloquant était la création d’images et de matières crédibles. Le choix du transport de diffusion est indépendant de ce défaut. Le site de production et les flux de paiement n’entrent pas dans le benchmark.

## 2. Références et observation des séquences

FFmpeg a décodé les deux fichiers intégralement. Beauty correspond à la pièce jointe du benchmark précédent, vérifiée par SHA-256 contre la copie des références. Sa lecture visuelle antérieure couvre 136 repères à 0,5 s et 30 repères d’ouverture à 0,25 s. Tattoo couvre 85 repères à 1 s et 36 repères d’ouverture à 0,25 s. Ces extraits sont des captations montées d’un écran de téléphone. Les horodatages concernent la captation, sans association directe aux pixels de scroll. Les vidéos de référence et les actifs Apex ne sont pas redistribués avec ce test.

| Référence | Fichier de référence | Paramètres de la captation |
|---|---|---|
| Apex Beauty | `1000026055.mp4` | H.264 · 536 × 954 · 30 i/s · 2 044 images · 68,17 s |
| Tatoo Apex | `1000026052(1).mp4` | H.264 · 356 × 634 · 30 i/s · 2 548 images · 84,94 s |

| Plage de captation | Apex Beauty |
|---|---|
| 00:00–00:00,75 | Accueil stable, architecture et assises au premier plan. Le titre flotte au-dessus du média. |
| 00:00,75–00:02,25 | Approche dans l’axe puis franchissement apparent de l’arche. Les bords proches et les assises se décalent davantage que le fond. |
| 00:02,25–00:04,50 | Le lit se dégage, la praticienne et la cliente deviennent le sujet. Les légendes se relaient au bas du cadre. |
| 00:04,50–00:05,75 | Gros plan apparent sur le soin. La pose et la visibilité des mains changent. La vidéo ne permet pas d’isoler l’origine de chaque geste. |
| 00:05,75–00:09,25 | Limite courbe claire montant depuis le bas, passage dans le flux éditorial, CTA persistant. |
| 00:09,25–00:17,75 | Prestations, calendrier, préférence et confirmation des coordonnées dans un écran sombre. La captation ne prouve aucune transaction. |
| 00:17,75–00:32,50 | Retour à la page, valeurs, catalogue, détails et déroulé du rituel. |
| 00:32,50–00:51,75 | Orientation par questionnaire, résultat avec produit, équipe et fiches de soins sur carrousel. |
| 00:51,75–01:08,17 | Cadeaux, avis, FAQ, adresse, horaires, carte et pied de page. |

| Plage de captation | Tatoo Apex |
|---|---|
| 00:00–00:01,50 | Devanture oblique, texte de marque par-dessus, puis approche et décalage latéral de l’enseigne. |
| 00:01,50–00:02,25 | Les montants et le seuil traversent la vue. L’intérieur sombre et le parquet apparaissent. |
| 00:02,25–00:03,75 | Progression vers le fond du studio. Reflets allongés dans le parquet et étagères éclairées en profondeur. |
| 00:03,75–00:04,50 | Changement de composition vers la scène de tatouage à gauche. Le passage est perceptible. Une coupe masquée ou un raccord dans le film reste possible. |
| 00:04,50–00:06,00 | Porte-lampe, silhouette de la cliente et bras du tatoueur se réorganisent visuellement avec l’approche. Le geste métier devient lisible. |
| 00:06,00–00:08,25 | Le plan resserré tient brièvement. Une action se superpose. La scène s’assombrit puis le contenu éditorial monte. |
| 00:08,25–00:18,50 | Indicateurs, preuve sociale, catalogue visuel et présentation de l’atelier. |
| 00:18,50–00:33,50 | Étapes, informations pratiques et options, puis section claire et élément présenté en différentes configurations. |
| 00:33,50–00:44,50 | Questionnaire, choix de zone et de caractéristiques, ordre de grandeur de prix. |
| 00:44,50–01:00,00 | Fiches des artistes, parcours vers le calendrier, date et formulaire, retour au flux. |
| 01:00,00–01:24,94 | Informations de soin et garanties, avis, FAQ, consultations, autres témoignages et pied de page. |

### Ce que le code public permet de vérifier

Les deux ouvertures reposent sur un canvas et sur un index d’image dérivé de la position de défilement. Aucune des deux pages HTML inspectées ne déclare un élément vidéo pour cette ouverture. La visite, les formulaires et le film ont des responsabilités séparées. Les sources JavaScript sont des ressources publiques référencées par les pages, consultées en lecture seule.

| Site | Mécanisme effectivement observé |
|---|---|
| Apex Beauty | `data-images=856`. Deux jeux de JPEG, `lo` et `hi`, affichés sur canvas par un lecteur JavaScript. Chargement contrôlé et transition de définition maintenue en avance sur la position. Le script déclare un intermédiaire MOV 2160 × 3840, 9,61 s, 24 i/s et une interpolation à 90 i/s. Le MOV de fabrication n’a pas été vérifié. La déclaration ne permet pas d’établir que le média a été généré en 4K native. |
| Tatoo Apex | 898 images WebP déclarées en 810 × 1440, 60 i/s interpolées selon le script. Le numéro de départ est décalé de 39 vues. Préchargement à faible densité sur l’ensemble du trajet, puis priorité à la position. Lissage temporel de la progression. |
| Métier | Titres, choix, prix indicatifs, carrousels et états d’interface gérés côté page. Le calendrier Beauty est ouvert par une iframe Cal.eu. Tattoo charge le programme d’intégration Cal.eu. Ce sont des éléments interactifs distincts de la séquence visuelle. |

Sources primaires
[Apex Beauty](https://apex-advisory-groupfr.com/demos/esthetique-1/index.html?lang=fr-FR) · [Lecteur Beauty](https://apex-advisory-groupfr.com/demos/esthetique-1/assets/js/seq.js?v=20261110c) · [Interface Beauty](https://apex-advisory-groupfr.com/demos/esthetique-1/assets/js/ui.js?v=20261110c)
[Tatoo Apex](https://apex-advisory-groupfr.com/demos/tatoo-6/index.html?lang=fr-FR) · [Lecteur et interface Tattoo](https://apex-advisory-groupfr.com/demos/tatoo-6/assets/app.js?v=20261110c)

### Ce qui reste à attribuer

Le pipeline aval est démontré par le code. Un master vidéo est déclaré pour Beauty. Les fichiers consultés ne montrent aucune attribution de fabrication de ce master à Claude, Runway, Kling, Blender ni à une caméra réelle. L’hypothèse plausible est celle d’un film fabriqué séparément, avec interpolation et préparation de plusieurs niveaux d’images. Un assistant de développement pourrait écrire le lecteur, le site et les scripts de postproduction. Anthropic décrit des artefacts de code et de sites, ainsi que des animations de code, et distingue ces fonctions de la génération de photos. Aucune preuve publique identifiée ne rattache Claude à ce projet précis. [Artefacts Claude](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) · [Capacité image](https://support.claude.com/en/articles/9002500-can-claude-produce-images)

## 3. Fournisseurs et moyens

Prix observés le 18 novembre 2026. Les tarifs se rapportent au calcul d’une génération. Le montant d’une recharge et les taxes sont des questions séparées. Les modèles ci-dessous n’ont pas été exécutés pendant ce benchmark.

| Solution | Capacité pertinente et accès | Coût du scénario test | Licence et limite |
|---|---|---:|---|
| fal Kling V3 4K I2V | Première et dernière images, références via éléments, soumission API asynchrone. La fiche fournisseur annonce une génération 4K. Vérifier le raster et la stabilité sur le fichier récupéré. | 2,10 USD pour 5 s à 0,42 USD/s. Deux prises coûtent 4,20 USD. | Fiche marquée usage commercial. Les termes du modèle et les droits sur les images fournies s’appliquent. Compte connecté bloqué par solde épuisé. |
| fal Kling V3 Pro I2V | Premier et dernier visuels selon le contrat du modèle. Approprié pour comparer deux trajectoires avant le master. | Fiche affichant 0,112 USD/s sans audio. Tarification interrogée via le compte affichant 0,14 USD/s générique. Réserver jusqu’à 0,70 USD pour 5 s et vérifier l’estimation exacte au moment de l’accord. | Fiche marquée usage commercial. Aucune génération ni téléversement effectué. |
| fal LTX-2.3 I2V | Alternative rapide de prévisualisation, contrat vidéo à confirmer pour le guidage final et le raster demandé. | Tarif générique interrogé de 0,08 USD/s. Durée et réglages facturés à confirmer. | Licence exacte du service et du poids local à distinguer. |
| Veo 3.1 via fal | Génération par ancres selon la variante. Prendre le contrat et le tarif de l’endpoint silencieux avant toute comparaison. | La fiche comparative fal indique 0,20 USD/s silencieux pour 720p ou 1080p. Durée minimale selon l’endpoint. | Vérifier badge et conditions du modèle exact. Aucune exécution. |
| Runway Gen-4.5 | API I2V à image initiale et mouvement dirigé par prompt. Profil horizontal 1280 × 720 disponible. Portail développeur distinct du compte web. | 0,60 USD pour 5 s à 12 crédits/s et 0,01 USD/crédit. Minimum de 10 USD au démarrage de l’API suivant la documentation. | Runway annonce les droits d’utilisation commerciale des résultats vis-à-vis de Runway. Offre web gratuite de 125 crédits uniques, avec catalogue limité et filigrane selon offre. Accès gratuit à un compte opérationnel non établi ici. |
| LTX Desktop local | Génération locale reproductible si le poste disposait d’un GPU compatible, VRAM et stockage requis. Aucun GPU de calcul exposé dans cette session. | Pas de coût d’API en exécution locale. Temps de calcul et matériel à amortir. | Licence Community versionnée du modèle. Vérifier les conditions commerciales et d’hébergement pour le poids exact retenu. |
| Blender Cycles + compositing | Caméra, ombres, géométrie et animation déterministes. Automatisation Python et CLI. Adapté après acquisition ou fabrication de matériaux et géométries crédibles. | Gratuit ici, avec un coût de fabrication et de calcul. Atelier Serein a mesuré près de 9 min CPU pour 96 vues modestes. | Blender sous GPL. Les droits sur les rendus dépendent des ressources que le producteur insère. |
| FFmpeg, MP4 court GOP, WebP | Transcodage et mesures locaux. Le MP4 réduit volume et requêtes. Le WebP rend possible l’adressage d’images exactes. | 0 USD d’API. Les deux exécutés dans ce benchmark. | FFmpeg LGPL ou GPL selon compilation et options. Le livrable livre des scripts et des médias, sans binaire FFmpeg. |
| GSAP ScrollTrigger | Progression, épinglage, seuils et timeline. Utile pour les longues expériences multi-sections. Le plan testé utilise sticky, événement scroll et rAF. | Aucun achat requis ici. | Licence standard GSAP à relire pour les usages d’édition visuelle tiers. Le moteur UI du test ne dépend pas de GSAP. |

Sources fournisseurs
[Fiche Kling 4K](https://fal.ai/models/fal-ai/kling-video/v3/4k/image-to-video) · [Kling Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video) · [Tarifs comparés fal](https://fal.ai/explore/image-to-video-apis) · [Facturation fal](https://docs.fal.ai/model-apis/pricing) · [Conditions fal](https://fal.ai/legal/terms-of-service)
[Tarifs Runway API](https://docs.dev.runwayml.com/guides/pricing/) · [Démarrage Runway API](https://docs.dev.runwayml.com/guides/setup/) · [Formats Runway](https://docs.dev.runwayml.com/assets/inputs/) · [Offre web gratuite](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details) · [Droits Runway](https://help.runwayml.com/hc/en-us/articles/18927776141715-Usage-rights)
[Matériel LTX Desktop](https://github.com/Lightricks/LTX-Desktop) · [Licences LTX](https://github.com/Lightricks/LTX-2/blob/main/LICENSE) · [Blender Cycles](https://docs.blender.org/manual/en/latest/render/cycles/gpu_rendering.html) · [Licence FFmpeg](https://ffmpeg.org/legal.html) · [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) · [Licence GSAP](https://gsap.com/community/standard-license/) · [Signal de présentation vidéo](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)

## 4. Comparaison des architectures

| Architecture | Test réellement effectué | Qualité et continuité | Décision |
|---|---|---|---|
| A · Film prérendu | Master réversible via deux MP4 courts GOP. Test desktop et mobile en viewport Chromium. | Film sans raccord, mouvement déterministe, bonne fidélité au master. Aucun résultat de film avec volume complet ou interprète. | Codec retenu comme candidat de livraison principal. Répéter sur Safari iOS et Android. |
| B · IA vidéo avec ancres | Création des deux visuels originaux fixes. Le test de génération du mouvement par un modèle vidéo n’a pu être lancé. | Aucune affirmation de qualité temporelle, 4K native, stabilité de visage ou raccord IA. | Premier test pertinent sur Kling V3 4K, avec deux ancres et un mouvement simple. |
| C · Hybride | Même master, 120 WebP par profil, canvas à cache borné, trajectoire du point d’action et fiche locale accessible. | Alignement du bouton sur la position affichée, mécanisme réversible. Poids total et mémoire du cache supérieurs au transport A testé. | Séparer l’interaction de son support d’image. Réserver le canvas aux cas qui le justifient. |

A et C utilisent le même master pour que la comparaison des deux lecteurs conserve le même film. Le rendu est un seul plan composé à partir d’un atelier et d’un vase créés pour l’essai. La caméra virtuelle traduit 0,605 m latéralement et 0,15 m en profondeur à focale fixe. Les centres projetés du vase de premier plan et de la céramique sur l’établi se déplacent respectivement de −73,8 et −9,7 points de largeur écran. L’occultation libère de nouvelles zones d’image. Les surfaces peintes dans une même plaque restent co-planaires. La différence de déplacement valide l’assemblage de la traversée, tandis que l’absence de relief et de reflets variables fixe sa limite artistique.

## 5. Architecture industrielle proposée

1. Rédiger une fiche de plan exploitable avec points de départ et d’arrivée, trajet, objet à découvrir, lumière, profondeur et critères de continuité. Le brief et ses contraintes restent indépendants du fournisseur.
2. Produire des ancres originales identifiées et vérifier silhouette, espace, matières, droits et résolution. Une prise de vue réelle de l’atelier, si disponible, constitue une alternative gratuite au fournisseur de génération.
3. Rendre une prise de prévisualisation courte. Écarter les dérives de forme, la paroi qui se déforme au franchissement, la lumière qui glisse et le saut au passage d’un plan à l’autre. Poser un verdict artistique distinct de la QA web.
4. Valider le master d’après les métadonnées et la source réelle. Rapporter séparément taille du fichier final, raster des sources, interpolation et éventuel upscale. Publier les dérivés mobile et desktop et conserver le master hors du chargement initial.
5. Préparer des événements indépendants des encodages, identifiés par un intervalle et un point projeté dans chaque recadrage. Si une fiche est ouverte, garder le contexte et restaurer le focus. Relever la position, le sens du déplacement et la vue réellement présentée.
6. Vérifier navigation clavier, gestes tactiles, respect de la préférence de mouvement réduit, redémarrage, arrière, consommation, attente réseau et reprise. Examiner sur appareil physique les raccords et le glissement de l’interface.
7. Maintenir une décision de publication humaine tant que la comparaison photoréaliste et le mobile n’ont pas été validés.

**Budget à soumettre.** fal, endpoint Kling V3 4K image-vers-vidéo, une prise de 5 s ancrée aux deux extrémités, **2,10 USD de calcul**. Deux prises apporteraient un meilleur contrôle du caractère reproductible pour 4,20 USD. La recharge minimale du compte fal n’a pas été vérifiée. Le coût engagé pendant ce benchmark est **0 USD de dépenses additionnelles**, avec les outils d’image et de calcul déjà disponibles. Aucun nouvel abonnement, achat ou transfert d’ancres vers un fournisseur vidéo.
