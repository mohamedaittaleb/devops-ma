---
titre: "De 9 à 2 minutes : découper un pipeline GitHub Actions"
resume: "Le pipeline d'un monorepo Node mettait neuf minutes. Trois changements — annulation des runs obsolètes, cache des dépendances, cache de build Docker — l'ont ramené à deux."
pilier: devops
date: 2026-09-08
tags: ["github-actions", "ci", "cache", "docker"]
repo: null
---

Un pipeline lent ne coûte pas seulement des minutes de runner. Il coûte le fait que
personne ne pousse une correction d'une ligne un vendredi à 17 h. Neuf minutes, c'est
assez long pour changer d'onglet, et assez court pour ne pas faire autre chose : le pire
intervalle possible.

Voici comment celui d'un monorepo Node (trois paquets, une image Docker) est passé à deux
minutes, et surtout comment la mesure a été faite — parce que les deux premières
optimisations que j'avais en tête n'étaient pas les bonnes.

## Mesurer avant de toucher quoi que ce soit

L'interface web de GitHub donne la durée totale d'un run, ce qui ne dit rien. La
répartition par étape s'obtient en ligne de commande :

```bash
# Les 20 derniers runs du workflow CI sur la branche par défaut
gh run list --workflow=ci.yml --branch=main --limit=20 \
  --json databaseId,conclusion,createdAt,updatedAt \
  --jq '.[] | select(.conclusion=="success")
        | {id: .databaseId,
           minutes: (((.updatedAt | fromdate) - (.createdAt | fromdate)) / 60)}'
```

Puis, sur un run représentatif, le détail étape par étape :

```bash
gh api repos/:owner/:repo/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | {job: .name,
                   steps: [.steps[] | {name, started_at, completed_at}]}'
```

Le relevé sur dix runs verts donnait ceci :

| Étape | Durée médiane |
|---|---|
| `actions/checkout` | 6 s |
| Installation des dépendances (`npm ci`) | 1 min 52 |
| Lint | 41 s |
| Tests unitaires | 1 min 10 |
| Build des paquets | 58 s |
| Build + push de l'image Docker | 3 min 48 |
| Divers (démarrage du runner, upload) | 25 s |

Deux postes pèsent 5 min 40 à eux seuls : `npm ci` et le build Docker. Le lint et les
tests, que je soupçonnais, sont hors sujet. C'est exactement pour cette raison qu'on
mesure : j'aurais passé l'après-midi à paralléliser des tests qui coûtent 1 min 10.

## 1. Arrêter de payer pour des runs périmés

Avant même d'accélérer quoi que ce soit : sur une branche active, trois poussées
successives lançaient trois pipelines complets, dont seul le dernier intéresse quelqu'un.
Les deux premiers consomment des runners et, sur un compte à concurrence limitée, ils
retardent le troisième.

```yaml
# .github/workflows/ci.yml
concurrency:
  # Un groupe par branche (ou par PR) : le nouveau run annule le précédent.
  group: ci-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  # Jamais sur main : chaque commit de la branche par défaut garde son run.
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Ça ne raccourcit aucun pipeline. Ça supprime les deux tiers de la file d'attente les jours
de forte activité, ce qui est le vrai gain quand on attend un runner libre.

## 2. Le cache des dépendances : pas celui qu'on croit

`actions/setup-node` sait gérer le cache npm, mais l'option par défaut ne met en cache que
le *cache global* de npm (`~/.npm`), pas `node_modules`. `npm ci` continue donc à
décompresser et à recopier l'arborescence, ce qui reste long sur un monorepo.

Le premier réflexe — mettre `node_modules` en cache — est une mauvaise idée : le contenu
dépend de la plateforme, les paquets compilés nativement s'y invitent, et une restauration
partielle produit des erreurs incompréhensibles. La bonne clé de cache, c'est le cache npm
plus un `npm ci` qui n'a plus rien à télécharger :

```yaml
      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
          # Sur un monorepo, tous les lockfiles comptent dans la clé.
          cache-dependency-path: '**/package-lock.json'

      - name: Installer les dépendances
        # --prefer-offline : n'interroge le registre que pour ce qui manque.
        # --no-audit / --no-fund : deux appels réseau qui n'apportent rien en CI.
        run: npm ci --prefer-offline --no-audit --no-fund
