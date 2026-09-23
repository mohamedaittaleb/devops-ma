---
titre: "Ce que coûte vraiment un agent de revue de code"
resume: "Un agent branché sur les pull requests d'une équipe de six personnes : le compte de jetons réel, ce qu'il a trouvé que la CI ne trouvait pas, et les trois réglages qui ont divisé la facture par quatre."
pilier: ai-devops
date: 2026-09-21
tags: ["agents", "revue-de-code", "coût", "ci"]
repo: null
---

« On branche un agent sur les pull requests » est une phrase qui coûte entre trois euros et
trois cents euros par mois selon la façon dont on l'implémente, pour une qualité de revue
à peu près identique. L'écart ne vient pas du modèle choisi : il vient de ce qu'on lui
envoie.

Voici le relevé d'un trimestre sur un dépôt réel — six développeurs, environ 40 pull
requests par semaine, un monorepo TypeScript — et les trois changements qui ont fait
l'essentiel de la différence.

## Comment compter, avant de discuter du prix

Le prix par million de jetons change, dépend du modèle et se lit sur la page tarifaire du
fournisseur. Le nombre de jetons, lui, dépend de vous, et c'est la seule variable sur
laquelle vous pouvez agir. C'est donc celle qu'il faut journaliser.

Toute réponse d'API renvoie son compte d'usage. Il suffit de l'écrire quelque part avec de
quoi l'attribuer :

```ts
const reponse = await client.messages.create({
  model: 'claude-sonnet-5',
  max_tokens: 4096,
  messages,
});

// Journaliser AVANT de se demander si c'est cher : sans ces lignes,
// toute discussion sur le coût est une conversation d'opinion.
journal.info('revue_terminee', {
  pr: contexte.numeroPR,
  depot: contexte.depot,
  fichiers_envoyes: fichiersRetenus.length,
  entree: reponse.usage.input_tokens,
  entree_cache_ecriture: reponse.usage.cache_creation_input_tokens,
  entree_cache_lecture: reponse.usage.cache_read_input_tokens,
  sortie: reponse.usage.output_tokens,
});
```

Le coût mensuel se reconstitue ensuite par une agrégation, en appliquant les tarifs en
vigueur à chaque colonne — les jetons lus depuis le cache et les jetons d'entrée normaux
n'ont pas le même prix, et c'est précisément ce déséquilibre qu'on va exploiter.

## Le relevé de départ

Première version, la plus naïve : à chaque `pull_request` ouverte ou synchronisée, envoyer
le diff complet plus les fichiers touchés en entier.

| | Médiane par PR | Pire cas observé |
|---|---|---|
| Fichiers envoyés | 14 | 210 |
| Jetons d'entrée | 48 000 | 610 000 |
| Jetons de sortie | 900 | 2 400 |
| Appels par PR | 3,8 | 17 |

3,8 appels par pull request : c'est le point qui saute aux yeux. L'agent était déclenché
sur `synchronize`, donc chaque `git push --force` pendant une revue relançait une analyse
complète. L'essentiel de la facture payait la relecture de code déjà relu.

## Changement 1 — ne pas relire ce qui n'a pas bougé

Le déclencheur est passé de « chaque poussée » à « la première poussée, puis seulement sur
demande explicite », avec un anti-rebond :

```yaml
on:
  pull_request:
    types: [opened, ready_for_review]
  issue_comment:
    types: [created]

concurrency:
  group: revue-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true

jobs:
  revue:
    # Sur commentaire, n'agir que sur "/revue" dans une PR.
    if: >
      github.event_name == 'pull_request' ||
      (github.event.issue.pull_request && startsWith(github.event.comment.body, '/revue'))
```

Les brouillons sont exclus par construction : `ready_for_review` ne se déclenche que quand
l'auteur estime son travail lisible. C'est aussi, accessoirement, le moment où une revue
sert à quelque chose.

**3,8 → 1,2 appel par PR.** Soit −68 % de facture pour zéro perte : les 2,6 appels
supprimés relisaient des versions intermédiaires que personne n'a jamais ouvertes.

## Changement 2 — envoyer le diff, pas le dépôt

Le réflexe « donnons-lui tout le contexte » est coûteux et contre-productif. Un fichier de
2 000 lignes dont 6 ont changé noie les 6 lignes qui comptent.

```ts
const IGNORES = [
  /^package-lock\.json$/,       // bruit pur : des milliers de lignes, zéro jugement à porter
  /^(dist|build|\.next)\//,
  /\.(snap|svg|png|jpg|woff2?)$/,
  /\.generated\.ts$/,
];

const fichiersRetenus = fichiersDuDiff
  .filter((f) => !IGNORES.some((re) => re.test(f.chemin)))
  .filter((f) => f.statut !== 'removed')       // relire du code supprimé n'apporte rien
  .filter((f) => f.ajouts + f.suppressions <= 400)
  .slice(0, 25);                                // au-delà, la PR doit être découpée, pas analysée
```

