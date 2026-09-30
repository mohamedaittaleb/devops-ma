---
titre: "L'inférence vue par un DevOps : 21 concepts dans l'ordre d'une requête"
resume: "Un serveur d'inférence ne ressemble à aucun service que j'ai exploité. Prefill, KV cache, batching continu, parallélisme : les concepts rangés dans l'ordre où une requête les traverse, traduits en mots d'ops."
pilier: ai-devops
date: 2026-09-30
tags: ["inférence", "llm", "gpu", "vllm", "kv-cache", "performance"]
repo: null
---

J'ai exploité des API, des bases de données, des files de messages. Je sais lire un
tableau de bord de latence, dimensionner un pool de connexions, régler un autoscaler. Puis
on m'a confié un serveur d'inférence, et j'ai découvert que presque tous mes réflexes
étaient à reprendre.

La requête dure dix secondes au lieu de cinquante millisecondes. La mémoire se remplit
alors que le CPU dort. Le débit augmente quand on charge davantage la machine. Et le coût
se compte en jetons, pas en requêtes.

Le point de départ de cet article est un carrousel de Vishakha Sadhwani qui aligne une
vingtaine de concepts d'inférence. Je les ai repris un par un, mais rangés autrement :
**dans l'ordre où une requête les traverse**, de la passerelle jusqu'au dernier jeton
renvoyé. Pour chacun, je note ce qu'il désigne et à quoi il correspond dans le monde que je
connais déjà.

