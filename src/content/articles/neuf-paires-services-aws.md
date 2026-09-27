---
titre: "Neuf paires de services AWS qu'on confond — et la question qui tranche"
resume: "Deux services AWS qui semblent faire la même chose se séparent presque toujours sur une seule question. Neuf paires, neuf questions, et ce que le mauvais choix coûte une fois en exploitation."
pilier: cloud
date: 2026-09-24
tags: ["aws", "cloud", "architecture", "coût", "réseau"]
repo: null
---

La confusion autour des services AWS n'est pas un problème de mémoire. Elle vient de ce que
les noms décrivent une **technologie**, jamais une **décision**. « Elastic Container
Service » et « Elastic Kubernetes Service » se ressemblent parce qu'ils font effectivement
la même chose : faire tourner des conteneurs. Ce qui les sépare n'est pas dans le nom.

L'outil utile n'est donc pas un tableau comparatif de plus — il en existe des centaines, et
personne ne les retient. C'est **une question par paire**, dont la réponse tranche. Voici
les neuf que j'utilise, et surtout ce que le mauvais choix coûte une fois en production,
parce que c'est là que la différence cesse d'être théorique.

Ce n'est pas un relevé de terrain : c'est une grille de décision, sans dépôt associé.

| | Paire | La question qui tranche |
|---|---|---|
| 01 | EC2 / Lambda | Qui exploite le serveur ? |
| 02 | ECS / EKS | Avez-vous besoin de Kubernetes ? |
| 03 | S3 / EBS | Des objets, ou un disque ? |
| 04 | RDS / DynamoDB | Comment allez-vous l'interroger ? |
| 05 | CloudFormation / Terraform | Un seul fournisseur, ou plusieurs ? |
| 06 | SageMaker / Bedrock | Entraîner un modèle, ou en appeler un ? |
| 07 | CloudWatch / CloudTrail | Comment ça se comporte, ou qui a fait quoi ? |
| 08 | SNS / SQS | Diffuser à plusieurs, ou mettre en file ? |
| 09 | Security Group / NACL | À état, ou sans état ? |

## 01 — EC2 / Lambda : qui exploite le serveur ?

Avec EC2, la machine est à vous : le système, les correctifs, le dimensionnement, la
surveillance. Avec Lambda, AWS exploite l'exécution ; vous ne fournissez qu'une fonction et
vous payez à l'invocation.

**Ce que ça change en exploitation.** Une instance EC2 facture quand elle ne fait rien. Une
fonction Lambda ne facture rien au repos, mais elle plafonne à quinze minutes d'exécution,
démarre à froid, et déplace votre charge d'exploitation ailleurs : limites de concurrence,
traçage distribué, gestion des relances.

Le vrai discriminant n'est ni la mode ni le prix affiché, c'est le **cycle d'utilisation**.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 290" role="img" aria-labelledby="fig-cycle">
<title id="fig-cycle">Au-delà d'un certain taux d'occupation, une instance permanente redevient moins chère que la facturation à l'invocation.</title>
<g class="viz-grille"><path d="M70 230h490M70 178h490M70 126h490M70 74h490M70 24h490"/></g>
<g class="viz-repere"><path d="M70 24v206M70 230h490"/></g>
<g class="c2">
<path class="viz-ligne" stroke="currentColor" d="M70 118L560 104"/>
</g>
<g class="c1">
<path class="viz-ligne" stroke="currentColor" d="M70 228L560 38"/>
</g>
<g class="viz-repere"><path d="M376 109v121"/></g>
<circle cx="376" cy="109" r="4" class="viz-point" fill="var(--texte)"/>
<text x="568" y="108" class="viz-fort">EC2</text>
<text x="568" y="42" class="viz-fort">Lambda</text>
<text x="376" y="250" text-anchor="middle">point de bascule</text>
<g class="viz-tick">
<text x="70" y="248" text-anchor="middle">0 %</text>
<text x="560" y="248" text-anchor="middle">100 %</text>
</g>
<text x="315" y="278" text-anchor="middle" class="viz-cle">Part du temps où la charge tourne réellement</text>
<text x="18" y="127" text-anchor="middle" class="viz-cle" transform="rotate(-90 18 127)">Coût mensuel</text>
</svg>
</div>
<ul class="legende-viz">
<li class="c2"><i></i><span>EC2 — une instance qui tourne en permanence</span></li>
<li class="c1"><i></i><span>Lambda — facturé à l'invocation</span></li>
</ul>
<figcaption>
Schéma de raisonnement, pas un relevé : l'échelle est relative et le point de bascule dépend
de votre charge, de votre région et de votre dimensionnement. Ce qui est vrai partout, c'est
la forme — une droite quasi plate contre une droite qui part de zéro. Sous un certain taux
d'occupation, payer à l'usage gagne ; au-dessus, l'instance permanente reprend l'avantage.
</figcaption>
</figure>

