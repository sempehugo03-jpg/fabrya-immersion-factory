# Atelier Serein

Banc d’essai privé FABRYA. Un trajet de caméra dans une cabine fictive, commandé par le scroll, et un formulaire local de demande.

## Ouvrir la démo en local

Depuis ce dossier, lancer `python3 -m http.server 8000 --directory web` et ouvrir [localhost:8000](http://localhost:8000). Les médias sont inclus. Le site n’a besoin d’aucune clé et ne contacte aucun service pour effectuer la simulation.

## Reproduire les médias

Prérequis utilisés pour ce rendu : Blender 4.3.2, FFmpeg avec libwebp, CPU local. Exporter les 96 vues JPEG, puis générer les vues WebP.

```sh
mkdir -p /tmp/serein-render
blender -b -noaudio -t 8 --python render.py
./encode.sh /tmp/serein-render
```

## Vérifier

Avec Node.js, Playwright et Chromium disponibles, lancer `node tests/benchmark.mjs local evidence`. `CHROMIUM_BIN` permet de choisir l’exécutable. Le premier argument peut aussi être l’URL d’un serveur de développement. Le test local sert les ressources directement depuis `web/` via des interceptions Playwright. Le test produit deux profils de viewport, les vues de comparaison et des mesures sur un défilement scripté de 5,6 secondes.

```sh
node tests/record.mjs local /tmp/serein-capture
ffmpeg -f concat -safe 0 -i /tmp/serein-capture/capture.ffconcat \
  -vf 'fps=30,format=yuv420p' -c:v libx264 -crf 20 -movflags +faststart parcours.mp4
python3 tests/compare.py /chemin/1000026055.mp4 evidence
```

La commande d’enregistrement produit une vidéo CDP horodatée de Chromium lorsqu’un Chromium local peut démarrer. Le montage remis avec cette livraison utilise le rendu continu et des captures du navigateur partagé. Le test pilote l’offset de scroll et effectue les interactions avec les contrôles de la page. Voir [ANALYSE.md](ANALYSE.md) pour les observations, le pipeline et les écarts.

Le fichier `tests/qa.html` permet de reprendre les contrôles du navigateur partagé. Copier ce fichier vers `web/qa.html` et ouvrir `/qa.html` sur le serveur local. Il charge la page réelle dans une iframe aux dimensions choisies. Ce fichier de contrôle ne fait pas partie du site déployé.
