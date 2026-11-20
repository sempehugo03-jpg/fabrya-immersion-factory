# Mesures de fluidité (20/11/2026)

## Conditions

- Chromium headless (Playwright), sans carte graphique, 4 cœurs CPU, serveur local.
- Décodage WebP mesuré dans ce conteneur : environ 20 ms par image 1440 px, 90 à 140 images/s en parallèle.
  Un ordinateur récent est nettement plus rapide : ces chiffres sont un plancher.
- Unités : images du film à 60 i/s.
- Définitions :
  - « écart de décodage » : image affichée − tête de lecture ;
  - « gel » : image inchangée alors que la position bouge ;
  - « saut max » : plus grand changement d'image entre deux rafraîchissements.

## Ordinateur 1440×900, molette, nouveau lecteur

| Scénario | Rafraîchissement médian | Écart de décodage moyen | Gels / images |
| --- | --- | --- | --- |
| Lent (1 cran / 120 ms) | 16,7 ms (60 i/s) | 1,8 | 25 / 304 |
| Rapide (1 cran / 16 ms) | 16,7 ms | 8,5 | 40 / 295 |
| Inversions rapides | 16,7 ms | 12,5 | 89 / 378 |

L'ancien lecteur ordinateur (flux H.264) ne peut pas être mesuré ici : le Chromium de test ne contient pas de décodeur H.264.

## Mobile émulé (Pixel 7), glissement tactile

| Scénario | Ancien : saut max / gels | Nouveau : saut max / gels | Nouveau : écart de décodage moyen |
| --- | --- | --- | --- |
| Lent | 2 / 0 | 1,5 / 0 | 0 |
| Rapide | 52 / 4 | 23 / 2 | 5,3 |
| Inversions rapides | 36 / 13 | 16 / 2 | 1,9 |

L'ancien lecteur mobile a été mesuré sur réseau local, ce qui l'avantage : en conditions réelles, il attend le réseau pour chaque image.

## Chargement

- Première image du film peinte : environ 100 ms (mobile) à 330 ms (ordinateur) après l'initialisation. Avant cela, l'image 000 s'affiche en fond CSS.
- Film complet : 76,5 Mo (ordinateur) / 42,3 Mo (mobile) en 31 requêtes.
- Mémoire décodée maximale : 56 images à la taille affichée sur ordinateur (environ 155 Mo en 832 px), 36 sur mobile (environ 117 Mo).
