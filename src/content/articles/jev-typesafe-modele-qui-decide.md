---
titre: "Jev, le modèle qui décide au lieu d'écrire : ce qu'un DevOps doit en retenir"
resume: "TypeSafe AI lance Jev, un modèle « System One » qui choisit parmi des réponses connues au lieu de générer du texte. Ce qu'il promet, où il s'insère dans une chaîne d'agents, et ce qu'il faut vérifier avant d'y croire."
pilier: ai-devops
date: 2026-09-24
tags: ["jev", "agents", "llm", "garde-fous", "coût", "routage"]
repo: null
brouillon: true
---

Regardez ce que fait réellement un agent entre deux actions visibles. Avant d'appeler un
outil, il doit décider lequel. Avant de relancer une requête, il doit juger si ça vaut la
peine. Avant d'exécuter une commande, il devrait se demander si elle est dangereuse. Ce
sont des dizaines de petites décisions, et dans la plupart des architectures actuelles,
chacune part vers un grand modèle de langage — le même qui sait écrire un roman.

C'est le problème qu'attaque **Jev**, le premier modèle de TypeSafe AI, ouvert en accès
anticipé le 15 septembre 2026. Je ne l'ai pas encore testé en conditions réelles : cet
article n'est pas un retour d'expérience, c'est une lecture de ce qui est annoncé, avec les
questions qu'un DevOps doit poser avant de le brancher sur quoi que ce soit. Les chiffres
cités sont ceux de l'éditeur, et je le signale à chaque fois.

## Le constat : on paie un rédacteur pour cocher des cases

Prenons un ticket de support : « J'ai été débité deux fois et je veux que ce soit réglé
maintenant. » Le logiciel qui le reçoit n'a besoin que de trois informations : quelle
équipe, quel niveau d'urgence, faut-il escalader.

Avec un LLM classique, le parcours est absurde quand on le décrit à voix haute :

1. on demande au modèle de raisonner sur le ticket ;
2. il produit un paragraphe poli — « Je suis désolé d'apprendre que… » ;
3. notre code doit ensuite extraire de ce texte une valeur structurée ;
4. et gérer le cas où le modèle a répondu « facturation » au lieu de `billing`, ou a oublié
   un champ.

Les sorties structurées et le mode JSON ont réduit l'étape 3, sans changer la nature du
processus : le modèle continue de générer, jeton après jeton, une réponse dont on connaît
pourtant d'avance toutes les valeurs possibles. On paie la latence et les jetons de sortie
d'un rédacteur pour remplir un formulaire à choix multiples.

## Ce que Jev fait différemment

Jev ne génère pas de texte. On lui fournit deux choses :

- **la situation** — l'état du programme, non structuré : un ticket, une commande, une
  question, une liste de documents ;
- **les réponses possibles** — un ensemble fermé et typé pour chaque question.

Il renvoie, pour chaque question, l'option choisie **accompagnée d'une probabilité**. Sur
l'exemple du double débit, la démonstration de TypeSafe donne : équipe `billing` à 94 %,
urgence `oui` à 88 %, frustration `élevée` à 91 %. Pas de prose, pas d'analyse syntaxique à
écrire : une valeur que le code peut consommer directement.

Pour fixer les idées, la forme de l'échange ressemble à ceci. **Il s'agit d'une
illustration du principe, pas de la syntaxe réelle de l'API**, que je n'ai pas encore
manipulée :

```json
{
  "situation": "J'ai été débité deux fois et je veux que ce soit réglé maintenant.",
  "questions": {
    "equipe":      ["billing", "technique", "commercial"],
    "urgent":      ["oui", "non"],
    "frustration": ["faible", "moyenne", "élevée"]
  }
}
```

