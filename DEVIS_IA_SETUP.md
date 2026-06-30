# Devis IA — Guide de déploiement

Fonctionnalité « Mon Devis IA » + page admin « Devis » pour Affich'Pub.
IA 100 % gratuite : **routage multi-fournisseurs** pour le texte (**Cerebras → Groq → Gemini**,
bascule automatique) et **Pollinations.ai** pour les images (aucune clé requise),
via des **Edge Functions Supabase** (les clés API ne sont jamais exposées côté client).

> **Pourquoi un routage multi-fournisseurs ?** Le palier « sans frais » de Google Gemini est, pour
> ce compte/région (France/UE), bridé à seulement **~20 requêtes par JOUR** (RPD) — inutilisable
> pour un chatbot public, et impossible à débloquer sans activer la facturation (créer un nouveau
> projet ou une nouvelle clé n'y change rien : le bridage est au niveau du compte/région).
>
> Solution sans payer : on empile plusieurs fournisseurs gratuits dont les **quotas sont
> indépendants**, et l'edge function `chat` **bascule automatiquement** sur le suivant dès que l'un
> échoue (429/quota épuisé). Le visiteur ne voit rien.
>
> | Fournisseur | Priorité | Palier gratuit (par jour) | Modèle |
> |---|---|---|---|
> | **Cerebras** | 1 (principal) | **~1 000 000 tokens/jour** (encaisse les contextes longs) | `llama-3.3-70b` |
> | **Groq** | 2 (secours) | **1 000 req/jour**, 30 req/min, très rapide | `llama-3.3-70b-versatile` |
> | **Gemini** | 3 (dernier recours) | ~20 req/jour résiduelles | `gemini-2.5-flash-lite` |
>
> Capacité gratuite totale ≈ somme des trois (quotas séparés). Tous exposent une **API
> OpenAI-compatible** → la réponse garde le format `{ choices: [{ message: { content } }] }`,
> donc le code client/admin n'a rien à changer côté parseur.

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

## 3. Récupérer les clés API gratuites (sans carte bancaire)

| Service | URL | Variable |
|---|---|---|
| Cerebras (texte, principal) | https://cloud.cerebras.ai → *API Keys* | `CEREBRAS_API_KEY` (commence par `csk-`) |
| Groq (texte, secours) | https://console.groq.com → *API Keys* | `GROQ_API_KEY` (commence par `gsk-`) |
| Google Gemini (texte, dernier recours) | https://aistudio.google.com/app/apikey | `GEMINI_API_KEY` (commence par `AIza`) |
| Pollinations.ai (images) | https://pollinations.ai | aucune — service public, sans clé |

> Les trois clés texte sont **optionnelles individuellement** : l'edge function ignore tout
> fournisseur dont la clé n'est pas configurée. Mais pour une vraie capacité gratuite, configure
> au moins **Cerebras + Groq** (Gemini seul = ~20 req/jour, insuffisant).

## 4. Déployer les Edge Functions (terminal, à la racine du projet)

```bash
# Connexion + lien au projet (une seule fois)
supabase login
supabase link --project-ref cyeppawyuxjlvjmpgnvr

# Secrets (jamais côté client) — au moins Cerebras + Groq recommandés
supabase secrets set CEREBRAS_API_KEY=csk-xxxxxxxx
supabase secrets set GROQ_API_KEY=gsk-xxxxxxxx
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
js/devis.js             Logique chatbot : appel IA, limiteur de débit, quick replies, PDF jsPDF, sauvegarde Supabase
admin_devis.html        Page admin (auth Supabase + tableau + modales)
js/admin_devis.js       Auth, tableau, statut éditable, 3 actions IA
css/style.css           + section « CHATBOT DEVIS IA » (réutilise le design system existant)
supabase/schema.sql     Table devis + RLS
supabase/functions/chat/index.ts     Proxy multi-fournisseurs Cerebras → Groq → Gemini (OpenAI-compatible, bascule auto sur 429/erreur)
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

- **Limites de débit (gratuit)** : la défense principale est le **routage multi-fournisseurs** de l'edge function
  `chat` (Cerebras → Groq → Gemini, bascule auto sur 429/quota). En complément, côté client : un **limiteur de débit**
  (fenêtre glissante de 60 s) lisse les envois d'un même visiteur, un **retry automatique avec backoff** rattrape les
  429 résiduels, et l'**historique envoyé est plafonné** (`MAX_HISTORY_MESSAGES` dans `js/devis.js`) — sans perte d'info,
  car l'état complet du devis est ré-injecté dans le system prompt à chaque tour, ce qui économise les tokens et fait
  durer les quotas. Côté admin, les 3 actions IA réessaient aussi en cas de 429.
- **Image Pollinations.ai** : gratuite et sans clé, mais sans support fiable du texte intégré à l'image.
  Le prompt envoyé au modèle ne décrit donc que le visuel (couleurs, scène, style) — le slogan/texte
  est superposé séparément, côté client, via Canvas (`renderGeneratedImage` dans `js/admin_devis.js`),
  ce qui garantit un texte toujours net et lisible. En cas d'échec (service indisponible), l'admin voit
  une suggestion d'alternative (Canva / Adobe Express) + bouton Réessayer.
- **PDF** : jsPDF (mise en page sobre). Pour un contrôle CSS plus fin, envisager `html2pdf.js`.
