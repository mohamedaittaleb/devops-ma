---
titre: "Terraform pour dev, staging et prod : l'architecture qui tient"
resume: "Modules réutilisables, un état par environnement, verrou partagé et étiquetage automatique. Le découpage que je retiens — et pourquoi les workspaces sont un piège quand on s'en sert pour séparer des environnements."
pilier: devops
date: 2026-09-28
tags: ["terraform", "iac", "aws", "environnements", "s3"]
repo: null
---

Le cahier des charges tient en une phrase : un seul code Terraform, trois environnements —
dev, staging, prod — qui ne se marchent jamais dessus. Modules réutilisables, un fichier
d'état par environnement, un backend distant verrouillé, une stratégie d'étiquetage, et des
variables propres à chaque environnement.

C'est un exercice classique, et il se joue presque entièrement sur une seule décision prise
au début. Le reste en découle.

Tout le code est dans l'article : il n'y a pas de dépôt à cloner, chaque fichier est donné
en entier et l'ensemble s'exécute tel quel.

## La décision : workspaces ou dossiers

Terraform propose deux façons de séparer des environnements. Elles se ressemblent sur le
papier et n'ont rien à voir à l'usage.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 232" role="img" aria-labelledby="fig-strategies">
<title id="fig-strategies">Avec les workspaces, un seul code vise trois états selon une variable de session ; avec un dossier par environnement, la cible est écrite dans le fichier.</title>
<text class="viz-cle" x="8" y="14">Workspaces</text>
<g class="c2" fill="currentColor" stroke="currentColor">
<rect x="94" y="30" width="128" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="158" y="48" text-anchor="middle" class="viz-fort">un seul dossier</text>
<text x="158" y="64" text-anchor="middle">un seul backend</text>
<g class="viz-repere" fill="none" stroke-linecap="round">
<path d="M158 74C158 104 58 100 58 128"/>
<path d="M158 74v54"/>
<path d="M158 74C158 104 258 100 258 128"/>
</g>
<g class="c2" fill="currentColor" stroke="currentColor">
<rect x="18" y="128" width="80" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="118" y="128" width="80" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="218" y="128" width="80" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="58" y="148" text-anchor="middle">dev</text>
<text x="158" y="148" text-anchor="middle">staging</text>
<text x="258" y="148" text-anchor="middle">prod</text>
<text x="8" y="188">La cible dépend d'une variable de session :</text>
<text x="8" y="206" class="viz-fort">terraform workspace select</text>
<text x="332" y="14" class="viz-cle">Un dossier par environnement</text>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="342" y="30" width="88" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="442" y="30" width="88" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="542" y="30" width="88" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="386" y="56" text-anchor="middle" class="viz-fort">dev/</text>
<text x="486" y="56" text-anchor="middle" class="viz-fort">staging/</text>
<text x="586" y="56" text-anchor="middle" class="viz-fort">prod/</text>
<g class="viz-repere" fill="none" stroke-linecap="round">
<path d="M386 74v54"/><path d="M486 74v54"/><path d="M586 74v54"/>
</g>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="342" y="128" width="88" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="442" y="128" width="88" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
<rect x="542" y="128" width="88" height="32" rx="6" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="386" y="148" text-anchor="middle">état dev</text>
<text x="486" y="148" text-anchor="middle">état staging</text>
<text x="586" y="148" text-anchor="middle">état prod</text>
<text x="332" y="188">La cible est écrite dans le fichier :</text>
<text x="332" y="206" class="viz-fort">backend.tf</text>
</svg>
</div>
<figcaption>
Les deux approches produisent bien trois états séparés. La différence est ailleurs : dans
un cas, ce que vous allez modifier dépend d'une commande tapée plus tôt ; dans l'autre, du
répertoire où vous vous trouvez.
</figcaption>
</figure>

**Je prends les dossiers**, et voici les trois raisons qui décident.

