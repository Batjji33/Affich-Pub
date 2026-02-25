/* ============================================
   CONTACT.JS — Open/Closed status logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const closeTime = document.getElementById('closeTime');
    const exceptionNotice = document.getElementById('exceptionNotice'); // The top banner
    const weeklyExceptionsContainer = document.getElementById('weeklyExceptionsContainer');

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

    let weeklyExceptions = [];

    async function loadWeeklyExceptions() {
        if (!supabase) return;
        const now = new Date();
        const day = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon, ..., 7=Sun

        // Start of current week (Monday)
        const start = new Date(now);
        start.setDate(now.getDate() - day + 1);
        const startStr = start.toISOString().split('T')[0];

        // End of current week (Sunday)
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const endStr = end.toISOString().split('T')[0];

        try {
            const { data, error } = await supabase
                .from('temporary_hours')
                .select('*')
                .gte('date', startStr)
                .lte('date', endStr)
                .order('date', { ascending: true });

            if (data && data.length > 0) {
                weeklyExceptions = data;
                renderWeeklyExceptions();
            }
        } catch (e) {
            console.error(e);
        }
    }

    function renderWeeklyExceptions() {
        if (!weeklyExceptionsContainer) return;
        weeklyExceptionsContainer.innerHTML = '';

        if (weeklyExceptions.length === 0) return;

        // Container title
        const title = document.createElement('div');
        title.style.marginTop = '20px';
        title.innerHTML = '<div class="period-title" style="color: #f59e0b; margin-bottom:10px;">⚠ Horaires modifiés cette semaine</div>';
        weeklyExceptionsContainer.appendChild(title);

        const formatToTimeInput = (decimalTime) => {
            if (decimalTime === null || decimalTime === undefined) return '';
            const h = Math.floor(decimalTime).toString().padStart(2, '0');
            const m = Math.round((decimalTime - h) * 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        };

        weeklyExceptions.forEach(record => {
            const d = new Date(record.date);
            const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const dayName = days[d.getDay()];
            const displayDate = `${dayName} ${d.getDate()}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

            const box = document.createElement('div');
            box.style.background = 'rgba(245, 158, 11, 0.05)';
            box.style.border = '1px dashed rgba(245, 158, 11, 0.3)';
            box.style.borderRadius = '8px';
            box.style.padding = '10px 15px';
            box.style.marginBottom = '10px';

            let currentScheduleHtml = '';
            if (record.is_closed) {
                currentScheduleHtml = '<span style="color:#ef4444; font-weight:bold;">FERMÉ TOUTE LA JOURNÉE</span>';
            } else if (record.schedule && record.schedule.length > 0) {
                const parts = record.schedule.map(i => `${formatToTimeInput(i[0])} - ${formatToTimeInput(i[1])}`);
                currentScheduleHtml = `<span style="color:#f59e0b; font-weight:bold;">${parts.join(' / ')}</span>`;
            } else {
                currentScheduleHtml = '<span style="color:#ef4444; font-weight:bold;">FERMÉ</span>';
            }

            // Figure out what the normal schedule would be to show it below
            const defaultSch = getDefaultSchedule(d.getDay(), record.date);
            let defaultScheduleHtml = '';
            if (defaultSch.length === 0) {
                defaultScheduleHtml = 'Normalement : Fermé';
            } else {
                const defParts = defaultSch.map(i => `${formatToTimeInput(i[0])} - ${formatToTimeInput(i[1])}`);
                defaultScheduleHtml = `Normalement : ${defParts.join(' / ')}`;
            }

            box.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span style="font-weight:bold; color:#fff;">${displayDate}</span>
                    <div style="text-align:right;">
                        <div>${currentScheduleHtml}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${defaultScheduleHtml}</div>
                    </div>
                </div>
            `;
            weeklyExceptionsContainer.appendChild(box);
        });
    }

    // Helper used by renderWeeklyExceptions to calculate the standard schedule
    function getDefaultSchedule(day, dateStr) {
        const vacationPeriods = [
            { start: '2025-10-18', end: '2025-11-02' },
            { start: '2025-12-20', end: '2026-01-04' },
            { start: '2026-02-14', end: '2026-03-01' },
            { start: '2026-04-11', end: '2026-04-26' },
            { start: '2026-05-14', end: '2026-05-17' },
            { start: '2026-07-04', end: '2026-08-31' }
        ];
        const isVacation = vacationPeriods.some(period => dateStr >= period.start && dateStr <= period.end);
        let defaultSchedule = [];
        if (!isVacation) {
            if (day === 3) defaultSchedule = [[17, 19]];
            else if (day >= 1 && day <= 4) defaultSchedule = [[18, 19]];
            else if (day === 6) defaultSchedule = [[11, 12], [14, 18]];
            else if (day === 0) defaultSchedule = [[14, 18]];
        } else {
            if (day === 1) defaultSchedule = [[14, 18]];
            else if (day >= 2 && day <= 4) defaultSchedule = [[11, 12], [14, 18]];
            else if (day === 5 || day === 6) defaultSchedule = [[11, 12], [14, 19]];
            else if (day === 0) defaultSchedule = [[14, 18]];
        }
        return defaultSchedule;
    }

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

        // Apply temporary hours from cache if available
        let schedule = defaultSchedule;
        let tempHoursRecord = weeklyExceptions.find(r => r.date === dateStr) || null;

        if (tempHoursRecord) {
            if (tempHoursRecord.is_closed) {
                schedule = []; // Closed all day
            } else if (tempHoursRecord.schedule) {
                schedule = tempHoursRecord.schedule; // Override with temp schedule
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
                if (targetTime) {
                    closeTime.textContent = `Ouvre à ${formatTime(targetTime)}`;
                } else {
                    closeTime.textContent = getNextStatusMsg(isVacation, day, time, tempHoursRecord ? schedule : null);
                }
            }
        }

        if (exceptionNotice) {
            if (tempHoursRecord) {
                exceptionNotice.style.display = 'block';
                if (tempHoursRecord.is_closed) {
                    exceptionNotice.textContent = "⚠ Exceptionnellement fermé aujourd'hui";
                } else {
                    exceptionNotice.textContent = "⚠ Horaires exceptionnels aujourd'hui";
                }
            } else {
                exceptionNotice.style.display = 'none';
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

    // Update process
    loadWeeklyExceptions().then(() => {
        updateStatus();
    });
    setInterval(updateStatus, 60000);

});
