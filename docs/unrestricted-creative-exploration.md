# FABRYA — Unrestricted Creative Exploration

## Audit de la convergence

Le 19 novembre 2026, cinq briefs indépendants ont alimenté le réalisateur du commit `a5acb6a` via GPT-6.1 Sol. L'audit porte sur les cinq dossiers et les onze requêtes de leur archive de provenance, dont la reprise après troncature de la serrurerie. Le point de départ Git a été vérifié sur le dépôt distant. La branche `fix/director-reliability` pointe sur `a5acb6a`, dans la continuité de `77cee16` sur la branche expérimentale du réalisateur. Le correctif part de cette branche de travail.

### Instructions réellement envoyées

| Source | Extrait ou élément vérifié | Effet plausible et preuve |
|---|---|---|
| Les cinq requêtes d’idéation | « Propose exactement trois directions dont le phénomène observable et ce que le visiteur découvre diffèrent vraiment. » | Le nombre fixe et l’absence de comparaison avant le développement pouvaient faire traiter trois réponses comme une exploration aboutie. Le schéma imposait les mêmes axes `entry`, `transformation`, `discovery` à toutes les pistes. |
| Les cinq requêtes d’idéation | « Relie chaque découverte à un intérêt métier et explique sa limite. Réponse en français, une phrase courte par champ » | La compression laissait peu de place au rapport au temps, au pouvoir d’agir et à la causalité. Demander une « limite » au premier passage pouvait susciter une autocensure. Le champ ne demandait pas explicitement un coût ni un moyen de production. |
| Les cinq requêtes de dossier | « Choisis la direction la plus singulière et pertinente », puis « Ouvre le dossier par son titre suivi des sections A à L ». | Un seul appel choisissait et développait le concept. Le choix n’avait aucun identifiant obligatoire et l’API ne pouvait pas exiger une autre exploration. La rédaction pouvait renommer, combiner ou remplacer un mécanisme en cours de mise en scène. |
| Les cinq requêtes de dossier | Section B, « ce qui est volontairement caché ». Section C, « ce qui se révèle ». Section D, « découverte, transition ». Section G, « ancrage fixe, révélation ». | L’accumulation favorisait une même lecture du scroll, de l’information cachée vers l’information visible. Le contrôle bidirectionnel et les arrêts étaient une exigence d’interaction légitime. Leur association répétée aux injonctions de dévoilement pouvait encourager une animation facilement réversible. |
| Les cinq requêtes de dossier | « La vision reste libre des contraintes du moteur actuel », puis J et K demandent le plan et les prompts de production. | Le registre réel des routes, les tarifs et les inventaires étaient absents de ces requêtes. Anticiper fabrication et raccords restait possible au moment de la sélection puisque tout le document était produit dans le même appel. Cette influence est plausible, sans preuve causale isolée. |
| Les cinq requêtes d’idéation et les cinq requêtes de dossier | L’idéation reçoit `brief` et `rule`. La rédaction reçoit aussi `ideation_du_meme_brief`. La reprise reçoit uniquement des passages de son propre dossier. | Aucun historique partagé, exemple artistique, consigne explicite de minimalisme, mouvement de caméra obligatoire ou modification de température dans les requêtes. Les comportements récurrents ne démontrent aucune fuite de projet ni un effet causal propre au modèle ou au niveau de raisonnement. |

La serrurerie et les quatre autres dossiers ont des instructions de rédaction différentes. La seconde variante ajoute une cible d’environ 3 200 mots et des priorités de détail pour limiter les troncatures. La convergence est présente dans les deux variantes. Les cinq idéations partagent le préfixe d’empreinte SHA-256 `5f21890ff786f6ff`. Les préfixes des instructions de dossier sont `0b0f5f56334f277a` pour la serrurerie et `136f4ab1a74af6ce` pour les quatre autres. Le registre des appels de l’archive conserve les SHA-256 intégraux des fichiers.

### Ce que montrent les dossiers