**La cible doit être lisible.** Avec les workspaces, `terraform apply` ne dit pas sur quoi
il s'applique : il faut se souvenir du dernier `workspace select`. Un onglet de terminal
oublié suffit pour appliquer une configuration de dev en production. Avec un dossier, la
cible est le répertoire courant — visible dans l'invite de commande.

**Les environnements divergent toujours.** La production a des sauvegardes, des alarmes,
une classe d'instance différente. Avec les workspaces, ces écarts s'écrivent en
conditionnels `terraform.workspace == "prod" ? … : …` dispersés dans le code. Au bout de
quelques mois, plus personne ne sait ce que contient réellement la production.

**Les droits doivent pouvoir différer.** Avec un dossier par environnement, la CI peut
donner à la tâche « dev » un rôle qui n'a aucun droit sur la production. Avec un workspace
unique, les mêmes identifiants ouvrent les trois.

Les workspaces restent utiles, mais pour autre chose : une branche de test éphémère, une
copie jetable de la même configuration. Pas pour un cycle de vie.

## L'arborescence

```text
.
├── socle-etat/                 # cree le backend — etat local, joue une seule fois
│   ├── main.tf
│   └── variables.tf
├── modules/
│   ├── reseau/                 # brique reutilisable
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── plateforme/             # composition : ce que contient un environnement
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environnements/
    ├── dev/main.tf
    ├── staging/main.tf
    └── prod/main.tf
```

Le point important est `modules/plateforme`. Sans lui, chaque dossier d'environnement
recopie la même liste d'appels de modules, et les trois divergent par accident. Avec lui,
un fichier d'environnement fait vingt lignes : le backend, le fournisseur, et un seul appel
de module avec les valeurs propres à l'environnement.

## Le socle : créer le backend avant de pouvoir l'utiliser

Il y a un problème d'amorçage que les tutoriels passent sous silence. Le backend S3 doit
exister avant que Terraform puisse y écrire — mais on veut le créer avec Terraform.

La réponse est un petit projet à part, appliqué **une seule fois**, avec un état local.

```hcl
# socle-etat/main.tf
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

resource "aws_s3_bucket" "etat" {
  bucket = var.nom_bucket

  # Le jour ou ce bucket disparait, les trois environnements deviennent
  # invisibles a Terraform. Il ne se detruit pas par megarde.
  lifecycle {
    prevent_destroy = true
  }
}

# Le versionnement est la seule chose qui rattrape un etat corrompu :
# on revient a la version precedente de l'objet.
resource "aws_s3_bucket_versioning" "etat" {
  bucket = aws_s3_bucket.etat.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "etat" {
  bucket = aws_s3_bucket.etat.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Un etat Terraform contient des valeurs sensibles en clair.
resource "aws_s3_bucket_public_access_block" "etat" {
  bucket                  = aws_s3_bucket.etat.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# La cle primaire doit s'appeler exactement LockID, de type chaine :
# c'est Terraform qui impose ce nom, pas une convention.
resource "aws_dynamodb_table" "verrou" {
  name         = var.nom_table_verrou
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}
```

```hcl
# socle-etat/variables.tf
variable "region" {
  description = "Region ou vivent le bucket d'etat et la table de verrous."
  type        = string
  default     = "eu-west-3"
}

variable "nom_bucket" {
  description = "Nom du bucket d'etat. Globalement unique sur tout S3."
  type        = string
}

variable "nom_table_verrou" {
  description = "Nom de la table DynamoDB qui porte les verrous."
  type        = string
  default     = "terraform-verrou"
}
```

```console
$ cd socle-etat
$ terraform init
$ terraform apply -var="nom_bucket=acme-terraform-etat"
```

L'état de ce projet-là reste local, et c'est assumé : il décrit deux ressources qu'on ne
touche plus jamais. Committez le `terraform.tfstate` produit, ou recréez-le par `import` le
jour improbable où vous en aurez besoin.

