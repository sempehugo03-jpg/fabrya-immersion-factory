# Résonance · Mesures reproductibles

## Résolutions, encodages et netteté

Le master est composé directement à 3840 × 2160, en H.264 BT.709, à 24 images/s, pendant 5,000 s. Les 120 vues sont calculées indépendamment avec les paramètres de caméra. Il pèse 10 133 856 octets. Le décor est une image 1672 × 941 et le vase alpha une image 1305 × 1206. Le raster de composition est donc UHD. La résolution et la richesse de détail des sources sont inférieures à l’UHD. La resynthèse bicubique du décor et du vase ne constitue pas une prise de vue 4K native.

Le rendu et l’encodage du master ont pris 42,7 s avec quatre travailleurs CPU et l’encodeur FFmpeg. Les variantes de diffusion sont calculées depuis ce master. La version mobile est un recadrage horizontal vers 3:4. Le film n’est jamais distribué d’office en UHD par le lecteur.

| Profil | Taille du poster WebP | Série C complète | MP4 A | Images clés A |
|---|---:|---:|---:|---:|
| Desktop, 1280 × 720 | 88 218 o | 10 045 124 o | 3 904 748 o | 20, intervalle 6 vues |
| Mobile, 540 × 720 | 44 872 o | 3 899 076 o | 1 555 198 o | 20, intervalle 6 vues |

Ce sont les fichiers complets sur disque. Le navigateur du mode C ne télécharge que les vues demandées et une petite fenêtre de prélecture. Le mode A charge la vidéo quand il est choisi et accepte les réponses partielles du serveur lorsqu’elles sont disponibles.

| Profil | SSIM MP4 / WebP | Énergie de contours MP4 / WebP, master redimensionné = 100 % |
|---|---:|---:|
| Desktop | 0,9858 / 0,9682 | 95,8 % / 98,8 % |
| Mobile | 0,9862 / 0,9693 | 96,0 % / 99,4 % |

SSIM calculé sur la séquence avec FFmpeg à raster égal. L’indicateur de contours est le RMS du Laplacien des luminances sur les vues 0, 20, 40, 60, 80, 100 et 119. Une valeur élevée indique des variations locales conservées, bruit et artefacts compris. Elle est complémentaire à SSIM. Aucun de ces deux indicateurs ne mesure la fidélité artistique, la résolution optique ou un gain de détail dû au raster UHD. Le fichier `tests/details.py` reproduit le second calcul.

Visuellement, les éprouvettes émaillées, les irrégularités du bois et le reflet de la lampe restent stables. Le cadre révèle la toile et le bord de l’établi masqués au départ. Une partie du vase proche quitte l’écran. Les reflets du vase et la perspective interne du décor restent figés dans les images projetées. Les visages et les raccords de plusieurs plans sortent du périmètre de ce rendu unique. Aucun effet de compression ou montage rapide n’a été utilisé pour masquer ces limites.

## Chromium partagé · Contrôles et délais

Le banc navigateur teste un viewport desktop 1080 × 808 et un viewport mobile 390 × 844 sur Chrome 156/Linux. Les deux profils sont des viewports contrôlés. Chrome n’émule pas ici un téléphone physique ni Safari iOS. Le code local de mesure est fourni dans `tests/qa.html`. Les sorties JSON sont remises avec les captures.

| Viewport | A MP4 médiane / P95 | C WebP médiane / P95 | Mémoire C contrôlée |
|---|---:|---:|---:|
| Desktop | 20,7 / 34,0 ms | 26,8 / 101,6 ms | 47,92 Mo |
| Mobile | 9,9 / 16,0 ms | 14,5 / 66,6 ms | 20,22 Mo |

Chaque mesure porte sur 11 sélections successives du curseur, entre événement demandé et état déclaré pour la vue affichée par le lecteur. Pour A, le signal testé est l’événement `seeked`. Il ne constitue pas une mesure photon-à-photon. Les caches ont pu être chauds, les deux transports ne sont pas testés à débit réseau égal et l’ordre C puis A est fixe. Le P95 est indicatif avec 11 points.

La colonne mémoire est un compte contrôlé du raster RGBA des ImageBitmap conservés, plus un canvas, au maximum échantillonné de 12 images + 1. Les surfaces du navigateur, les décodages en cours et la mémoire GPU n’y figurent pas. Le tampon interne du décodeur A reste non mesuré. Les valeurs d’octets transférés des JSON sont dépendantes du cache et des réponses réseau observées. Comparer les poids intégraux dans le tableau de fichiers.

Le premier affichage de contenu a été relevé à 76 ms dans le banc prévisualisé. Le premier état prêt du mode vidéo a été observé à 30,6 ms desktop et 69,5 ms mobile lors du changement de mode, avec les mêmes limites de cache. Aucun temps de chargement à froid sur un réseau mobile réel n’est établi.

### Résultats fonctionnels

- A et C reproduisent la suite 0 → 48 → 87 → 119 → 87 → 48 → 0 sur les deux viewports. La vue reste stable après arrêt et les rafales de demandes se stabilisent sur la dernière vue demandée, 81.
- Le curseur natif passe de 0 à 119 puis 118 au clavier. La fiche apparaît au point lié à la céramique en mode C, s’ouvre et se ferme par Échap. Aucun débordement horizontal sur les viewports testés.
- Sur le site déployé, la molette déplace la vue 0 → 37 → 0 en mode C. Le mode A atteint la vue 119. Le retour vers C à cette position affiche la fiche contextuelle.
- Un défaut du premier test empêchait d’atteindre la dernière vue lorsque le plateau était plus petit que le viewport. Le plateau a été dimensionné à une hauteur minimale d’écran. La dernière vue est atteinte sur les deux profils après correction.
- Le défilement continu a produit deux états de vue intermédiaires ou finaux par passage, avec environ 1 016 ms entre callbacks rAF dans cette session, dans les deux modes. Ce chronomètre partagé ne valide pas une cadence interactive utilisable sur un téléphone. L’arrêt et la réversibilité sont observés. Le débit à cadence d’affichage normale, les gestes tactiles réels et Safari iOS restent ouverts.
- La préférence de mouvement réduit suspend le pilotage passif dans le code et garde le contrôle manuel visible. Le réglage système n’a pas été exécuté pendant ce benchmark.

## Conditions de validation d’une prochaine prise

Conserver les trois preuves séparées. Premier volet, inspecter le fichier source et sa provenance. Deuxième volet, contrôler les plans et le détail sans interface et en arrière. Troisième volet, mesurer rendu des vues, réseau à froid, mémoire du navigateur et geste tactile sur iOS et Android. Valider le seuil artistique seulement après comparaison de la prise avec les références.
