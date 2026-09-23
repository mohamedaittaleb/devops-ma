---
titre: "Des GPU dans un cluster OpenShift : ce qui change pour l'ops"
resume: "Un GPU ne se planifie pas comme un CPU, ne se surréserve pas, et coûte le même prix à l'arrêt qu'en charge. Ce que l'arrivée des cartes graphiques change concrètement dans l'exploitation d'un cluster."
pilier: devops
date: 2026-09-24
tags: ["openshift", "gpu", "kubernetes", "nvidia", "observabilité"]
repo: null
---

La demande arrive toujours de la même façon : « on a besoin de GPU sur le cluster ». Elle
a l'air d'une demande de capacité ordinaire, du même genre que « il nous faut deux nœuds
de plus ». Elle ne l'est pas.

Un CPU se partage, se surréserve et se récupère. Un GPU ne fait rien de tout ça par
défaut. Le planificateur que vous connaissez, les quotas que vous avez écrits, les
tableaux de bord que vous consultez le matin : les trois reposent sur des hypothèses qui
cessent d'être vraies. Voici ce qui change réellement, dans l'ordre où vous allez le
rencontrer.

## Trois ressources, trois comportements

Tout part de là. Le tableau ci-dessous est la seule chose à retenir si vous ne lisez rien
d'autre.

| | CPU | Mémoire | GPU |
|---|---|---|---|
| Divisible | oui, en millicœurs | oui, en octets | **non, par entier** |
| Surréservable | oui, c'est la norme | non | **non** |
| Comportement sous pression | ralentissement | expulsion, *OOMKill* | **rien : le pod reste en attente** |
| Coût à vide | faible | faible | **identique à pleine charge** |

Un CPU est *compressible* : deux conteneurs qui en demandent plus que disponible ralentissent
tous les deux, et le service continue. La mémoire est incompressible mais divisible : on
peut en demander 300 Mi. Un GPU n'est ni l'un ni l'autre. On en demande **un**, ou deux,
jamais 0,5. Et tant qu'aucun n'est libre, le pod reste en `Pending` — pas dégradé, pas
lent : à l'arrêt.

La conséquence sur le remplissage des nœuds est brutale. Sur un parc CPU, la surréservation
à 150 % est une pratique courante et saine. Sur un parc GPU, la même stratégie ne signifie
rien : il n'y a rien à surréserver. Si vous avez huit cartes et neuf équipes, la neuvième
attend.

## Avant d'écrire `nvidia.com/gpu`, deux opérateurs

Sur OpenShift, un nœud équipé d'une carte ne l'expose pas tout seul. Il faut deux
opérateurs, et comprendre pourquoi ils existe évite beaucoup de perplexité au premier
incident.

**Node Feature Discovery** parcourt le matériel de chaque nœud et pose des étiquettes. Pour
une carte NVIDIA, c'est l'identifiant constructeur PCI `10de` qui sert de marqueur :

```console
$ oc get nodes -l feature.node.kubernetes.io/pci-10de.present=true
NAME                       STATUS   ROLES    AGE   VERSION
worker-gpu-a              Ready    worker   31d   v1.31.4
worker-gpu-b              Ready    worker   31d   v1.31.4
```

**Le NVIDIA GPU Operator** prend le relais sur les nœuds ainsi étiquetés. Il installe le
pilote, l'intégration au moteur de conteneurs, le *device plugin* qui déclare la ressource
à Kubernetes, et l'exportateur de métriques.

Le point qui surprend les gens venus d'un Linux classique : **le pilote n'est pas installé
sur l'hôte**. RHCOS est un système immuable, on n'y fait pas de `dnf install`. Le pilote est
compilé et chargé depuis un conteneur, à partir d'une image de *Driver Toolkit* appariée à
la version exacte de RHCOS du nœud.

Retenez cette phrase, elle explique un incident sur deux : **la version du pilote est liée
à la version du noyau, donc à la version d'OpenShift**. Votre montée de version de cluster
est désormais couplée à une matrice de compatibilité fournisseur. C'est une contrainte
d'exploitation entièrement nouvelle, et elle n'apparaît nulle part dans vos procédures
actuelles.

## Le premier pod qui demande un GPU

