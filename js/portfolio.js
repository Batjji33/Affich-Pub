/* ============================================
   PORTFOLIO.JS — Affichage public des réalisations
   Lecture seule depuis la table Supabase "portfolio".
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

    const stateEl = document.getElementById('portfolioState');
    const gridEl = document.getElementById('portfolioGrid');

    // Échappe le HTML pour éviter toute injection via les données.
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    };

    const showState = (html) => {
        stateEl.innerHTML = html;
        stateEl.style.display = 'block';
        gridEl.style.display = 'none';
    };

    const renderGrid = (items) => {
        gridEl.innerHTML = items.map((item) => {
            const titre = escapeHtml(item.titre);
            const description = escapeHtml(item.description);
            const photo = item.photo_url
                ? `<img class="card-photo" src="${escapeHtml(item.photo_url)}" alt="${titre}" loading="lazy"
                       onerror="this.outerHTML='<div class=\\'card-photo-placeholder\\'>🖼️</div>'">`
                : `<div class="card-photo-placeholder">🖼️</div>`;

            return `
                <article class="glass-card portfolio-card">
                    ${photo}
                    <div class="card-content">
                        <h3>${titre}</h3>
                        ${description ? `<p>${description}</p>` : ''}
                    </div>
                </article>`;
        }).join('');

        stateEl.style.display = 'none';
        gridEl.style.display = 'grid';
    };

    async function loadPortfolio() {
        if (!supabase) {
            showState('⚠️ Base de données indisponible pour le moment.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('portfolio')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                showState('Aucune réalisation pour le moment. Revenez bientôt !');
                return;
            }

            renderGrid(data);
        } catch (e) {
            console.error('Erreur de chargement du portfolio:', e);
            showState('❌ Impossible de charger les réalisations. Veuillez réessayer plus tard.');
        }
    }

    loadPortfolio();
});
