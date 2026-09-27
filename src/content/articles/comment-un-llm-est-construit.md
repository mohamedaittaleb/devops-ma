---
titre: "Ce qui se passe entre votre question et la réponse d'un LLM"
resume: "Vous posez une question, la réponse arrive. Entre les deux, six étapes toujours les mêmes. On les suit une par une, tranquillement, du découpage du texte jusqu'aux cartes qui font tourner le modèle."
pilier: ai-devops
date: 2026-09-27
tags: ["llm", "vulgarisation", "jetons", "transformeur", "gpu"]
repo: null
---

Vous tapez « Quelle est la capitale du Japon ? ». Une seconde plus tard, « Tokyo » s’affiche.

Entre les deux, il s’est passé pas mal de choses. Rien de magique, et rien
d’incompréhensible non plus : six étapes, qui se suivent toujours dans le même ordre.

On va les parcourir une par une. Pas d’équations, aucun prérequis — juste le trajet, depuis
un tas de texte brut jusqu’à la réponse qui apparaît sur votre écran. Les termes anglais
sont donnés entre parenthèses la première fois, parce que ce sont eux que vous retrouverez
partout ailleurs.

## 1. Les données : on commence par jeter

Avant qu’un modèle existe, il faut du texte. Énormément de texte.

Et la première chose qu’on en fait, c’est d’en jeter la plus grande partie. Ça peut
surprendre, mais ça devient évident dès qu’on regarde ce qu’on ramasse sur le web.

La même phrase revient à l’identique sur quatre mille sites. Des pages entières ne disent
rien d’autre que « ACHETEZ MAINTENANT meilleur prix cliquez ici ». D’autres ne sont que du
balisage cassé, qui n’a jamais vraiment été du texte. Tout cela part : les doublons, le
contenu vide, et ce qui est abîmé.

Pourquoi tant de soin pour une étape aussi ingrate ? Parce qu’un modèle apprend exactement
ce qu’on lui donne. Une phrase qu’il rencontre quatre mille fois, il finit par la prendre
pour une évidence. Le ménage du départ décide de beaucoup de choses.

## 2. Les jetons : le texte devient des nombres

Un modèle ne sait pas lire. Il ne manipule que des nombres.

Il faut donc traduire. On commence par découper la phrase en petits morceaux appelés
**jetons** (*tokens*). Ce ne sont ni des mots ni des lettres, mais des fragments, taillés
selon ce qui revient souvent dans la langue.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 236" role="img" aria-labelledby="fig-jetons">
<title id="fig-jetons">Une phrase de sept mots devient onze jetons, chacun converti en identifiant puis en vecteur.</title>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="8" y="30" width="30" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="44" y="30" width="30" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="80" y="30" width="45" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="131" y="30" width="30" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="167" y="30" width="52" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="225" y="30" width="52" height="26" rx="5" fill-opacity=".22" stroke-opacity=".9"/>
<rect x="283" y="30" width="45" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="334" y="30" width="45" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="385" y="30" width="66" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="457" y="30" width="38" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
<rect x="501" y="30" width="23" height="26" rx="5" fill-opacity=".09" stroke-opacity=".4"/>
</g>
<g class="viz-cle" style="text-transform:none">
<text x="23" y="48" text-anchor="middle">LL</text>
<text x="59" y="48" text-anchor="middle">Ms</text>
<text x="102" y="48" text-anchor="middle">·don</text>
<text x="146" y="48" text-anchor="middle">'t</text>
<text x="193" y="48" text-anchor="middle">·read</text>
<text x="251" y="48" text-anchor="middle">·text</text>
<text x="305" y="48" text-anchor="middle">·the</text>
<text x="356" y="48" text-anchor="middle">·way</text>
<text x="418" y="48" text-anchor="middle">·humans</text>
<text x="476" y="48" text-anchor="middle">·do</text>
<text x="512" y="48" text-anchor="middle">.</text>
</g>
<text x="536" y="49" class="viz-fort">11 jetons</text>
<text x="8" y="18" class="viz-cle" style="text-transform:none">« LLMs don't read text the way humans do. »</text>
<g class="viz-repere" stroke-linecap="round">
<path d="M251 62v16"/><path d="M247 72l4 6 4-6"/>
<path d="M251 108v16"/><path d="M247 118l4 6 4-6"/>
</g>
<text x="266" y="98" class="viz-fort">2420</text>
<text x="320" y="98">son identifiant dans le vocabulaire</text>
<g class="c1">
<rect x="236" y="130" width="30" height="86" rx="5" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="3 3"/>
</g>
<text x="280" y="166">un vecteur de plusieurs centaines</text>
<text x="280" y="184">de dimensions — le plongement</text>
</svg>
</div>
<figcaption>
L'exemple et le décompte viennent du découpeur de GPT-2. Le petit point « · » représente
l'espace qui précède le mot : pour le modèle, « text » et « ·text » ne sont pas la même
chose. Et le point final, lui, compte pour un jeton entier.
</figcaption>
</figure>