Une fois l'opérateur en place, la ressource devient visible dans la capacité du nœud, comme
`cpu` et `memory` :

```console
$ oc describe node worker-gpu-a | grep -A4 Capacity
Capacity:
  cpu:             32
  memory:          263850372Ki
  nvidia.com/gpu:  2
```

La demande s'écrit alors ainsi :

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: entrainement
spec:
  containers:
    - name: tache
      image: registry.example.ma/ia/entrainement:2026.09
      resources:
        limits:
          # Une ressource etendue ne s'ecrit que dans `limits`, en entier.
          # Kubernetes aligne automatiquement `requests` sur la meme valeur :
          # il n'existe ni demi-GPU, ni GPU en rafale.
          nvidia.com/gpu: 1
```

Trois règles découlent de ce seul champ, et chacune casse une habitude :

- **Pas de valeur fractionnaire.** `nvidia.com/gpu: 0.5` est refusé à l'admission.
- **`requests` égale toujours `limits`.** Aucune marge, aucun *burst*.
- **L'attribution est exclusive.** Le conteneur obtient la carte entière, y compris quand il
  n'utilise que 3 % de sa mémoire.

Cette dernière règle est la source du gâchis dont on parlera plus bas.

## Protéger les nœuds coûteux

Un nœud GPU qui exécute un conteneur d'intégration continue est une perte sèche. La
protection se fait en deux temps, et les deux sont nécessaires.

**La souillure** empêche tout ce qui ne la tolère pas explicitement de s'y poser :

```console
$ oc adm taint node worker-gpu-a nvidia.com/gpu=true:NoSchedule
```

**Le sélecteur et la tolérance** font le chemin inverse, côté charge de travail :

```yaml
spec:
  nodeSelector:
    nvidia.com/gpu.present: "true"
  tolerations:
    - key: nvidia.com/gpu
      operator: Exists
      effect: NoSchedule
```

Sans la souillure, n'importe quel pod atterrit sur la machine la plus chère du parc. Sans
le sélecteur, votre tâche d'entraînement se retrouve sur un nœud sans carte et échoue à
l'exécution plutôt qu'à la planification — un échec beaucoup plus pénible à diagnostiquer.

Ajoutez un quota, parce qu'une ressource rare sans quota devient la propriété de la
première équipe qui déploie :

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: quota-gpu
  namespace: equipe-ia
spec:
  hard:
    requests.nvidia.com/gpu: "4"
```

## Partager une carte : deux mécanismes, pas interchangeables

Arrive inévitablement le moment où huit personnes veulent expérimenter sur deux cartes.
Deux réponses existent, et les confondre coûte cher.

| | Découpage temporel | MIG |
|---|---|---|
| Principe | les processus se relaient sur la carte | partition matérielle de la carte |
| Isolation mémoire | **aucune** | complète |
| Isolation des pannes | aucune | complète |
| Matériel requis | toute carte récente | A100, H100 et suivantes |
| Bon pour | notebooks, essais, inférence légère | production, multi-équipes |

**Le découpage temporel** se configure par une carte de configuration lue par le *device
plugin* :

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: decoupage-temporel
  namespace: nvidia-gpu-operator
data:
  quatre-parts: |-
    version: v1
    sharing:
      timeSlicing:
        resources:
          - name: nvidia.com/gpu
            replicas: 4
```

Une carte physique est alors annoncée comme quatre unités attribuables. Le mot important
est **annoncée** : rien n'est isolé. Les quatre processus se partagent la même mémoire
embarquée, et celui qui en réclame trop fait tomber les trois autres. Ce n'est pas une
limitation de configuration, c'est le mécanisme lui-même. À réserver aux usages où une
interruption est sans conséquence.

**MIG** découpe la carte au niveau matériel, avec une mémoire et des unités de calcul
dédiées par partition. Un profil se pose par étiquette de nœud :

```console
$ oc label node worker-gpu-a nvidia.com/mig.config=all-1g.5gb --overwrite
```

Le gestionnaire MIG de l'opérateur reconfigure la carte et expose les partitions. C'est la
seule option défendable dès qu'une charge de production et une charge d'expérimentation
coexistent sur le même matériel.

## Le tableau de bord qui change de forme

L'exportateur DCGM, déployé par l'opérateur, publie les métriques dans la supervision
intégrée d'OpenShift. Deux séries suffisent pour commencer, et ce sont deux séries que vous
n'aviez pas :

```promql
# Taux d'occupation du calcul, par carte et par nœud
DCGM_FI_DEV_GPU_UTIL