Pour chaque fichier retenu, l'agent reçoit le *hunk* modifié avec vingt lignes de contexte
de part et d'autre, et non le fichier entier. S'il lui manque quelque chose, il dispose
d'un outil pour demander la lecture d'un fichier précis — ce qu'il fait dans moins d'une
revue sur cinq, à un coût bien inférieur à celui d'envoyer tout systématiquement.

La limite de 25 fichiers est une décision de produit, pas une économie : au-delà,
l'agent poste « cette pull request touche 60 fichiers, elle devrait être découpée » et
s'arrête. C'est le commentaire le plus utile qu'il puisse produire dans ce cas.

**48 000 → 11 000 jetons d'entrée médians.**

## Changement 3 — mettre en cache ce qui ne change jamais

L'instruction système — conventions du dépôt, ce qu'il faut signaler, ce qu'il faut
ignorer, format de sortie — faisait 3 400 jetons, renvoyés intégralement à chaque appel.
Marquée comme cacheable, elle est facturée une fois à l'écriture puis à un tarif réduit en
lecture :

```ts
const reponse = await client.messages.create({
  model: 'claude-sonnet-5',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: instructionsDuDepot,           // stable d'un appel à l'autre
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [{ role: 'user', content: diffFormate }],
});
```

Le préfixe doit être **strictement identique** d'un appel à l'autre : une date, un numéro
de PR ou un nom de branche glissés dans l'instruction système invalident le cache à chaque
fois. Ce genre de détail se vérifie dans le journal — `cache_read_input_tokens` à zéro sur
tous les appels signifie que le cache ne sert à rien, et c'est passé inaperçu pendant deux
semaines chez nous parce que personne ne regardait cette colonne.

Sur 40 PR par semaine, le cache reste chaud une bonne partie de la journée ouvrée.

## Le compte final

| | Version 1 | Version 3 |
|---|---|---|
| Appels par PR | 3,8 | 1,2 |
| Jetons d'entrée par PR (médiane) | 48 000 | 11 000 |
| dont lus depuis le cache | 0 | 3 400 |
| Jetons de sortie par PR | 900 | 1 100 |
| **Jetons d'entrée facturés / semaine** | ≈ 7,3 M | ≈ 0,41 M |

Un facteur **dix-huit** sur l'entrée, sans changer de modèle et sans dégrader la revue —
les commentaires sont même devenus plus pertinents, parce que le signal n'est plus noyé.
Multipliez par le tarif en vigueur du modèle que vous utilisez pour obtenir votre facture :
le calcul tient sur une ligne, et c'est le seul chiffre qui vous concerne.

## Ce qu'il trouve, et ce qu'il ne trouve pas

Sur un trimestre, 213 commentaires postés, triés à la main :

| Catégorie | Part | Utile ? |
|---|---|---|
| Cas limite non couvert (nul, tableau vide, erreur non gérée) | 31 % | oui, régulièrement |
| Incohérence avec une convention du dépôt | 24 % | oui |
| Test manquant sur une branche ajoutée | 18 % | oui |
| Reformulation de ce que le code fait déjà | 15 % | non, bruit |
| Faux positif (contexte manquant) | 12 % | non |

**Ce qu'il attrape que la CI n'attrape pas :** la cohérence. Un linter ne sait pas que ce
dépôt renvoie ses erreurs par un type `Resultat` et pas par des exceptions ; l'agent, à qui
on l'a écrit une fois, le signale à chaque écart. C'est répétitif, jamais fatigué, et
c'était exactement le genre de remarque que les relecteurs humains cessaient de faire après
la troisième fois.

**Ce qu'il n'attrape pas :** tout ce qui demande de connaître l'intention. Aucun des trois
bugs sérieux du trimestre — une logique de facturation inversée, une condition de course
sur un travail de fond, une migration non réversible — n'a été signalé. Ils étaient
parfaitement corrects en tant que code. Ils étaient faux en tant que décision.

Un quart des commentaires est du bruit. C'est le chiffre qu'il faut annoncer à l'équipe
avant de brancher l'agent, sinon la confiance se perd sur les premiers faux positifs et
l'outil est désactivé au bout d'un mois.

## Ce que je ferais différemment

**Journaliser l'usage dès le premier jour.** Nous avons ajouté ces quatre lignes après six
semaines. Les six premières semaines sont donc une zone d'ombre, et je ne peux pas dire ce
qu'elles ont coûté.

**Ne pas lui donner le droit de bloquer la fusion.** Il commente, il ne vote pas. Un agent
qui bloque une pull request sur un faux positif à 19 h un vendredi est un agent qu'on
désactive le lundi.

**Écrire les conventions du dépôt d'abord.** L'essentiel de la qualité des commentaires
vient de ce fichier d'instructions, pas du modèle. Une journée passée à le rédiger a plus
amélioré les revues que n'importe quel changement de configuration décrit ici.