Deux choses méritent qu’on s’y arrête.

D’abord, un jeton n’est pas un mot. Un terme courant en occupe un seul, un mot rare peut en
demander trois ou quatre. Dans l’exemple ci-dessus, « LLMs » en consomme deux à lui tout
seul.

Ensuite, ce découpage a surtout été appris sur de l’anglais. Le français a donc besoin de
plus de jetons pour dire la même chose, et l’arabe davantage encore. Comme tout se facture
au jeton, écrire en français revient un peu plus cher qu’écrire en anglais. C’est rarement
mentionné.

Chaque jeton reçoit ensuite un numéro, qui est sa place dans le vocabulaire du modèle. Puis
ce numéro se transforme en une longue liste de nombres, qu’on appelle un **plongement**
(*embedding*). C’est cette liste, et plus jamais le texte, que la suite va manipuler.

## 3. Le transformeur : la machine à relier les mots

On arrive au modèle lui-même. Son nom a l’air intimidant — **transformeur** (*transformer*)
— mais son mécanisme central l’est beaucoup moins. On l’appelle **l’attention**.

L’idée tient en une phrase : chaque jeton regarde tous les autres, et décide lesquels
comptent pour lui.

Un exemple vaut mieux qu’une définition.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 168" role="img" aria-labelledby="fig-attention">
<title id="fig-attention">Le mécanisme d'attention rattache le pronom « il » à « serveur » plutôt qu'à « développeur ».</title>
<g class="c-gris">
<path d="M388 96C388 46 108 46 108 96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity=".45"/>
<path d="M240 56l14 14M254 56l-14 14" stroke="currentColor" stroke-width="1.5" stroke-opacity=".55"/>
</g>
<g class="c1">
<path d="M388 104C388 138 284 138 284 104" fill="none" stroke="currentColor" stroke-width="2.5"/>
</g>
<text x="40" y="100">Le</text>
<text x="64" y="100" class="viz-fort">développeur</text>
<text x="160" y="100">a</text>
<text x="176" y="100">réparé</text>
<text x="232" y="100">le</text>
<text x="256" y="100" class="viz-fort">serveur</text>
<text x="320" y="100">parce</text>
<text x="368" y="100" class="viz-fort">qu'il</text>
<text x="416" y="100">avait</text>
<text x="464" y="100">planté.</text>
<text x="108" y="40" text-anchor="middle">candidat écarté</text>
<text x="284" y="160" text-anchor="middle" class="viz-fort">lien retenu</text>
</svg>
</div>
<figcaption>
Grammaticalement, « il » peut aussi bien être le développeur que le serveur. La phrase seule
ne permet pas de choisir : il faut comprendre le sens. C'est exactement ce que fait
l'attention, et c'est tout ce qu'elle fait.
</figcaption>
</figure>

C’est vraiment tout ce que fait une couche du modèle. Elle relie.

La couche suivante recommence, à partir de ce que la précédente a produit. Puis la suivante
encore, sur plusieurs dizaines d’étages. Le mécanisme reste le même du début à la fin :
c’est l’empilement qui fait le travail.

## 4. Le pré-entraînement : deviner le mot suivant, des milliards de fois

Le modèle existe, mais il ne sait rien. On va lui apprendre, avec un exercice d’une
simplicité étonnante : deviner ce qui vient ensuite.

On lui montre « La capitale du Japon est », on lui demande la suite, et on compare sa
proposition à la bonne réponse.

