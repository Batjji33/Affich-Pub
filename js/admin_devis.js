/* ============================================
   ADMIN_DEVIS.JS — Gestion des devis (admin)
   Auth Supabase, tableau, statut éditable,
   et 3 actions IA :
     1) Analyser par IA
     2) Générer le vrai devis (PDF)
     3) Créer la publicité (chatbot + image)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';
    const FN_BASE = `${SUPABASE_URL}/functions/v1`;

    let supabase = null;
    try {
        if (SUPABASE_URL.startsWith('http')) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (e) {
        console.error('Supabase init failed', e);
    }

    // --- DOM ---
    const authGate = document.getElementById('authGate');
    const adminContent = document.getElementById('adminContent');
    const authForm = document.getElementById('authForm');
    const authError = document.getElementById('authError');
    const tableBody = document.getElementById('devisTableBody');
    const logoutBtn = document.getElementById('logoutBtn');

    // ======================================================
    //  AUTHENTIFICATION (Supabase Auth)
    // ======================================================
    function showGate() {
        authGate.style.display = 'flex';
        adminContent.style.display = 'none';
    }
    function showContent() {
        authGate.style.display = 'none';
        adminContent.style.display = 'block';
    }

    async function initAuth() {
        if (!supabase) {
            showGate();
            authError.textContent = 'Base de données indisponible.';
            authError.style.display = 'block';
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            showContent();
            loadDevis();
        } else {
            showGate();
        }
    }

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authError.style.display = 'none';
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;

        const submitBtn = authForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connexion…';

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter';

        if (error) {
            authError.textContent = 'Identifiants incorrects.';
            authError.style.display = 'block';
            document.getElementById('authPassword').value = '';
        } else {
            showContent();
            loadDevis();
        }
    });

    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (supabase) await supabase.auth.signOut();
        showGate();
    });

    // ======================================================
    //  APPELS EDGE FUNCTIONS (Google Gemini 2.0 Flash)
    // ======================================================
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // L'API renvoie parfois { error: { message, ... } } (objet) au lieu d'une
    // chaîne : on normalise pour toujours obtenir un texte lisible.
    function errorMessageOf(data, status) {
        const e = data && data.error;
        if (!e) return `Erreur serveur (${status})`;
        if (typeof e === 'string') return e;
        if (typeof e === 'object' && e.message) return String(e.message);
        return `Erreur serveur (${status})`;
    }

    function isRateLimitStatus(status, data) {
        if (status === 429) return true;
        const msg = errorMessageOf(data, status).toLowerCase();
        return msg.includes('rate limit') || msg.includes('rate_limit') ||
            msg.includes('too many requests') || msg.includes('quota') ||
            msg.includes('resource_exhausted');
    }

    // Gemini 2.0 Flash gratuit : 15 requêtes/min. Chaque action admine (analyse,
    // vrai devis, pub) = 1 requête ; en cas de 429 on réessaie avec un backoff.
    const MAX_RETRIES = 2;
    async function callChatFn(messages, system) {
        let attempt = 0;
        for (;;) {
            const res = await fetch(`${FN_BASE}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'apikey': SUPABASE_KEY
                },
                body: JSON.stringify({ system, messages, model: GEMINI_MODEL })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) return (data?.choices?.[0]?.message?.content || '').trim();

            if (isRateLimitStatus(res.status, data) && attempt < MAX_RETRIES) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '', 10);
                const wait = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : (attempt + 1) * 4000;
                await sleep(wait);
                attempt++;
                continue;
            }
            throw new Error(errorMessageOf(data, res.status));
        }
    }

    async function callGenAd(prompt) {
        const res = await fetch(`${FN_BASE}/gen-ad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(errorMessageOf(data, res.status));
        return data; // { image, mimeType }
    }

    // ======================================================
    //  HELPERS
    // ======================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function formatRich(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^### (.*)$/gm, '<strong>$1</strong>')
            .replace(/^## (.*)$/gm, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR') + ' ' +
            d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function cap(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
    }

    function emplacementsText(d) {
        if (Array.isArray(d.emplacements) && d.emplacements.length) {
            const counts = {};
            d.emplacements.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
            return Object.keys(counts).map(k => `${counts[k]} ${cap(k)}`).join(', ');
        }
        return cap(d.emplacement);
    }

    function devisToText(d) {
        return [
            `Nom : ${d.nom}`,
            `Prénom : ${d.prenom}`,
            `Âge : ${d.age ?? '—'}`,
            `Téléphone : ${d.telephone ?? '—'}`,
            `Format de diffusion : ${d.format_diffusion ?? '—'}`,
            `Objet de la publicité : ${d.objet_pub ?? '—'}`,
            `Description : ${d.description_pub ?? '—'}`,
            `Budget : ${d.budget ?? '—'} €`,
            `Quantité de publicités : ${d.quantite ?? 1} (visuel identique)`,
            `Emplacements : ${emplacementsText(d)}`,
            `Régularité d'entretien : ${d.regularite ?? '—'}`,
            `Période : du ${d.date_debut ?? '—'} au ${d.date_fin ?? '—'}`,
            `Prix estimé (interne) : ${d.prix_estime ?? '—'} €`
        ].join('\n');
    }

    // Transcription lisible de la conversation (pour l'analyse IA).
    // Gemini accepte 1M tokens/min : on peut transmettre l'intégralité de
    // l'échange (l'analyse ne perd plus aucun élément). On conserve néanmoins un
    // garde-fou très large contre une conversation anormalement longue ; au-delà,
    // on garde en priorité la FIN de l'échange (la plus utile) en élaguant le début.
    const MAX_TRANSCRIPT_CHARS = 200000;
    function conversationToText(d) {
        const msgs = d && d.conversation && Array.isArray(d.conversation.messages)
            ? d.conversation.messages
            : [];
        if (!msgs.length) return '(Aucune conversation enregistrée.)';
        const lines = msgs
            .filter(m => m && m.content)
            // On retire les consignes techniques internes injectées au modèle.
            .filter(m => !String(m.content).startsWith('[VALIDATION SYSTÈME'))
            .map(m => {
                let content = String(m.content);
                // On retire le bloc technique d'état (###ETAT###{...}).
                const ei = content.indexOf('###ETAT###');
                if (ei !== -1) content = content.slice(0, ei).trim();
                // Compat. ancienne version : on masque le JSON de fin de devis.
                if (content.includes('DEVIS_COMPLET')) {
                    content = content.split('DEVIS_COMPLET')[0].trim() || '(devis finalisé)';
                }
                if (!content) return '';
                const who = m.role === 'user' ? 'Client' : 'Assistant';
                return `${who} : ${content}`;
            })
            .filter(Boolean);

        // On assemble depuis la fin jusqu'à atteindre le budget de caractères.
        const kept = [];
        let total = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
            const len = lines[i].length + 1;
            if (total + len > MAX_TRANSCRIPT_CHARS && kept.length) break;
            kept.unshift(lines[i]);
            total += len;
        }
        if (kept.length < lines.length) {
            kept.unshift('[…début de la conversation tronqué pour respecter la limite…]');
        }
        return kept.join('\n');
    }

    // ======================================================
    //  CHARGEMENT & RENDU DU TABLEAU
    // ======================================================
    async function loadDevis() {
        tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">Chargement…</td></tr>`;
        const { data, error } = await supabase
            .from('devis')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">Erreur : ${escapeHtml(error.message)}</td></tr>`;
            return;
        }
        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">Aucun devis pour le moment.</td></tr>`;
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(d => tableBody.appendChild(buildRow(d)));
    }

    const STATUTS = [
        { v: 'nouveau', label: 'Nouveau' },
        { v: 'contacte', label: 'Contacté' },
        { v: 'converti', label: 'Converti' },
        { v: 'archive', label: 'Archivé' }
    ];

    function buildRow(d) {
        const tr = document.createElement('tr');

        const td = (html) => { const c = document.createElement('td'); c.innerHTML = html; return c; };

        tr.appendChild(td(fmtDate(d.created_at)));
        tr.appendChild(td(escapeHtml(d.nom)));
        tr.appendChild(td(escapeHtml(d.prenom)));
        tr.appendChild(td(escapeHtml(d.telephone || '—')));
        const qte = d.quantite && d.quantite > 1 ? `${d.quantite}× ` : '';
        tr.appendChild(td(escapeHtml(qte + emplacementsText(d))));
        tr.appendChild(td(d.budget != null ? `${d.budget} €` : '—'));

        // Statut (sélecteur)
        const statutTd = document.createElement('td');
        const sel = document.createElement('select');
        sel.className = `status-select s-${d.statut || 'nouveau'}`;
        STATUTS.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.v;
            opt.textContent = s.label;
            if (s.v === (d.statut || 'nouveau')) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => updateStatus(d.id, sel.value, sel));
        statutTd.appendChild(sel);
        tr.appendChild(statutTd);

        // Actions
        const actTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';

        const mkBtn = (label, title, handler) => {
            const b = document.createElement('button');
            b.className = 'icon-btn';
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', handler);
            return b;
        };

        wrap.appendChild(mkBtn('🔍 Analyser', 'Analyser ce devis par IA', () => analyzeDevis(d)));
        wrap.appendChild(mkBtn('📄 Devis', 'Générer le vrai devis (PDF)', (e) => generateRealDevis(d, e.currentTarget)));
        wrap.appendChild(mkBtn('🎨 Pub', 'Créer la publicité', () => openPubCreator(d)));
        const delBtn = mkBtn('🗑️ Supprimer', 'Supprimer définitivement ce devis', () => deleteDevis(d, tr, delBtn));
        delBtn.classList.add('icon-btn-danger');
        wrap.appendChild(delBtn);

        actTd.appendChild(wrap);
        tr.appendChild(actTd);

        return tr;
    }

    async function deleteDevis(d, tr, btn) {
        const confirmed = confirm(
            `Supprimer définitivement le devis de ${d.prenom} ${d.nom} ?\n\nCette action est irréversible.`
        );
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = '⏳…';

        const { error } = await supabase.from('devis').delete().eq('id', d.id);

        if (error) {
            alert('Erreur lors de la suppression : ' + error.message);
            btn.disabled = false;
            btn.textContent = '🗑️ Supprimer';
            return;
        }

        tr.remove();
        if (!tableBody.querySelector('tr')) {
            tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">Aucun devis pour le moment.</td></tr>`;
        }
    }

    async function updateStatus(id, statut, sel) {
        sel.className = `status-select s-${statut}`;
        const { error } = await supabase.from('devis').update({ statut }).eq('id', id);
        if (error) {
            alert('Erreur lors de la mise à jour du statut : ' + error.message);
        }
    }

    // ======================================================
    //  MODALES
    // ======================================================
    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov.id); });
    });

    // ======================================================
    //  ACTION 1 — ANALYSER PAR IA
    // ======================================================
    const ANALYSE_PROMPT = `Tu es un consultant expert en publicité. On te fournit les informations d'un devis ET la transcription de la conversation entre le client et l'assistant. Fournis un compte rendu clair et structuré, avec ces sections :

1. Profil client
2. Objet et description de la publicité (besoins identifiés)
3. Compte rendu du déroulement de la conversation : est-ce que l'échange s'est bien ou mal passé ? Le client a-t-il hésité, été confus, mécontent, pressé ? Y a-t-il eu des blocages, des incompréhensions, des tentatives de fausses informations ou de manipulation de l'assistant ? Des points positifs (client motivé, réponses claires) ?
4. Points de vigilance (budget, description vague, dates, cohérence)
5. Recommandations pour optimiser la campagne et pour le suivi commercial (ce que le conseiller devrait préparer / aborder lors du RDV)
6. Score de qualité du devis sur 10

Sois concret et utile pour le conseiller qui rappellera le client.`;

    // L'analyse est mise en cache (en mémoire sur `d`, et persistée en base) :
    // rouvrir la modale n'appelle PLUS l'IA — il faut cliquer explicitement sur
    // « Régénérer » pour relancer une analyse (ex. devis modifié depuis).
    async function analyzeDevis(d, force = false) {
        document.getElementById('infoModalTitle').textContent = `Analyse IA — ${d.prenom} ${d.nom}`;
        const body = document.getElementById('infoModalBody');
        openModal('infoModal');

        if (d.analyse_ia && !force) {
            renderAnalysis(d, body);
            return;
        }

        body.innerHTML = `<div class="modal-loading">⏳ Analyse en cours…</div>`;

        try {
            const userMsg =
                "=== INFORMATIONS DU DEVIS ===\n" + devisToText(d) +
                "\n\n=== TRANSCRIPTION DE LA CONVERSATION ===\n" + conversationToText(d);
            const result = await callChatFn(
                [{ role: 'user', content: userMsg }],
                ANALYSE_PROMPT
            );
            d.analyse_ia = result;
            d.analyse_ia_at = new Date().toISOString();
            renderAnalysis(d, body);

            // Sauvegarde best-effort : si la migration (colonnes analyse_ia*)
            // n'est pas encore appliquée, l'analyse reste affichée (juste pas
            // persistée entre deux rechargements de la page).
            const { error } = await supabase.from('devis')
                .update({ analyse_ia: d.analyse_ia, analyse_ia_at: d.analyse_ia_at })
                .eq('id', d.id);
            if (error) console.error('Sauvegarde analyse IA échouée', error);
        } catch (err) {
            body.innerHTML = `<div class="gen-error">⚠️ ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderAnalysis(d, body) {
        body.innerHTML = '';

        const content = document.createElement('div');
        content.innerHTML = formatRich(d.analyse_ia);
        body.appendChild(content);

        const regenBtn = document.createElement('button');
        regenBtn.className = 'btn btn-outline mt-2';
        regenBtn.textContent = '🔄 Régénérer l\'analyse';
        regenBtn.addEventListener('click', () => analyzeDevis(d, true));
        body.appendChild(regenBtn);
    }

    // ======================================================
    //  ACTION 2 — GÉNÉRER LE VRAI DEVIS (PDF)
    // ======================================================
    const VRAI_DEVIS_PROMPT = `Tu es l'assistant administratif d'Affich'Pub. À partir des informations et des montants fournis, rédige un devis professionnel complet, en texte clair et structuré (sans markdown, sans astérisques), prêt à être imprimé. Inclure dans cet ordre : un numéro de devis, la date du jour, les coordonnées du client, le détail des prestations (nombre de publicités et emplacement de chacune, régularité d'entretien, format de diffusion, période, durée), puis le récapitulatif financier avec Prix HT, TVA 20% et Prix TTC, les conditions de règlement, et la mention "Devis valable 30 jours". Utilise exactement les montants fournis.`;

    async function generateRealDevis(d, btn) {
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳…';

        try {
            const ht = Number(d.prix_estime) || 0;
            const tva = +(ht * 0.2).toFixed(2);
            const ttc = +(ht * 1.2).toFixed(2);
            const numero = 'DV-' + new Date().getFullYear() + '-' +
                String(d.id).slice(0, 8).toUpperCase();

            const userMsg =
                devisToText(d) + '\n\n' +
                `Numéro de devis : ${numero}\n` +
                `Prix HT : ${ht.toFixed(2)} €\n` +
                `TVA (20%) : ${tva.toFixed(2)} €\n` +
                `Prix TTC : ${ttc.toFixed(2)} €`;

            const text = await callChatFn([{ role: 'user', content: userMsg }], VRAI_DEVIS_PROMPT);
            buildTextPdf(`Devis ${numero}`, text, `devis-${numero}.pdf`);
        } catch (err) {
            alert('Génération du devis impossible : ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    }

    function buildTextPdf(title, text, fileName) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 18;

        // En-tête
        doc.setFillColor(255, 229, 0);
        doc.rect(0, 0, pageW, 24, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text("AFFICH'PUB", margin, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(new Date().toLocaleDateString('fr-FR'), pageW - margin, 14, { align: 'right' });

        let y = 34;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(20, 20, 20);
        doc.text(title, margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);

        const lines = doc.splitTextToSize(text, pageW - margin * 2);
        lines.forEach(ln => {
            if (y > pageH - 24) { doc.addPage(); y = 24; }
            doc.text(ln, margin, y);
            y += 5.6;
        });

        // Mention légale
        if (y > pageH - 24) { doc.addPage(); y = 24; }
        y += 4;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const legal = doc.splitTextToSize(
            "Document généré par Affich'Pub. Les tarifs peuvent varier selon les disponibilités. Devis valable 30 jours.",
            pageW - margin * 2
        );
        doc.text(legal, margin, y);

        doc.save(fileName);
    }

    // ======================================================
    //  ACTION 3 — CRÉER LA PUBLICITÉ (chatbot + image)
    // ======================================================
    const ART_PROMPT = `Tu es un directeur artistique expert en publicité. À partir des informations du devis fourni, aide à affiner le concept visuel de la publicité en posant des questions (UNE à la fois) sur : la palette de couleurs, le texte principal/slogan, le style visuel, les éléments visuels souhaités, le public cible, l'ambiance générale.

Important : aucun modèle de génération d'image gratuit ne sait écrire du texte lisible à l'intérieur d'une image. Le texte/slogan ne doit donc JAMAIS être inclus dans le prompt visuel ni demandé au modèle d'image — il sera superposé séparément, par-dessus l'image, une fois celle-ci générée.

Quand tous les éléments sont définis, réponds UNIQUEMENT avec ce format exact :
AD_PROMPT:
<prompt en anglais décrivant uniquement la scène visuelle : couleurs, composition, style, ambiance, éléments — sans aucun mot, lettre ni texte à afficher>
TEXTE_PRINCIPAL:
<le texte/slogan exact à superposer sur l'image, tel que validé par le client ; laisser vide si aucun texte n'est souhaité>`;

    let pubHistory = [];
    const pubChat = document.getElementById('pubChat');
    const pubInput = document.getElementById('pubInput');
    const pubSend = document.getElementById('pubSend');
    const pubInputRow = document.getElementById('pubInputRow');
    const pubGenZone = document.getElementById('pubGenZone');

    function pubAddBubble(role, text) {
        const b = document.createElement('div');
        b.className = `mini-bubble ${role}`;
        b.innerHTML = formatRich(text);
        pubChat.appendChild(b);
        pubChat.scrollTop = pubChat.scrollHeight;
    }

    function pubSetEnabled(on) {
        pubInput.disabled = !on;
        pubSend.disabled = !on;
        if (on) pubInput.focus();
    }

    async function openPubCreator(d) {
        pubHistory = [];
        pubChat.innerHTML = '';
        pubGenZone.innerHTML = '';
        pubInputRow.style.display = 'flex';
        pubInput.value = '';
        openModal('pubModal');

        pubAddBubble('bot', "Très bien, affinons ensemble le visuel de cette publicité…");
        pubSetEnabled(false);

        // 1er tour : on fournit le contexte du devis et on récupère la 1re question
        pubHistory.push({
            role: 'user',
            content: `Voici le devis à transformer en visuel :\n${devisToText(d)}\n\nCommençons à définir le concept visuel.`
        });

        try {
            const reply = await callChatFn(pubHistory, ART_PROMPT);
            handlePubReply(reply);
        } catch (err) {
            pubAddBubble('bot', `⚠️ ${err.message}`);
            pubSetEnabled(true);
        }
    }

    async function pubSendMessage() {
        const msg = pubInput.value.trim();
        if (!msg || pubInput.disabled) return;
        pubAddBubble('user', msg);
        pubHistory.push({ role: 'user', content: msg });
        pubInput.value = '';
        pubSetEnabled(false);

        try {
            const reply = await callChatFn(pubHistory, ART_PROMPT);
            handlePubReply(reply);
        } catch (err) {
            pubAddBubble('bot', `⚠️ ${err.message}`);
            pubSetEnabled(true);
        }
    }

    function parseAdPromptReply(reply) {
        const adIdx = reply.indexOf('AD_PROMPT:');
        if (adIdx === -1) return null;

        const intro = reply.slice(0, adIdx).trim();
        const rest = reply.slice(adIdx + 'AD_PROMPT:'.length).trim();
        const txtIdx = rest.indexOf('TEXTE_PRINCIPAL:');

        let adPrompt = rest;
        let texte = '';
        if (txtIdx !== -1) {
            adPrompt = rest.slice(0, txtIdx).trim();
            texte = rest.slice(txtIdx + 'TEXTE_PRINCIPAL:'.length).trim();
        }
        return { intro, adPrompt, texte };
    }

    function handlePubReply(reply) {
        pubHistory.push({ role: 'assistant', content: reply });

        const parsed = parseAdPromptReply(reply);
        if (parsed) {
            const { intro, adPrompt, texte } = parsed;
            if (intro) pubAddBubble('bot', intro);
            pubAddBubble('bot', "✅ Concept finalisé ! Voici le prompt prêt à coller dans une autre IA. Vous pouvez le modifier librement, ou générer l'image directement ici.");
            pubInputRow.style.display = 'none';
            showPromptResult(adPrompt, texte);
        } else {
            pubAddBubble('bot', reply);
            pubSetEnabled(true);
        }
    }

    // Construit le prompt complet à copier (visuel + consigne de texte si slogan).
    function buildCopyPrompt(visual, slogan) {
        let p = (visual || '').trim();
        if (slogan && slogan.trim()) {
            p += `\n\nInclude this exact text, large and clearly legible: "${slogan.trim()}".`;
        }
        return p;
    }

    function copyToClipboard(text, btn) {
        const done = () => {
            const orig = btn.dataset.label || btn.textContent;
            btn.dataset.label = orig;
            btn.textContent = '✅ Copié !';
            setTimeout(() => { btn.textContent = orig; }, 1800);
        };
        const fallback = () => {
            const t = document.createElement('textarea');
            t.value = text;
            t.style.position = 'fixed';
            t.style.opacity = '0';
            document.body.appendChild(t);
            t.select();
            try { document.execCommand('copy'); done(); }
            catch (e) { alert('Copie impossible — sélectionnez le texte manuellement.'); }
            document.body.removeChild(t);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(fallback);
        } else {
            fallback();
        }
    }

    // Résultat principal : le prompt éditable + copie + (option) génération directe.
    function showPromptResult(adPrompt, texteOverlay) {
        pubGenZone.innerHTML = '';

        const box = document.createElement('div');
        box.className = 'pub-prompt-box';

        const lab = document.createElement('label');
        lab.className = 'pub-prompt-label';
        lab.textContent = '📝 Prompt (modifiable) — à coller dans une autre IA (Midjourney, DALL·E, ChatGPT…)';
        box.appendChild(lab);

        const ta = document.createElement('textarea');
        ta.className = 'pub-prompt-textarea';
        ta.rows = 5;
        ta.value = adPrompt || '';
        box.appendChild(ta);

        const slabel = document.createElement('label');
        slabel.className = 'pub-prompt-label';
        slabel.textContent = '🅰️ Texte / slogan à intégrer (optionnel)';
        box.appendChild(slabel);

        const sloganInput = document.createElement('input');
        sloganInput.type = 'text';
        sloganInput.className = 'pub-prompt-input';
        sloganInput.value = texteOverlay || '';
        box.appendChild(sloganInput);

        const actions = document.createElement('div');
        actions.className = 'pub-prompt-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-primary';
        copyBtn.textContent = '📋 Copier le prompt';
        copyBtn.addEventListener('click', () => copyToClipboard(buildCopyPrompt(ta.value, sloganInput.value), copyBtn));
        actions.appendChild(copyBtn);

        const genBtn = document.createElement('button');
        genBtn.className = 'btn btn-outline';
        genBtn.textContent = "🖼️ Générer l'image ici";
        genBtn.addEventListener('click', () => generateVisual(ta.value.trim(), sloganInput.value.trim(), genBtn));
        actions.appendChild(genBtn);

        box.appendChild(actions);

        const hint = document.createElement('p');
        hint.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:8px;';
        hint.textContent = "Le prompt décrit le visuel. Le texte/slogan est ajouté à la fin du prompt copié, et superposé proprement si vous générez l'image ici.";
        box.appendChild(hint);

        pubGenZone.appendChild(box);
    }

    // Sous-zone dédiée au résultat de génération (laisse le prompt visible au-dessus).
    function genResultZone() {
        let z = document.getElementById('pubGenResult');
        if (!z) {
            z = document.createElement('div');
            z.id = 'pubGenResult';
            z.style.marginTop = '14px';
            pubGenZone.appendChild(z);
        }
        return z;
    }

    async function generateVisual(adPrompt, texteOverlay, btn) {
        if (!adPrompt) { alert('Le prompt est vide.'); return; }
        const origLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Génération… (30–60s)';

        const zone = genResultZone();
        zone.innerHTML = `<p style="font-size:0.8rem;color:var(--text-secondary);">La génération gratuite peut prendre 30 à 60 secondes. Merci de patienter…</p>`;

        try {
            const { image, mimeType } = await callGenAd(adPrompt);
            const dataUrl = `data:${mimeType};base64,${image}`;
            renderGeneratedImage(dataUrl, texteOverlay, zone);
        } catch (err) {
            zone.innerHTML = `
                <div class="gen-error">
                    ⚠️ ${escapeHtml(err.message)}<br><br>
                    Le service de génération gratuit est temporairement indisponible ou surchargé.
                    Réessayez dans une minute, ou collez le prompt ci-dessus dans un autre outil
                    (<strong>Canva</strong>, <strong>Adobe Express</strong>, <strong>ChatGPT</strong>…).
                </div>`;
            const retry = document.createElement('button');
            retry.className = 'btn btn-outline btn-full mt-2';
            retry.textContent = '🔄 Réessayer';
            retry.addEventListener('click', () => generateVisual(adPrompt, texteOverlay, retry));
            zone.appendChild(retry);
        } finally {
            btn.disabled = false;
            btn.textContent = origLabel;
        }
    }

    // Découpe le texte en lignes qui rentrent dans maxWidth (canvas 2D)
    function wrapCanvasText(ctx, text, maxWidth) {
        const words = text.split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';
        words.forEach(word => {
            const test = current ? current + ' ' + word : word;
            if (current && ctx.measureText(test).width > maxWidth) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        });
        if (current) lines.push(current);
        return lines;
    }

    // Superpose le slogan (texte réel, toujours lisible) en bas de l'image générée
    function drawTextOverlay(ctx, canvas, text) {
        if (!text) return;
        const w = canvas.width;
        const h = canvas.height;
        const fontSize = Math.round(w * 0.055);
        ctx.font = `700 ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = w * 0.86;
        const lines = wrapCanvasText(ctx, text.toUpperCase(), maxWidth);
        const lineHeight = fontSize * 1.25;
        const bannerHeight = lines.length * lineHeight + fontSize * 0.9;
        const bannerY = h - bannerHeight;

        const gradient = ctx.createLinearGradient(0, bannerY, 0, h);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.35, 'rgba(0,0,0,0.65)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, bannerY, w, bannerHeight);

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = fontSize * 0.15;
        let ty = h - bannerHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach(line => {
            ctx.fillText(line, w / 2, ty);
            ty += lineHeight;
        });
        ctx.shadowBlur = 0;
    }

    function renderGeneratedImage(dataUrl, texteOverlay, zone) {
        const target = zone || pubGenZone;
        target.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'gen-image-wrap';

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 1024;
            canvas.height = img.naturalHeight || 1024;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            drawTextOverlay(ctx, canvas, (texteOverlay || '').trim());

            const finalUrl = canvas.toDataURL('image/png');
            const finalImg = new Image();
            finalImg.src = finalUrl;
            finalImg.alt = 'Visuel publicitaire généré';
            wrap.insertBefore(finalImg, wrap.firstChild);

            const dl = document.createElement('button');
            dl.className = 'btn btn-primary btn-full';
            dl.textContent = '⬇️ Télécharger en PNG';
            dl.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = finalUrl;
                link.download = 'visuel-affichpub.png';
                link.click();
            });
            wrap.appendChild(dl);

            const regen = document.createElement('p');
            regen.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:8px;text-align:center;';
            regen.textContent = 'Astuce : relancez la création pour obtenir d’autres variantes.';
            wrap.appendChild(regen);
        };
        img.onerror = () => {
            wrap.innerHTML = `<div class="gen-error">⚠️ L'image générée n'a pas pu être chargée. Réessayez.</div>`;
        };
        img.src = dataUrl;

        target.appendChild(wrap);
    }
    pubSend.addEventListener('click', pubSendMessage);
    pubInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); pubSendMessage(); }
    });

    // ======================================================
    //  INIT
    // ======================================================
    initAuth();
});
