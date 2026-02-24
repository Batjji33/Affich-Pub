/* ============================================
   CONTACT.JS — Open/Closed status logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const closeTime = document.getElementById('closeTime');

    async function updateStatus() {
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

        // Default Schedule definition
        let defaultSchedule = [];

        if (!isVacation) {
            if (day === 3) defaultSchedule = [[17, 19]];
            else if (day >= 1 && day <= 4) defaultSchedule = [[18, 19]];
            else if (day === 5) defaultSchedule = [];
            else if (day === 6) defaultSchedule = [[11, 12], [14, 18]];
            else if (day === 0) defaultSchedule = [[14, 18]];
        } else {
            if (day === 1) defaultSchedule = [[14, 18]];
            else if (day >= 2 && day <= 4) defaultSchedule = [[11, 12], [14, 18]];
            else if (day === 5 || day === 6) defaultSchedule = [[11, 12], [14, 19]];
            else if (day === 0) defaultSchedule = [[14, 18]];
        }

        // Apply temporary hours if available
        let schedule = defaultSchedule;
        let tempHoursRecord = null;

        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('temporary_hours')
                    .select('*')
                    .eq('date', dateStr)
                    .single();

                if (data) {
                    tempHoursRecord = data;
                    if (data.is_closed) {
                        schedule = []; // Closed all day
                    } else if (data.schedule) {
                        schedule = data.schedule; // Override with temp schedule
                    }
                }
            } catch (err) {
                // Ignore error, fallback to default schedule
                console.log("No temporary hours found for today or DB error");
            }
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

        // If closed, check if opening soon (today)
        if (!isOpen) {
            for (const [start, end] of schedule) {
                if (time < start) {
                    targetTime = start;
                    if (start - time <= 0.5) isOpeningSoon = true;
                    break;
                }
            }
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
                // If it was explicitly closed today via temp hours, just say "Consultez les horaires" or "Fermé exceptionnellement"
                // Otherwise find next status message
                closeTime.textContent = getNextStatusMsg(isVacation, day, time, tempHoursRecord ? schedule : null);
            }
        }
    }

    function getNextStatusMsg(isVacation, day, time, temporarySchedule = null) {
        if (temporarySchedule) {
            // If there's a custom schedule for today and we are here, it means we are closed.
            // Ideally we'd look at tomorrow's schedule, but since temporary schedules are date-specific,
            // we default to the standard logic for "tomorrow"
            return 'Consultez les horaires';
        }

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

    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';
    let supabase = null;
    try {
        if (SUPABASE_URL.startsWith('http')) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (e) {
        console.error("Supabase initiation failed", e);
    }

    // Update immediately and then every minute
    updateStatus();
    setInterval(updateStatus, 60000);

});