Quand il se trompe — et au début, il se trompe tout le temps — un mécanisme appelé
**rétropropagation** (*backpropagation*) refait le calcul à l’envers. Il cherche quels
réglages internes ont mené à l’erreur, et de combien il faudrait les ajuster. Ces réglages
s’appellent des **poids**, et il y en a beaucoup : 124 millions dans GPT-2, qu’on considère
pourtant aujourd’hui comme un tout petit modèle.

Ensuite on recommence. Puis encore. C’est là que les chiffres deviennent difficiles à se
représenter.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 196" role="img" aria-labelledby="fig-echelle">
<title id="fig-echelle">Trois chiffres de l'entraînement de Llama 3 405B et leur conversion en durée.</title>
<g class="viz-repere">
<rect x="8" y="20" width="196" height="88" rx="8" fill="none"/>
<rect x="222" y="20" width="196" height="88" rx="8" fill="none"/>
<rect x="436" y="20" width="196" height="88" rx="8" fill="none"/>
</g>
<text x="24" y="42" class="viz-cle">Jetons vus</text>
<text x="24" y="82" style="font-size:30px;font-weight:640;fill:var(--texte)">15,6 billions</text>
<text x="238" y="42" class="viz-cle">Cartes en parallèle</text>
<text x="238" y="82" style="font-size:30px;font-weight:640;fill:var(--texte)">16 000</text>
<text x="452" y="42" class="viz-cle">Heures-GPU</text>
<text x="452" y="82" style="font-size:30px;font-weight:640;fill:var(--texte)">30,84 M</text>
<text x="8" y="148" class="viz-fort">Sur une seule carte, ces 30,84 millions d'heures feraient 3 518 ans.</text>
<text x="8" y="172">En en alignant seize mille, l'affaire est pliée en 80 jours. C'est tout le métier.</text>
</svg>
</div>
<figcaption>
Chiffres publiés par Meta pour Llama 3 405B en 2024. Les deux conversions en durée sont de
moi : elles se refont à la calculatrice. Mettre 16 000 cartes en parallèle ne coûte pas moins
cher — cela permet simplement de finir un jour.
</figcaption>
</figure>

Au bout de cette étape, le modèle sait continuer n’importe quel texte. En revanche, il ne
sait toujours pas discuter avec vous.

## 5. Le post-entraînement : apprendre à répondre

Posez une question à un modèle qui sort tout juste du pré-entraînement, et il vous répondra
peut-être par dix autres questions. Ce n’est pas un défaut : sur un forum, ce qui suit une
question, c’est souvent d’autres questions. Il continue le texte, exactement comme on le lui
a appris.

D’où une seconde phase, le **post-entraînement** (*post-training*), qui lui apprend à se
comporter en assistant. On le pousse vers trois qualités : être **utile**, être **exact**,
être **sûr**.

C’est cette étape qui donne à chaque modèle sa manière d’être : son ton, sa façon
d’organiser une réponse, ce qu’il accepte ou non de faire.

Une précision qui éclaire bien des situations : cette phase n’ajoute presque aucune
connaissance. Elle change la forme des réponses, pas leur contenu. C’est pour cela qu’un
modèle peut vous affirmer une chose fausse avec une politesse irréprochable — la justesse et
les bonnes manières s’apprennent séparément.

## 6. La mise en service : trouver où le faire tenir

Le modèle est prêt. Reste à le faire tourner pour des millions de personnes, et là, la
physique reprend la main.

Un modèle de 405 milliards de paramètres occupe 810 gigaoctets en mémoire. Le calcul est
simple : chaque paramètre pèse deux octets, et 405 milliards multipliés par deux donnent
810 milliards d’octets.