C'est exactement la même courbe qui décide, plus bas, entre SageMaker et Bedrock. Deux
paires sur neuf se réduisent à cette seule question.

## 02 — ECS / EKS : avez-vous besoin de Kubernetes ?

Les deux orchestrent des conteneurs. ECS est l'ordonnanceur d'AWS : peu de concepts,
intégration native avec IAM, les répartiteurs de charge et CloudWatch. EKS est un
Kubernetes géré : portable, immense écosystème, et toutes les notions qui vont avec.

**Ce que ça change en exploitation.** EKS ajoute une surface d'astreinte entière —
montées de version du cluster, greffons, définitions de ressources personnalisées — et son
plan de contrôle est facturé à l'heure, qu'il travaille ou non. ECS supprime cette couche.

La question n'est donc pas « lequel est le meilleur » mais **avez-vous déjà les compétences
Kubernetes, ou un besoin réel de portabilité ?** Si la réponse est non deux fois, EKS vous
fait payer un écosystème que vous n'utiliserez pas.

Au passage, une confusion fréquente : **Fargate n'est pas un concurrent des deux**. C'est un
mode d'exécution disponible pour ECS *comme* pour EKS, dans lequel vous ne gérez plus les
instances sous-jacentes. La question « ECS ou EKS » et la question « Fargate ou pas » sont
indépendantes.

## 03 — S3 / EBS : des objets, ou un disque ?

S3 est un stockage d'objets : on y accède par une API HTTP, il n'y a pas de système de
fichiers, la capacité est pratiquement illimitée et la durabilité annoncée est de onze
neuf. EBS est un volume bloc attaché à une instance : il se comporte comme un disque, il a
des caractéristiques d'IOPS, et on le formate.

**Ce que ça change en exploitation.** Le piège n'est pas l'API, c'est la portée. **Un volume
EBS vit dans une seule zone de disponibilité.** Il disparaît avec elle. S3 est régional.
C'est la différence qu'on découvre le jour d'une panne de zone, pas le jour du choix.

Et non, on ne monte pas S3 comme un système de fichiers POSIX pour s'épargner la question :
c'est le rôle d'EFS, qui est un troisième service, avec un troisième modèle de coût.

## 04 — RDS / DynamoDB : comment allez-vous l'interroger ?

RDS gère des moteurs relationnels — PostgreSQL, MySQL et les autres. SQL, jointures,
requêtes que vous n'aviez pas prévues. DynamoDB est un magasin clé-valeur géré, à la
latence de quelques millisecondes annoncée, qui monte en charge horizontalement.

**Ce que ça change en exploitation.** Avec DynamoDB, les **schémas d'accès se conçoivent
avant** d'écrire la première ligne. Une question métier imprévue six mois plus tard se paie
en index secondaire, voire en refonte de table. Avec RDS, la même question se paie en une
requête un peu lente.

Formulé autrement : DynamoDB échange la souplesse d'interrogation contre une montée en
charge que RDS ne sait pas faire aussi bien. Si vous ne savez pas encore quelles questions
vous poserez à vos données, vous n'êtes pas prêt pour DynamoDB.

## 05 — CloudFormation / Terraform : un seul fournisseur, ou plusieurs ?

C'est la paire où l'argument affiché est presque toujours le mauvais.

**Ce que ça change en exploitation.** La différence structurante n'est pas le multi-cloud,
c'est **le fichier d'état**. CloudFormation n'en a pas : AWS conserve l'état des piles, il
n'y a rien à sauvegarder, rien à verrouiller, rien à perdre. Terraform maintient un état
que vous devez stocker, verrouiller et protéger — historiquement un compartiment S3 plus un
verrou. Cet état devient un actif critique, avec ses sauvegardes et ses droits d'accès.