Pour ce qui se passe avant — comment un modèle est entraîné, ce qu'est un jeton —, voir
[le trajet complet d'un LLM](/articles/comment-un-llm-est-construit/). Ici, le modèle est
prêt, et il faut le servir.

## Le trajet, vu d'en haut

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 204" role="img" aria-labelledby="fig-trajet">
<title id="fig-trajet">Une requête traverse la passerelle, puis le moteur d'inférence qui la place dans un lot, calcule le prefill, remplit le KV cache et génère la réponse jeton par jeton.</title>
<g class="c-gris" fill="none" stroke="currentColor">
<rect x="8" y="70" width="80" height="50" rx="8"/>
<rect x="112" y="40" width="150" height="110" rx="8"/>
<rect x="286" y="16" width="346" height="170" rx="10" stroke-opacity=".6"/>
<rect x="300" y="54" width="96" height="40" rx="6"/>
</g>
<g class="c1"><rect x="412" y="54" width="92" height="40" rx="6" fill="currentColor" fill-opacity=".16" stroke="currentColor"/></g>
<g class="c-attention"><rect x="412" y="120" width="92" height="40" rx="6" fill="currentColor" fill-opacity=".18" stroke="currentColor"/></g>
<g class="c2"><rect x="530" y="120" width="88" height="40" rx="6" fill="currentColor" fill-opacity=".16" stroke="currentColor"/></g>
<g class="viz-repere" stroke-linecap="round" stroke-linejoin="round">
<path d="M88 95H110M104 91l6 4-6 4"/>
<path d="M262 95H284M278 91l6 4-6 4"/>
<path d="M396 74H410M404 70l6 4-6 4"/>
<path d="M458 94V118M454 112l4 6 4-6"/>
<path d="M506 134H528M522 130l6 4-6 4"/>
<path d="M528 146H506M512 142l-6 4 6 4"/>
<path d="M574 160V174H48V122M44 128l4-6 4 6"/>
</g>
<text x="48" y="100" text-anchor="middle" class="viz-fort">Client</text>
<text x="124" y="62" class="viz-fort">Passerelle</text>
<text x="124" y="88">authentification</text>
<text x="124" y="108">quota en jetons</text>
<text x="124" y="128">routage</text>
<text x="300" y="38" class="viz-fort">Moteur d'inférence</text>
<text x="348" y="79" text-anchor="middle">file + lot</text>
<text x="458" y="79" text-anchor="middle" class="viz-fort">prefill</text>
<text x="458" y="145" text-anchor="middle" class="viz-fort">KV cache</text>
<text x="574" y="145" text-anchor="middle" class="viz-fort">decode</text>
<text x="618" y="108" text-anchor="end">1 jeton par passe</text>
<text x="96" y="168">la réponse revient en flux</text>
</svg>
</div>
<figcaption>
Deux étages, comme partout : une passerelle qui décide qui a le droit d'entrer, et un
moteur qui fait le travail. Tout ce qui est nouveau pour un ops se trouve dans le second.
</figcaption>
</figure>

## La passerelle : un API gateway qui compte en jetons

**Inference Gateway (#5).** Elle authentifie, limite le débit, route vers la bonne
machine. Rien de neuf en apparence : c'est le rôle d'un Kong, d'un Envoy, d'un API
Gateway de fournisseur cloud.

La différence est dans l'unité. Une limite à « 100 requêtes par minute » ne veut rien dire
ici. Une requête de 50 jetons et une requête de 50 000 jetons n'occupent pas la carte le
même temps, et ne coûtent pas le même prix. La passerelle doit donc compter en **jetons
par minute**, et raisonner en budget par équipe ou par clé.

Elle a aussi un rôle de routage que je n'avais pas anticipé : envoyer une requête vers
le serveur qui a *déjà* une partie de son calcul en cache. On y revient plus bas avec le
prefix caching.

**Côté ops :** l'API gateway que je connais, avec deux changements. Le quota se compte en
jetons. Et l'équilibrage de charge en tourniquet (*round-robin*) cesse d'être le bon choix
par défaut.

## Deux phases qui n'ont rien à voir

Une fois dans le moteur, une requête passe par deux phases. C'est le concept qui a tout
débloqué pour moi, parce qu'il explique la plupart des comportements étranges.

**Transformers (#2).** Le modèle est une pile de couches. Dans chaque couche, chaque jeton
produit trois vecteurs : une requête (*Query*), une clé (*Key*) et une valeur (*Value*). La
clé et la valeur sont ce que les autres jetons consultent pour savoir « qui compte pour
moi ». Ce qu'il faut retenir côté exploitation : **chaque jeton déjà traité laisse derrière
lui une paire K/V par couche**, et ces paires sont réutilisées à chaque étape suivante.

**Prefill (#1).** Le moteur prend tout le prompt d'un coup et calcule les K/V de tous ses
jetons **en parallèle**. Deux mille jetons en entrée, c'est une seule grosse passe
matricielle. La carte est saturée en calcul, et c'est ce qu'on veut.

**Decode (#4).** Ensuite, la réponse sort **un jeton à la fois**. Pour produire le
suivant, le modèle a besoin de tous les K/V précédents. Il relit donc l'intégralité des
poids et du cache pour ne calculer qu'un seul jeton. Le calcul est minuscule, la lecture
mémoire énorme. La carte n'attend plus ses cœurs de calcul, elle attend sa mémoire.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 176" role="img" aria-labelledby="fig-phases">
<title id="fig-phases">Le prefill traite le prompt en un seul bloc, puis le decode produit la réponse par petites passes régulières. Le TTFT couvre le prefill, l'ITL l'écart entre deux jetons.</title>
<path d="M8 112H632" class="viz-repere"/>
<text x="632" y="130" text-anchor="end" class="viz-tick">temps →</text>
<g class="c1"><rect x="20" y="72" width="150" height="40" rx="4" fill="currentColor" fill-opacity=".2" stroke="currentColor"/></g>
<g class="c2" fill="currentColor">
<rect x="178" y="82" width="14" height="30" rx="2"/><rect x="198" y="82" width="14" height="30" rx="2"/><rect x="218" y="82" width="14" height="30" rx="2"/><rect x="238" y="82" width="14" height="30" rx="2"/><rect x="258" y="82" width="14" height="30" rx="2"/><rect x="278" y="82" width="14" height="30" rx="2"/><rect x="298" y="82" width="14" height="30" rx="2"/><rect x="318" y="82" width="14" height="30" rx="2"/><rect x="338" y="82" width="14" height="30" rx="2"/><rect x="358" y="82" width="14" height="30" rx="2"/><rect x="378" y="82" width="14" height="30" rx="2"/><rect x="398" y="82" width="14" height="30" rx="2"/><rect x="418" y="82" width="14" height="30" rx="2"/><rect x="438" y="82" width="14" height="30" rx="2"/><rect x="458" y="82" width="14" height="30" rx="2"/><rect x="478" y="82" width="14" height="30" rx="2"/><rect x="498" y="82" width="14" height="30" rx="2"/><rect x="518" y="82" width="14" height="30" rx="2"/><rect x="538" y="82" width="14" height="30" rx="2"/><rect x="558" y="82" width="14" height="30" rx="2"/><rect x="578" y="82" width="14" height="30" rx="2"/><rect x="598" y="82" width="14" height="30" rx="2"/>
</g>
<text x="95" y="97" text-anchor="middle" class="viz-fort">prefill</text>
<text x="20" y="60">2 000 jetons, une passe</text>
<text x="400" y="60" text-anchor="middle">decode : un jeton par passe, jusqu'à la fin</text>
<text x="20" y="18" class="viz-cle">Une requête, du point de vue de la carte</text>
<g class="viz-repere">
<path d="M20 142V150H178V142"/>
<path d="M198 142V150H218V142"/>
</g>
<text x="99" y="168" text-anchor="middle" class="viz-fort">TTFT</text>
<text x="208" y="168" text-anchor="middle" class="viz-fort">ITL</text>
<text x="236" y="168">l'écart entre deux jetons</text>
</svg>
</div>
<figcaption>
La durée totale d'une réponse vaut à peu près TTFT + ITL × nombre de jetons générés. Le
premier terme dépend surtout de la longueur de la question, le second de la longueur de la
réponse.
</figcaption>
</figure>

**Les deux métriques qui en découlent (#7 et #8).** Le carrousel en saute les numéros, mais
ce sont elles qui tombent logiquement à cette place :

- le **TTFT** (*Time To First Token*) mesure le temps jusqu'au premier jeton. Il est
  dominé par le prefill et par l'attente en file. C'est lui qui décide si l'interface
  paraît réactive ;
- l'**ITL** (*Inter-Token Latency*), qu'on trouve aussi sous le nom de TPOT, mesure
  l'écart entre deux jetons en decode. C'est lui qui décide si le texte défile vite ou lentement.

**Côté ops :** une seule latence ne suffit plus, il en faut deux. Un SLO du type « p95 <
2 s » n'a aucun sens pour une réponse qui dure légitimement vingt secondes. J'écris
maintenant des SLO séparés : TTFT p95 sous un seuil, ITL p95 sous un autre.

## Le KV cache : la vraie ressource rare

**KV Cache (#3).** Les paires K/V de tous les jetons, conservées dans la mémoire de la
carte pour ne pas les recalculer à chaque jeton généré. Sans lui, produire le centième
jeton demanderait de retraiter les quatre-vingt-dix-neuf précédents.

C'est l'équivalent le plus proche de **l'état de session**. Chaque requête en cours
occupe une part de mémoire proportionnelle à sa longueur, et cette part grossit d'un cran
à chaque jeton généré. Elle se calcule :

```text
octets par jeton = 2 (K et V) × couches × têtes K/V × dimension d'une tête × octets par valeur
```

Pour Llama 3.1 8B en 16 bits : 2 × 32 couches × 8 têtes × 128 × 2 octets = **128 Kio par
jeton**. Une conversation de 8 000 jetons immobilise donc 1 Gio de mémoire GPU, pour elle
seule, tant qu'elle est en cours.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 150" role="img" aria-labelledby="fig-budget">
<title id="fig-budget">Sur une carte de 80 Go avec un modèle de 8 milliards de paramètres, les poids prennent 16 Go, le KV cache environ 54 Go, et 10 % restent hors budget.</title>
<g class="c1"><rect x="8" y="46" width="124" height="40" rx="3" fill="currentColor"/></g>
<g class="c-gris"><rect x="133" y="46" width="15" height="40" fill="currentColor" fill-opacity=".5"/></g>
<g class="c2"><rect x="149" y="46" width="420" height="40" fill="currentColor" fill-opacity=".3" stroke="currentColor"/></g>
<g class="c-gris"><rect x="570" y="46" width="62" height="40" rx="3" fill="currentColor" fill-opacity=".15"/></g>
<text x="8" y="18" class="viz-cle">Une carte de 80 Go, Llama 3.1 8B en 16 bits</text>
<text x="8" y="38" class="viz-fort">poids · 16 Go</text>
<text x="160" y="38" class="viz-fort">KV cache · ≈ 54 Go</text>
<text x="632" y="38" text-anchor="end">hors budget</text>
<text x="70" y="71" text-anchor="middle" class="viz-sur-sombre">poids</text>
<text x="140" y="104" text-anchor="middle">activations</text>
<text x="601" y="104" text-anchor="middle">10 %</text>
<text x="8" y="136" class="viz-fort">54 Gio ÷ 128 Kio ≈ 440 000 jetons en vol, soit ≈ 54 conversations de 8 000 jetons.</text>
</svg>
</div>
<figcaption>
Ordres de grandeur, pas une mesure : le moteur réserve 90 % de la carte par défaut, et la
part des activations varie selon la configuration. Le raisonnement, lui, reste valable
pour n'importe quel modèle.
</figcaption>
</figure>

Ce calcul a changé ma façon de dimensionner. La question n'est plus « combien de
requêtes par seconde », mais **« combien de jetons simultanés tiennent dans ce qui reste
après les poids »**. Quand le cache est plein, le moteur ne ralentit pas : il met les
nouvelles requêtes en attente, ou il évince des requêtes en cours pour les recalculer plus
tard. Le TTFT explose, et le CPU reste à 5 %.

**Côté ops :** la mémoire par connexion d'une base de données, poussée à l'extrême. La
métrique d'occupation du KV cache est désormais la première que je regarde, avant
l'utilisation GPU.

## Trois techniques pour faire tenir plus de monde dans le cache

Puisque le cache est la ressource rare, une bonne partie des optimisations modernes
consiste à l'économiser.

### GQA et MQA : une propriété du modèle, pas un réglage

**GQA/MQA (#11).** Dans un modèle classique, chaque tête d'attention a ses propres K et V.
Le *Grouped-Query Attention* fait partager une paire K/V à plusieurs têtes de requête. Le
*Multi-Query Attention* pousse la logique jusqu'au bout, avec une seule paire pour toutes
les têtes.

L'effet se lit directement dans la formule plus haut, dans le facteur « têtes K/V ».
Llama 3.1 70B a 64 têtes de requête mais seulement 8 têtes K/V : 320 Kio par jeton. Sans
GQA, ce serait 64 têtes K/V et 2,5 Mio par jeton — **huit fois plus**. Une conversation de
8 000 jetons passerait de 2,5 Gio à 20 Gio.

**Côté ops :** je ne peux rien y régler, c'est l'architecture du modèle. En revanche, c'est
un critère de choix. À taille égale, deux modèles peuvent servir un nombre d'utilisateurs
très différent sur le même matériel. Le fichier `config.json` du modèle l'indique :
comparer `num_attention_heads` et `num_key_value_heads`.

### Paged attention : la mémoire virtuelle, appliquée au cache

**Paged Attention (#13).** Les premiers moteurs réservaient, pour chaque requête, un bloc
contigu de la taille du contexte maximal. Une requête qui s'arrêtait à 300 jetons
bloquait quand même la place de 8 000.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 196" role="img" aria-labelledby="fig-pages">
<title id="fig-pages">En réservation contiguë, les requêtes A et B bloquent des cases qu'elles n'utilisent pas. En pages, les blocs sont alloués à la demande et la place libérée accueille la requête C.</title>
<text x="8" y="18" class="viz-cle">Réservation contiguë, au contexte maximal</text>
<g class="c1">
<g fill="currentColor"><rect x="8" y="28" width="27" height="34" rx="3"/><rect x="39" y="28" width="27" height="34" rx="3"/><rect x="70" y="28" width="27" height="34" rx="3"/></g>
<g fill="none" stroke="currentColor" stroke-opacity=".6"><rect x="101" y="28" width="27" height="34" rx="3"/><rect x="132" y="28" width="27" height="34" rx="3"/><rect x="163" y="28" width="27" height="34" rx="3"/><rect x="194" y="28" width="27" height="34" rx="3"/><rect x="225" y="28" width="27" height="34" rx="3"/></g>
</g>
<g class="c2">
<g fill="currentColor"><rect x="256" y="28" width="27" height="34" rx="3"/><rect x="287" y="28" width="27" height="34" rx="3"/><rect x="318" y="28" width="27" height="34" rx="3"/><rect x="349" y="28" width="27" height="34" rx="3"/><rect x="380" y="28" width="27" height="34" rx="3"/></g>
<g fill="none" stroke="currentColor" stroke-opacity=".6"><rect x="411" y="28" width="27" height="34" rx="3"/><rect x="442" y="28" width="27" height="34" rx="3"/><rect x="473" y="28" width="27" height="34" rx="3"/></g>
</g>
<g class="c-gris" fill="none" stroke="currentColor"><rect x="504" y="28" width="27" height="34" rx="3"/><rect x="535" y="28" width="27" height="34" rx="3"/><rect x="566" y="28" width="27" height="34" rx="3"/><rect x="597" y="28" width="27" height="34" rx="3"/></g>
<text x="130" y="80" text-anchor="middle">A réserve 8 blocs, en remplit 3</text>
<text x="378" y="80" text-anchor="middle">B réserve 8 blocs, en remplit 5</text>
<text x="566" y="80" text-anchor="middle">libre, trop court</text>
<text x="8" y="112" class="viz-cle">Pages allouées à la demande</text>
<g class="c1" fill="currentColor"><rect x="8" y="122" width="27" height="34" rx="3"/><rect x="101" y="122" width="27" height="34" rx="3"/><rect x="194" y="122" width="27" height="34" rx="3"/></g>
<g class="c2" fill="currentColor"><rect x="39" y="122" width="27" height="34" rx="3"/><rect x="70" y="122" width="27" height="34" rx="3"/><rect x="132" y="122" width="27" height="34" rx="3"/><rect x="163" y="122" width="27" height="34" rx="3"/><rect x="225" y="122" width="27" height="34" rx="3"/></g>
<g class="c-bon" fill="currentColor"><rect x="256" y="122" width="27" height="34" rx="3"/><rect x="287" y="122" width="27" height="34" rx="3"/><rect x="318" y="122" width="27" height="34" rx="3"/><rect x="349" y="122" width="27" height="34" rx="3"/></g>
<g class="c-gris" fill="none" stroke="currentColor"><rect x="380" y="122" width="27" height="34" rx="3"/><rect x="411" y="122" width="27" height="34" rx="3"/><rect x="442" y="122" width="27" height="34" rx="3"/><rect x="473" y="122" width="27" height="34" rx="3"/><rect x="504" y="122" width="27" height="34" rx="3"/><rect x="535" y="122" width="27" height="34" rx="3"/><rect x="566" y="122" width="27" height="34" rx="3"/><rect x="597" y="122" width="27" height="34" rx="3"/></g>
<g text-anchor="middle" class="viz-sur-sombre">
<text x="21" y="144">A</text><text x="52" y="144">B</text><text x="83" y="144">B</text><text x="114" y="144">A</text><text x="145" y="144">B</text><text x="176" y="144">B</text><text x="207" y="144">A</text><text x="238" y="144">B</text>
<text x="269" y="144">C</text><text x="300" y="144">C</text><text x="331" y="144">C</text><text x="362" y="144">C</text>
</g>
<text x="8" y="184" class="viz-fort">Même mémoire, mêmes requêtes : la place gaspillée accueille C, et il en reste encore.</text>
</svg>
</div>
<figcaption>
Un bloc contient typiquement 16 jetons. Les blocs d'une même requête n'ont plus besoin
d'être voisins : une table de correspondance fait le lien, exactement comme la table des
pages d'un système d'exploitation.
</figcaption>
</figure>

L'article qui a présenté vLLM en 2023 mesurait que les systèmes de l'époque gaspillaient
entre 60 et 80 % de la mémoire du cache à cause de cette fragmentation. En découpant le
cache en pages allouées à la demande, le gaspillage tombait sous 4 %.

**Côté ops :** c'est la pagination de la mémoire virtuelle, appliquée au cache. Aujourd'hui
c'est le comportement par défaut des moteurs sérieux (vLLM, SGLang, TensorRT-LLM). Je
n'ai rien à activer, mais je sais maintenant pourquoi un vieux moteur « maison » servait
trois fois moins d'utilisateurs sur la même carte.

### Prefix caching : le cache de couches d'un Dockerfile

**Prefix Caching (#12).** Deux requêtes qui commencent par le même texte — même
instruction système, mêmes définitions d'outils — ont les mêmes K/V pour ce début. Le
moteur les garde et saute la partie correspondante du prefill.

C'est l'analogie qui m'a le plus servi, parce qu'elle est exacte : **le prefix caching se
comporte comme le cache de couches d'un `docker build`**. Tout ce qui précède la première
différence est réutilisé. Tout ce qui suit est recalculé, même si c'est identique plus
loin.

Les conséquences pratiques sont les mêmes qu'avec un Dockerfile :

- ce qui est stable va en haut : instruction système, puis outils, puis documents de
  référence ;
- ce qui varie va en bas : la question de l'utilisateur ;
- un horodatage ou un identifiant de requête glissé en première ligne du prompt invalide
  tout le cache, exactement comme un `COPY . .` placé trop tôt.

Il reste une condition, qui ramène à la passerelle : le cache vit dans la mémoire d'**un**
serveur. Si la deuxième requête atterrit sur un autre réplica, le cache ne sert à rien. D'où
l'intérêt d'un routage qui tient compte des préfixes, plutôt que du tourniquet.

**Côté ops :** activé par défaut dans les versions récentes de vLLM. Le travail se fait
surtout avec les équipes applicatives, pour qu'elles ordonnent leurs prompts, et sur le
routage.

## Le moteur : ordonnanceur avant tout

**Inference Engine (#6).** vLLM, SGLang, TensorRT-LLM, TGI. Le moteur charge le modèle,
reçoit les requêtes, les regroupe en lots, orchestre prefill et decode, gère le KV cache.
Vu de l'exploitation, c'est d'abord un **ordonnanceur** : son rôle principal est de décider
qui passe sur la carte à chaque étape.

**Continuous Batching (#14).** Le batching classique regroupe N requêtes, les traite
ensemble, et attend que la plus longue ait terminé avant d'en accepter de nouvelles. Une
réponse de 20 jetons reste bloquée derrière une réponse de 2 000. La carte tourne à vide
sur les places déjà libérées.

Le batching continu réévalue le lot **à chaque passe de decode**. Une requête qui termine
libère sa place, et une requête en attente la prend immédiatement. C'est la différence
entre un bus qui ne repart qu'une fois tous les passagers descendus au terminus et un
escalator où chacun monte et descend quand il veut.

C'est aussi ce qui explique le comportement qui m'avait le plus surpris : **le débit total
augmente avec la charge**. Le decode est limité par la lecture des poids, et ces poids sont
lus une fois par passe, que le lot contienne une requête ou soixante-quatre. Plus il y a de
requêtes dans le lot, plus cette lecture est amortie. Jusqu'au moment où le KV cache est
plein.

Voici à quoi ressemble un lancement. Presque chaque option renvoie à un concept de cet
article :

```bash
vllm serve meta-llama/Llama-3.1-8B-Instruct \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.90 \
  --max-num-seqs 64 \
  --enable-prefix-caching \
  --tensor-parallel-size 1
```

| Option | Ce qu'elle règle |
|---|---|
| `--max-model-len` | le plafond de contexte, donc le KV cache maximal d'une requête |
| `--gpu-memory-utilization` | la part de la carte réservée aux poids et au cache |
| `--max-num-seqs` | la taille maximale du lot en batching continu |
| `--enable-prefix-caching` | la réutilisation des préfixes communs |
| `--tensor-parallel-size` | le nombre de cartes sur lesquelles découper le modèle |

## Mesurer : débit, latence et coût

**Throughput (#9).** Le nombre de jetons générés par seconde, **toutes requêtes
confondues**. C'est la mesure de rendement de la machine.

Le piège, c'est qu'elle tire dans le sens inverse de la latence ressentie. Un lot plus
gros augmente le débit total mais allonge l'ITL de chacun, puisque chaque passe traite plus
de requêtes. Il n'existe pas de bon réglage dans l'absolu, seulement un arbitrage entre
« servir beaucoup de monde » et « servir chacun vite ». Un assistant interactif et un
traitement de nuit par lots ne se règlent pas pareil, même sur le même modèle.

**Cost per token (#10).** Le coût de calcul d'un jeton généré. La formule tient en une
ligne, et c'est elle que je ressors en réunion budgétaire :

```text
coût par million de jetons = prix horaire de la carte ÷ (débit en jetons/s × 3 600) × 1 000 000
```

Avec des chiffres ronds : une carte facturée 3 $ de l'heure qui soutient 2 000 jetons par
seconde produit 7,2 millions de jetons à l'heure, soit environ 0,42 $ le million. La même
carte chargée à 10 % coûte dix fois plus cher par jeton. Comme pour [les GPU dans un
cluster](/articles/gpu-openshift-quotidien-ops/), le prix de la carte ne bouge pas quand elle
ne fait rien.

**Côté ops :** le moteur expose tout cela en Prometheus. Les noms ont changé entre les
versions de vLLM, alors je vérifie toujours sur `/metrics` avant d'écrire une alerte. En
ce moment, cela ressemble à ceci :

```promql
# TTFT au 95e centile, sur 5 minutes
histogram_quantile(0.95, sum by (le) (rate(vllm:time_to_first_token_seconds_bucket[5m])))

# Requêtes en attente : si ça monte, le cache ou le lot est plein
vllm:num_requests_waiting

# Occupation du KV cache, entre 0 et 1
vllm:kv_cache_usage_perc
```

Si je ne devais mettre qu'une alerte en place, ce serait sur `num_requests_waiting`.
Tant qu'elle reste à zéro, la capacité suffit. Si elle grimpe, le TTFT va suivre.

## Réduire la facture sans changer de carte

**Quantization (#16).** Stocker les poids sur moins de bits : 8 au lieu de 16, parfois 4.
Pour un modèle de 70 milliards de paramètres, on passe de 140 Go en 16 bits à 70 Go en
8 bits, et à environ 40 Go en 4 bits. Le gain est double : le modèle tient sur moins de
cartes, et la mémoire libérée va au KV cache, donc à davantage d'utilisateurs simultanés.
Et comme le decode est limité par la lecture mémoire, lire moitié moins d'octets rend aussi
chaque passe plus rapide.

La contrepartie est une perte de qualité, faible en 8 bits, plus sensible en 4 bits et
très variable selon les tâches. Je ne la mesure pas « au ressenti » : je rejoue le jeu
d'évaluation de l'équipe sur les deux versions avant de basculer, comme pour n'importe
quelle migration.

**Speculative Decoding (#15).** Un petit modèle rapide propose plusieurs jetons d'avance, et
le grand modèle les vérifie **en une seule passe**. Tant que les propositions sont bonnes,
on obtient plusieurs jetons pour le prix d'une passe du grand modèle. Au premier refus, on
garde la correction du grand modèle et on repart de là.

Deux points m'ont rassuré. D'abord, avec la méthode de vérification standard, le texte
produit suit exactement la même distribution que celle du grand modèle seul : on gagne du
temps sans perdre en qualité. Ensuite, le gain dépend entièrement du taux d'acceptation.
Sur du texte prévisible (du code, des formats structurés), il est net. Sur du texte libre,
il peut devenir nul. Et sous forte charge, quand le lot est déjà plein, la carte n'a plus
de passes à gaspiller : l'intérêt baisse.

**Côté ops :** la quantification est l'optimisation que je propose en premier, parce
qu'elle se mesure facilement. Le décodage spéculatif vient ensuite, et seulement si le
problème est la latence d'un utilisateur, pas le débit global.

## Quand une carte ne suffit plus

Trois manières de répartir le travail sur plusieurs GPU. Je les confondais, alors qu'elles
correspondent à trois problèmes différents.

**Data Parallelism (#19).** Plusieurs copies complètes du modèle, chacune sur sa carte,
derrière un équilibreur. C'est celle que je connais déjà : ce sont des réplicas d'un
Deployment. Elle sert quand le modèle tient sur une carte et qu'il faut plus de capacité.

**Tensor Parallelism (#17).** Chaque couche est découpée, et chaque carte en calcule un
morceau. Les cartes doivent échanger leurs résultats **à chaque couche**, donc des
dizaines de fois par jeton. Ce n'est viable qu'avec une interconnexion très rapide entre
cartes (NVLink), c'est-à-dire à l'intérieur d'un même serveur.

**Pipeline Parallelism (#18).** Les couches sont réparties par tranches : les premières
sur la carte 1, les suivantes sur la carte 2, et ainsi de suite. Les cartes ne se passent
que les résultats intermédiaires, une fois par tranche. Le réseau est beaucoup moins
sollicité, ce qui permet de s'étendre sur plusieurs serveurs. Le prix à payer : des temps
morts, puisque la carte 3 attend que la 1 et la 2 aient fini.

La règle que j'applique en découle :

| Le problème | La réponse | L'équivalent que je connais |
|---|---|---|
| le modèle tient sur une carte, il manque de la capacité | data parallelism | des réplicas derrière un équilibreur |
| le modèle ne tient pas sur une carte | tensor parallelism, dans un serveur | un *scale-up*, qui exige un bus rapide |
| le modèle ne tient pas sur un serveur | pipeline parallelism, entre serveurs | une chaîne d'étapes, avec des temps morts |

En pratique, on combine souvent les trois : du tensor parallelism sur les huit cartes d'un
serveur, du pipeline entre deux serveurs, et plusieurs de ces ensembles en réplicas.

## Choisir le modèle à la volée

**Model Routing & Cascading (#20).** Toutes les requêtes n'ont pas besoin du plus gros
modèle. Un routeur oriente les questions simples vers un petit modèle rapide et bon marché,
et garde le grand modèle, ou un modèle de raisonnement, pour ce qui le justifie. La
cascade fait l'inverse : on essaie d'abord le petit, et on escalade si sa réponse ne passe
pas un contrôle.

**Côté ops :** c'est le choix d'une classe d'instance, fait requête par requête. Le gain sur
la facture peut être important. Mais le routeur devient un composant critique à part
entière, avec ses propres erreurs : une question difficile envoyée au petit modèle donne
une réponse médiocre, et rien ne lève d'alerte. La question que je pose est donc :
**comment mesure-t-on les erreurs du routeur ?**

## Le cas à part : la diffusion

**Diffusion Models (#21).** Les modèles d'image, et certains modèles vidéo, ne génèrent pas
jeton par jeton. Ils partent d'un bruit aléatoire et l'affinent en un nombre fixe
d'étapes, guidés par le plongement du prompt. Une dernière étape de décodage transforme le
résultat en image.

Presque tout ce qui précède cesse alors de s'appliquer. Il n'y a pas de KV cache qui
grossit, pas de flux de jetons, pas de TTFT. Le coût d'une requête est à peu près
**nombre d'étapes × résolution**, et il est connu dès l'arrivée. La latence est plus
prévisible, le dimensionnement plus classique. Les réglages qui comptent sont le nombre
d'étapes et la taille de sortie.

**Côté ops :** plus proche d'un traitement par lots que d'un service conversationnel. Je
le dimensionne comme un worker de file d'attente.

## Les 21, d'un coup d'œil

| # | Concept | Ce que c'est pour moi | La question que je pose |
|---|---|---|---|
| 5 | Passerelle | API gateway qui compte en jetons | le quota est-il en jetons ? |
| 2 | Transformeur | la pile de couches qui produit les K/V | — |
| 1 | Prefill | une grosse passe parallèle sur le prompt | quelle taille de prompt en p95 ? |
| 4 | Decode | un jeton par passe, limité par la mémoire | quelle longueur de réponse ? |
| 7 | TTFT | le temps de réaction | quel SLO ? |
| 8 | ITL | la vitesse de défilement | quel SLO ? |
| 3 | KV cache | l'état de session, en mémoire GPU | combien de jetons en vol ? |
| 11 | GQA/MQA | propriété du modèle qui divise le cache | combien de têtes K/V ? |
| 13 | Paged attention | la pagination, appliquée au cache | le moteur la fait-il ? |
| 12 | Prefix caching | le cache de couches d'un Dockerfile | les prompts sont-ils ordonnés ? |
| 6 | Moteur | un ordonnanceur | lequel, et quelle version ? |
| 14 | Batching continu | un escalator au lieu d'un bus | quelle taille de lot max ? |
| 9 | Débit | le rendement de la machine | à quelle latence ? |
| 10 | Coût par jeton | prix horaire ÷ débit | à quel taux d'occupation ? |
| 16 | Quantification | moins d'octets par poids | mesurée sur quelles évaluations ? |
| 15 | Décodage spéculatif | un brouillon vérifié en bloc | quel taux d'acceptation ? |
| 19 | Data parallelism | des réplicas | — |
| 17 | Tensor parallelism | découper les couches, dans un serveur | y a-t-il NVLink ? |
| 18 | Pipeline parallelism | découper la pile, entre serveurs | combien de temps morts ? |
| 20 | Routage de modèles | choisir la taille d'instance par requête | comment mesure-t-on ses erreurs ? |
| 21 | Diffusion | un traitement par lots à coût fixe | combien d'étapes ? |

## Ce que je retiens

**La ressource à surveiller, c'est la mémoire, pas le calcul.** Poids d'abord, KV cache
ensuite. Presque toutes les optimisations de la liste servent à faire tenir plus de
jetons dans la même carte. Le taux d'utilisation GPU affiché par défaut ne le montre pas.

**Deux phases, deux latences, deux SLO.** Le prefill décide du TTFT, le decode de l'ITL. Une
latence moyenne unique masque les deux problèmes.

**L'unité, c'est le jeton.** Pour les quotas, pour le dimensionnement, pour la facture. Une
métrique exprimée en requêtes est presque toujours la mauvaise.

**Beaucoup de choses sont déjà faites par le moteur.** Paged attention, batching continu,
prefix caching : je n'ai pas à les écrire. Ce qui me revient, c'est de choisir le moteur,
de le régler, de le mesurer, et d'expliquer aux équipes applicatives pourquoi l'ordre de
leur prompt a un effet sur la facture.

Pour moi, c'est la bonne nouvelle de ces 21 concepts. Aucun n'exige d'être chercheur. Ils
demandent le même travail que d'habitude : comprendre où est le goulot, puis mesurer.