# Mémoire embarquée consommée, en Mio
DCGM_FI_DEV_FB_USED
```

C'est ici que l'exploitation d'un parc GPU se sépare vraiment de celle d'un parc CPU. La
requête qui compte n'est pas un pic, c'est une moyenne longue :

```promql
avg_over_time(DCGM_FI_DEV_GPU_UTIL[7d])
```

Sur la plupart des parcs, ce chiffre est bas — souvent très bas. Non par négligence, mais
par construction : un notebook ouvert réserve la carte entière pendant huit heures et ne
calcule que par courtes rafales. Le pod est en cours d'exécution, le quota est consommé, la
facture court, et la carte ne fait rien.

**Ce chiffre est le seul argument utilisable en arbitrage budgétaire.** Tant que personne
ne le mesure, la conversation sur l'achat de cartes supplémentaires reste une conversation
d'opinion. Une fois mesuré, il déplace la question : faut-il acheter du matériel, ou
récupérer celui qui dort ?

Les deux séries se lisent ensemble, et leur croisement est révélateur :

| Occupation | Mémoire | Interprétation |
|---|---|---|
| Basse | Basse | carte réservée pour rien — à récupérer |
| Basse | Haute | modèle chargé, peu sollicité — candidat au partage |
| Haute | Basse | calcul efficace — rien à faire |
| Haute | Haute | carte saturée — celle qu'il faut dupliquer |

## Ce qui casse, et que vous n'aviez pas avant

**La montée de version du cluster.** Elle change le noyau RHCOS, donc oblige le pilote à se
recompiler. Une incompatibilité dans la matrice fournisseur, et les nœuds GPU redémarrent
sans carte utilisable. Conséquence pratique : les nœuds GPU sortent du canal de mise à jour
automatique, et une version de préproduction avec la même carte devient nécessaire. Ça n'a
l'air de rien écrit ici ; c'est une machine supplémentaire à justifier au budget.

**Le poids des images.** Une image contenant CUDA et une pile d'apprentissage pèse
couramment plusieurs gigaoctets. Le premier démarrage sur un nœud neuf se compte en
minutes, pas en secondes. En environnement déconnecté, cela se répercute sur le miroir de
registre et sur le disque des nœuds — des dimensionnements à revoir, pas seulement à
surveiller.

**Le démarrage à froid.** Au téléchargement de l'image s'ajoute le chargement des poids en
mémoire de la carte. Une mise à l'échelle qui répondait en trente secondes sur du CPU peut
en demander plusieurs minutes. Toute politique d'autoscaling calibrée sur des temps CPU est
à recalculer.

**L'autoscaling lui-même.** Ajouter un nœud GPU est lent et cher. Le réflexe de laisser le
`ClusterAutoscaler` absorber les pics devient coûteux. Sur ce type de parc, une file
d'attente explicite est souvent plus économique qu'une élasticité qui s'exerce sur la
ressource la plus chère du cluster.

## Ce que je retiens

**La ressource rare n'est plus le CPU.** Les réflexes de remplissage, de surréservation et
de tolérance à la contention ne se transposent pas. Un parc GPU se gère comme un stock, pas
comme une capacité élastique.

**Mesurer l'occupation avant d'acheter.** C'est la première chose à mettre en place, avant
même le partage de cartes. Dans beaucoup de cas, le matériel nécessaire est déjà là, réservé
par des pods qui ne calculent pas.

**Ne pas proposer le découpage temporel en production.** Il se configure en dix lignes et
donne l'illusion d'avoir quadruplé le parc. L'absence d'isolation mémoire se paie au premier
incident, et se paie devant l'équipe à qui on l'avait recommandé.

**Sortir les nœuds GPU du cycle de mise à jour standard.** Le couplage pilote–noyau est réel.
Le découvrir pendant une montée de version un mardi matin n'est pas la bonne façon de
l'apprendre.
