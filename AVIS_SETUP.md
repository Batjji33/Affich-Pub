# Système d'avis vérifiés — Mise en place

Deux parties : page publique `avis.html` + interface admin `admin_avis.html`.
Sécurité : les codes ne sont jamais lisibles côté navigateur ; la vérification du
code et l'écriture de l'avis se font **côté serveur** (Edge Function en service role).

## 1. Base de données

Dans **Supabase → SQL Editor**, exécuter le fichier :

```
supabase/avis_schema.sql
```

Il crée les tables `codes_avis` et `avis` + les règles RLS :

- `avis` : **lecture publique des avis visibles uniquement** ; accès complet pour
  l'admin connecté (Supabase Auth).
- `codes_avis` : **aucun accès public** ; accès complet pour l'admin connecté.
- L'écriture d'un avis passe par l'Edge Function (service role), qui contourne la RLS.

## 2. Edge Function `submit-avis`

Déployer la fonction (elle gère : vérif. du code → insertion de l'avis → marquage du
code comme utilisé) :

```bash
supabase functions deploy submit-avis
```

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont **fournies
automatiquement** par Supabase à l'exécution : aucun secret à configurer.

> Si la fonction est déployée avec "Verify JWT" activé, le front l'appelle déjà avec
> la clé publique en `Authorization` / `apikey` (comme les fonctions `chat`/`gen-ad`).

## 3. Accès admin

`admin_avis.html` utilise **Supabase Auth** (email/mot de passe), comme
`admin_devis.html`. Utiliser le même compte directeur que pour la gestion des devis.

## Parcours

**Client** (`avis.html`) :
1. saisit son code à 4 chiffres,
2. donne un titre, une description et une note sur 5,
3. publication → l'avis apparaît, marqué « ✓ Vérifié », et le code devient inutilisable.

**Admin** (`admin_avis.html`) :
- génère des codes à 4 chiffres (liés à un nom client / référence devis), les copie ;
- liste tous les avis (date, extrait, note, statut visible/masqué) ;
- masque / réaffiche, modifie le texte, ou supprime chaque avis.
