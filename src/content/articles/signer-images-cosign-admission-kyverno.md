---
titre: "Signer ses images avec Cosign, puis refuser les autres à l'admission"
resume: "Signer une image ne protège rien tant que le cluster accepte encore les images non signées. Signature sans clé depuis GitHub Actions, vérification par Kyverno, et la migration Audit → Enforce."
pilier: devsecops
date: 2026-09-15
tags: ["cosign", "kyverno", "supply-chain", "kubernetes", "sigstore"]
repo: null
---

Signer ses images de conteneurs est devenu facile. Le piège est ailleurs : une signature
que personne ne vérifie ne fait rien d'autre que décorer un registre. Tant que le cluster
démarre encore des images non signées, la chaîne n'est pas protégée — elle est seulement
documentée.

Cet article couvre les deux moitiés : signer sans gérer de clé privée depuis GitHub
Actions, puis refuser à l'admission tout ce qui n'est pas signé par ce pipeline précis.

## Pourquoi « sans clé » plutôt qu'une paire de clés

Le mode classique de Cosign utilise une paire de clés : `cosign generate-key-pair`, la clé
privée en secret CI, la clé publique dans la politique d'admission. Ça marche, et ça
déplace le problème : vous avez maintenant une clé privée à stocker, à faire tourner, et à
révoquer le jour où un runner est compromis.

Le mode *keyless* supprime la clé. À la place :

1. GitHub Actions émet un jeton OIDC de courte durée qui décrit le workflow en train de
   tourner (dépôt, branche, nom du fichier de workflow).
2. Cosign échange ce jeton auprès de Fulcio contre un certificat X.509 valable **dix
   minutes**, dont les extensions reprennent ces informations.
3. La signature et le certificat sont publiés dans Rekor, le journal de transparence, puis
   attachés à l'image dans le registre.

Ce qui est vérifié à l'arrivée n'est donc pas « quelqu'un qui détenait la clé », mais
« le workflow `release.yml` du dépôt `org/app`, sur la branche `main` ». C'est une
affirmation beaucoup plus utile — et il n'y a plus rien à révoquer.

## Signer dans le pipeline

Deux points comptent plus que le reste : la permission `id-token: write`, sans laquelle il
n'y a pas de jeton OIDC, et le fait de **signer le digest, jamais le tag**.

```yaml
# .github/workflows/release.yml
name: release

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  packages: write
  id-token: write   # indispensable : c'est lui qui autorise le jeton OIDC

jobs:
  publier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.ref_name }}

      - uses: sigstore/cosign-installer@v4

      - name: Signer l'image
        env:
          # Le digest sorti de build-push-action, pas le tag : un tag est mutable,
          # et signer un tag revient à signer une promesse que n'importe qui peut réécrire.
          IMAGE: ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}
        run: cosign sign --yes "$IMAGE"
```

Le `--yes` accepte la publication dans le journal de transparence public. C'est le
comportement voulu pour un projet public : Rekor est ce qui rend la signature vérifiable
par un tiers. Pour une image privée, cette entrée révèle le nom du dépôt et le digest —
jamais le contenu — ce qui suffit parfois à motiver un Rekor privé.

Vérification en ligne de commande, avant même de parler du cluster :

```bash
cosign verify \
  --certificate-identity-regexp '^https://github\.com/org/app/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  ghcr.io/org/app@sha256:<digest> | jq .
```

Si cette commande échoue, inutile de continuer : la politique d'admission échouera de la
même façon, en plus difficile à déboguer.

## Vérifier à l'admission avec Kyverno

Le webhook d'admission est le seul endroit où la signature devient contraignante. Kyverno
sait le faire sans code, avec une règle `verifyImages` :

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: exiger-images-signees
spec:
  validationFailureAction: Audit   # Enforce seulement après la phase d'observation
  background: false
  webhookTimeoutSeconds: 30
  rules:
    - name: verifier-signature-ghcr
      match:
        any:
          - resources:
              kinds: [Pod]
      # Les espaces de noms système déploient des images que nous ne signons pas.
      exclude:
        any:
          - resources:
              namespaces: [kube-system, kyverno, flux-system]
      verifyImages:
        - imageReferences:
            - "ghcr.io/org/*"
          # Réécrit le tag en digest dans le Pod admis : ce qui a été vérifié
          # est exactement ce qui sera exécuté, même si le tag bouge ensuite.
          mutateDigest: true
          required: true
          attestors:
            - count: 1
              entries:
                - keyless:
                    issuer: "https://token.actions.githubusercontent.com"
                    subject: "https://github.com/org/app/.github/workflows/release.yml@refs/tags/*"
                    rekor:
                      url: https://rekor.sigstore.dev
