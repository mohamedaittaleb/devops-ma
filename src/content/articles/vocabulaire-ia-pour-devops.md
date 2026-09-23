---
titre: "Le carnet d'un DevOps qui apprend le vocabulaire de l'IA"
resume: "Un essai : ces mots, je les entends tous les jours et je les comprends à peu près. Les fixer pour de bon — ce que je croyais avant de regarder de près, et ce qu'ils désignent réellement."
pilier: ai-devops
date: 2026-09-23
tags: ["essai", "vocabulaire", "llm", "rag", "agents", "évaluation"]
repo: null
---

Ces mots, je les entends tous les jours. Jetons, fenêtre de contexte, RAG, appel d'outil,
évaluation. Ils circulent dans les réunions, dans les canaux d'équipe, dans les demandes
d'accès qui finissent sur mon bureau. Je les reconnais tous et je vois à peu près de quoi
il s'agit — et c'est exactement le problème. « À peu près » suffit pour hocher la tête au
bon moment. Pas pour poser la question qui ferait apparaître l'ennui deux mois plus tôt.

Ce texte est ma tentative de les fixer une bonne fois. Ce n'est pas un cours
d'apprentissage automatique, et je n'ai pas la compétence pour l'écrire. C'est la liste des
concepts qu'un DevOps doit s'approprier pour **suivre une conversation, poser la bonne
question et reconnaître une mauvaise réponse**. J'y note aussi ce que je croyais avant de
regarder de près : un malentendu qu'on a nommé se retient mieux qu'une définition.

## Le jeton, et pourquoi je le comptais mal

Le jeton — *token* — est l'unité réelle de tout : de la facturation, des limites, de la
latence. Ce n'est ni un mot ni un caractère, mais un fragment statistique issu du
découpage appris par le modèle. En anglais, environ quatre caractères. En français,
sensiblement moins efficace, parce que les découpeurs sont entraînés majoritairement sur
de l'anglais. En arabe, nettement moins encore.

Ce détail n'est pas cosmétique. Quand je raisonnais en pages ou en lignes, je me trompais
d'un facteur deux ou trois sur du contenu francophone. Un document de 10 000 mots en
français ne coûte pas ce qu'il coûterait en anglais, et personne ne m'avait prévenu.

**Ce que je croyais :** un jeton, c'est à peu près un mot.
**Ce que c'est :** une unité de découpage dont le rendement dépend de la langue — et ma
langue de travail est une des moins bien servies.

## Le modèle n'a pas de mémoire

C'est le contresens qui m'a le plus longtemps induit en erreur.

Un modèle de langage est **sans état**. Il ne se souvient de rien entre deux appels. Ce
qu'on appelle une conversation, c'est le renvoi intégral de tout l'échange précédent à
chaque nouveau message. Au trentième tour, on ne transmet pas la dernière question : on
retransmet les vingt-neuf tours plus la dernière question.

La *fenêtre de contexte* est le budget qui plafonne cet envoi. Tout s'y dispute la place :
instruction système, historique, documents injectés, résultats d'outils.

L'arithmétique devient alors évidente, et elle m'avait échappé. Une conversation de trente
tours à 500 jetons par tour ne coûte pas 15 000 jetons d'entrée. Elle en coûte la somme
cumulée — de l'ordre de 225 000, quinze fois plus — parce que chaque tour réexpédie tous
les précédents. C'est une croissance quadratique, et elle suffit à
expliquer bien des factures que personne n'avait vues venir.

**Ce que je croyais :** le modèle garde le fil, on lui envoie juste la suite.
**Ce que c'est :** on lui renvoie tout, à chaque fois, et on le paie à chaque fois.

## Pourquoi la même question donne deux réponses

Un modèle ne choisit pas un mot : à chaque étape il produit une distribution de
probabilité sur l'ensemble de son vocabulaire, puis on y pioche. La `temperature` aplatit
ou concentre cette distribution ; `top_p` en tronque la queue.

D'où le non-déterminisme, qui n'est pas un défaut d'implémentation mais le mécanisme
lui-même. Et le point qui compte pour nous : mettre la température à zéro réduit fortement
la dispersion, **sans la supprimer**. Il reste du flottant, du parallélisme, du matériel.

Pour quelqu'un qui a construit toute sa carrière sur « même entrée, même sortie », c'est
l'hypothèse de base qui tombe. Une assertion ne tient plus. On la remplace par une
acceptation statistique : rejouer *n* fois, exiger un taux de réussite. Un cas qui échoue
une fois sur vingt n'est pas une instabilité d'infrastructure qu'un *retry* va masquer —
c'est le comportement réel du système.