| Dossier | Mécanisme observé dans le premier geste | Indice de convergence ou de différence |
|---|---|---|
| Serrurerie — *La ligne juste* | « Deux arêtes jusque-là superposées se séparent dans la perspective. » | Le visiteur gagne un angle et identifie un joint. La piste retenue parlait d’abord d’écarts géométriques et de friction. Le dossier ajoute le filet lumineux comme dispositif d’ouverture. |
| Tatouage — *Les constellations d’atelier* | « Le premier geste produit un recul » et deux autres photographies se dégagent. | Le recul et l’occlusion restent proches d’un dévoilement, mais la découverte finale est une relation entre création, corpus et artiste. Le raisonnement privilégie ici une preuve réelle de portfolio. |
| Garage automobile — *La coupe juste* | « Elle écarte deux représentations de sa surface, comme deux pages rigides. » | La piste de la matière comme archive devient une ouverture lumineuse dévoilant des pièces. Le dossier retient la piste « pour son potentiel photographique », puis l’élargit en rédaction. |
| Écouteurs Bluetooth — *L’intervalle* | « Le premier geste fait d’abord glisser les bords des parois vers l’extérieur. » | Le dossier écarte la transparence non documentée, puis remplace cette idée par une ouverture qui retire physiquement un masque. La prudence factuelle est motivée. Le choix d’un motif visuel voisin est une décision de mise en scène. |
| Immobilier — *Le Seuil déplié* | « La mince bande colorée s’élargit jusqu’à révéler une photographie réelle de propriété ». | Le dossier invoque la piste de comparaison mais substitue des panneaux articulés au système initial de rapprochement par caractéristiques. L’ouverture et le déploiement des surfaces reprennent le procédé de révélation. |

Le rapport causal le plus récurrent est **geste → changement d’occlusion ou de perspective → contenu déjà présent enfin visible**. Le relevé distingue ce procédé d’un mécanisme complet. Ainsi, le tatouage organise l’attribution des œuvres et l’immobilier conduit à une visite contextualisée. La répétition est particulièrement forte entre les ouvertures serrurerie, garage et écouteurs. Elle ne tient pas au seul terme « lumière ».

### Limites présentes dans le moteur de référence

Ces limites appartiennent au parcours de conception exécutable du dépôt. Elles n’ont pas toutes été envoyées dans les cinq dossiers rédigés sur papier.

- `reliability.develop` construisait le registre des solutions et pouvait rejeter le brief faute d’option avant même l’appel d’idéation.
- `STAGE` demandait au même appel de choisir l’idée et de réaliser une option du registre, dans un cadrage mobile partagé, avec « Un à trois plans si le récit et le budget le justifient. »
- `JUDGE` mélangeait « la promesse, la singularité, la découverte, l’émotion, l’utilité, le scroll, la faisabilité et le coût » dans l’évaluation. Le compilateur contrôlait aussi le contrat du lecteur et un filtre historique de ressemblance lexicale. Ces contrôles restent utiles à l’exécution, mais ils n’apprécient pas séparément l’ambition artistique.
- L’architecture antérieure protégeait déjà l’idéation contre l’historique. Le problème identifié ici est la procédure de divergence et de choix, puis le couplage de l’ambition avec les critères de livraison. L’audit est observationnel, sans attribution causale à une phrase unique.

## Nouveau mode

`python3 -m cinema_factory explore` utilise le même adaptateur modèle et les mêmes contrôles financiers. Il produit une vision de développement et une stratégie descriptive. Le nombre de pistes dépend du brief, avec un minimum de deux pour permettre une comparaison. Le mode ne reprend aucun effet en exemple.

| Phase | Données transmises | Décision conservée |
|---|---|---|
| Explorateur | Brief courant, instruction de rôle. Le passage éventuel de divergence reçoit encore exclusivement le brief, avec une instruction générale de réexploration. | Pistes et causalité, sans storyboard, cotes, prix ni routes. |
| Directeur artistique | Pistes courantes et, sur demande, profils de mécanismes historiques. | Groupes justifiés, répétitions historiques, choix identifié et motif. La partition doit contenir chaque piste une fois. |
| Réalisateur | Brief et piste retenue. | Mise en scène idéale, fiction déclarée, faits confirmés et invariants. La vision est écrite avant l’inventaire. |
| Critique artistique | Brief, piste et vision. | Pertinence, cohérence, accessibilité et allégations client à corriger. Une allégation non étayée suspend l’ingénierie et laisse la vision et la critique sur disque. |
| Ingénieur de production | Vision, capacités et routes déclarées, droits et budget hypothétique éventuel. | Stratégie séparée, capacités requises, hypothèses et écarts éventuels. |