Et la vraie raison de choisir Terraform est rarement « nous sommes multi-cloud » — très peu
d'organisations le sont réellement. C'est l'écosystème de fournisseurs : GitHub, Datadog,
Cloudflare, votre fournisseur d'identité. Vous décrivez tout votre système, pas seulement
la partie AWS. C'est un argument bien plus solide que celui du second cloud.

## 06 — SageMaker / Bedrock : entraîner un modèle, ou en appeler un ?

SageMaker est une plateforme pour construire, entraîner, ajuster et déployer **vos** modèles.
Bedrock donne accès par API à des modèles de fondation déjà entraînés.

**Ce que ça change en exploitation.** Un point de terminaison SageMaker, c'est une instance :
elle facture tant qu'elle est provisionnée, y compris la nuit et le week-end. Bedrock
facture à l'appel.

Vous reconnaissez la courbe de la première figure. C'est la même décision, déplacée d'un
étage : est-ce que la charge justifie une capacité permanente ?

## 07 — CloudWatch / CloudTrail : comment ça se comporte, ou qui a fait quoi ?

CloudWatch collecte des métriques, des journaux et déclenche des alarmes : le
**comportement** de vos systèmes. CloudTrail enregistre les appels d'API adressés à AWS :
**qui** a fait quoi, quand, depuis quelle identité.

**Ce que ça change en exploitation.** Pendant un incident, vous avez besoin des deux, pour
deux questions différentes :

- « Pourquoi la latence a doublé à 3 h ? » → CloudWatch.
- « Qui a supprimé ce groupe de sécurité à 3 h ? » → CloudTrail.

Deux pièges classiques. CloudTrail **n'est pas** le journal de votre application : il ne voit
que le plan de contrôle AWS. Et comme CloudTrail peut être livré *dans* CloudWatch Logs, on
finit par croire qu'il s'agit du même produit — ce sont deux sources distinctes qui se
croisent dans le même endroit de stockage.

## 08 — SNS / SQS : diffuser à plusieurs, ou mettre en file ?

SNS est un mécanisme de publication-abonnement : un message part vers tous les abonnés, en
mode poussé. SQS est une file : les messages attendent qu'un consommateur vienne les
chercher, et survivent en attendant.

**Ce que ça change en exploitation.** SQS vous donne un **tampon** : absorption des pointes,
relances, file de rebut pour ce qui échoue. SNS n'en a pas — si un abonné est indisponible,
le message est perdu au terme des tentatives.

Et surtout, la question est mal posée, parce que ces deux services **ne s'opposent pas**.
Le motif standard les combine :

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 196" role="img" aria-labelledby="fig-fanout">
<title id="fig-fanout">SNS diffuse vers plusieurs files SQS, chaque consommateur disposant de son propre tampon.</title>
<g class="c2" fill="currentColor" stroke="currentColor">
<rect x="8" y="70" width="128" height="52" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="72" y="92" text-anchor="middle" class="viz-fort">SNS</text>
<text x="72" y="109" text-anchor="middle">un sujet</text>
<g class="viz-repere" stroke-linecap="round">
<path d="M140 96C170 96 170 36 200 36"/>
<path d="M140 96h60"/>
<path d="M140 96C170 96 170 156 200 156"/>
</g>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="206" y="14" width="130" height="44" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="206" y="74" width="130" height="44" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="206" y="134" width="130" height="44" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="271" y="42" text-anchor="middle" class="viz-fort">SQS — facturation</text>
<text x="271" y="102" text-anchor="middle" class="viz-fort">SQS — recherche</text>
<text x="271" y="162" text-anchor="middle" class="viz-fort">SQS — analytique</text>
<g class="viz-repere" stroke-linecap="round">
<path d="M340 36h52"/><path d="M386 32l5 4-5 4"/>
<path d="M340 96h52"/><path d="M386 92l5 4-5 4"/>
<path d="M340 156h52"/><path d="M386 152l5 4-5 4"/>
</g>
<text x="400" y="14" class="viz-cle">Consommateurs</text>
<text x="400" y="41">lent — le tampon absorbe</text>
<text x="400" y="101">rapide</text>
<text x="400" y="161">en panne — rien n'est perdu</text>
</svg>
</div>
<figcaption>
Le motif de diffusion avec tampon : SNS répartit, chaque file SQS amortit. Un consommateur
indisponible ne fait perdre aucun message et n'affecte pas les deux autres — ce qu'un
abonnement SNS direct ne permet pas.
</figcaption>
</figure>