Aucune carte graphique ne dispose de 810 Go. Il faut donc découper le modèle et le répartir
sur plusieurs cartes à la fois.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 180" role="img" aria-labelledby="fig-memoire">
<title id="fig-memoire">Les 810 Go de poids occupent environ 63 % des 1 280 Go offerts par seize cartes de 80 Go.</title>
<text x="8" y="16" class="viz-cle" style="text-transform:none">16 cartes × 80 Go = 1 280 Go disponibles</text>
<g class="c1">
<g fill="currentColor" fill-opacity=".14"><rect x="8" y="28" width="30" height="80" rx="3"/><rect x="47" y="28" width="30" height="80" rx="3"/><rect x="86" y="28" width="30" height="80" rx="3"/><rect x="125" y="28" width="30" height="80" rx="3"/><rect x="164" y="28" width="30" height="80" rx="3"/><rect x="203" y="28" width="30" height="80" rx="3"/><rect x="242" y="28" width="30" height="80" rx="3"/><rect x="281" y="28" width="30" height="80" rx="3"/><rect x="320" y="28" width="30" height="80" rx="3"/><rect x="359" y="28" width="30" height="80" rx="3"/><rect x="398" y="28" width="30" height="80" rx="3"/><rect x="437" y="28" width="30" height="80" rx="3"/><rect x="476" y="28" width="30" height="80" rx="3"/><rect x="515" y="28" width="30" height="80" rx="3"/><rect x="554" y="28" width="30" height="80" rx="3"/><rect x="593" y="28" width="30" height="80" rx="3"/></g>
<g fill="currentColor"><rect x="8" y="57" width="30" height="51" rx="3"/><rect x="47" y="57" width="30" height="51" rx="3"/><rect x="86" y="57" width="30" height="51" rx="3"/><rect x="125" y="57" width="30" height="51" rx="3"/><rect x="164" y="57" width="30" height="51" rx="3"/><rect x="203" y="57" width="30" height="51" rx="3"/><rect x="242" y="57" width="30" height="51" rx="3"/><rect x="281" y="57" width="30" height="51" rx="3"/><rect x="320" y="57" width="30" height="51" rx="3"/><rect x="359" y="57" width="30" height="51" rx="3"/><rect x="398" y="57" width="30" height="51" rx="3"/><rect x="437" y="57" width="30" height="51" rx="3"/><rect x="476" y="57" width="30" height="51" rx="3"/><rect x="515" y="57" width="30" height="51" rx="3"/><rect x="554" y="57" width="30" height="51" rx="3"/><rect x="593" y="57" width="30" height="51" rx="3"/></g>
</g>
<text x="8" y="132" class="viz-fort">810 Go de poids, répartis sur les seize cartes</text>
<text x="8" y="154">Le tiers restant n'est pas du luxe : il accueille le cache et les requêtes en cours.</text>
<text x="8" y="172" class="viz-cle" style="text-transform:none">Deux serveurs de huit cartes</text>
</svg>
</div>
<figcaption>
S'il n'y avait qu'un calcul à retenir de tout l'article, ce serait celui-là : nombre de
paramètres × octets par paramètre. 405 milliards × 2 = 810 Go. C'est ce résultat qui décide
du matériel, et donc du budget.
</figcaption>
</figure>

On peut alléger tout ça en réduisant la précision : ranger chaque paramètre sur un octet au
lieu de deux, parfois moins. La mémoire nécessaire diminue d’autant, et la qualité baisse un
peu. C’est l’arbitrage que fait toute équipe qui héberge ses propres modèles.

## Le trajet, d’un coup d’œil

| | Étape | Ce qui s’y passe |
|---|---|---|
| 1 | Données | on collecte, puis on jette l’essentiel |
| 2 | Jetons | le texte devient des nombres |
| 3 | Transformeur | le modèle relie les jetons entre eux |
| 4 | Pré-entraînement | deviner le jeton suivant, des milliards de fois |
| 5 | Post-entraînement | apprendre à être utile, exact et sûr |
| 6 | Mise en service | répartir les poids et répondre à tout le monde |

## Le plus étonnant dans tout ça

Une fois qu’on a suivi le trajet du début à la fin, une chose frappe : on ne croise jamais
d’étape intelligente.

Découper du texte. Le convertir en nombres. Relier des jetons entre eux. Ajuster des
réglages quand on s’est trompé. Prise séparément, chaque opération est mécanique, presque
banale. On cherche le moment où quelque chose de plus se produirait, et ce moment n’arrive
jamais.

Ce qu’il y a à la place, c’est l’échelle. Un exercice tout simple — deviner ce qui vient
après — répété sur des billions de jetons, à travers des centaines de milliards de réglages,
pendant des mois.

La compétence ne se trouve donc nulle part en particulier. Elle apparaît quand on répète la
même petite opération un nombre de fois que personne n’arrive vraiment à se représenter.

On peut trouver ça rassurant, ou un peu vertigineux. Les deux se défendent.