```

`npm ci` passe de **1 min 52 à 38 s**. L'essentiel du reste est incompressible : c'est de
l'écriture disque.

## 3. Le build Docker : un cache, mais pas dans le registre

Le build d'image était le poste le plus lourd, et pour une raison bête : sans cache, chaque
run réinstalle les dépendances *une deuxième fois*, à l'intérieur de l'image.

J'ai d'abord essayé `type=registry`, qui stocke le cache comme une image dans GHCR. Ça
marche, mais le push et le pull du cache coûtaient presque autant que ce qu'ils
économisaient sur un runner GitHub hébergé — la bande passante vers le registre est le
facteur limitant. Le cache `type=gha`, servi par l'infrastructure de cache de GitHub
Actions elle-même, est sur le même réseau :

```yaml
      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`mode=max` met aussi en cache les couches intermédiaires des étapes multi-stage — sans
lui, seule l'image finale est mise en cache et les étapes de build sont rejouées.

Le Dockerfile compte au moins autant que le workflow. L'ordre des instructions décide de
ce qui est réutilisable :

```dockerfile
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# Copier les manifestes SEULS : cette couche ne change que si le lockfile change.
COPY package.json package-lock.json ./
COPY packages/*/package.json ./packages/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
USER node
CMD ["node", "dist/serveur.js"]
```

Build Docker : **3 min 48 → 47 s** quand le lockfile n'a pas bougé, ce qui est le cas de
la grande majorité des commits.

## 4. Paralléliser ce qui reste

Le lint, les tests et le build des paquets étaient enchaînés dans un seul job. Ils ne
dépendent pas les uns des autres : trois jobs qui partagent le même cache tournent en
parallèle, et le temps total devient celui du plus lent.

```yaml
jobs:
  verifier:
    strategy:
      fail-fast: true
      matrix:
        tache: [lint, test, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci --prefer-offline --no-audit --no-fund
      - run: npm run ${{ matrix.tache }}

  image:
    # L'image n'est construite que si les trois vérifications passent.
    needs: verifier
    runs-on: ubuntu-latest
    steps: [] # voir plus haut
```

`fail-fast: true` est délibéré : si le lint échoue, l'exécution des tests ne m'apprendra
rien que je ne doive de toute façon corriger.

## Le résultat

| | Avant | Après |
|---|---|---|
| Installation des dépendances | 1 min 52 | 38 s |
| Lint + tests + build | 2 min 49 (en série) | 1 min 12 (en parallèle) |
| Build de l'image | 3 min 48 | 47 s |
| **Total, cache chaud** | **9 min 10** | **2 min 04** |
| Total, cache froid | 9 min 10 | 6 min 30 |

Le cache froid — première exécution sur une nouvelle branche, ou après une modification du
lockfile — reste à 6 min 30. C'est le chiffre honnête à retenir : l'optimisation ne
supprime pas le travail, elle évite de le refaire.

## Ce qui n'a pas marché

**Les runners auto-hébergés.** Testés sur une machine à 24 €/mois : 40 s de gagnées sur le
démarrage, en échange d'une machine à maintenir, à mettre à jour et à surveiller. Pour un
dépôt public avec des minutes gratuites, le calcul est vite fait. Pour un dépôt privé qui
consomme des milliers de minutes par mois, il peut s'inverser — mais alors il faut compter
le temps d'exploitation, pas seulement le prix du serveur.

**Le cache `type=registry`.** Décrit plus haut : correct en théorie, plus lent en pratique
sur un runner hébergé. Il redevient pertinent sur des runners auto-hébergés proches du
registre.

**`npm ci --omit=dev` dans le job de test.** Évidemment : les outils de test *sont* des
dépendances de développement. Cinq minutes perdues à comprendre pourquoi `vitest` était
introuvable.

## Ce que je surveille maintenant

Un pipeline rapide se dégrade silencieusement — une dépendance de plus ici, une étape de
plus là. Un relevé mensuel de la durée médiane des runs verts sur `main`, avec la même
commande `gh run list` qu'au début, suffit à voir la dérive avant qu'elle ne redevienne
insupportable.