```json
{
  "equipe":      { "choix": "billing", "probabilite": 0.94 },
  "urgent":      { "choix": "oui",     "probabilite": 0.88 },
  "frustration": { "choix": "élevée",  "probabilite": 0.91 }
}
```

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 218" role="img" aria-labelledby="fig-chemins">
<title id="fig-chemins">Le même tri de ticket demande quatre étapes à un modèle génératif, deux à Jev.</title>
<text class="viz-cle" x="22" y="14">Avec un LLM génératif</text>
<g class="c2" fill="currentColor" stroke="currentColor">
<rect x="22" y="26" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="176" y="26" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="330" y="26" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="484" y="26" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<g fill="none" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M158 54h10"/><path d="M165 50l5 4-5 4"/>
<path d="M312 54h10"/><path d="M319 50l5 4-5 4"/>
<path d="M466 54h10"/><path d="M473 50l5 4-5 4"/>
</g>
</g>
<text x="89" y="50" text-anchor="middle">Situation</text>
<text x="89" y="67" text-anchor="middle">non structurée</text>
<text x="243" y="50" text-anchor="middle">Rédige une</text>
<text x="243" y="67" text-anchor="middle">phrase polie</text>
<text x="397" y="50" text-anchor="middle">Extraction</text>
<text x="397" y="67" text-anchor="middle">depuis le texte</text>
<text x="551" y="59" text-anchor="middle" class="viz-fort">Valeur typée</text>
<text x="22" y="106">Quatre étapes, dont une qui facture des jetons de sortie pour du texte aussitôt jeté.</text>
<text class="viz-cle" x="22" y="146">Avec Jev</text>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="22" y="158" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="176" y="158" width="134" height="56" rx="8" fill-opacity=".09" stroke-opacity=".45"/>
<g fill="none" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M158 186h10"/><path d="M165 182l5 4-5 4"/>
</g>
</g>
<text x="89" y="182" text-anchor="middle">Situation</text>
<text x="89" y="199" text-anchor="middle">+ options fermées</text>
<text x="243" y="182" text-anchor="middle" class="viz-fort">Valeur typée</text>
<text x="243" y="199" text-anchor="middle" class="viz-fort">+ probabilité</text>
<text x="332" y="182">Le reste du chemin</text>
<text x="332" y="199">n’existe pas.</text>
</svg>
</div>
<figcaption>
Les deux chemins pour la même décision. Ce que Jev supprime n’est pas une étape de
calcul : c’est la rédaction d’un texte, puis le code qu’il faut écrire et maintenir
pour en réextraire une valeur.
</figcaption>
</figure>

Techniquement, TypeSafe décrit un modèle **non autorégressif** : toutes les décisions sont
produites en une seule passe parallèle, et non jeton par jeton. C'est ce qui explique la
promesse de vitesse — et c'est aussi ce qui l'empêche, par construction, de rédiger quoi
que ce soit.

## Pourquoi « System One »

Le nom vient de la distinction popularisée par Daniel Kahneman entre deux modes de pensée :
le **système 1**, rapide et intuitif, et le **système 2**, lent et délibéré. Les LLM
actuels, surtout avec leurs modes de raisonnement, jouent le système 2. Jev revendique le
système 1 : le jugement immédiat sur une question dont on connaît les réponses possibles.

Le nom du modèle lui-même est un clin d'œil à William Stanley Jevons et à son paradoxe :
quand une ressource devient moins chère à consommer, on en consomme davantage. J'y reviens
plus bas, parce que ce paradoxe concerne directement nos factures.

## Quatre usages qui parlent à un DevOps

La présentation de TypeSafe met en avant quatre cas. Ils recoupent tous une architecture
que nous opérons déjà.

### 1. Le tri des tickets

Le cas d'école : quelle équipe, quelle urgence, faut-il une relecture humaine. Un premier
projet public l'utilise déjà pour trier des courriels : [inbox-zero](https://github.com/elie222/inbox-zero).

### 2. Le routage d'un agent

Un agent dispose d'une recherche web, d'une calculatrice, d'un modèle de code et d'une base
de données. À chaque étape, il faut choisir l'outil suivant. C'est une question fermée à
quatre réponses : exactement le terrain de Jev. Le grand modèle n'est alors appelé que
lorsqu'il faut vraiment produire quelque chose.

### 3. Les garde-fous d'un agent de code

C'est le cas qui m'intéresse le plus, et celui qui demande le plus de prudence. L'agent
propose d'exécuter :

```bash
rm -rf ~/projects
```

Jev tranche entre trois réponses : **autoriser**, **demander à un humain**, **bloquer**. Le
projet [jev-guard](https://github.com/leepokai/jev-guard) applique ce principe aux actions
de n'importe quel agent.

J'ai écrit dans [le carnet sur le vocabulaire de l'IA](/articles/vocabulaire-ia-pour-devops)
que la frontière de sécurité d'un agent est entièrement de notre côté, dans le code qui
reçoit la demande d'outil et décide de l'exécuter. Un classifieur rapide placé à cet
endroit est une bonne idée. **Un classifieur probabiliste utilisé comme seule barrière
n'en est pas une.** J'y reviens dans les réserves.

