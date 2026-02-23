/* ============================================
   DEVIS.JS — Quote generator logic
   Form validation, toggles, persistence,
   AI simulation, copy/PDF
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('devisForm');
    const generateBtn = document.getElementById('generateBtn');
    const resultSection = document.getElementById('devisResult');
    const storageKey = 'devis_form_data';

    // ---------- Format toggle (Manuel / Informatique) ----------
    const toggleManuel = document.getElementById('toggleManuel');
    const toggleInfo = document.getElementById('toggleInfo');
    const formatInput = document.getElementById('format');

    [toggleManuel, toggleInfo].forEach(btn => {
        btn.addEventListener('click', () => {
            toggleManuel.classList.remove('active');
            toggleInfo.classList.remove('active');
            btn.classList.add('active');
            formatInput.value = btn.dataset.value;
            saveFormData();
        });
    });

    // ---------- Radio group (Régularité) ----------
    const regulariteGroup = document.getElementById('regulariteGroup');
    const regulariteInput = document.getElementById('regularite');

    if (regulariteGroup) {
        regulariteGroup.querySelectorAll('.radio-option').forEach(option => {
            option.addEventListener('click', () => {
                regulariteGroup.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                regulariteInput.value = option.dataset.value;
                saveFormData();
            });
        });
    }

    // ---------- Budget Range ----------
    const budgetRange = document.getElementById('budgetRange');
    const budgetValue = document.getElementById('budgetValue');

    if (budgetRange && budgetValue) {
        budgetRange.addEventListener('input', () => {
            budgetValue.textContent = `${budgetRange.value} €`;
            saveFormData();
        });
    }

    // ---------- Persistence Logic ----------
    function saveFormData() {
        if (!form) return;
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });
        // Add active states for toggles and radios if not captured by FormData
        data.activeFormat = formatInput.value;
        data.activeRegularite = regulariteInput.value;

        localStorage.setItem(storageKey, JSON.stringify(data));
    }

    function loadFormData() {
        const savedData = localStorage.getItem(storageKey);
        if (!savedData) return;

        try {
            const data = JSON.parse(savedData);

            // Text inputs, selects, textareas
            Object.keys(data).forEach(key => {
                const field = form.elements[key];
                if (field && field.type !== 'hidden') {
                    field.value = data[key];
                }
            });

            // Budget
            if (data.budget && budgetRange && budgetValue) {
                budgetRange.value = data.budget;
                budgetValue.textContent = `${data.budget} €`;
            }

            // Format buttons
            if (data.activeFormat) {
                formatInput.value = data.activeFormat;
                toggleManuel.classList.remove('active');
                toggleInfo.classList.remove('active');
                if (data.activeFormat === 'manuel') toggleManuel.classList.add('active');
                else toggleInfo.classList.add('active');
            }

            // Regularity buttons
            if (data.activeRegularite && regulariteGroup) {
                regulariteInput.value = data.activeRegularite;
                regulariteGroup.querySelectorAll('.radio-option').forEach(option => {
                    option.classList.remove('active');
                    if (option.dataset.value === data.activeRegularite) option.classList.add('active');
                });
            }
        } catch (e) {
            console.error("Error loading form data", e);
        }
    }

    // Listen for changes on all form elements
    if (form) {
        form.querySelectorAll('input, textarea, select').forEach(element => {
            element.addEventListener('change', saveFormData);
            element.addEventListener('input', saveFormData);
        });
        loadFormData();
    }

    // ---------- Date Validation ----------
    const dateDebut = document.getElementById('dateDebut');
    const dateFin = document.getElementById('dateFin');
    const dateError = document.getElementById('dateError');

    function validateDates() {
        if (!dateDebut.value || !dateFin.value) return true;

        const start = new Date(dateDebut.value);
        const end = new Date(dateFin.value);

        const diffTime = end - start;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0 || diffDays > 7) {
            dateError.style.display = 'block';
            return false;
        } else {
            dateError.style.display = 'none';
            return true;
        }
    }

    [dateDebut, dateFin].forEach(input => {
        if (input) {
            input.addEventListener('change', validateDates);
        }
    });

    // ---------- Form validation ----------
    function validateForm() {
        let isValid = true;
        const required = form.querySelectorAll('[required]');

        required.forEach(field => {
            const group = field.closest('.form-group');
            if (!field.value.trim()) {
                group.classList.add('has-error');
                isValid = false;
            } else {
                group.classList.remove('has-error');
            }
        });

        if (!validateDates()) {
            isValid = false;
        }

        // Live validation on input
        required.forEach(field => {
            field.addEventListener('input', () => {
                const group = field.closest('.form-group');
                if (field.value.trim()) {
                    group.classList.remove('has-error');
                }
            });
        });

        return isValid;
    }

    // ---------- Generate devis (AI simulation) ----------
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateForm()) {
                // Scroll to first error
                const firstError = form.querySelector('.has-error') || dateError;
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            // Show loading state
            generateBtn.classList.add('loading');
            generateBtn.disabled = true;

            // Simulate AI generation delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Gather form data
            const nom = document.getElementById('nom').value;
            const prenom = document.getElementById('prenom').value;
            const telephone = document.getElementById('telephone').value;
            const format = document.getElementById('format').value;
            const objet = document.getElementById('objet').value;
            const description = document.getElementById('description').value;
            const regularite = document.getElementById('regularite').value;
            const emplacement = document.getElementById('emplacement');
            const emplacementText = emplacement.options[emplacement.selectedIndex].text;
            const debut = document.getElementById('dateDebut').value;
            const fin = document.getElementById('dateFin').value;

            // Populate result
            document.getElementById('resultNom').textContent = `${prenom} ${nom}`;
            document.getElementById('resultTel').textContent = telephone;
            document.getElementById('resultBudget').textContent = `${budgetRange.value} €`;
            document.getElementById('resultFormat').textContent =
                format === 'manuel' ? 'Manuel (Print)' : 'Informatique (Digital)';
            document.getElementById('resultEmplacement').textContent =
                `${emplacementText} • ${regularite.charAt(0).toUpperCase() + regularite.slice(1)}`;
            document.getElementById('resultObjet').textContent = objet;
            document.getElementById('resultDescription').textContent =
                `Description : ${description} (Du ${new Date(debut).toLocaleDateString()} au ${new Date(fin).toLocaleDateString()})`;

            // Generate smart recommendations based on inputs
            const recos = generateRecommendations(format, regularite, description);
            document.getElementById('resultRecos').textContent = recos;

            // Show result
            generateBtn.classList.remove('loading');
            generateBtn.disabled = false;
            resultSection.classList.add('visible');

            // Scroll to result
            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);
        });
    }

    function generateRecommendations(format, regularite, description) {
        const recos = [];

        if (format === 'informatique') {
            recos.push('Nous recommandons une approche digitale avec des formats animés (vidéo courte, bannière interactive) pour maximiser l\'engagement en ligne.');
            if (regularite === 'quotidien') {
                recos.push('Pour une diffusion quotidienne, nous préconisons un système de templates dynamiques permettant des variations automatiques.');
            }
        } else {
            recos.push('Nous recommandons une approche visuelle épurée avec des contrastes élevés pour maximiser l\'impact sur l\'emplacement choisi.');
            recos.push('L\'utilisation de matériaux premium (papier couché, finition mate) est préconisée pour le support print.');
        }

        if (regularite === 'bi-hebdomadaire') {
            recos.push('La fréquence bi-hebdomadaire offre un excellent équilibre entre présence et budget, idéal pour maintenir un flux de communication constant.');
        }

        if (description.length > 100) {
            recos.push('Votre brief détaillé nous permet de proposer une stratégie très ciblée, en phase avec vos objectifs.');
        }

        return recos.join(' ');
    }

    // ---------- Copy to clipboard ----------
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const nom = document.getElementById('resultNom').textContent;
            const tel = document.getElementById('resultTel').textContent;
            const format = document.getElementById('resultFormat').textContent;
            const emp = document.getElementById('resultEmplacement').textContent;
            const budget = document.getElementById('resultBudget').textContent;
            const objet = document.getElementById('resultObjet').textContent;
            const desc = document.getElementById('resultDescription').textContent;
            const recos = document.getElementById('resultRecos').textContent;

            const plainText = `
📄 RÉSUMÉ DE VOTRE DEVIS — AFFICH'PUB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 COORDONNÉES
Nom : ${nom}
Tél : ${tel}

⚙️ CONFIGURATION
Format : ${format}
Emplacement : ${emp}
Budget : ${budget}

📝 PROJET
Objet : ${objet}
${desc}

✨ NOS RECOMMANDATIONS
${recos}

🚀 NOS ENGAGEMENTS
• Conseiller disponible 24h/7j
• Pub certifiée droit d'auteur
• Emplacement stratégique

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2024 AFFICH'PUB — L'AGENCE DE DEMAIN
            `.trim();

            navigator.clipboard.writeText(plainText).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅ Copié !';
                copyBtn.style.borderColor = 'var(--accent)';
                copyBtn.style.color = 'var(--accent)';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.borderColor = '';
                    copyBtn.style.color = '';
                }, 2000);
            });
        });
    }

    // ---------- PDF (print) ----------
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            window.print();
        });
    }

});

