# Vérification du jalon · 19 novembre 2026

| Critère de validation | État observé |
| --- | --- |
| A · Concept autonome | Bloqué sur les deux briefs métier. Clé OpenAI absente |
| B · Choix autonome du fournisseur | Catalogue accessible et contrat implémenté. Aucun choix de modèle observé en exécution |
| C · Production de médias | Montage réel d'une prise historique. Génération IA fal et Runway non exécutée |
| D · Film et site automatisés | Vérifié sur le plan fourni « Au tour ». Montage de deux extraits supplémentaires vérifié à 1280 × 720, 96 images |
| E · Molette et toucher | Vérifié sur le prototype original et le nouvel assemblage, dans Chromium avec tactile émulé |
| F · Actions métier | Deux fiches ancrées et leurs deux raccourcis vérifiés. Le focus et l'image reviennent après fermeture. Destinations de production non exercées |
| G · Qualité | Définition, continuité du plan historique, cadrage et mesures de laboratoire vérifiés. Revue artistique autonome non exécutée pour un nouveau site |
| H · Coûts | Dépense fournisseur observée nulle. Simulation économique documentée. Coût d'un projet autonome et coût d'hébergement réels non mesurés |

## Deux essais sans storyboard

| Brief | Étape atteinte | Appels facturés | Résultat |
| --- | --- | ---: | --- |
| Maison Sillage, optique | Vérification du brief et inventaire | 0 | Arrêt avant conception, aucun secret OpenAI |
| Les Pages Retrouvées, reliure et restauration | Vérification du brief et inventaire | 0 | Arrêt avant conception, aucun secret OpenAI |

Les briefs de test contiennent uniquement le métier, les personnes visées et le but commercial. La production sera également bloquée sans média autorisé ou clé vidéo et budget utilisables. Chaque tentative a son journal et son relevé d'opérations.

## Preuve d'assemblage issue de « Au tour »

Master 3840 × 2160, huit secondes, 24 images/s, 192 images distinctes dans chaque paquet. La prise source UHD a été réencodée sans agrandissement ni interpolation. Visuellement, la pièce reste cohérente au centre et le geste des mains progresse durant la rotation. Le fond et le cadrage restent continus. Le repère passe devant le vase sur le format mobile. Le plan a une caméra fixe. Aucun raccord entre deux scènes n'est évalué artistiquement sur cette prise. Le contrôle de toutes les images n'a détecté ni gel d'au moins 0,55 s ni écran noir d'au moins 0,2 s avec les seuils du rapport.

| Mesure locale Chromium 156 | Desktop 1152 × 768 | Mobile 390 × 844 |
| --- | ---: | ---: |
| Geste → dessin, médiane | 48,8 ms | 61,6 ms |
| Geste → dessin, P95 | 63,6 ms | 109,2 ms |
| Geste → dessin, maximum | 93,1 ms | 199,4 ms |
| Demandes suivies d'un dessin | 37 / 37 | 89 / 89 |
| Premier canvas visible | 170 ms | 130 ms |
| Paquet transmis | 3,92 Mo | 1,93 Mo |
| Retour au départ | Empreinte de pixels identique | Empreinte de pixels identique |

Les essais couvrent les arrêts, les inversions, les interactions, la reprise, le clavier et le mouvement réduit. Rapport non bridé sur transport local et écran tactile émulé. Les temps de présentation sont mesurés au dessin sur canvas. L'assemblage du master a pris 28,46 s, l'encodage 16,80 s et la QA navigateur 30,22 s sur le runner du test. Les journaux bruts accompagnent les vidéos. Les 12 tests unitaires sont passés.

## Git

Le commit de départ est vérifié dans le bundle historique. GitHub ne connaît pas cet objet sur le dépôt distant et le transport Git n'a pas d'identifiants d'écriture dans cet environnement. Le bundle de livraison contient le commit et ses ancêtres, directement importables dans le dépôt existant avec `git fetch /chemin/vers/fabrya-autonomous-cinema.git.bundle experiment/autonomous-cinema:experiment/autonomous-cinema`.
