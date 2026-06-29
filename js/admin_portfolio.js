/* ============================================
   ADMIN_PORTFOLIO.JS — Gestion des réalisations (admin)
   Auth Supabase + CRUD sur la table "portfolio"
   + upload des photos dans Supabase Storage (bucket "portfolio").
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';
    const BUCKET = 'portfolio';
    const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

    let supabase = null;
    try {
        if (SUPABASE_URL.startsWith('http')) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (e) {
        console.error('Supabase init failed', e);
    }

    // --- DOM : auth ---
    const authGate = document.getElementById('authGate');
    const adminContent = document.getElementById('adminContent');
    const authForm = document.getElementById('authForm');
    const authError = document.getElementById('authError');
    const logoutBtn = document.getElementById('logoutBtn');

    // --- DOM : contenu ---
    const pfState = document.getElementById('pfState');
    const pfGrid = document.getElementById('pfGrid');
    const pfCount = document.getElementById('pfCount');
    const addBtn = document.getElementById('addBtn');

    // --- DOM : modale formulaire ---
    const formModal = document.getElementById('formModal');
    const formModalTitle = document.getElementById('formModalTitle');
    const pfForm = document.getElementById('pfForm');
    const pfId = document.getElementById('pfId');
    const pfTitre = document.getElementById('pfTitre');
    const pfDescription = document.getElementById('pfDescription');
    const pfPhoto = document.getElementById('pfPhoto');
    const uploadZone = document.getElementById('uploadZone');
    const photoPreview = document.getElementById('photoPreview');
    const previewImg = document.getElementById('previewImg');
    const formFeedback = document.getElementById('formFeedback');
    const saveBtn = document.getElementById('saveBtn');

    let items = [];            // réalisations chargées
    let editingItem = null;    // item en cours d'édition (null = ajout)
    let selectedFile = null;   // fichier image choisi

    // ======================================================
    //  HELPERS
    // ======================================================
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    };

    const setFeedback = (msg, type) => {
        formFeedback.textContent = msg;
        formFeedback.className = 'form-feedback ' + (type || '');
        if (!type) formFeedback.style.display = 'none';
    };

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
            loadItems();
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
            loadItems();
        }
    });

    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (supabase) await supabase.auth.signOut();
        showGate();
    });

    // ======================================================
    //  CHARGEMENT & RENDU
    // ======================================================
    async function loadItems() {
        pfState.style.display = 'block';
        pfState.textContent = 'Chargement…';
        pfGrid.style.display = 'none';

        try {
            const { data, error } = await supabase
                .from('portfolio')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            items = data || [];
            renderItems();
        } catch (e) {
            console.error('Erreur de chargement:', e);
            pfState.textContent = '❌ Impossible de charger les réalisations.';
            pfState.style.display = 'block';
            pfGrid.style.display = 'none';
        }
    }

    function renderItems() {
        pfCount.textContent = items.length
            ? `${items.length} réalisation${items.length > 1 ? 's' : ''}`
            : '';

        if (items.length === 0) {
            pfState.textContent = 'Aucune réalisation. Cliquez sur « Ajouter une réalisation » pour commencer.';
            pfState.style.display = 'block';
            pfGrid.style.display = 'none';
            return;
        }

        pfState.style.display = 'none';
        pfGrid.style.display = 'grid';
        pfGrid.innerHTML = items.map((item) => {
            const titre = escapeHtml(item.titre);
            const desc = escapeHtml(item.description);
            const photo = item.photo_url
                ? `<img class="pf-photo" src="${escapeHtml(item.photo_url)}" alt="${titre}"
                       onerror="this.outerHTML='<div class=\\'pf-photo-placeholder\\'>🖼️</div>'">`
                : `<div class="pf-photo-placeholder">🖼️</div>`;
            return `
                <article class="glass-card admin-pf-card">
                    ${photo}
                    <div class="pf-body">
                        <h3>${titre}</h3>
                        <p class="pf-desc">${desc || '<em style="color:var(--text-muted)">Sans description</em>'}</p>
                        <div class="pf-actions">
                            <button class="icon-btn" data-edit="${item.id}">✏️ Modifier</button>
                            <button class="icon-btn icon-btn-danger" data-delete="${item.id}">🗑️ Supprimer</button>
                        </div>
                    </div>
                </article>`;
        }).join('');
    }

    // Délégation des clics (édition / suppression)
    pfGrid.addEventListener('click', (e) => {
        const editId = e.target.getAttribute('data-edit');
        const deleteId = e.target.getAttribute('data-delete');
        if (editId) openForm(items.find(i => String(i.id) === editId));
        if (deleteId) deleteItem(items.find(i => String(i.id) === deleteId), e.target);
    });

    // ======================================================
    //  MODALE FORMULAIRE
    // ======================================================
    function openForm(item) {
        editingItem = item || null;
        selectedFile = null;
        pfForm.reset();
        setFeedback('', null);
        photoPreview.style.display = 'none';
        previewImg.src = '';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Enregistrer';

        if (editingItem) {
            formModalTitle.textContent = 'Modifier la réalisation';
            pfId.value = editingItem.id;
            pfTitre.value = editingItem.titre || '';
            pfDescription.value = editingItem.description || '';
            if (editingItem.photo_url) {
                previewImg.src = editingItem.photo_url;
                photoPreview.style.display = 'block';
            }
            uploadZone.textContent = editingItem.photo_url
                ? '📷 Changer la photo (laisser vide pour conserver l\'actuelle)'
                : '📷 Cliquez pour choisir une image (JPG, PNG, WebP — max 5 Mo)';
        } else {
            formModalTitle.textContent = 'Ajouter une réalisation';
            pfId.value = '';
            uploadZone.textContent = '📷 Cliquez pour choisir une image (JPG, PNG, WebP — max 5 Mo)';
        }

        formModal.classList.add('open');
    }

    function closeForm() {
        formModal.classList.remove('open');
    }

    addBtn.addEventListener('click', () => openForm(null));

    // Fermeture (croix + clic sur l'overlay)
    document.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.getAttribute('data-close')).classList.remove('open');
        });
    });
    formModal.addEventListener('click', (e) => {
        if (e.target === formModal) closeForm();
    });

    // Sélection de fichier
    uploadZone.addEventListener('click', () => pfPhoto.click());
    pfPhoto.addEventListener('change', () => {
        setFeedback('', null);
        const file = pfPhoto.files[0];
        if (!file) {
            selectedFile = null;
            return;
        }
        if (!file.type.startsWith('image/')) {
            setFeedback('Le fichier doit être une image.', 'error');
            pfPhoto.value = '';
            selectedFile = null;
            return;
        }
        if (file.size > MAX_SIZE) {
            setFeedback('Image trop volumineuse (max 5 Mo).', 'error');
            pfPhoto.value = '';
            selectedFile = null;
            return;
        }
        selectedFile = file;
        previewImg.src = URL.createObjectURL(file);
        photoPreview.style.display = 'block';
    });

    // ======================================================
    //  UPLOAD STORAGE
    // ======================================================
    async function uploadPhoto(file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(name, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
        return data.publicUrl;
    }

    // Récupère le chemin du fichier à partir de son URL publique (pour suppression).
    function storagePathFromUrl(url) {
        if (!url) return null;
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const idx = url.indexOf(marker);
        return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
    }

    // ======================================================
    //  ENREGISTREMENT (ajout / édition)
    // ======================================================
    pfForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFeedback('', null);

        const titre = pfTitre.value.trim();
        const description = pfDescription.value.trim();

        if (!titre) {
            setFeedback('Le titre est obligatoire.', 'error');
            return;
        }
        if (!editingItem && !selectedFile) {
            setFeedback('Veuillez choisir une photo pour la réalisation.', 'error');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = selectedFile ? 'Envoi de la photo…' : 'Enregistrement…';

        try {
            let photoUrl = editingItem ? editingItem.photo_url : null;
            let oldPathToRemove = null;

            if (selectedFile) {
                const newUrl = await uploadPhoto(selectedFile);
                // En édition, on prévoit de supprimer l'ancienne image après succès.
                if (editingItem && editingItem.photo_url) {
                    oldPathToRemove = storagePathFromUrl(editingItem.photo_url);
                }
                photoUrl = newUrl;
            }

            saveBtn.textContent = 'Enregistrement…';

            if (editingItem) {
                const { error } = await supabase
                    .from('portfolio')
                    .update({ titre, description, photo_url: photoUrl })
                    .eq('id', editingItem.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('portfolio')
                    .insert([{ titre, description, photo_url: photoUrl }]);
                if (error) throw error;
            }

            // Nettoyage de l'ancienne photo (best-effort, non bloquant).
            if (oldPathToRemove) {
                supabase.storage.from(BUCKET).remove([oldPathToRemove]).catch(() => {});
            }

            closeForm();
            await loadItems();
        } catch (err) {
            console.error('Erreur d\'enregistrement:', err);
            setFeedback('❌ Échec de l\'enregistrement : ' + (err.message || 'erreur inconnue'), 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Enregistrer';
        }
    });

    // ======================================================
    //  SUPPRESSION
    // ======================================================
    async function deleteItem(item, btn) {
        if (!item) return;
        if (!confirm(`Supprimer définitivement « ${item.titre} » ?`)) return;

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Suppression…';
        }

        try {
            const { error } = await supabase
                .from('portfolio')
                .delete()
                .eq('id', item.id);
            if (error) throw error;

            // Supprime aussi le fichier du Storage (best-effort).
            const path = storagePathFromUrl(item.photo_url);
            if (path) {
                supabase.storage.from(BUCKET).remove([path]).catch(() => {});
            }

            await loadItems();
        } catch (err) {
            console.error('Erreur de suppression:', err);
            alert('❌ Échec de la suppression : ' + (err.message || 'erreur inconnue'));
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🗑️ Supprimer';
            }
        }
    }

    // INIT
    initAuth();
});
