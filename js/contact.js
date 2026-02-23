/* ============================================
   CONTACT.JS — Open/Closed status logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const closeTime = document.getElementById('closeTime');

    function updateStatus() {
        if (!statusDot || !statusText || !closeTime) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const day = now.getDay(); // 0=Sunday, 1=Monday...
        const time = now.getHours() + now.getMinutes() / 60;

        // Zone B School Holidays 2025-2026 (Nantes)
        const vacationPeriods = [
            { start: '2025-10-18', end: '2025-11-02' },
            { start: '2025-12-20', end: '2026-01-04' },
            { start: '2026-02-14', end: '2026-03-01' }, // Currently in this one (Hiver Zone B)
            { start: '2026-04-11', end: '2026-04-26' },
            { start: '2026-05-14', end: '2026-05-17' }, // Pont de l'Ascension
            { start: '2026-07-04', end: '2026-08-31' }
        ];

        const isVacation = vacationPeriods.some(period => dateStr >= period.start && dateStr <= period.end);

        let isOpen = false;
        let nextStatusMsg = '';

        if (!isVacation) {
            // Période scolaire
            if (day >= 1 && day <= 4) { // Lun-Jeu: 18h-19h
                if (time >= 18 && time < 19) { isOpen = true; nextStatusMsg = 'Ferme à 19:00'; }
                else if (time < 18) { nextStatusMsg = 'Ouvre à 18:00'; }
                else { nextStatusMsg = 'Ouvre demain à 18:00'; }
            } else if (day === 5) { // Ven: Fermé
                nextStatusMsg = 'Ouvre demain à 11:00';
            } else if (day === 6) { // Sam: 11h-12h / 14h-18h
                if ((time >= 11 && time < 12) || (time >= 14 && time < 18)) {
                    isOpen = true;
                    nextStatusMsg = time < 12 ? 'Pause à 12:00' : 'Ferme à 18:00';
                } else if (time < 11) { nextStatusMsg = 'Ouvre à 11:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = 'Ouvre demain à 14:00'; }
            } else if (day === 0) { // Dim: 14h-18h
                if (time >= 14 && time < 18) { isOpen = true; nextStatusMsg = 'Ferme à 18:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = 'Ouvre demain à 18:00'; }
            }
        } else {
            // Vacances scolaires
            if (day === 1) { // Lun: 14h-18h
                if (time >= 14 && time < 18) { isOpen = true; nextStatusMsg = 'Ferme à 18:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = 'Ouvre demain à 11:00'; }
            } else if (day >= 2 && day <= 4) { // Mar-Jeu: 11h-12h / 14h-18h
                if ((time >= 11 && time < 12) || (time >= 14 && time < 18)) {
                    isOpen = true;
                    nextStatusMsg = time < 12 ? 'Pause à 12:00' : 'Ferme à 18:00';
                } else if (time < 11) { nextStatusMsg = 'Ouvre à 11:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = 'Ouvre demain à 11:00'; }
            } else if (day === 5 || day === 6) { // Ven-Sam: 11h-12h / 14h-19h
                if ((time >= 11 && time < 12) || (time >= 14 && time < 19)) {
                    isOpen = true;
                    nextStatusMsg = time < 12 ? 'Pause à 12:00' : 'Ferme à 19:00';
                } else if (time < 11) { nextStatusMsg = 'Ouvre à 11:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = day === 5 ? 'Ouvre demain à 11:00' : 'Ouvre demain à 14:00'; }
            } else if (day === 0) { // Dim: 14h-18h
                if (time >= 14 && time < 18) { isOpen = true; nextStatusMsg = 'Ferme à 18:00'; }
                else if (time < 14) { nextStatusMsg = 'Ouvre à 14:00'; }
                else { nextStatusMsg = 'Ouvre demain à 14:00'; }
            }
        }

        if (isOpen) {
            statusDot.classList.remove('closed');
            statusText.textContent = 'ACTUELLEMENT OUVERT';
            closeTime.textContent = nextStatusMsg;
        } else {
            statusDot.classList.add('closed');
            statusText.textContent = 'ACTUELLEMENT FERMÉ';
            closeTime.textContent = nextStatusMsg;
        }
    }

    // Update immediately and every minute
    updateStatus();
    setInterval(updateStatus, 60000);

});