## Le module réutilisable

Il est volontairement minimal — le sujet de l'exercice est le câblage, pas le contenu du
réseau.

```hcl
# modules/reseau/variables.tf
variable "nom" {
  description = "Prefixe de nommage, en pratique le nom de l'environnement."
  type        = string
}

variable "cidr" {
  description = "Plage d'adresses du VPC."
  type        = string
}

variable "zones" {
  description = "Zones de disponibilite a couvrir."
  type        = list(string)
}

variable "sous_reseaux_publics" {
  description = "Une plage par zone, dans le meme ordre que `zones`."
  type        = list(string)
}

variable "sous_reseaux_prives" {
  description = "Une plage par zone, dans le meme ordre que `zones`."
  type        = list(string)
}
```

```hcl
# modules/reseau/main.tf
resource "aws_vpc" "ce" {
  cidr_block           = var.cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.nom}-vpc"
  }
}

resource "aws_internet_gateway" "ce" {
  vpc_id = aws_vpc.ce.id

  tags = {
    Name = "${var.nom}-igw"
  }
}

# `for_each` plutot que `count` : une zone retiree du milieu de la liste
# ne decale pas les autres, donc Terraform ne detruit pas ce qu'il faut garder.
resource "aws_subnet" "public" {
  for_each = zipmap(var.zones, var.sous_reseaux_publics)

  vpc_id                  = aws_vpc.ce.id
  cidr_block              = each.value
  availability_zone       = each.key
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.nom}-public-${each.key}"
    Type = "public"
  }
}

resource "aws_subnet" "prive" {
  for_each = zipmap(var.zones, var.sous_reseaux_prives)

  vpc_id            = aws_vpc.ce.id
  cidr_block        = each.value
  availability_zone = each.key

  tags = {
    Name = "${var.nom}-prive-${each.key}"
    Type = "prive"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.ce.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.ce.id
  }

  tags = {
    Name = "${var.nom}-public"
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}
```

```hcl
# modules/reseau/outputs.tf
output "vpc_id" {
  description = "Identifiant du VPC cree."
  value       = aws_vpc.ce.id
}

output "sous_reseaux_publics" {
  description = "Identifiants des sous-reseaux publics, par zone."
  value       = { for z, s in aws_subnet.public : z => s.id }
}

output "sous_reseaux_prives" {
  description = "Identifiants des sous-reseaux prives, par zone."
  value       = { for z, s in aws_subnet.prive : z => s.id }
}
```

## La composition : ce qu'un environnement contient

C'est ici qu'on décrit une fois pour toutes ce qu'est « un environnement ». Les trois
dossiers l'appelleront avec des valeurs différentes.

```hcl
# modules/plateforme/variables.tf
variable "environnement" {
  description = "dev, staging ou prod."
  type        = string

  # Une faute de frappe ici creerait un quatrieme environnement en silence.
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environnement)
    error_message = "environnement doit valoir dev, staging ou prod."
  }
}

variable "cidr" {
  description = "Plage d'adresses du VPC de cet environnement."
  type        = string
}

variable "zones" {
  description = "Zones de disponibilite. Une seule suffit en dev."
  type        = list(string)
}

variable "sous_reseaux_publics" {
  type = list(string)
}

variable "sous_reseaux_prives" {
  type = list(string)
}
```

```hcl
# modules/plateforme/main.tf
module "reseau" {
  source = "../reseau"

  nom                  = var.environnement
  cidr                 = var.cidr
  zones                = var.zones
  sous_reseaux_publics = var.sous_reseaux_publics
  sous_reseaux_prives  = var.sous_reseaux_prives
}
```

```hcl
# modules/plateforme/outputs.tf
output "vpc_id" {
  value = module.reseau.vpc_id
}

output "sous_reseaux_prives" {
  value = module.reseau.sous_reseaux_prives
}
```

## Un environnement, en entier

