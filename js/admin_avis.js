/* ============================================
   ADMIN_AVIS.JS — Gestion des avis (admin)
   Auth Supabase (rôle authenticated → RLS full access).
   - Génération de codes à 4 chiffres
   - Liste / modération des avis (masquer, modifier, supprimer)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';

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
    const logoutBtn = document.getElementById('logoutBtn');

    const clientName = document.getElementById('clientName');
    const genCodeBtn = document.getElementById('genCodeBtn');
    const genCodeMsg = document.getElementById('genCodeMsg');
    const codesList = document.getElementById('codesList');

    const avisTableBody = document.getElementById('avisTableBody');

    const editModal = document.getElementById('editModal');
    const editStars = document.getElementById('editStars');
    const editTitre = document.getElementById('editTitre');
    const editDesc = document.getElementById('editDesc');
    const editMsg = document.getElementById('editMsg');
    const saveEditBtn = document.getElementById('saveEditBtn');

    let editingId = null;
    let editNote = 0;

    // ======================================================
    //  HELPERS
    // ======================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR') + ' ' +
            d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function starsMini(note) {
        const n = Math.max(0, Math.min(5, Math.round(note)));
        return '★'.repeat(n) + '☆'.repeat(5 - n);
    }

    function extrait(txt, max = 110) {
        const s = String(txt || '');
        return s.length > max ? s.slice(0, max).trim() + '…' : s;
    }

    function showErr(el, text) {
        el.textContent = text;
        el.style.display = text ? 'block' : 'none';
    }

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
            loadCodes();
            loadAvis();
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
            loadCodes();
            loadAvis();
        }
    });

    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (supabase) await supabase.auth.signOut();
        showGate();
    });

    // ======================================================
    //  GÉNÉRATION DE CODES
    // ======================================================
    function randomCode() {
        return String(Math.floor(1000 + Math.random() * 9000)); // 1000–9999
    }

    async function generateCode() {
        showErr(genCodeMsg, '');
        genCodeBtn.disabled = true;
        const original = genCodeBtn.textContent;
        genCodeBtn.textContent = 'Génération…';

        // Le code doit être unique (contrainte UNIQUE en base). On réessaie en
        // cas de collision (erreur 23505) jusqu'à 6 fois.
        let lastError = null;
        for (let i = 0; i < 6; i++) {
            const code = randomCode();
            const { error } = await supabase.from('codes_avis').insert([{
                code,
                nom_client: clientName.value.trim() || null
            }]);
            if (!error) {
                clientName.value = '';
                genCodeBtn.disabled = false;
                genCodeBtn.textContent = original;
                loadCodes();
                return;
            }
            lastError = error;
            if (error.code !== '23505') break; // erreur autre qu'une collision
        }

        genCodeBtn.disabled = false;
        genCodeBtn.textContent = original;
        showErr(genCodeMsg, 'Impossible de générer le code : ' +
            (lastError ? lastError.message : 'erreur inconnue') + '.');
    }

    genCodeBtn.addEventListener('click', generateCode);

    async function loadCodes() {
        const { data, error } = await supabase
            .from('codes_avis')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            codesList.innerHTML =
                `<div class="table-empty" style="padding:20px;">Erreur : ${escapeHtml(error.message)}</div>`;
            return;
        }
        if (!data || !data.length) {
            codesList.innerHTML =
                `<div class="table-empty" style="padding:20px;">Aucun code généré pour l'instant.</div>`;
            return;
        }

        codesList.innerHTML = '';
        data.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'code-chip' + (c.utilise ? ' used' : '');
            chip.innerHTML = `
                <span class="code-val">${escapeHtml(c.code)}</span>
                <span class="code-meta">${c.nom_client ? escapeHtml(c.nom_client) : '<em>sans nom</em>'}
                    · ${fmtDate(c.created_at)}</span>
                <span class="code-status ${c.utilise ? 'used' : 'free'}">${c.utilise ? 'Utilisé' : 'Disponible'}</span>
            `;
            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '6px';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'icon-btn';
            copyBtn.textContent = '📋 Copier';
            copyBtn.disabled = c.utilise;
            copyBtn.addEventListener('click', () => copyCode(c.code, copyBtn));
            actions.appendChild(copyBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn icon-btn-danger';
            delBtn.textContent = '🗑️ Supprimer';
            delBtn.title = 'Supprimer ce code';
            delBtn.addEventListener('click', () => deleteCode(c, chip, delBtn));
            actions.appendChild(delBtn);

            chip.appendChild(actions);

            codesList.appendChild(chip);
        });
    }

    async function deleteCode(c, chip, btn) {
        const warning = c.utilise
            ? `Ce code a déjà été utilisé pour déposer un avis. Le supprimer effacera aussi l'avis associé (lien en cascade).\n\nSupprimer définitivement le code ${c.code} ?`
            : `Supprimer définitivement le code ${c.code} ?`;
        if (!confirm(warning)) return;

        btn.disabled = true;
        const copyBtnSibling = chip.querySelector('.icon-btn:not(.icon-btn-danger)');
        if (copyBtnSibling) copyBtnSibling.disabled = true;
        btn.textContent = '⏳…';

        const { error } = await supabase.from('codes_avis').delete().eq('id', c.id);

        if (error) {
            alert('Erreur lors de la suppression : ' + error.message);
            btn.disabled = false;
            btn.textContent = '🗑️ Supprimer';
            if (copyBtnSibling) copyBtnSibling.disabled = c.utilise;
            return;
        }

        chip.remove();
        if (!codesList.querySelector('.code-chip')) {
            codesList.innerHTML =
                `<div class="table-empty" style="padding:20px;">Aucun code généré pour l'instant.</div>`;
        }
        // Le code supprimé pouvait être lié à un avis (ON DELETE CASCADE) :
        // on rafraîchit la liste des avis pour refléter une éventuelle suppression.
        if (c.utilise) loadAvis();
    }

    function copyCode(code, btn) {
        const done = () => {
            const orig = '📋 Copier';
            btn.textContent = '✅ Copié';
            setTimeout(() => { btn.textContent = orig; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
        } else {
            fallbackCopy(code, done);
        }
    }

    function fallbackCopy(text, done) {
        const t = document.createElement('textarea');
        t.value = text;
        t.style.position = 'fixed';
        t.style.opacity = '0';
        document.body.appendChild(t);
        t.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { alert('Code : ' + text); }
        document.body.removeChild(t);
    }

    // ======================================================
    //  LISTE & MODÉRATION DES AVIS
    // ======================================================
    async function loadAvis() {
        avisTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">Chargement…</td></tr>`;
        const { data, error } = await supabase
            .from('avis')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            avisTableBody.innerHTML =
                `<tr><td colspan="5" class="table-empty">Erreur : ${escapeHtml(error.message)}</td></tr>`;
            return;
        }
        if (!data || !data.length) {
            avisTableBody.innerHTML =
                `<tr><td colspan="5" class="table-empty">Aucun avis pour le moment.</td></tr>`;
            return;
        }

        avisTableBody.innerHTML = '';
        data.forEach(a => avisTableBody.appendChild(buildRow(a)));
    }

    function buildRow(a) {
        const tr = document.createElement('tr');

        const tdDate = document.createElement('td');
        tdDate.style.whiteSpace = 'nowrap';
        tdDate.textContent = fmtDate(a.created_at);
        tr.appendChild(tdDate);

        const tdNote = document.createElement('td');
        tdNote.innerHTML = `<span class="stars-mini">${starsMini(a.note)}</span>`;
        tr.appendChild(tdNote);

        const tdExtrait = document.createElement('td');
        tdExtrait.innerHTML =
            `<div class="extrait"><strong>${escapeHtml(a.titre)}</strong>${escapeHtml(extrait(a.resume))}</div>`;
        tr.appendChild(tdExtrait);

        const tdStatut = document.createElement('td');
        tdStatut.innerHTML = a.visible
            ? `<span class="pill visible">Visible</span>`
            : `<span class="pill hidden">Masqué</span>`;
        tr.appendChild(tdStatut);

        const tdAct = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';

        const mkBtn = (label, title, handler, danger) => {
            const b = document.createElement('button');
            b.className = 'icon-btn' + (danger ? ' icon-btn-danger' : '');
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', handler);
            return b;
        };

        const toggleBtn = mkBtn(
            a.visible ? '🙈 Masquer' : '👁️ Afficher',
            a.visible ? 'Masquer cet avis' : 'Rendre cet avis visible',
            () => toggleVisible(a, tr, toggleBtn)
        );
        wrap.appendChild(toggleBtn);
        wrap.appendChild(mkBtn('✏️ Modifier', 'Modifier le texte', () => openEdit(a)));
        const delBtn = mkBtn('🗑️ Supprimer', 'Supprimer définitivement', () => deleteAvis(a, tr, delBtn), true);
        wrap.appendChild(delBtn);

        tdAct.appendChild(wrap);
        tr.appendChild(tdAct);

        return tr;
    }

    async function toggleVisible(a, tr, btn) {
        btn.disabled = true;
        const { error } = await supabase.from('avis')
            .update({ visible: !a.visible })
            .eq('id', a.id);
        btn.disabled = false;

        if (error) {
            alert('Erreur : ' + error.message);
            return;
        }
        a.visible = !a.visible;
        // On reconstruit la ligne pour refléter le nouvel état
        tr.replaceWith(buildRow(a));
    }

    async function deleteAvis(a, tr, btn) {
        if (!confirm('Supprimer définitivement cet avis ?\n\nCette action est irréversible.')) return;
        btn.disabled = true;
        btn.textContent = '⏳…';
        const { error } = await supabase.from('avis').delete().eq('id', a.id);
        if (error) {
            alert('Erreur lors de la suppression : ' + error.message);
            btn.disabled = false;
            btn.textContent = '🗑️ Supprimer';
            return;
        }
        tr.remove();
        if (!avisTableBody.querySelector('tr')) {
            avisTableBody.innerHTML =
                `<tr><td colspan="5" class="table-empty">Aucun avis pour le moment.</td></tr>`;
        }
    }

    // ======================================================
    //  MODALE D'ÉDITION
    // ======================================================
    function paintEditStars(n) {
        editStars.querySelectorAll('.star').forEach(s => {
            s.classList.toggle('on', Number(s.dataset.v) <= n);
        });
    }

    editStars.querySelectorAll('.star').forEach(star => {
        const v = Number(star.dataset.v);
        star.addEventListener('mouseenter', () => paintEditStars(v));
        star.addEventListener('click', () => { editNote = v; paintEditStars(v); });
    });
    editStars.addEventListener('mouseleave', () => paintEditStars(editNote));

    function openEdit(a) {
        editingId = a.id;
        editNote = a.note;
        editTitre.value = a.titre || '';
        editDesc.value = a.resume || '';
        paintEditStars(a.note);
        showErr(editMsg, '');
        editModal.classList.add('open');
    }

    function closeEdit() { editModal.classList.remove('open'); }

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeEdit());
    });
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEdit(); });

    saveEditBtn.addEventListener('click', async () => {
        const titre = editTitre.value.trim();
        const resume = editDesc.value.trim();
        if (!editNote || editNote < 1 || editNote > 5) { showErr(editMsg, 'Choisissez une note (1 à 5).'); return; }
        if (!titre) { showErr(editMsg, 'Le titre est obligatoire.'); return; }
        if (!resume) { showErr(editMsg, 'La description est obligatoire.'); return; }

        saveEditBtn.disabled = true;
        saveEditBtn.textContent = 'Enregistrement…';

        const { error } = await supabase.from('avis')
            .update({ titre, resume, note: editNote })
            .eq('id', editingId);

        saveEditBtn.disabled = false;
        saveEditBtn.textContent = 'Enregistrer';

        if (error) {
            showErr(editMsg, 'Erreur : ' + error.message);
            return;
        }
        closeEdit();
        loadAvis();
    });

    // ======================================================
    //  INIT
    // ======================================================
    initAuth();
});
