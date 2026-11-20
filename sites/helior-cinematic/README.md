# Hélior · version cinéma (film image par image)

Reprise du site publié par ChatGPT Work (https://helior-cinematic-rebuild.sempehugo03.chatgpt.site),
avec un nouveau lecteur de film pour un défilement fluide dans les deux sens, lent ou rapide.

## Ce qui a changé

- `film-player.js` (nouveau) remplace les deux lecteurs précédents :
  - 721 images indépendantes à 60 i/s (WebP, ordinateur 1440 px, mobile 900 px), regroupées en 31 paquets de 24.
  - Les paquets se chargent d'abord autour du visiteur, puis tout le film en arrière-plan.
  - Les images sont décodées hors du fil principal, à la taille affichée, le long de la trajectoire prévue du geste.
  - La tête de lecture suit le défilement avec un ressort amorti, sans dépassement, et fond les deux images qui l'encadrent.
  - À l'arrêt, l'image exacte s'affiche. Une position revisitée donne toujours la même image.
- `app.js` : le lecteur est branché, et le défilement amorti de la molette est réactivé en mode film. Il était désactivé, d'où des sauts de 100 px par cran.
- Les anciens lecteurs (`box-cinema.js`, flux H.264 par paquets de 30 images ; `numbered-cinema.js`, une requête par image) restent disponibles avec `?player=legacy`.

## Médias

- `media/film/desktop/packs/` : 76,5 Mo, extraits une image sur trois du flux 180 i/s d'origine (1440×1440).
- `media/film/mobile/packs/` : 42,3 Mo, depuis `frames-60` d'origine (900×900).
- Les téléphones ne téléchargent que la version 900 px. En mode économie de données (2G/3G), seul le voisinage de la position est chargé.

## Mesures

`production/MESURES.md` et `production/demo-defilement-1280x800.mp4`.
