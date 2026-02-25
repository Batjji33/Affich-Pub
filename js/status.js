/* ============================================
   STATUS.JS — Real-time Status Logic (Shared)
   ============================================ */

const StatusManager = (() => {
    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';
    let supabase = null;
    let weeklyExceptions = [];

    // Initialize Supabase
    try {
        if (typeof window.supabase !== 'undefined' && SUPABASE_URL.startsWith('http')) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (e) {
        console.error("Supabase initiation failed", e);
    }

    async function loadWeeklyExceptions() {
        if (!supabase) return [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const day = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon, ..., 7=Sun

        const start = new Date(now);
        start.setDate(now.getDate() - day + 1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const endStr = end.toISOString().split('T')[0];

        try {
            const { data, error } = await supabase
                .from('temporary_hours')
                .select('*')
                .gte('date', todayStr)
                .lte('date', endStr)
                .order('date', { ascending: true });

            if (error) throw error;
            weeklyExceptions = data || [];
            return weeklyExceptions;
        } catch (e) {
            console.error("Error loading weekly exceptions:", e);
            return [];
        }
    }

    function getDefaultSchedule(day, dateStr) {
        // Zone B School Holidays 2025-2026 (Nantes)
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
        return { schedule: defaultSchedule, isVacation };
    }

    function calculateStatus() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const time = hours + minutes / 60;

        const { schedule: defaultSchedule, isVacation } = getDefaultSchedule(day, dateStr);
        let schedule = defaultSchedule;
        let tempHoursRecord = weeklyExceptions.find(r => r.date === dateStr) || null;

        if (tempHoursRecord) {
            if (tempHoursRecord.is_closed) {
                schedule = [];
            } else if (tempHoursRecord.schedule) {
                schedule = tempHoursRecord.schedule;
            }
        }

        let isOpen = false;
        let isOpeningSoon = false;
        let isClosingSoon = false;
        let targetTime = null;

        for (const [start, end] of schedule) {
            if (time >= start && time < end) {
                isOpen = true;
                targetTime = end;
                if (end - time <= 0.5) isClosingSoon = true;
                break;
            }
        }

        if (!isOpen) {
            for (const [start, end] of schedule) {
                if (time < start) {
                    targetTime = start;
                    if (start - time <= 0.5) isOpeningSoon = true;
                    break;
                }
            }
        }

        return {
            isOpen,
            isOpeningSoon,
            isClosingSoon,
            targetTime,
            tempHoursRecord,
            isVacation,
            day,
            time,
            currentSchedule: schedule
        };
    }

    function formatTime(t) {
        const h = Math.floor(t);
        const m = Math.round((t - h) * 60);
        return `${h}:${m.toString().padStart(2, '0')}`;
    }

    function getNextStatusMsg() {
        const now = new Date();

        // Loop through next 7 days to find the first opening
        for (let i = 0; i <= 7; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(now.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];
            const day = checkDate.getDay();

            // Get schedule for this specific date
            const { schedule: defaultSchedule } = getDefaultSchedule(day, dateStr);
            let schedule = defaultSchedule;

            const tempRecord = weeklyExceptions.find(r => r.date === dateStr);
            if (tempRecord) {
                if (tempRecord.is_closed) schedule = [];
                else if (tempRecord.schedule) schedule = tempRecord.schedule;
            }

            // Only consider times in the future
            const currentTime = (i === 0) ? (now.getHours() + now.getMinutes() / 60) : 0;

            for (const [start, end] of schedule) {
                if (start > currentTime) {
                    const timeStr = formatTime(start);
                    if (i === 0) return `Ouvre à ${timeStr}`;
                    if (i === 1) return `Ouvre demain à ${timeStr}`;
                    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                    return `Ouvre ${days[day]} à ${timeStr}`;
                }
            }
        }
        return 'Consultez les horaires';
    }

    function updateUI(elements) {
        const { statusDot, statusText, closeTime, exceptionNotice } = elements;
        const status = calculateStatus();

        if (statusDot) {
            statusDot.classList.remove('closed', 'warning');
            if (!status.isOpen && status.isOpeningSoon) statusDot.classList.add('warning');
            else if (status.isOpen && status.isClosingSoon) statusDot.classList.add('warning');
            else if (!status.isOpen) statusDot.classList.add('closed');
        }

        if (statusText) {
            if (status.isOpen) {
                statusText.textContent = status.isClosingSoon ? 'FERME BIENTÔT' : 'ACTUELLEMENT OUVERT';
            } else {
                statusText.textContent = status.isOpeningSoon ? 'OUVRE BIENTÔT' : 'ACTUELLEMENT FERMÉ';
            }
        }

        if (closeTime) {
            if (status.isOpen && status.targetTime) {
                closeTime.textContent = `Ferme à ${formatTime(status.targetTime)}`;
            } else {
                closeTime.textContent = getNextStatusMsg();
            }
        }

        if (exceptionNotice) {
            if (status.tempHoursRecord) {
                exceptionNotice.style.display = 'block';
                exceptionNotice.textContent = status.tempHoursRecord.is_closed ?
                    "⚠ Exceptionnellement fermé aujourd'hui" :
                    "⚠ Horaires exceptionnels aujourd'hui";
            } else {
                exceptionNotice.style.display = 'none';
            }
        }
    }

    return {
        init: async (elements) => {
            await loadWeeklyExceptions();
            updateUI(elements);
            setInterval(() => updateUI(elements), 60000);
        },
        getWeeklyExceptions: () => weeklyExceptions,
        getDefaultSchedule
    };
})();
