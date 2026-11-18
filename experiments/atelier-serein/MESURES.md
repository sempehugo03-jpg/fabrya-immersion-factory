# Vérifications, performance et coût

## Ce qui a été vérifié

| Contrôle | Résultat |
|---|---|
| Démo propriétaire uniquement | Déploiement privé terminé. Page ouverte dans Chromium depuis son URL finale. |
| Molette sur la démo déployée | Image 0 → 28 → 0. |
| Viewport mobile 390 × 844 | Séquence 61 → 21 → 61 à partir des offsets 64 % → 22 % → 64 %. Les captures montrent les états 0, 33, 56 et 95. |
| Formulaire dans le viewport mobile | Sélection clavier de « Massage à l’huile · 60 min », ouverture de la préférence de date puis récapitulatif. L’interface confirme que la simulation n’envoie aucune demande. |
| Largeur | Aucun débordement horizontal à 390 × 844 et 1 440 × 900. |
| Desktop | Capture de l’URL déployée. |
| Régression du moteur | 34 tests découverts depuis l’archive Équinoxe. 33 réussis et le test fournisseur live ignoré. |
| Suite Playwright ajoutée | Sources et vérification syntaxique disponibles. Chromium local s’est arrêté au lancement sur `ProcessSingleton`, lors de la création d’une socket refusée par l’environnement. La suite complète, le tactile émulé et le mode mouvement réduit restent à exécuter. |
| Enregistrement continu de l’écran | Les captures Chromium sont disponibles. La sortie de 22,83 s est un montage du rendu continu et de captures Chromium. La capture continue du navigateur n’a pas pu être obtenue dans cet environnement. |

## Mesures du site

- 96 images à 448 × 672. La séquence WebP pèse 3 367 728 octets au total, soit 3,37 Mo. L’image d’ouverture pèse 15 400 octets. HTML, CSS et JavaScript pèsent 20 659 octets avant compression HTTP.
- Blender 4.3.2, Cycles CPU, 12 échantillons. Environ 8 min 56 s entre la première et la dernière image exportée. Eevee a échoué à créer un contexte EGL. L’exécutable Blender ne dispose pas d’OpenImageDenoise. FFmpeg applique un filtre spatial image par image, ce qui laisse du bruit sur les zones éclairées et adoucit les détails fins.
- La comparaison animée recale les deux trajectoires sur le seuil, la cabine et le détail. Les repères du rendu correspondent aux vues 33, 56 et 95 à 16 vues par seconde. L’intervalle entre événements est ajusté dans la vidéo comparative. Ce montage montre les différences de mouvement et de composition indépendamment du débit du navigateur.

| Profil du navigateur partagé | Intervalle médian entre callbacks | P95 | Images distinctes sur la traversée |
|---|---:|---:|---:|
| 390 × 844 | 599,8 ms | 1 016,4 ms | 11 |
| 1 440 × 900 | 1 016,4 ms | 1 016,5 ms | 5 |

Ces mesures viennent d’un défilement scripté de 5,6 s dans la prévisualisation du navigateur partagé. Elles montrent que la cadence de cette session était insuffisante pour juger la fluidité. Elles ne constituent ni un résultat smartphone ni un budget d’animation validé en production. La seconde mesure bénéficie du cache de la première. Le débit de téléchargement à froid et la latence tactile physique restent à mesurer.

## Coût

**0 USD facturé par des API de génération pour cet essai.** Rendu et encodage locaux. Aucun appel payant, aucun achat ou rechargement de crédits. Le solde cité de 0,64 USD n’a pas été vérifié, car aucun appel facturé n’a été effectué. La limite de finition constatée tient au décor procédural, à l’absence d’interprètes et aux capacités de rendu de cet environnement.

Le commit de l’expérimentation est inclus dans le fichier Git bundle. Le dépôt GitHub consulté est public. Aucune branche expérimentale n’y a été poussée. L’URL privée héberge uniquement la démo et ses médias originaux.
