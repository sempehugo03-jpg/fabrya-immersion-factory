# Résonance · Banc de production FABRYA

Plan de cinq secondes et lecteur réversible. Le bouton **A · Vidéo** sélectionne le MP4 à images clés rapprochées. **C · Images + action** charge des vues WebP au voisinage de la position et ajoute une fiche liée à la céramique sur l’établi. Aucun fond sonore et aucune action commerciale externe.

## Reproduire

Préparer un environnement avec Python, NumPy, Pillow, FFmpeg avec libx264 et libwebp, puis lancer depuis ce dossier.

```sh
OPENBLAS_NUM_THREADS=1 python render.py master-resonance-2160p.mp4
./encode.sh master-resonance-2160p.mp4
node tests/static.mjs
python3 -m http.server 8000 --directory web
```

Ouvrir [le lecteur local](http://127.0.0.1:8000/). Les images de départ originales se trouvent dans `media/`. La génération de ces deux images a été effectuée dans ChatGPT. `render.py` effectue la composition caméra et `encode.sh` produit les deux profils de diffusion. Le master et les médias web préencodés sont également fournis dans le dossier de livraison. La série générée n’est pas versionnée dans Git.

Pour le banc navigateur, copier `tests/qa.html` vers `web/qa.html` puis ouvrir [le contrôle local](http://127.0.0.1:8000/qa.html). Sélectionner le viewport et lancer la mesure. Ce contrôle ne fait pas partie du déploiement privé. Tester **Home**, **End**, les flèches, la molette ou le tactile, ainsi que **Échap** pour la fiche. La préférence de mouvement réduit supprime la progression passive et garde le curseur manuel.

Voir [l’audit](BENCHMARK.md) pour la production de référence, les limites et la décision. Voir [les mesures](MESURES.md) pour les poids et les résultats Chromium.