### 4. Le filtrage avant un RAG

On récupère dix documents, mais seuls trois sont réellement pertinents. Jev note la
pertinence de chacun **avant** de les envoyer au grand modèle. Moins de contexte, donc
moins de jetons d'entrée, moins de latence — et souvent une meilleure réponse, puisque les
performances d'un modèle se dégradent quand on noie l'information utile dans du bruit.

## Les chiffres annoncés

Tous les chiffres qui suivent sont **ceux de TypeSafe AI**. Aucun n'a été mesuré par moi.

| Critère | Jev (annoncé) | Grand LLM génératif |
|---|---|---|
| Temps de réponse | quelques centaines de millisecondes | plusieurs secondes selon la longueur de sortie |
| Écart de vitesse revendiqué | 40 à 200 fois plus rapide sur des tâches comparables | — |
| Prix en entrée | 0,042 $ par million de jetons | variable selon le modèle |
| Prix en sortie | gratuit : il n'y a pas de texte généré | la ligne la plus chère de la facture |
| Forme de la réponse | valeur typée + probabilité | texte à analyser |

La colonne de droite est volontairement qualitative : la comparaison dépend entièrement du
modèle de référence choisi, et un éditeur choisit rarement le plus défavorable pour lui.

L'argument économique tient surtout à la dernière ligne de la facture. Sur un LLM, les
jetons de sortie coûtent typiquement plusieurs fois plus cher que ceux d'entrée, et une
décision « rédigée » en consomme inutilement. Supprimer la sortie, c'est supprimer le
poste le plus coûteux pour ce type de tâche.

## Ce qu'il faut vérifier avant d'y croire

### « Il ne peut pas halluciner » : vrai et trompeur à la fois

TypeSafe affirme que Jev ne peut ni halluciner ni produire d'erreur de type. C'est exact
dans un sens précis : il ne peut pas inventer une équipe qui n'existe pas ni renvoyer une
chaîne mal formée, puisqu'il choisit dans une liste fermée.

Mais il peut **choisir la mauvaise option avec assurance**. Router un incident de
production vers l'équipe commerciale, c'est une erreur valide du point de vue du typage.
Le problème n'a pas disparu : il a changé de forme. On ne vérifie plus « la réponse est-elle
bien formée ? » mais « la réponse est-elle juste ? » — ce qui est, de toute façon, la seule
question qui comptait.

### Une probabilité n'a de valeur que si elle est calibrée

« 94 % » est une promesse forte : sur cent décisions annoncées à 94 %, environ quatre-vingt-
quatorze devraient être correctes. TypeSafe dit entraîner Jev précisément pour ça, par un
apprentissage par renforcement orienté vers des décisions calibrées.