```hcl
# environnements/prod/main.tf
terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Un bloc backend n'accepte aucune variable : tout y est litteral.
  # C'est une limitation de Terraform, et c'est exactement ce qui rend
  # la strategie par dossiers lisible — la cible est ecrite noir sur blanc.
  backend "s3" {
    bucket         = "acme-terraform-etat"
    key            = "prod/plateforme.tfstate"
    region         = "eu-west-3"
    dynamodb_table = "terraform-verrou"
    encrypt        = true
  }
}

provider "aws" {
  region = "eu-west-3"

  # Etiquetage central : toute ressource etiquetable creee par ce dossier
  # porte ces quatre etiquettes, sans qu'aucun module ait a les recopier.
  default_tags {
    tags = {
      Environnement = "prod"
      Projet        = "acme"
      GerePar       = "terraform"
      Depot         = "acme/infrastructure"
    }
  }
}

module "plateforme" {
  source = "../../modules/plateforme"

  environnement        = "prod"
  cidr                 = "10.2.0.0/16"
  zones                = ["eu-west-3a", "eu-west-3b", "eu-west-3c"]
  sous_reseaux_publics = ["10.2.0.0/20", "10.2.16.0/20", "10.2.32.0/20"]
  sous_reseaux_prives  = ["10.2.64.0/20", "10.2.80.0/20", "10.2.96.0/20"]
}
```

Le dossier `dev` est le même fichier, avec quatre valeurs changées :

```hcl
# environnements/dev/main.tf — extrait
  backend "s3" {
    bucket         = "acme-terraform-etat"
    key            = "dev/plateforme.tfstate"   # <- la seule ligne qui isole l'etat
    region         = "eu-west-3"
    dynamodb_table = "terraform-verrou"
    encrypt        = true
  }

module "plateforme" {
  source = "../../modules/plateforme"

  environnement        = "dev"
  cidr                 = "10.0.0.0/16"
  zones                = ["eu-west-3a"]          # une seule zone : dev n'a pas besoin de plus
  sous_reseaux_publics = ["10.0.0.0/20"]
  sous_reseaux_prives  = ["10.0.64.0/20"]
}
```

Trois plages distinctes — `10.0` en dev, `10.1` en staging, `10.2` en prod — pour que les
trois VPC puissent être appairés un jour sans se chevaucher. C'est le genre de choix qu'on
ne peut plus faire après coup.

## Le verrou, et à quoi il sert vraiment

La table DynamoDB ne stocke pas l'état : elle stocke **qui est en train de l'écrire**.

<figure class="figure">
<div class="viz-cadre">
<svg viewBox="0 0 640 186" role="img" aria-labelledby="fig-verrou">
<title id="fig-verrou">Deux applies simultanés : le premier prend le verrou, le second est refusé avant d'avoir rien modifié.</title>
<g class="c1" fill="currentColor" stroke="currentColor">
<rect x="8" y="22" width="132" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="74" y="48" text-anchor="middle" class="viz-fort">apply de Sofia</text>
<g class="c2" fill="currentColor" stroke="currentColor">
<rect x="8" y="112" width="132" height="42" rx="7" fill-opacity=".09" stroke-opacity=".45"/>
</g>
<text x="74" y="138" text-anchor="middle" class="viz-fort">apply de Karim</text>
<g class="viz-repere" fill="none" stroke-linecap="round">
<path d="M144 43C176 43 176 78 194 82"/><path d="M188 78l6 4-6 5"/>
<path d="M144 133C176 133 176 98 194 94"/><path d="M188 90l6 4-6 5"/>
</g>
<g class="viz-repere"><rect x="200" y="58" width="140" height="60" rx="7" fill="none"/></g>
<text x="270" y="82" text-anchor="middle" class="viz-fort">table de verrous</text>
<text x="270" y="100" text-anchor="middle">une ligne : LockID</text>
<g class="viz-repere" fill="none" stroke-linecap="round">
<path d="M344 82C376 82 376 46 398 44"/><path d="M392 40l6 4-6 5"/>
<path d="M344 94C376 94 376 130 398 132"/><path d="M392 128l6 4-6 5"/>
</g>
<g class="c-bon"><circle cx="410" cy="44" r="5" fill="currentColor"/></g>
<text x="424" y="48" class="viz-fort">verrou obtenu — l'apply part</text>
<g class="c-critique"><circle cx="410" cy="132" r="5" fill="currentColor"/></g>
<text x="424" y="128" class="viz-fort">refusé — rien n'a été modifié</text>
<text x="424" y="146">Error acquiring the state lock</text>
</svg>
</div>
<figcaption>
Sans verrou, les deux applies liraient le même état et le réécriraient chacun de leur côté.
Le dernier à écrire gagne, et l'état ne décrit plus ce qui existe réellement. C'est la
panne la plus difficile à réparer de toutes celles que peut produire Terraform.
</figcaption>
</figure>

