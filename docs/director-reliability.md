# Fiabilité du réalisateur cinématographique

## Audit du contexte

Le commit `ca7cc67` envoyait `history=history` dans le message de conception. La liste contenait les champs `name`, `entry` et `discovery` des concepts historiques, dont La Traverse. Le journal du test Sillon Mémoire conserve quatre idées de transmission et de pignons pour un brief de restauration sonore. La réutilisation est constatée. Le chemin d'entrée est démontré par le code. Aucun test d'ablation contrôlé sur le même modèle et la même graine n'établit à lui seul la causalité.

Le commit `653f5a1` écarte déjà ces descriptions du message. Ce correctif resserre la frontière. L'idéation reçoit uniquement le brief courant et une instruction générale sans exemple de métier. La mise en scène reçoit les décisions de cette idéation, les ressources autorisées, les routes vérifiées, les destinations et le retour du même dossier. L'évaluation séparée reçoit la proposition courante et le coût calculé. Les plans historiques servent à la comparaison locale après l'inférence. Le registre garde les empreintes des historiques utilisés, du brief, des actifs et des requêtes par étape. Les réponses, décisions et rejets sont conservés avec les journaux.

Les appels locaux créent deux messages neufs. Les appels OpenAI envoient une unique entrée utilisateur, avec `store: false`, sans ID de réponse précédente ni outil de récupération. Le runtime peut réutiliser des jetons d'un préfixe identique et le journal conserve les métriques retournées. Le code ne réutilise aucun objet de conversation, réponse cachée, précédent Blueprint ou document récupéré. Les seules constantes globales sont les instructions, schémas et paramètres invariants. Le test d'isolation couvre deux projets successifs et un historique contenant une sentinelle.

## Décisions et contraintes

1. L'idéation propose trois logiques visuelles. Chaque candidate identifie un point d'entrée, un changement observable, une découverte, une valeur et des limites.
2. La mise en scène choisit la candidate par ID, un ou plusieurs plans, une identité visuelle persistante et les états d'entrée et d'arrivée. Chaque coupe réutilise formellement l'état de sortie précédent. L'évaluation examine le sens de ces états et détecte les contradictions décrites.
3. Le compilateur applique le registre de production. Un choix de route lie durée, définition et média client. Une route textuelle impose un champ de référence vide dans le schéma. Une route image impose une étape déclarée avant la vidéo. Les actifs client sont vérifiés avant acceptation.
4. Le recadrage mobile utilise l'enveloppe des sujets déclarés au début et à la fin de chaque plan, sans modifier le lecteur. Le recadrage réel d'un film doit encore être évalué sur ses images.
5. Un appel indépendant examine les trois paires de concepts, la pertinence et les décisions de mise en scène. Le chevauchement lexical couvre les répétitions manifestes. Le jugement séparé couvre le mécanisme de découverte. Un désaccord purement artistique peut être une réserve. Une répétition, une contradiction ou une promesse inventée bloque.
6. Une correction structurelle conserve l'idéation et le choix du même dossier. Un rejet de la direction artistique peut autoriser une nouvelle idéation dans la limite configurée.

La vérification d'un texte ne prouve pas la continuité physique du résultat ni sa qualité artistique. Un seul modèle local peut remplir les deux rôles via des appels et des contextes distincts. Des erreurs corrélées restent possibles. Les offres et l'orchestrateur OpenAI utilisent toujours les protections financières existantes.

## Contrats fournisseur

Le compilateur maintient l'enveloppe du lecteur à 24 secondes et le master horizontal. Kling v4 y accepte 720p ou 1080p, de 3 à 24 secondes. Le fournisseur annonce jusqu'à 30 secondes. Le mode image fourni par FABRYA transmet l'image initiale HTTPS. Runway Gen-4.5 accepte une requête texte de 2 à 10 secondes en 1280:720 et 1 000 unités UTF-16. Les références numérotées sans liaison réelle sont refusées. Les paramètres sont contrôlés avant de réserver un appel et à nouveau à la construction du payload.

[Kling texte](https://fal.ai/models/kling/v4/text-to-video) · [Kling image](https://fal.ai/models/kling/v4/image-to-video/api) · [Runway](https://docs.dev.runwayml.com/api/)

## Contrôle des preuves

Chaque image provient d'un indice exact du master 24 i/s. Les deux cadrages sont extraits au même indice et documentés par plan, temps relatif, profil et empreinte. Le contrôle refuse une capture manquante, modifiée, dupliquée ou attachée à la mauvaise position. Le navigateur vérifie la visibilité du canvas, le chargement, les gestes, le retour, les actions et le débordement horizontal.

Une mesure du sujet marquée comme fiable indique son rectangle, sa visibilité et l'empreinte du master. Sa projection dans le cadrage et l'occlusion déclarée sont vérifiées avant tout appel artistique. Un défaut mesuré reste prioritaire. Sans mesure fiable, la visibilité dépend de l'observation des images. Le modèle doit citer des captures précises et comparer les deux cadrages au même indice pour valider la composition. Ce dispositif ne comporte pas de suivi d'objet automatique et n'observe pas toutes les images.

La Traverse contient une mesure manuelle de référence à l'image 105. Sa projection rejette le cadre mobile. Cet exemple constitue un contrôle réel d'un défaut connu, distinct des cas synthétiques des tests.

## Reproduction

```sh
python3 -m unittest discover -s tests -v
python3 scripts/benchmark-director.py --suite reliability --url http://127.0.0.1:18786 \
  --model qwen2.5-7b-instruct-q4 --jobs 2 --corrections 1 --out /tmp/fabrya-reliability
python3 -m cinema_factory inspect /chemin/La-Traverse-master-1080p.mp4 \
  --plan docs/essais/la-traverse/plan.json \
  --observations docs/essais/reliability/la-traverse-observations.json \
  --out /tmp/fabrya-la-traverse-inspection
```

Le benchmark charge six briefs bruts issus de secteurs distincts. Le jeu est figé avant le premier passage. Il inclut un brief d'une ligne, un brief aux informations limitées, des prestations multiples et une contrainte de confidentialité. Le seuil est cinq dossiers acceptés. Le mode local utilise seulement l'interface loopback du modèle et ne soumet aucune génération vidéo.

La suite `reliability-holdout` contient deux briefs de réserve. Elle utilise les mêmes contrôles et conserve des résultats distincts du seuil principal de cinq sur six.