C'est vérifiable, et il faut le vérifier **sur ses propres données**. Un jeu de quelques
centaines de cas étiquetés à la main, rejoué à chaque changement, suffit à tracer la
courbe : probabilité annoncée d'un côté, taux de réussite observé de l'autre. Si la courbe
tient, les probabilités deviennent un outil de pilotage. Si elle ne tient pas, elles sont
décoratives.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 300" role="img" aria-labelledby="fig-calibration">
<title id="fig-calibration">Schéma : un modèle calibré suit la diagonale, un modèle surconfiant passe dessous.</title>
<g class="viz-grille">
<path d="M70 240h462M70 185h462M70 130h462M70 75h462M70 20h462"/>
</g>
<g class="viz-repere"><path d="M70 20v220M70 240h462"/></g>
<path d="M70 240L532 20" class="viz-diagonale"/>
<text x="126" y="210">calibration parfaite</text>
<g class="c2">
<path class="viz-ligne" stroke="currentColor" d="M255 174L324 148L393 126L440 108L486 95L509 86"/>
<g class="viz-point" fill="currentColor">
<circle cx="255" cy="174" r="4"/><circle cx="324" cy="148" r="4"/><circle cx="393" cy="126" r="4"/>
<circle cx="440" cy="108" r="4"/><circle cx="486" cy="95" r="4"/><circle cx="509" cy="86" r="4"/>
</g>
</g>
<g class="c1">
<path class="viz-ligne" stroke="currentColor" d="M255 156L324 115L393 84L440 68L486 40L509 33"/>
<g class="viz-point" fill="currentColor">
<circle cx="255" cy="156" r="4"/><circle cx="324" cy="115" r="4"/><circle cx="393" cy="84" r="4"/>
<circle cx="440" cy="68" r="4"/><circle cx="486" cy="40" r="4"/><circle cx="509" cy="33" r="4"/>
</g>
</g>
<text x="520" y="37" class="viz-fort">calibré</text>
<text x="520" y="90">surconfiant</text>
<g class="viz-tick">
<text x="60" y="244" text-anchor="end">0</text>
<text x="60" y="189" text-anchor="end">25</text>
<text x="60" y="134" text-anchor="end">50</text>
<text x="60" y="79" text-anchor="end">75</text>
<text x="60" y="24" text-anchor="end">100</text>
<text x="70" y="262" text-anchor="middle">0</text>
<text x="185" y="262" text-anchor="middle">25</text>
<text x="301" y="262" text-anchor="middle">50</text>
<text x="416" y="262" text-anchor="middle">75</text>
<text x="532" y="262" text-anchor="middle">100</text>
</g>
<text x="301" y="288" text-anchor="middle" class="viz-cle">Probabilité annoncée (%)</text>
<text x="18" y="130" text-anchor="middle" class="viz-cle" transform="rotate(-90 18 130)">Réussite observée (%)</text>
</svg>
</div>
<ul class="legende-viz">
<li class="c1"><i></i><span>modèle calibré</span></li>
<li class="c2"><i></i><span>modèle surconfiant</span></li>
</ul>
<figcaption>
Schéma de lecture, pas une mesure : aucune de ces deux courbes n’a été relevée sur Jev.
Sur la diagonale, une annonce à 90 % se vérifie 90 fois sur 100. En dessous, le modèle
se croit meilleur qu’il n’est — et c’est le cas dangereux, puisque les seuils reposent
sur ce chiffre.
</figcaption>
</figure>

Et une fois calibrées, elles permettent quelque chose de très concret : **fixer des seuils**.
Au-dessus de 90 %, on agit automatiquement. Entre 60 et 90 %, on met en file pour relecture.
En dessous, on escalade. C'est un réglage d'ops, pas de l'intelligence artificielle.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 122" role="img" aria-labelledby="fig-seuils">
<title id="fig-seuils">Trois régimes de décision selon la probabilité annoncée : escalade, relecture, automatique.</title>
<g class="c-critique"><rect x="70" y="28" width="322" height="34" rx="3" fill="currentColor"/></g>
<g class="c-attention"><rect x="394" y="28" width="160" height="34" rx="3" fill="currentColor"/></g>
<g class="c-bon"><rect x="556" y="28" width="54" height="34" rx="3" fill="currentColor"/></g>
<text x="86" y="50" class="viz-sur-sombre">✕ escalade</text>
<text x="408" y="50" class="viz-sur-clair">⚑ relecture humaine</text>
<path d="M583 66v20" class="viz-repere"/>
<text x="634" y="102" text-anchor="end" class="viz-fort">✓ action automatique</text>
<g class="viz-tick">
<text x="70" y="78" text-anchor="middle">0</text>
<text x="394" y="78" text-anchor="middle">60</text>
<text x="556" y="78" text-anchor="middle">90</text>
<text x="610" y="78" text-anchor="middle">100</text>
</g>
<text x="70" y="18" class="viz-cle">Probabilité annoncée par le modèle (%)</text>
</svg>
</div>
<figcaption>
Les seuils sont un réglage d’exploitation, pas un paramètre du modèle. Ils ne valent que
si la courbe précédente tient : une probabilité non calibrée déplace les trois frontières
sans prévenir.
</figcaption>
</figure>

### Un garde-fou probabiliste ne remplace pas un garde-fou déterministe

Pour le cas `rm -rf`, l'architecture que je défendrais est en couches :

1. **Une liste de refus déterministe, d'abord.** Les commandes destructrices connues, les
   chemins sensibles, les accès réseau sortants non prévus : bloqués par une règle, sans
   modèle, sans probabilité.
2. **Jev au milieu**, pour tout ce que les règles ne couvrent pas : la commande inédite,
   l'enchaînement suspect. Rapide, bon marché, appelable à chaque action.
3. **Un humain pour la réponse « demander »**, avec un délai de décision et un refus par
   défaut.

