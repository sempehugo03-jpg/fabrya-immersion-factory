# FABRYA · Résonance · Au tour

[Ouvrir le prototype privé](https://fabrya-resonance-gestes.sempehugo03.chatgpt.site/)

Prototype indépendant, issu du lecteur de séquences Résonance du commit `89eb42e`. Le scroll natif détermine directement l’index d’image. Molette, glissement tactile et curseur clavier utilisent la même règle. Le mode de mouvement réduit désactive la progression au scroll et conserve le curseur manuel.

## Film et encodage

Prise réelle d’Anastasia Shuraeva. Extrait de 13,5 à 21,5 secondes, étalonné en contraste et en saturation. Le master contient 192 vues successives de la prise d’origine, à 3840 × 2160 et 24 i/s. La caméra reste fixe sur le geste. Le prototype présente un rendu desktop de 1152 × 648 et un recadrage mobile de 576 × 720. Il charge uniquement le profil requis. [Source vidéo](https://www.pexels.com/video/female-hands-working-with-pottery-wheel-5564528/) · [Licence Pexels](https://www.pexels.com/license/)

Le lecteur télécharge un paquet de WebP par profil. Il affiche le poster dès le départ, adresse l’image exacte par sa plage d’octets, puis la décode à la demande. Il garde au plus dix images décodées dans son cache explicite et précharge autour de la position. Les tâches obsolètes ne peuvent pas afficher une image qui ne correspond plus à la position demandée. La fiche est ancrée au vase à partir de la vue 86 et sa fermeture rend le focus au point d’action.

## Reproduction

Prérequis pour régénérer les médias, FFmpeg avec les encodeurs libx264 et libwebp et Python 3.

```sh
./encode-live.sh source-pexels-4k.mp4 Au-tour-master-2160p.mp4
python3 -m http.server 8000 --directory web
```

Ouvrir [le lecteur local](http://127.0.0.1:8000/). Les dérivés déjà encodés sont inclus dans le dossier de livraison. Le commit Git versionne le code et le manifeste, et ignore les médias dérivés.

```sh
CHROMIUM_BIN=/chemin/vers/chromium-headless-shell node tests/gestures.mjs preuves
```

Le script utilise Playwright et Chromium. En l’absence de `CHROMIUM_BIN`, il utilise le navigateur installé par Playwright. Le deuxième argument facultatif est l’URL du lecteur. Par défaut, la page de test reçoit exactement les fichiers locaux via la route Playwright. Les deux flux continus du navigateur sont écrits sous `preuves/raw-desktop/` et `preuves/raw-mobile/` avec leurs horodatages FFconcat.

Voir [les mesures et la validation](MESURES.md).