## La génération se fait un jeton à la fois

Le modèle produit sa réponse séquentiellement, chaque jeton conditionné par tous les
précédents. Trois conséquences que je constatais sans savoir les expliquer :

- La latence dépend de la longueur de la **sortie**, pas de l'entrée. Une réponse longue
  est lente par construction, quelle que soit la taille de la question.
- On distingue le temps jusqu'au premier jeton du temps total. Ce sont deux métriques
  différentes, et seule la première décide de l'impression de réactivité.
- Le *streaming* n'est pas une coquetterie d'interface : c'est la forme naturelle de la
  sortie.

## Les vecteurs, la brique que j'ai su utiliser tout de suite

Un *embedding* transforme un texte en vecteur de quelques centaines de dimensions, où la
proximité géométrique traduit une proximité de sens. Deux phrases qui disent la même chose
avec des mots différents se retrouvent voisines.

C'est celui que je peux mettre au travail le plus vite de mon côté, parce qu'il ne demande
de générer aucun texte. Regrouper des milliers de lignes de journal par
similarité pour faire émerger les trois familles d'erreur réelles derrière deux cents
messages distincts : c'est de la recherche de voisins, pas de l'intelligence artificielle
conversationnelle. Et ça marche.

## RAG, *fine-tuning*, *prompting* : l'arbre que je prenais à l'envers

Trois réponses à trois questions différentes, et je les confondais systématiquement.

| Le besoin | La réponse |
|---|---|
| Changer le format, le ton, la structure de sortie | Le *prompt*, d'abord |
| Ajouter des connaissances : documentation interne, code, runbooks | RAG |
| Réduire coût et latence sur une tâche étroite et stable | *Fine-tuning* d'un petit modèle |

Le **RAG** — *retrieval-augmented generation* — consiste à chercher les documents
pertinents, à les injecter dans le contexte, puis à générer. Il existe parce que les
connaissances ne sont pas dans les poids du modèle, qu'elles vieillissent, et qu'un
réentraînement coûte cher.

Le point le plus utile à retenir : **quand un RAG répond mal, c'est
presque toujours la recherche qui a échoué, pas la génération.** On passe alors des jours
à retoucher des instructions alors que le problème est un index qui ne remonte pas le bon
document. Déboguer le mauvais composant, c'est une pathologie d'ops que je connais bien —
je ne m'attendais pas à la retrouver ici.

Le **fine-tuning** enseigne une *forme*, pas des *faits*. L'erreur la plus courante — et elle
paraît raisonnable tant qu'on n'a pas saisi la distinction — c'est de vouloir fine-tuner
pour injecter de la connaissance métier. C'est cher, ça vieillit dès la publication suivante,
et le modèle continue d'inventer. Ce qu'il faut, dans ce cas, c'est un index.

## L'appel d'outil, ou l'endroit exact où se trouve la sécurité

C'est le concept le plus important pour un DevOps, et celui que j'avais le plus mal
compris.

**Le modèle n'exécute rien.** Il n'a pas d'accès réseau, pas de terminal, pas de droits. Ce
qu'il produit, quand on lui a décrit des outils, c'est une demande structurée :

```json
{
  "type": "tool_use",
  "name": "redemarrer_service",
  "input": { "service": "api-paiements", "environnement": "production" }
}
```

C'est du texte. Une intention. Ce qui la transforme en action, c'est **mon code**, qui
reçoit cet objet et décide de l'exécuter ou non. La frontière de sécurité est entièrement
de mon côté — pas dans le modèle, pas chez le fournisseur.

Ça change complètement la question à poser en réunion. Ce n'est pas « est-ce que ce modèle
est sûr ? », qui n'a pas de réponse utile. C'est : **quels outils lui avons-nous exposés,
avec quels droits, et qu'est-ce qui exige une validation humaine ?** Formulée ainsi, la
question devient un problème de contrôle d'accès — un terrain que je connais.

Le corollaire inquiétant, une fois qu'on a compris ça : un agent qui peut écrire dans un
dépôt *et* lire le texte d'une *issue* rédigée par un inconnu est un chemin d'exécution de
code à distance. Parce qu'il n'existe aucune séparation fiable entre les instructions et
les données — pas d'équivalent des requêtes paramétrées. Tout ce qui entre dans le
contexte peut se comporter comme une instruction.

## Un agent, c'est une boucle

Après des mois à entendre le mot, la définition tient en une ligne :

```
modèle → demande d'outil → exécution par mon code → résultat réinjecté → modèle → …
```

jusqu'à une condition d'arrêt. C'est tout. Il n'y a pas de couche mystérieuse.