Un modèle qui se trompe une fois sur cent est remarquable pour trier des tickets. Pour
autoriser des commandes shell en production, une fois sur cent, c'est un incident par
semaine. Le classifieur réduit le bruit qui arrive à l'humain ; il ne remplace ni les
règles ni le principe du moindre privilège.

### Le paradoxe de Jevons s'applique aussi à nous

Le nom est honnête, et il faut le prendre au sérieux. Quand une décision coûte presque
rien, on en prend beaucoup plus. On finit par classifier chaque ligne de journal, chaque
appel d'outil, chaque document récupéré. Le coût unitaire s'effondre ; le volume explose ;
la facture totale peut très bien augmenter.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 168" role="img" aria-labelledby="fig-jevons">
<title id="fig-jevons">Le coût unitaire s’effondre, le volume explose, et la facture totale monte quand même.</title>
<text class="viz-cle" x="8" y="12">Coût par décision</text>
<g class="c-gris">
<path d="M8 126h178" class="viz-repere"/>
<path class="viz-ligne" stroke="currentColor" d="M8 34C60 92 92 112 186 118"/>
</g>
<text x="8" y="152" class="viz-fort">÷ 20</text>
<text class="viz-cle" x="231" y="12">Nombre de décisions</text>
<g class="c-gris">
<path d="M231 126h178" class="viz-repere"/>
<path class="viz-ligne" stroke="currentColor" d="M231 118C312 114 350 60 409 32"/>
</g>
<text x="231" y="152" class="viz-fort">× 40</text>
<text class="viz-cle" x="454" y="12">Facture totale</text>
<g class="c1">
<path d="M454 126h178" class="viz-repere"/>
<path class="viz-ligne" stroke="currentColor" d="M454 100C528 96 565 70 632 48"/>
</g>
<text x="454" y="152" class="viz-fort">× 2</text>
</svg>
</div>
<figcaption>
Hypothèse chiffrée, pas une mesure : si le coût unitaire est divisé par vingt et le volume
multiplié par quarante, la facture double. C’est le paradoxe de Jevons — le prix unitaire
n’est jamais la quantité à surveiller.
</figcaption>
</figure>

Les réflexes restent les mêmes que pour n'importe quel service facturé à l'usage : un
compteur par cas d'usage, un budget par environnement, une alerte sur la dérive. J'ai
détaillé cette démarche dans [le coût réel d'un agent de revue de code](/articles/cout-reel-agent-revue-de-code).

### C'est un produit de septembre 2026

Accès anticipé, lancé il y a quelques jours. Pas encore de recul sur la disponibilité, la
stabilité de l'API, la politique de conservation des données ni la portabilité. Avant d'y
envoyer des tickets clients, la question de la résidence des données se pose comme pour
n'importe quel fournisseur — et d'autant plus quand la situation transmise contient des
informations personnelles.

## Ce que Jev ne remplace pas

Jev ne rend obsolètes ni GPT ni Claude. Il répond à une autre question. Pour répondre à la
cliente débitée deux fois, il faut toujours un modèle génératif : c'est lui qui rédige le
message. Jev, lui, a décidé en amont que le ticket allait à la facturation, qu'il était
urgent, et qu'un remboursement méritait une validation humaine.

La règle de décision tient en une phrase : **si le logiciel connaît déjà les réponses
possibles, c'est une décision ; sinon, c'est une génération.** Chat, génération de code,
explication rédigée : ce n'est pas le terrain de Jev, et TypeSafe le dit lui-même.

## Ce que je vais tester

Si l'hypothèse de TypeSafe se vérifie, l'IA dans nos systèmes change de forme. Elle cesse
d'être uniquement un interlocuteur à qui l'on parle et devient une multitude de petits
moteurs de décision, invisibles, disséminés dans le code — exactement comme les règles
métier qu'ils remplaceront en partie.

Avant d'en arriver là, trois mesures, que je publierai ici :

- **la calibration** sur un jeu de tickets réels anonymisés, comparée à un LLM en sortie
  structurée sur les mêmes cas ;
- **la latence au 95e percentile** depuis une région européenne, et pas seulement la
  médiane annoncée ;
- **le coût réel d'un mois** de routage d'agent, en comptant le volume supplémentaire que
  le faible prix aura inévitablement provoqué.

D'ici là, la formule qui résume le mieux la proposition reste la plus simple : les LLM
génèrent, Jev décide. Reste à mesurer à quel point il décide bien.
