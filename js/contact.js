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
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const time = hours + minutes / 60;

        // Zone B School Holidays 2025-2026 (Nantes)
        const vacationPeriods = [
            { start: '2025-10-18', end: '2025-11-02' },
            { start: '2025-12-20', end: '2026-01-04' },
            { start: '2026-02-14', end: '2026-03-01' },
            { start: '2026-04-11', end: '2026-04-26' },
            { start: '2026-05-14', end: '2026-05-17' }, // Pont de l'Ascension
            { start: '2026-07-04', end: '2026-08-31' }
        ];

        const isVacation = vacationPeriods.some(period => dateStr >= period.start && dateStr <= period.end);

        // Schedule definition
        let schedule = [];

        if (!isVacation) {
            if (day === 3) schedule = [[17, 19]];
            else if (day >= 1 && day <= 4) schedule = [[18, 19]];
            else if (day === 5) schedule = [];
            else if (day === 6) schedule = [[11, 12], [14, 18]];
            else if (day === 0) schedule = [[14, 18]];
        } else {
            if (day === 1) schedule = [[14, 18]];
            else if (day >= 2 && day <= 4) schedule = [[11, 12], [14, 18]];
            else if (day === 5 || day === 6) schedule = [[11, 12], [14, 19]];
            else if (day === 0) schedule = [[14, 18]];
        }

        let isOpen = false;
        let isOpeningSoon = false;
        let isClosingSoon = false;
        let msg = '';
        let targetTime = null;

        // Check if currently open or closing soon
        for (const [start, end] of schedule) {
            if (time >= start && time < end) {
                isOpen = true;
                targetTime = end;
                if (end - time <= 0.5) isClosingSoon = true;
                break;
            }
        }

        // If closed, check if opening soon
        if (!isOpen) {
            for (const [start, end] of schedule) {
                if (time < start) {
                    targetTime = start;
                    if (start - time <= 0.5) isOpeningSoon = true;
                    break;
                }
            }
        }

        // Determine next opening message if no targetTime found for today
        if (!isOpen && targetTime === null) {
            msg = 'Ouvre demain'; // Default fallback
            // More precise logic could be added here for "Ouvre demain à..."
        }

        // Helper to format time
        const formatTime = (t) => {
            const h = Math.floor(t);
            const m = Math.round((t - h) * 60);
            return `${h}:${m.toString().padStart(2, '0')}`;
        };

        statusDot.classList.remove('closed', 'warning');

        if (isOpen) {
            if (isClosingSoon) {
                statusDot.classList.add('warning');
                statusText.textContent = 'FERME BIENTÔT';
            } else {
                statusText.textContent = 'ACTUELLEMENT OUVERT';
            }
            closeTime.textContent = `Ferme à ${formatTime(targetTime)}`;
        } else {
            if (isOpeningSoon) {
                statusDot.classList.add('warning');
                statusText.textContent = 'OUVRE BIENTÔT';
                closeTime.textContent = `Ouvre à ${formatTime(targetTime)}`;
            } else {
                statusDot.classList.add('closed');
                statusText.textContent = 'ACTUELLEMENT FERMÉ';
                // Find next status message like original script
                closeTime.textContent = getNextStatusMsg(isVacation, day, time);
            }
        }
    }

    function getNextStatusMsg(isVacation, day, time) {
        // Simple version of the original logic for closed state
        if (!isVacation) {
            if (day === 3) {
                if (time < 17) return 'Ouvre à 17:00';
                return 'Ouvre demain à 18:00';
            } else if (day >= 1 && day <= 4) {
                if (time < 18) return 'Ouvre à 18:00';
                const nextOpen = (day === 2) ? '17:00' : '18:00'; // If Tue, tomorrow is Wed 17h.
                return `Ouvre demain à ${nextOpen}`;
            } else if (day === 5) return 'Ouvre demain à 11:00';
            else if (day === 6) {
                if (time < 11) return 'Ouvre à 11:00';
                if (time < 14) return 'Ouvre à 14:00';
                return 'Ouvre demain à 14:00';
            } else if (day === 0) {
                if (time < 14) return 'Ouvre à 14:00';
                return 'Ouvre demain à 18:00';
            }
        } else {
            if (day === 1) {
                if (time < 14) return 'Ouvre à 14:00';
                return 'Ouvre demain à 11:00';
            } else if (day >= 2 && day <= 4) {
                if (time < 11) return 'Ouvre à 11:00';
                if (time < 14) return 'Ouvre à 14:00';
                return 'Ouvre demain à 11:00';
            } else if (day === 5 || day === 6) {
                if (time < 11) return 'Ouvre à 11:00';
                if (time < 14) return 'Ouvre à 14:00';
                return day === 5 ? 'Ouvre demain à 11:00' : 'Ouvre demain à 14:00';
            } else if (day === 0) {
                if (time < 14) return 'Ouvre à 14:00';
                return 'Ouvre demain à 14:00';
            }
        }
        return 'Consultez les horaires';
    }

    // Update immediately and every minute
    updateStatus();
    setInterval(updateStatus, 60000);

});
