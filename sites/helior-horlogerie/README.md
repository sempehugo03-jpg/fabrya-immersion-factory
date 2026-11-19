# Hélior — site immersif horloger

Maison horlogère **fictive** créée comme démonstration FABRYA. Site statique (HTML/CSS/JS), sans build.

## Concept

Une montre 3D entièrement procédurale (three.js, aucune photo ni modèle importé) pilotée par la molette :
le défilement est lissé comme une couronne sous le pouce et fait avancer un seul plan-séquence.

| Chapitre | Ce que fait la molette |
| --- | --- |
| XII · Ouverture | La couronne tourne, les aiguilles avancent, la jauge de réserve de marche se remplit |
| I · La boîte | Rotation en profil, couronne crantée et carrure |
| II · Vue éclatée | Les neuf niveaux se séparent, étiquettes projetées depuis la 3D |
| III · Le cœur | Gros plan sur le balancier : le temps ralentit ×4 (balancier, ancre, roue d'échappement, spiral qui respire) |
| IV · Finitions | Côtes de Genève, perlage, vis bleuies, rochet soleillé |
| V · Cadrans | Trois cadrans dessinés en temps réel (bleu nuit soleillé, émail grand feu, ardoise guillochée) |
| VI · Rendez-vous | Remontage complet, retour à l'heure exacte, formulaire local |

Détails : petite seconde qui avance par huitièmes (28 800 alt/h), son d'échappement optionnel (bouton « Battement »),
parallaxe à la souris, `prefers-reduced-motion` respecté (aucun lissage, mouvement figé), repli lisible sans WebGL.

## Lancer en local

```bash
cd sites/helior-horlogerie
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Un serveur HTTP est nécessaire (modules ES). three.js r170 est embarqué dans `vendor/` (licence MIT).
Le formulaire ne transmet rien : brancher un service d'envoi avant toute mise en production.
