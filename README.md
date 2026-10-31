# ✧ Aetheria

Encyclopédie collaborative pour un univers de RP : personnages, monde, bestiaire, magie, factions, divinités, objets, chronologie, chroniques de parties et règles.

- Les joueurs **publient directement depuis le site** (pas besoin de toucher à GitHub).
- Toi, l'**admin**, tu crées des **liens d'invitation** et tu les envoies : seuls les invités peuvent s'inscrire.
- Chacun peut modifier et supprimer **ses** fiches ; l'admin peut tout gérer (et bannir quelqu'un).
- **Images** : une image principale, une **galerie** par fiche (tenues, illustrations… jusqu'à 100 images avec légendes, visionneuse plein écran), et des images insérées dans le texte. Les photos trop lourdes prises au téléphone sont réduites automatiquement.
- Liens entre fiches façon wiki : `[[Nom de la fiche]]`.

Le site est hébergé gratuitement sur **GitHub Pages**, et les comptes et les fiches sont stockés sur **Supabase** (gratuit aussi).

> Tant que Supabase n'est pas configuré, le site tourne en **mode démo** : tu peux tout tester, mais rien n'est partagé avec les autres.

---

## Installation (environ 15 minutes)

### 1. Mettre le site sur GitHub

1. Sur GitHub, crée un nouveau dépôt (par exemple `aetheria`), en **public**.
2. Clique sur **Add file › Upload files** et glisse **tout le contenu** du dossier (`index.html`, le dossier `assets`, le dossier `supabase`, `.nojekyll`, `README.md`).
3. Va dans **Settings › Pages**. Sous *Source*, choisis **Deploy from a branch**, puis la branche `main` et le dossier `/ (root)`. Enregistre.
4. Au bout d'une minute, ton site est en ligne à l'adresse `https://TON-PSEUDO.github.io/aetheria/` (en mode démo pour l'instant).

### 2. Créer la base de données (Supabase)

1. Crée un compte sur **supabase.com**, puis un **New project** (nom : `aetheria`, choisis un mot de passe et la région *Europe*).
2. Une fois le projet prêt, ouvre **SQL Editor › New query**, colle **tout** le contenu du fichier `supabase/schema.sql`, puis clique sur **Run**.
3. Va dans **Authentication › URL Configuration** :
   - **Site URL** : l'adresse de ton site, par exemple `https://TON-PSEUDO.github.io/aetheria/`
   - **Redirect URLs** : ajoute la même adresse.
4. Va dans **Project Settings › API** (ou **Data API**) et copie :
   - la **Project URL**
   - la clé **anon public** (celle-là est faite pour être publique, il n'y a aucun risque)

### 3. Brancher le site sur la base

Sur GitHub, ouvre `assets/config.js`, clique sur le crayon ✏️ et remplis :

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

Puis clique sur **Commit changes**. Une minute plus tard, le site est en mode réel.

### 4. Devenir admin

Va sur ton site, à l'adresse `…/aetheria/#/inscription`, et crée ton compte : **le tout premier compte inscrit devient automatiquement admin**, sans invitation. Fais-le donc tout de suite.

> Supabase envoie un email de confirmation : clique sur le lien qu'il contient, puis connecte-toi.
> (Pour éviter cette étape : **Authentication › Sign In / Providers › Email** → désactive *Confirm email*.)

### 5. Inviter des joueurs

Menu **⚙ Administration** → *Inviter des joueurs* :

- une note pour toi (« Lucas », « serveur Discord »…),
- le nombre de personnes qui peuvent utiliser le lien (1, 5, 20 ou illimité),
- la durée de validité.

Clique sur **Créer le lien**, puis sur **Copier** ou **Partager**, et envoie-le. Tu peux supprimer un lien à tout moment pour le désactiver.

Dans la même page, la liste des **membres** te permet de passer quelqu'un *admin*, *membre* ou *banni*.

---

## Personnaliser

| Quoi | Où |
|---|---|
| Nom, sous-titre | `assets/config.js` → `NOM_SITE`, `SOUS_TITRE` |
| Ajouter / renommer une catégorie | `assets/config.js` → `CATEGORIES` (ne change pas l'`id` d'une catégorie déjà utilisée) |
| Cases proposées dans les fiches | `champs` de chaque catégorie |
| Catégorie réservée à l'admin | `adminSeulement: true` (côté base, seules les **règles** sont verrouillées ; pour en verrouiller une autre, modifie la règle `fiches ajout` dans `schema.sql`) |
| Couleurs | le haut de `assets/style.css` (`--or`, `--nuit`, etc.) |

## Mise en forme des fiches

```
## Intertitre
**gras**  *italique*  ~~barré~~
- liste
1. liste numérotée
> citation
[[Nom d'une autre fiche]]      → lien interne (en rouge si la fiche n'existe pas encore)
[texte](https://…)             → lien externe
![](https://…)                 → image
---                            → séparateur
```

Les images s'envoient directement depuis le formulaire : image principale, galerie (plusieurs d'un coup) ou bouton **🖼 Image** dans le texte. Les photos trop lourdes sont réduites automatiquement.

> Si tu as installé le site avant l'arrivée de la galerie, relance simplement `supabase/schema.sql` dans Supabase : ça ajoute ce qui manque sans rien effacer.

## Limites de l'offre gratuite de Supabase

500 Mo de base de données et 1 Go d'images, ce qui fait des milliers de fiches. Un projet gratuit qui reste **inactif pendant une semaine** est mis en pause : il suffit de le relancer depuis le tableau de bord Supabase.