Une convergence provoque au plus une exploration de plus et une nouvelle sélection, soit cinq appels en situation courante, sept si la divergence est déclenchée. Une convergence persistante est signalée. Les groupes comparent causalité et rôle du visiteur, sans dictionnaire de mots interdits. La répétition d’un procédé est acceptable si sa fonction narrative change ou si sa contribution particulière à la marque est justifiée. Le modèle doit pouvoir retenir une idée exigeante même sans route disponible.

`vision-artistique-ideale.json` est rédigé avant la critique et l’ingénierie. Il reste lisible même si ces phases rencontrent une erreur. `strategie-de-production.json` référence son SHA-256 et ne peut ni modifier sa vision ni déclencher de fabrication. Les compromis restent des options explicites. Les contrôles de droit passent par l’inventaire déclaré et les règles de publication existantes. Les clés, URLs de destination et chemins locaux des médias n’entrent pas dans les requêtes. Les requêtes et réponses de phase, les empreintes et le registre de coûts sont traçables dans le répertoire de sortie. Ces fichiers incluent les données du brief et doivent rester hors du dépôt de code.

### Exécution

```sh
python3 -m cinema_factory explore brief.md --out /tmp/fabrya-exploration \
  --budget-microusd "$FABRYA_TEXT_BUDGET" --funds verified-funds.json
```

`--history` accepte une vision idéale produite par ce mode. Seuls les champs causaux du concept sont transmis à la sélection, sous un identifiant de comparaison. Utiliser des fichiers approuvés dont les profils n’incluent pas d’informations confidentielles. Les dossiers précédents restent les pièces du diagnostic et ne servent pas d’exemples d’idéation. `--production-cap-microusd` exprime une hypothèse de production exclusivement pour l’ingénieur. `--no-divergence` borne le mode au premier passage si le budget le requiert. L’option `--local-url` accepte uniquement un serveur de texte en boucle locale.

Le parcours historique `design/run` continue à compiler et valider les plans compatibles avec le lecteur. `explore` est le parcours de développement libre, distinct de la fabrication. Passer d’une vision libre à un plan exécutable fidèle n’est pas encore automatisé. La comparaison entre projets dépend de profils historiques explicitement fournis. Le classement sémantique reste un jugement du modèle et peut se tromper. La critique factuelle en langage naturel ne garantit pas l’absence de toutes les assertions implicites.

## Vérification du correctif

Les tests ciblés du mode libre inspectent les requêtes, vérifient le passage de divergence, refusent une partition incorrecte, contrôlent l’absence de contamination et vérifient que l’empreinte de la vision reste identique malgré une capacité manquante. Ils couvrent également une allégation client insuffisamment étayée et l’entrée utilisée par le CLI. Les tests existants du réalisateur et de sa couche de fiabilité ont été relancés pour contrôler les interfaces conservées.

Les quatre vérifications ciblées et les 38 tests existants des modules réalisateur et fiabilité passent. Deux appels de texte local à Qwen2.5 7B quantifié ont testé uniquement la sélection, avec le même cas abstrait. Les deux ont regroupé `idea-1` et `idea-2` (un contenu présent est rendu visible par la diminution d'une occlusion) et isolé `idea-3` (une décision change un résultat visible), malgré un vocabulaire d'ouverture partagé par `idea-1` et `idea-3`.

Le premier appel a demandé une nouvelle divergence en proposant comme manque un mécanisme déjà présent. L’instruction de sélection impose désormais un motif comparatif pour le choix et la description d’une lacune réelle avant de demander une divergence. Sur le second appel, la partition reste la même, le choix `idea-1` est motivé au regard du meilleur autre groupe et la nouvelle divergence est écartée. Le modèle local a préféré le dévoilement dans ce cas et a présenté celui-ci comme plus central que ne l’établissait le bref énoncé. La preuve est donc la distinction sémantique et la séparation des critères, avec une limite de jugement artistique toujours observable.

Empreinte SHA-256 de la requête de phase finale `ff158287d30632a9874207904287df4eaeb7722bdb56da875cc95204f317a74d`. Empreinte de la réponse structurée `60dcd03904eaac26d8ffaa4ea87470796019790ac6a2faa0d58d08e3f31ae69c`. Ce cas n'a produit aucun dossier complet. Le modèle OpenAI configuré pour la production n'a pas été sollicité pendant ce correctif.

Aucune génération d’image, de vidéo, de site ou de dossier commercial. Aucun appel OpenAI ni dépense fournisseur pendant ce correctif.
