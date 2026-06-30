# Devis IA — Guide de déploiement

Fonctionnalité « Mon Devis IA » + page admin « Devis » pour Affich'Pub.
IA 100 % gratuite : **Google Gemini 2.5 Flash-Lite** (texte) et **Pollinations.ai** (images, aucune clé requise),
via des **Edge Functions Supabase** (les clés API ne sont jamais exposées côté client).

> **Pourquoi Gemini 2.5 Flash-Lite ?** `gemini-2.0-flash` a été **définitivement retiré par Google
> le 01/06/2026** (tout appel à ce modèle échoue désormais). `gemini-2.5-flash-lite` est le modèle
> qui retrouve un palier gratuit aussi généreux que l'ancien 2.0-flash : **1 000 000 tokens/minute**
> et **15 requêtes/minute** (1500/jour). `gemini-2.5-flash` (non-lite) a un palier bien plus serré
> (10 req/min, ~250/jour) — à éviter pour cet usage. La contrainte de 15 req/min est gérée côté
> client (limiteur de débit + nouvelle tentative automatique en cas de 429) et côté admin (retry
> sur les actions IA).

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
| Google Gemini (texte) | https://aistudio.google.com/app/apikey | `GEMINI_API_KEY` (commence par `AIza`) |
| Pollinations.ai (images) | https://pollinations.ai | aucune — service public, sans clé |

## 4. Déployer les Edge Functions (terminal, à la racine du projet)

```bash
# Connexion + lien au projet (une seule fois)
supabase login
supabase link --project-ref cyeppawyuxjlvjmpgnvr

# Secrets (jamais côté client)
supabase secrets set GEMINI_API_KEY=AIzaxxxxxxxx
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
js/devis.js             Logique chatbot : Gemini, limiteur de débit, quick replies, PDF jsPDF, sauvegarde Supabase
admin_devis.html        Page admin (auth Supabase + tableau + modales)
js/admin_devis.js       Auth, tableau, statut éditable, 3 actions IA (Gemini)
css/style.css           + section « CHATBOT DEVIS IA » (réutilise le design system existant)
supabase/schema.sql     Table devis + RLS
supabase/functions/chat/index.ts     Proxy Gemini 2.5 Flash-Lite (endpoint OpenAI-compatible, relais 429 + Retry-After)
supabase/functions/gen-ad/index.ts   Proxy Pollinations.ai (image → base64, sans clé)
supabase/functions/_shared/cors.ts   En-têtes CORS partagés
```

## Estimation tarifaire (calcul côté client)

```js
// € par publicité et par semaine, selon l'emplacement
basePPW    = { decouverte: 30, standard: 50, premium: 85 }
formatMult = { manuel: 1.0, informatique: 1.25 }   // informatique plus cher
regMult    = { quotidienne: 1.4, bihebdomadaire: 1.0 } // quotidien plus cher
semaines   = max(1, ceil((dateFin - dateDebut) / 1 semaine))
sumBase    = somme de basePPW[emplacement] pour chaque publicité (quantité)
prixEstime = round(sumBase * semaines * formatMult * regMult)
prixEstime = clamp(prixEstime, 50, 500)   // plancher 50 €, plafond 500 €
```

> Une **barrière de validation côté client** (js/devis.js) vérifie toutes les
> informations avant de finaliser, et le client doit **confirmer explicitement**
> avant la génération (après quoi la conversation est clôturée). La date de début
> doit être au moins **7 jours** après aujourd'hui (délai de livraison).

## Points d'attention

- **Gemini rate limit** : 1M tokens/min (confortable) mais **15 requêtes/min**. Côté client, un limiteur de
  débit (fenêtre glissante de 60 s) lisse les envois d'un même visiteur, et un **retry automatique avec backoff**
  rattrape les 429 (clé API partagée entre visiteurs). Côté admin, les 3 actions IA réessaient aussi en cas de 429.
- **Image Pollinations.ai** : gratuite et sans clé, mais sans support fiable du texte intégré à l'image.
  Le prompt envoyé au modèle ne décrit donc que le visuel (couleurs, scène, style) — le slogan/texte
  est superposé séparément, côté client, via Canvas (`renderGeneratedImage` dans `js/admin_devis.js`),
  ce qui garantit un texte toujours net et lisible. En cas d'échec (service indisponible), l'admin voit
  une suggestion d'alternative (Canva / Adobe Express) + bouton Réessayer.
- **PDF** : jsPDF (mise en page sobre). Pour un contrôle CSS plus fin, envisager `html2pdf.js`.
