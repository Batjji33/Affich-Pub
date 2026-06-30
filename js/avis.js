/* ============================================
   AVIS.JS — Page publique des avis vérifiés
   - Affiche la moyenne + la liste des avis visibles
     (lecture directe via la clé publique, RLS = visible only)
   - Dépôt d'un avis en 3 étapes via l'Edge Function
     "submit-avis" (vérification du code + écriture service role)
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
    const avisGrid = document.getElementById('avisGrid');
    const ratingScore = document.getElementById('ratingScore');
    const ratingStarsFg = document.getElementById('ratingStarsFg');
    const ratingCount = document.getElementById('ratingCount');

    const reviewModal = document.getElementById('reviewModal');
    const openReviewBtn = document.getElementById('openReviewBtn');

    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');

    const codeInput = document.getElementById('codeInput');
    const verifyBtn = document.getElementById('verifyBtn');
    const step1Msg = document.getElementById('step1Msg');

    const starPicker = document.getElementById('starPicker');
    const titreInput = document.getElementById('titreInput');
    const descInput = document.getElementById('descInput');
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    const step2Msg = document.getElementById('step2Msg');

    const closeConfirmBtn = document.getElementById('closeConfirmBtn');

    let selectedNote = 0;
    let verifiedCode = '';

    // ======================================================
    //  HELPERS
    // ======================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function fmtDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function starsRow(note) {
        const n = Math.max(0, Math.min(5, Math.round(note)));
        return '★'.repeat(n) + '☆'.repeat(5 - n);
    }

    function showMsg(el, text, type) {
        el.textContent = text;
        el.className = 'form-msg ' + (type || '');
    }

    function clearMsg(el) {
        el.textContent = '';
        el.className = 'form-msg';
    }

    // ======================================================
    //  CHARGEMENT DE LA LISTE + MOYENNE
    // ======================================================
    async function loadAvis() {
        if (!supabase) {
            avisGrid.innerHTML = `<div class="avis-empty">Base de données indisponible.</div>`;
            ratingCount.textContent = '';
            return;
        }

        // La RLS limite déjà les visiteurs anonymes aux avis visibles, mais
        // on filtre AUSSI explicitement ici : intention claire, robuste si la
        // RLS venait à changer, et la moyenne ne comptera jamais un avis masqué.
        const { data, error } = await supabase
            .from('avis')
            .select('titre, resume, note, created_at')
            .eq('visible', true)
            .order('created_at', { ascending: false });

        if (error) {
            avisGrid.innerHTML = `<div class="avis-empty">Impossible de charger les avis pour le moment.</div>`;
            ratingCount.textContent = '';
            console.error(error);
            return;
        }

        renderSummary(data || []);
        renderList(data || []);
    }

    function renderSummary(list) {
        if (!list.length) {
            ratingScore.innerHTML = '—<span>/5</span>';
            ratingStarsFg.style.width = '0';
            ratingCount.textContent = 'Aucun avis pour le moment';
            return;
        }
        const sum = list.reduce((acc, a) => acc + (Number(a.note) || 0), 0);
        const avg = sum / list.length;
        ratingScore.innerHTML = `${avg.toFixed(1).replace('.', ',')}<span>/5</span>`;
        ratingStarsFg.style.width = `${(avg / 5) * 100}%`;
        ratingCount.textContent =
            `Basé sur ${list.length} avis vérifié${list.length > 1 ? 's' : ''}`;
    }

    function renderList(list) {
        if (!list.length) {
            avisGrid.innerHTML =
                `<div class="avis-empty">Soyez le premier à laisser un avis vérifié ✨</div>`;
            return;
        }
        avisGrid.innerHTML = '';
        list.forEach(a => {
            const card = document.createElement('article');
            card.className = 'glass-card avis-card';
            card.innerHTML = `
                <div class="avis-card-head">
                    <div class="stars-row" aria-label="${a.note} sur 5">${starsRow(a.note)}</div>
                    <span class="verified-badge">✓ Vérifié</span>
                </div>
                <h3>${escapeHtml(a.titre)}</h3>
                <p>${escapeHtml(a.resume)}</p>
                <div class="avis-date">${fmtDate(a.created_at)}</div>
            `;
            avisGrid.appendChild(card);
        });
    }

    // ======================================================
    //  MODALE — ouverture / fermeture / navigation d'étapes
    // ======================================================
    function openModal() { reviewModal.classList.add('open'); }
    function closeModal() { reviewModal.classList.remove('open'); }

    function resetModal() {
        step1.style.display = 'block';
        step2.style.display = 'none';
        step3.style.display = 'none';
        codeInput.value = '';
        titreInput.value = '';
        descInput.value = '';
        selectedNote = 0;
        verifiedCode = '';
        paintStars(0);
        clearMsg(step1Msg);
        clearMsg(step2Msg);
        document.getElementById('reviewModalTitle').textContent = 'Donner mon avis';
    }

    openReviewBtn.addEventListener('click', () => {
        resetModal();
        openModal();
        setTimeout(() => codeInput.focus(), 50);
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    reviewModal.addEventListener('click', (e) => {
        if (e.target === reviewModal) closeModal();
    });

    // N'autoriser que des chiffres dans le champ code
    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
        clearMsg(step1Msg);
    });
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); verifyCode(); }
    });

    // ======================================================
    //  ÉTAPE 1 — VÉRIFICATION DU CODE
    //  On interroge l'Edge Function en mode "check" (lecture seule,
    //  ne réclame pas le code) pour afficher immédiatement une erreur
    //  si le code est invalide ou déjà utilisé — sans attendre la
    //  saisie de l'avis. La réclamation définitive a toujours lieu à
    //  la publication (étape 3), qui revérifie tout côté serveur.
    // ======================================================
    async function verifyCode() {
        clearMsg(step1Msg);
        const code = codeInput.value.trim();
        if (!/^[0-9]{4}$/.test(code)) {
            showMsg(step1Msg, 'Veuillez saisir un code à 4 chiffres.', 'error');
            return;
        }

        verifyBtn.disabled = true;
        const original = verifyBtn.textContent;
        verifyBtn.textContent = 'Vérification…';

        try {
            const res = await fetch(`${FN_BASE}/submit-avis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'apikey': SUPABASE_KEY
                },
                body: JSON.stringify({ code, check: true })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showMsg(step1Msg, data.error || 'Ce code est invalide.', 'error');
                return;
            }

            verifiedCode = code;
            goToStep2();
        } catch (err) {
            showMsg(step1Msg, 'Connexion impossible. Vérifiez votre réseau et réessayez.', 'error');
            console.error(err);
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.textContent = original;
        }
    }

    verifyBtn.addEventListener('click', verifyCode);

    function goToStep2() {
        step1.style.display = 'none';
        step2.style.display = 'block';
        step3.style.display = 'none';
        titreInput.focus();
    }

    // ======================================================
    //  ÉTAPE 2 — SAISIE DE L'AVIS
    // ======================================================
    function paintStars(n) {
        starPicker.querySelectorAll('.star').forEach(s => {
            s.classList.toggle('on', Number(s.dataset.v) <= n);
        });
    }

    starPicker.querySelectorAll('.star').forEach(star => {
        const v = Number(star.dataset.v);
        star.addEventListener('mouseenter', () => paintStars(v));
        star.addEventListener('click', () => { selectedNote = v; paintStars(v); });
    });
    starPicker.addEventListener('mouseleave', () => paintStars(selectedNote));

    async function submitReview() {
        clearMsg(step2Msg);
        const titre = titreInput.value.trim();
        const description = descInput.value.trim();

        if (!selectedNote) {
            showMsg(step2Msg, 'Veuillez choisir une note (1 à 5 étoiles).', 'error');
            return;
        }
        if (!titre) {
            showMsg(step2Msg, 'Veuillez saisir un titre.', 'error');
            return;
        }
        if (!description) {
            showMsg(step2Msg, 'Veuillez décrire votre expérience.', 'error');
            return;
        }

        submitReviewBtn.disabled = true;
        const original = submitReviewBtn.textContent;
        submitReviewBtn.textContent = 'Publication…';

        try {
            const res = await fetch(`${FN_BASE}/submit-avis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'apikey': SUPABASE_KEY
                },
                body: JSON.stringify({
                    code: verifiedCode,
                    titre,
                    description,
                    note: selectedNote
                })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // Erreurs métier : code invalide (404) ou déjà utilisé (409)
                const msg = data.error || 'Une erreur est survenue. Réessayez.';
                if (res.status === 404 || res.status === 409) {
                    // Le code est en cause → on renvoie l'utilisateur à l'étape 1
                    step1.style.display = 'block';
                    step2.style.display = 'none';
                    showMsg(step1Msg, msg, 'error');
                    codeInput.focus();
                } else {
                    showMsg(step2Msg, msg, 'error');
                }
                return;
            }

            goToStep3();
            loadAvis(); // rafraîchit la liste + la moyenne en arrière-plan
        } catch (err) {
            showMsg(step2Msg, 'Connexion impossible. Vérifiez votre réseau et réessayez.', 'error');
            console.error(err);
        } finally {
            submitReviewBtn.disabled = false;
            submitReviewBtn.textContent = original;
        }
    }

    submitReviewBtn.addEventListener('click', submitReview);

    // ======================================================
    //  ÉTAPE 3 — CONFIRMATION
    // ======================================================
    function goToStep3() {
        step1.style.display = 'none';
        step2.style.display = 'none';
        step3.style.display = 'block';
        document.getElementById('reviewModalTitle').textContent = 'Avis publié';
    }

    closeConfirmBtn.addEventListener('click', closeModal);

    // ======================================================
    //  INIT
    // ======================================================
    loadAvis();
});