```

Trois détails qui décident du résultat :

- **`mutateDigest: true`** ferme la fenêtre entre vérification et exécution. Sans lui, la
  politique valide `app:v1.2.3`, et rien n'empêche ce tag de pointer ailleurs entre
  l'admission et le `docker pull` du kubelet.
- **`subject`** doit être aussi étroit que possible. `https://github.com/org/*` accepterait
  n'importe quel workflow de l'organisation, y compris celui qu'un contributeur vient
  d'ajouter dans une pull request.
- **`exclude`** n'est pas une commodité : sans lui, la première mise à jour de `kube-system`
  bloque, et l'incident qui suit fera supprimer la politique entière.

## La migration Audit → Enforce

C'est l'étape que les tutoriels sautent, et celle qui détermine si la politique survivra à
sa première semaine.

**Semaine 1 — `Audit`.** La politique rapporte sans rien bloquer. Le relevé des violations
dit ce qui tournerait en échec :

```bash
kubectl get policyreport -A \
  -o jsonpath='{range .items[*].results[?(@.result=="fail")]}{.policy}{"\t"}{.resources[0].namespace}{"\t"}{.message}{"\n"}{end}' \
  | sort | uniq -c | sort -rn
```

Sur le cluster où j'ai fait cette bascule, la première liste comptait 34 violations
distinctes. Quatre venaient de nos images. Les trente autres étaient des images tierces
parfaitement légitimes : ingress-nginx, cert-manager, des agents de supervision. Passer en
`Enforce` ce jour-là aurait cassé le cluster, et la conclusion aurait été « Kyverno est
inutilisable ».

**Semaine 2 — trier.** Trois cas, et aucun ne se règle en élargissant la politique :

- *nos images non signées* : on corrige le pipeline ;
- *images tierces signées par leur éditeur* : on ajoute une règle dédiée avec **leur**
  identité d'attestation, pas la nôtre ;
- *images tierces non signées* : on les épingle par digest et on l'écrit quelque part —
  c'est une dette acceptée, pas une exception invisible.

**Semaine 3 — `Enforce`, un espace de noms à la fois.** D'abord un environnement de
recette, puis la production. La bascule globale d'un coup transforme une erreur de
politique en panne générale.

Et avant tout cela, il faut savoir ce qui se passe si le webhook lui-même tombe. Par
défaut Kyverno s'installe en `failurePolicy: Fail` : webhook indisponible, plus aucun Pod
n'est admis. C'est le bon choix pour une politique de sécurité — à condition de l'avoir
décidé, d'exécuter Kyverno en plusieurs répliques, et de l'avoir testé un jour où ça ne
brûle pas.

## Ce que ça protège, et ce que ça ne protège pas

La politique garantit qu'un conteneur exécuté dans ce cluster a été produit par ce
workflow, à partir de ce dépôt. C'est beaucoup : elle élimine l'image poussée à la main
sous le même tag, l'image d'un registre compromis, et le déploiement d'un digest qui n'est
jamais passé par la CI.

Elle ne dit rien du contenu. Une dépendance vulnérable signée reste signée, et une
compromission du dépôt lui-même produit des images parfaitement valides. La signature
répond à « d'où vient ceci », pas à « est-ce sûr ». Les deux questions demandent des
outils différents, et confondre les deux est la façon la plus courante de se croire
protégé.

## Vérifier que ça marche vraiment

Un test qui échoue est plus convaincant qu'un test qui réussit :

```bash
# Doit être refusé : image publique, jamais signée par notre workflow.
kubectl run test-non-signe --image=nginx:alpine -n production
# Error from server: admission webhook "mutate.kyverno.svc-fail" denied the request:
#   ... failed to verify image nginx:alpine: no matching signatures
```

Tant que cette commande réussit, la politique n'est pas active — quel que soit ce
qu'affiche `kubectl get clusterpolicy`.
