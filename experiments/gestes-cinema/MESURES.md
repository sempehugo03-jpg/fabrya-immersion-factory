# Au tour · Validation du 19 novembre 2026

## Gestes et interaction

Chromium Headless Shell 156.0.8078.79, bureau 1152 × 768 et mobile émulé 390 × 844. Les événements de molette et de toucher ont été injectés dans Chromium par Playwright et CDP, puis observés par le document avec `isTrusted=true`. Le script ne déplace pas le curseur pour simuler ces gestes. La capture est faite par le screencast du navigateur. Ses deux parties, bureau puis téléphone émulé, conservent leur cadence et leurs pauses respectives. Le cartouche indique les événements et les indices vus.

| Contrôle | Bureau | Mobile émulé |
|---|---:|---:|
| Départ → premier arrêt → deuxième arrêt → fiche → retour | 0 → 48 → 30 → 130 → 0 | 0 → 43 → 27 → 124 → 0 |
| Demandes associées à un geste récent et affichées | 42 / 42 | 115 / 115 |
| Vues demandées mais remplacées avant dessin | 0 | 0 |
| Écarts cumulés entre indices demandés sur les portions gestuelles | 271 | 191 |
| Geste → dessin, médiane / P95 | 44,1 / 61,6 ms | 65,1 / 106,0 ms |
| Index demandé → dessin, médiane / P95 | 10,2 / 18,8 ms | 5,6 / 11,3 ms |
| Inversions rapides, demandes affichées / demandes | 11 / 11 | 16 / 16 |
| Délai maximum index → dessin pendant les inversions rapides | 13,6 ms | 6,7 ms |

Une demande correspond à un changement d’index calculé par le lecteur. Un fort déplacement peut atteindre directement un index éloigné et sauter des vues du film dans les deux sens. Les écarts entre indices distinguent ces sauts des demandes effectivement perdues. Les écarts sont cumulés sur plusieurs passages incluant les retours.

La latence gestuelle associe à chaque demande le dernier événement de geste observé dans les 300 ms précédentes. Le point d’arrivée est l’appel de dessin du canvas, avant le délai du compositeur et de l’écran. Les mesures ont lieu une fois le paquet chargé, dans le navigateur d’essai. Elles ne donnent ni un chargement à froid ni une latence tactile physique. Les changements rapides sont des rafales de molette de sens alterné et deux balayages consécutifs opposés sur mobile.

## Vérifications

- Au premier arrêt les pixels du canvas sont restés identiques pendant 1,45 s. Au deuxième arrêt l’index est resté fixe pendant 1,30 s.
- L’empreinte SHA-256 de la première image du canvas est identique avant le départ et après le retour, pour chaque profil.
- L’ouverture et la fermeture de la fiche préservent la position. Le focus revient au bouton ancré. Le test de molette pendant l’ouverture a gardé le plan fixe.
- En mouvement réduit, la molette laisse le film à la vue 0. Le clavier sélectionne 191 puis retrouve 0.
- Sur le déploiement privé, la molette a révélé la fiche à la vue 156, Échap l’a refermée à la vue 156 et la molette a retrouvé la vue 0.
- Aucun téléphone physique n’était disponible. La fluidité iOS et Android, les cadences de rendu sur matériel réel et le chargement à froid restent à mesurer.

## Médias

| Fichier | Raster | Taille |
|---|---|---:|
| Master du plan | 3840 × 2160 · 24 i/s · 8 s | 25 535 676 o |
| Paquet desktop, 192 WebP | 1152 × 648 | 3 925 340 o |
| Paquet mobile, 192 WebP | 576 × 720 | 1 935 786 o |
| Poster desktop / mobile | Profil respectif | 21 950 / 10 392 o |
| Capture de preuve | 1280 × 832 · 30 i/s · 27,13 s | 1 863 275 o |

Le film repose sur une prise de vues fixe. Le mouvement visible est celui du tour et des mains au travail. Le choix de ce plan rapproche la matière et le geste d’un tournage réel. Une traversée de lieu avec déplacement de caméra reste un autre type de plan.
