# Devis IA — Guide de déploiement

Fonctionnalité « Mon Devis IA » + page admin « Devis » pour Affich'Pub.
IA 100 % gratuite : **Groq** (texte) et **Pollinations.ai** (images, aucune clé requise), via des
**Edge Functions Supabase** (les clés API ne sont jamais exposées côté client).

---

## 1. Base de données (Supabase → SQL Editor)

Exécuter le contenu de [`supabase/schema.sql`](supabase/schema.sql).
Cela crée la table `devis` et les politiques RLS :

- **Visiteurs anonymes** : peuvent **insérer** un devis (chatbot public), mais **jamais le relire**.
- **Admins connectés (Supabase Auth)** : accès complet (lecture / modification).

## 2. Créer le compte admin (Supabase → Authentication → Users → *Add user*)

La page `admin_devis.html` exige une vraie connexion Supabase Auth (pour protéger les données
personnelles des clients). Créer **un utilisateur** :

- Email : *(celui du directeur)*
- Mot de passe : *(au choix)*
- ✅ Cocher « Auto Confirm User »

> Les pages `admin_rdv.html` / `admin_contact.html` continuent d'utiliser l'ancien système
> (`sessionStorage`) — elles ne sont pas impactées.

## 3. Récupérer les clés API gratuites

| Service | URL | Variable |
|---|---|---|
| Groq (texte) | https://console.groq.com | `GROQ_API_KEY` (commence par `gsk_`) |
| Pollinations.ai (images) | https://pollinations.ai | aucune — service public, sans clé |

## 4. Déployer les Edge Functions (terminal, à la racine du projet)

```bash
# Connexion + lien au projet (une seule fois)
supabase login
supabase link --project-ref cyeppawyuxjlvjmpgnvr

# Secrets (jamais côté client)
supabase secrets set GROQ_API_KEY=gsk_xxxxxxxx
# Pollinations.ai ne nécessite aucune clé — rien à configurer pour gen-ad

# Déploiement des fonctions.
# --no-verify-jwt : les fonctions sont des proxys publics appelés depuis le
# navigateur avec la clé publishable (qui n'est pas un JWT classique).
supabase functions deploy chat   --no-verify-jwt
supabase functions deploy gen-ad --no-verify-jwt
```

> Si vous préférez garder la vérification JWT activée, il faudra adapter l'en-tête
> `Authorization` envoyé par `js/devis.js` et `js/admin_devis.js`.

## 5. Tester

1. Ouvrir `devis.html` → discuter avec l'assistant jusqu'au devis complet → « Générer mon devis en PDF ».
2. Le devis doit apparaître dans Supabase (table `devis`) **et** dans `admin_devis.html` après connexion.
3. Sur un devis, tester les 3 actions : 🔍 Analyser · 📄 Devis (PDF) · 🎨 Pub (chatbot + image).

---

## Architecture livrée

```
devis.html              Page client « Mon Devis IA » (chatbot)
js/devis.js             Logique chatbot : Groq, quick replies, PDF jsPDF, sauvegarde Supabase
admin_devis.html        Page admin (auth Supabase + tableau + modales)
js/admin_devis.js       Auth, tableau, statut éditable, 3 actions IA
css/style.css           + section « CHATBOT DEVIS IA » (réutilise le design system existant)
supabase/schema.sql     Table devis + RLS
supabase/functions/chat/index.ts     Proxy Groq (fallback llama-3.1-8b-instant si 429)
supabase/functions/gen-ad/index.ts   Proxy Pollinations.ai (image → base64, sans clé)
supabase/functions/_shared/cors.ts   En-têtes CORS partagés
```

## Estimation tarifaire (calcul côté client)

```js
prixBase   = { decouverte: 150, standard: 300, premium: 600 }
multReg    = { quotidienne: 1.5, bihebdomadaire: 1.0 }
semaines   = max(1, ceil((dateFin - dateDebut) / 1 semaine))
prixEstime = prixBase[emplacement] * multReg[regularite] * semaines
```

## Points d'attention

- **Groq rate limit** (~30 req/min) → bascule automatique sur `llama-3.1-8b-instant` (géré dans l'Edge Function).
- **Image Pollinations.ai** : gratuite et sans clé, mais sans support fiable du texte intégré à l'image.
  Le prompt envoyé au modèle ne décrit donc que le visuel (couleurs, scène, style) — le slogan/texte
  est superposé séparément, côté client, via Canvas (`renderGeneratedImage` dans `js/admin_devis.js`),
  ce qui garantit un texte toujours net et lisible. En cas d'échec (service indisponible), l'admin voit
  une suggestion d'alternative (Canva / Adobe Express) + bouton Réessayer.
- **PDF** : jsPDF (mise en page sobre). Pour un contrôle CSS plus fin, envisager `html2pdf.js`.