Une note d'actualité : Terraform a depuis introduit un verrou natif S3, activé par
`use_lockfile`, qui rend la table DynamoDB optionnelle. L'exercice demande explicitement
DynamoDB, c'est donc ce qui est implémenté ici. Si vous démarrez aujourd'hui sur une version
récente, vérifiez dans la documentation de votre version si le verrou natif vous suffit —
cela fait une ressource de moins à exploiter.

## L'étiquetage, sans le recopier partout

Le bloc `default_tags` du fournisseur AWS règle la question en un endroit. Toute ressource
étiquetable créée par ce dossier porte les quatre étiquettes, et les `tags` posés dans les
modules viennent s'y ajouter — `Name` et `Type` dans le module réseau, par exemple.

Deux limites à connaître avant de s'y fier :

- **Toutes les ressources ne sont pas étiquetables**, et certaines gèrent leurs étiquettes
  autrement. Les groupes d'autoscaling, notamment, ont leur propre mécanisme de propagation
  vers les instances.
- **Ne redéclarez pas une étiquette par défaut dans une ressource.** Poser `Environnement`
  à la main quelque part, avec la même valeur, produit sur certaines versions du fournisseur
  une différence permanente dans le plan.

Vérifiez le résultat une fois, avec la clé qui compte pour la facturation :

```console
$ aws resourcegroupstaggingapi get-resources \
    --tag-filters Key=Environnement,Values=prod \
    --query 'length(ResourceTagMappingList)'
```

## À l'usage

```console
$ cd environnements/prod
$ terraform init
$ terraform plan
$ terraform apply
```

Pas de `workspace select`, pas de `-var-file` à ne pas oublier, pas de commutateur qui
change la cible. Le répertoire est la cible. C'était tout l'objet de la décision du début.

## Les pièges que j'ai listés en chemin

**Le bloc backend n'accepte pas de variables.** C'est la limitation qui décourage le plus de
monde et qui, retournée, devient un atout : elle force la cible à être écrite littéralement.
Si vous devez absolument la paramétrer — pour des comptes AWS multiples — la sortie est
`terraform init -backend-config=…`, pas une variable.

**`for_each` plutôt que `count` sur les sous-réseaux.** Avec `count`, retirer une zone du
milieu de la liste décale toutes les suivantes, et Terraform détruit puis recrée des
sous-réseaux qui n'avaient pas bougé. Avec `for_each` indexé par zone, chacun garde son
identité.

**Validez `environnement`.** Le bloc `validation` sur cette variable coûte cinq lignes et
empêche qu'une faute de frappe crée une quatrième plateforme silencieuse, avec son propre
état et sa propre facture.

**Versionnez le bucket d'état.** C'est la seule chose qui vous rattrape quand un état est
corrompu ou partiellement écrit. Le chiffrement et le blocage d'accès public, eux, tiennent
au fait qu'un fichier d'état contient des valeurs sensibles en clair.
