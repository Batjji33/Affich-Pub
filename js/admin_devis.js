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
    //  APPELS EDGE FUNCTIONS
    // ======================================================
    async function callChatFn(messages, system) {
        const res = await fetch(`${FN_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify({ system, messages, model: 'llama-3.3-70b-versatile' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
        return (data?.choices?.[0]?.message?.content || '').trim();
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
        if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
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
            `Régularité d'entretien : ${d.regularite ?? '—'}`,
            `Emplacement : ${d.emplacement ?? '—'}`,
            `Période : du ${d.date_debut ?? '—'} au ${d.date_fin ?? '—'}`,
            `Prix estimé (interne) : ${d.prix_estime ?? '—'} €`
        ].join('\n');
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
        tr.appendChild(td(cap(d.emplacement)));
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

        actTd.appendChild(wrap);
        tr.appendChild(actTd);

        return tr;
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
    const ANALYSE_PROMPT = `Tu es un consultant expert en publicité. Analyse ce devis et fournis un compte rendu structuré incluant : profil client, objet et description de la publicité, besoins identifiés, points de vigilance (budget, description vague, dates), recommandations pour optimiser la campagne, et un score de qualité du devis sur 10.`;

    async function analyzeDevis(d) {
        document.getElementById('infoModalTitle').textContent = `Analyse IA — ${d.prenom} ${d.nom}`;
        const body = document.getElementById('infoModalBody');
        body.innerHTML = `<div class="modal-loading">⏳ Analyse en cours…</div>`;
        openModal('infoModal');

        try {
            const result = await callChatFn(
                [{ role: 'user', content: devisToText(d) }],
                ANALYSE_PROMPT
            );
            body.innerHTML = formatRich(result);
        } catch (err) {
            body.innerHTML = `<div class="gen-error">⚠️ ${escapeHtml(err.message)}</div>`;
        }
    }

    // ======================================================
    //  ACTION 2 — GÉNÉRER LE VRAI DEVIS (PDF)
    // ======================================================
    const VRAI_DEVIS_PROMPT = `Tu es l'assistant administratif d'Affich'Pub. À partir des informations et des montants fournis, rédige un devis professionnel complet, en texte clair et structuré (sans markdown, sans astérisques), prêt à être imprimé. Inclure dans cet ordre : un numéro de devis, la date du jour, les coordonnées du client, le détail des prestations (emplacement, régularité, format de diffusion, période, durée), puis le récapitulatif financier avec Prix HT, TVA 20% et Prix TTC, les conditions de règlement, et la mention "Devis valable 30 jours". Utilise exactement les montants fournis.`;

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
Quand tous les éléments sont définis, génère un prompt précis en anglais pour un modèle de génération d'image, optimisé pour une affiche publicitaire. Commence ce prompt par "AD_PROMPT:" sur une ligne séparée.`;

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

    function handlePubReply(reply) {
        pubHistory.push({ role: 'assistant', content: reply });

        if (reply.includes('AD_PROMPT:')) {
            const idx = reply.indexOf('AD_PROMPT:');
            const intro = reply.slice(0, idx).trim();
            const adPrompt = reply.slice(idx + 'AD_PROMPT:'.length).trim();

            if (intro) pubAddBubble('bot', intro);
            pubAddBubble('bot', "✅ Concept finalisé ! Vous pouvez générer le visuel.");
            pubInputRow.style.display = 'none';
            showGenerateButton(adPrompt);
        } else {
            pubAddBubble('bot', reply);
            pubSetEnabled(true);
        }
    }

    function showGenerateButton(adPrompt) {
        pubGenZone.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-full';
        btn.textContent = '🖼️ Générer le visuel';
        btn.addEventListener('click', () => generateVisual(adPrompt, btn));
        pubGenZone.appendChild(btn);

        // Aperçu du prompt (repliable)
        const small = document.createElement('p');
        small.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:8px;';
        small.textContent = 'Prompt : ' + adPrompt;
        pubGenZone.appendChild(small);
    }

    async function generateVisual(adPrompt, btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Génération en cours (30–60s)…';

        const info = document.createElement('p');
        info.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-top:8px;';
        info.textContent = 'La génération gratuite peut prendre 30 à 60 secondes. Merci de patienter…';
        pubGenZone.appendChild(info);

        try {
            const { image, mimeType } = await callGenAd(adPrompt);
            const dataUrl = `data:${mimeType};base64,${image}`;
            renderGeneratedImage(dataUrl);
        } catch (err) {
            pubGenZone.innerHTML = `
                <div class="gen-error">
                    ⚠️ ${escapeHtml(err.message)}<br><br>
                    Le service de génération gratuit est temporairement indisponible ou surchargé.
                    Réessayez dans une minute, ou créez le visuel avec un outil comme
                    <strong>Canva</strong> ou <strong>Adobe Express</strong>.
                </div>`;
            const retry = document.createElement('button');
            retry.className = 'btn btn-outline btn-full mt-2';
            retry.textContent = '🔄 Réessayer';
            retry.addEventListener('click', () => generateVisual(adPrompt, retry));
            pubGenZone.appendChild(retry);
        }
    }

    function renderGeneratedImage(dataUrl) {
        pubGenZone.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'gen-image-wrap';

        const img = new Image();
        img.src = dataUrl;
        img.alt = 'Visuel publicitaire généré';
        wrap.appendChild(img);

        const dl = document.createElement('button');
        dl.className = 'btn btn-primary btn-full';
        dl.textContent = '⬇️ Télécharger en PNG';
        dl.addEventListener('click', () => downloadAsPng(img));
        wrap.appendChild(dl);

        const regen = document.createElement('p');
        regen.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:8px;text-align:center;';
        regen.textContent = 'Astuce : relancez la création pour obtenir d’autres variantes.';
        wrap.appendChild(regen);

        pubGenZone.appendChild(wrap);
    }

    function downloadAsPng(img) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 1024;
            canvas.height = img.naturalHeight || 1024;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = 'visuel-affichpub.png';
            link.click();
        } catch (e) {
            // Repli : téléchargement direct du data URL d'origine
            const link = document.createElement('a');
            link.href = img.src;
            link.download = 'visuel-affichpub.png';
            link.click();
        }
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