Ce qui m'a rassuré, parce que la difficulté redevient alors familière : borner le nombre
d'itérations, plafonner le budget, restreindre les droits, rendre les outils idempotents.
Un agent qui reprend après une erreur peut rejouer une action déjà à moitié effectuée — et
une nouvelle tentative n'est pas gratuite, elle est refacturée. Idempotence et plafonds :
deux réflexes d'ops, appliqués tels quels.

## L'hallucination n'est pas un bug

Je l'ai longtemps prise pour un défaut qu'une version ultérieure corrigerait. C'est une
propriété de l'objectif.

Le modèle optimise la **plausibilité de la suite**, pas la vérité. Il ne dispose d'aucun
mécanisme interne distinguant « je sais » de « voici ce qui viendrait normalement après ».
Un énoncé faux et bien formé satisfait parfaitement son objectif.

On réduit le taux par la vérification externe — citer des sources, contraindre le format,
valider contre un système qui, lui, sait. On ne l'annule jamais en le demandant
poliment dans l'instruction. Attendre la version qui ne mentira plus, c'est attendre une
version qui aurait un autre objectif.

Deux limites de la même famille, qu'il faut connaître pour ne pas se faire surprendre :
les performances se dégradent sur les contextes très longs, et la position compte — ce qui
se trouve au milieu d'une très longue fenêtre est moins bien exploité que le début et la
fin. Remplir la fenêtre n'est pas neutre, même quand tout tient dedans.

## Le mot qui manque dans la plupart des réunions

**Évaluation.** Un jeu de cas avec des réponses attendues, rejoué à chaque changement de
*prompt*, de modèle ou de version.

C'est le seul filet. Sans lui, « on a amélioré le prompt » est une phrase invérifiable, et
on peut naviguer des semaines à l'impression. Deux notions qui vont
avec :

- **Le modèle juge.** Faire noter les sorties par un autre modèle. Économique, mais biaisé
  de façon documentée : préférence pour les réponses longues, sensibilité à l'ordre de
  présentation. Utilisable si on calibre sur un échantillon noté à la main.
- **Précision et rappel.** Le vocabulaire qui me manquait pour parler d'un agent de revue
  de code. Combien de vrais problèmes trouvés, combien de fausses alertes. Sans ces deux
  chiffres, « ça marche bien » ne veut rien dire.

## Ce que je n'ai pas appris, sans regret

Rétropropagation, descente de gradient, les mathématiques de l'attention, l'entraînement
depuis zéro. Je n'entraînerai pas de modèle de base, et connaître la dérivée d'une
fonction de perte ne m'a jamais aidé à décider d'un plafond de budget.

C'est précisément là que la plupart des formations « IA pour ingénieurs » font perdre trois
semaines : elles commencent par la théorie de l'apprentissage et n'arrivent jamais aux
appels d'outils, aux droits, au coût et à l'évaluation — c'est-à-dire à tout ce dont
j'avais besoin.

Une exception, si l'équipe héberge ses propres modèles : le rapport entre paramètres et
mémoire. Nombre de paramètres × octets par paramètre. Un modèle de 7 milliards en demi-
précision, deux octets par paramètre, demande environ 14 Go, plus le cache. La
quantisation réduit cette précision — le même modèle tombe autour de 3,5 Go en 4 bits, en
échangeant un peu de qualité contre beaucoup de mémoire. Ces deux règles suffisent à
comprendre pourquoi une équipe réclame telle carte, et à évaluer si la demande est
raisonnable.

## Ce que ce vocabulaire permet

L'objectif n'était pas de devenir ingénieur en apprentissage automatique. Il était plus
modeste : savoir à quel moment ouvrir la bouche.

Quand quelqu'un propose de fine-tuner pour que le modèle connaisse la documentation
interne, la bonne réponse est un index. Quand une demande d'accès en écriture arrive pour
un agent, la question ne porte pas sur le modèle mais sur les outils exposés et sur ce qui
exige une validation humaine. Quand une équipe annonce une amélioration, la question est
« sur quel jeu d'évaluation ? », et « on n'en a pas » est une réponse recevable — mais une
réponse qui appelle une suite.

Aucune de ces trois questions ne demande de savoir entraîner un modèle. Elles demandent
seulement de connaître le sens exact de six ou sept mots. C'est le même rôle que je tiens
déjà auprès des équipes de développement : je ne sais pas écrire leur code, je sais quelles
questions font apparaître les problèmes avant la mise en production.

Il fallait juste apprendre le vocabulaire. C'est fait — écrire ces pages était la manière
de le fixer.