## 09 — Security Group / NACL : à état, ou sans état ?

Un groupe de sécurité s'attache à une ressource et **tient l'état des connexions** : si vous
autorisez une requête entrante, la réponse repart automatiquement. Il n'accepte que des
règles d'autorisation. Une liste de contrôle d'accès réseau s'attache à un sous-réseau, elle
est **sans état**, elle est évaluée dans l'ordre des numéros de règle, et elle sait refuser
explicitement.

**Ce que ça change en exploitation.** C'est le bug de 3 h du matin le plus classique d'AWS :

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 208" role="img" aria-labelledby="fig-etat">
<title id="fig-etat">Un groupe de sécurité laisse repartir la réponse automatiquement ; une NACL exige une règle sortante explicite.</title>
<text class="viz-cle" x="8" y="14">Groupe de sécurité — à état</text>
<g class="viz-repere"><rect x="8" y="26" width="290" height="120" rx="8" fill="none"/></g>
<g class="c-bon" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round">
<path d="M14 52h100"/><path d="M108 48l6 4-6 4"/>
<path d="M114 120H14"/><path d="M20 116l-6 4 6 4"/>
</g>
<text x="124" y="56">:443 entrant — autorisé</text>
<text x="124" y="124">réponse — repart d’office</text>
<text x="8" y="176" class="viz-fort">Une règle suffit.</text>
<text class="viz-cle" x="342" y="14">Liste de contrôle réseau — sans état</text>
<g class="viz-repere"><rect x="342" y="26" width="290" height="120" rx="8" fill="none"/></g>
<g class="c-bon" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round">
<path d="M348 52h100"/><path d="M442 48l6 4-6 4"/>
</g>
<g class="c-critique" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round">
<path d="M448 120H348"/><path d="M354 116l-6 4 6 4"/>
<path d="M392 112l16 16M408 112l-16 16"/>
</g>
<text x="458" y="56">:443 entrant — autorisé</text>
<text x="458" y="124">réponse — bloquée</text>
<text x="342" y="176" class="viz-fort">Il faut une seconde règle, sortante,</text>
<text x="342" y="194" class="viz-fort">sur les ports éphémères.</text>
</svg>
</div>
<figcaption>
La cause d'incident : une NACL qui autorise l'entrée mais pas le retour. La réponse d'un
serveur part depuis un port éphémère — la plage haute attribuée à la connexion — et une
liste sans état la refuse tant qu'aucune règle sortante ne la couvre.
</figcaption>
</figure>

En pratique : gérez vos autorisations avec les groupes de sécurité, et ne descendez aux
listes de contrôle réseau que lorsque vous avez besoin d'un **refus explicite** — bloquer
une plage d'adresses, par exemple. C'est la seule chose qu'un groupe de sécurité ne sait pas
exprimer.

## Ce que je retiens

**Le nom du service ne contient jamais la décision.** « Elastic », « Simple », « Managed »
décrivent une technologie. La question qui tranche porte toujours sur autre chose : qui
exploite, quelle portée, quel cycle d'utilisation, quel modèle d'interrogation.

**Deux des neuf paires se réduisent à la même courbe.** EC2/Lambda et SageMaker/Bedrock
posent la question du taux d'occupation. Une fois qu'on a vu ça, on n'a plus deux décisions
à prendre mais une, appliquée deux fois.

**Les pires surprises sont des questions de portée, pas de fonctionnalité.** Un volume EBS
enfermé dans une zone, une NACL qui ne laisse pas repartir la réponse, un état Terraform
qu'on n'avait pas sauvegardé : aucune ne se voit sur une fiche produit.

Trois autres paires mériteraient le même traitement, et feront sans doute une suite :
Secrets Manager et Parameter Store, ALB et NLB, EFS et FSx.
