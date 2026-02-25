/**
 * Admin Contact Calendar Logic (Temporary Hours)
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- AUTH CHECK ---
    if (sessionStorage.getItem('adminToken') !== 'true') {
        window.location.href = 'admin_login.html';
        return;
    }

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('adminToken');
        window.location.href = 'index.html';
    });


    // --- VARIABLES & STATE ---
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDate = null;
    let temporaryHours = []; // From Supabase
    let selectedRecord = null; // Currently selected DB record

    // --- DOM ELEMENTS ---
    const monthDisplay = document.getElementById('currentMonth');
    const calendarDays = document.getElementById('calendarDays');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const noDateMsg = document.getElementById('noDateMsg');
    const editorContainer = document.getElementById('editorContainer');

    const isClosedCheckbox = document.getElementById('isClosedCheckbox');
    const scheduleEditor = document.getElementById('scheduleEditor');
    const intervalsContainer = document.getElementById('intervalsContainer');
    const addIntervalBtn = document.getElementById('addIntervalBtn');

    const saveHoursBtn = document.getElementById('saveHoursBtn');
    const deleteHoursBtn = document.getElementById('deleteHoursBtn');

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

    // --- HELPER FUNCTIONS ---
    const getMonthName = (month) => {
        const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        return months[month];
    };

    const formatDate = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${y}-${m}-${d}`;
    };

    const formatDateFR = (date) => {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const dayName = days[date.getDay()];
        return `${dayName} ${date.getDate()} ${getMonthName(date.getMonth())} ${date.getFullYear()}`;
    };

    // --- CALENDAR RENDERING ---
    const renderCalendar = async () => {
        // Fetch all temporary hours for display
        await fetchAllTemporaryHours();

        monthDisplay.textContent = `${getMonthName(currentMonth)} ${currentYear}`;
        calendarDays.innerHTML = '';

        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        for (let i = 0; i < startDay; i++) {
            calendarDays.appendChild(document.createElement('div'));
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(currentYear, currentMonth, i);
            const dateStr = formatDate(dateObj);
            const dayEl = document.createElement('div');
            dayEl.classList.add('cal-day');
            dayEl.textContent = i;

            dayEl.addEventListener('click', () => selectDate(dateObj, dayEl));

            if (dateObj.getTime() === today.getTime()) {
                dayEl.classList.add('today');
            }

            if (selectedDate && formatDate(selectedDate) === dateStr) {
                dayEl.classList.add('selected');
            }

            // Check if this date has a temporary hour record
            const hasException = temporaryHours.some(h => h.date === dateStr);
            if (hasException) {
                dayEl.classList.add('has-exception');
                dayEl.title = "Horaires modifiés";
            }

            calendarDays.appendChild(dayEl);
        }
    };

    // --- EVENT LISTENERS FOR NAV ---
    prevMonthBtn.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderCalendar();
    });

    // --- DATABASE OPERATIONS ---
    const fetchAllTemporaryHours = async () => {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('temporary_hours')
                .select('*');
            if (error) throw error;
            temporaryHours = data || [];
        } catch (error) {
            console.error("Error fetching temporary hours:", error);
        }
    };

    const fetchTemporaryHourForDate = async (dateStr) => {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('temporary_hours')
                .select('*')
                .eq('date', dateStr)
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error("Error fetching date hour:", error);
            return null;
        }
    };

    // --- SELECTION LOGIC ---
    const selectDate = async (date, element) => {
        const prevSelected = document.querySelector('.cal-day.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        element.classList.add('selected');

        selectedDate = date;
        const dateStr = formatDate(date);
        selectedDateDisplay.textContent = formatDateFR(date);

        noDateMsg.style.display = 'none';
        editorContainer.style.display = 'block';

        // Load data for this date
        selectedRecord = await fetchTemporaryHourForDate(dateStr);
        populateEditor(selectedRecord);
    };

    const getDefaultScheduleForDate = (date) => {
        const day = date.getDay(); // 0=Sunday, 1=Monday...
        const dateStr = formatDate(date);

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
        return defaultSchedule;
    };

    // --- EDITOR LOGIC ---
    const populateEditor = (record) => {
        intervalsContainer.innerHTML = '';

        if (record) {
            deleteHoursBtn.style.display = 'block';
            isClosedCheckbox.checked = record.is_closed;

            if (record.is_closed) {
                scheduleEditor.style.display = 'none';
            } else {
                scheduleEditor.style.display = 'block';
                // Parse schedule: [[10, 12], [14, 18]]
                const schedule = record.schedule || [];
                if (schedule.length > 0) {
                    schedule.forEach(interval => addIntervalUI(interval[0], interval[1]));
                } else {
                    addIntervalUI();
                }
            }
        } else {
            // New entry - pre-fill with default schedule
            deleteHoursBtn.style.display = 'none';
            isClosedCheckbox.checked = false;
            scheduleEditor.style.display = 'block';

            const defSchedule = getDefaultScheduleForDate(selectedDate);
            if (defSchedule.length > 0) {
                defSchedule.forEach(interval => addIntervalUI(interval[0], interval[1]));
            } else {
                // If it's a completely closed day by default, still offer an empty interval to open it
                addIntervalUI();
            }
        }
    };

    isClosedCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            scheduleEditor.style.display = 'none';
        } else {
            scheduleEditor.style.display = 'block';
            if (intervalsContainer.children.length === 0) {
                addIntervalUI();
            }
        }
    });

    const formatToTimeInput = (decimalTime) => {
        if (decimalTime === null || decimalTime === undefined) return '';
        const h = Math.floor(decimalTime).toString().padStart(2, '0');
        const m = Math.round((decimalTime - h) * 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    const addIntervalUI = (start = null, end = null) => {
        const div = document.createElement('div');
        div.className = 'time-interval';

        div.innerHTML = `
            <input type="time" class="start-time" value="${formatToTimeInput(start)}" required>
            <span style="color:white;">à</span>
            <input type="time" class="end-time" value="${formatToTimeInput(end)}" required>
            <button type="button" class="remove-interval-btn">✖</button>
        `;

        div.querySelector('.remove-interval-btn').addEventListener('click', () => {
            div.remove();
        });

        intervalsContainer.appendChild(div);
    };

    addIntervalBtn.addEventListener('click', () => {
        addIntervalUI();
    });

    // --- SAVE / DELETE ---
    const parseTimeToDecimal = (timeStr) => {
        if (!timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m / 60);
    };

    saveHoursBtn.addEventListener('click', async () => {
        if (!supabase || !selectedDate) return;

        const dateStr = formatDate(selectedDate);
        const isClosed = isClosedCheckbox.checked;
        let schedule = [];

        if (!isClosed) {
            const tempIntervals = [];
            const rows = intervalsContainer.querySelectorAll('.time-interval');
            for (let row of rows) {
                const startStr = row.querySelector('.start-time').value;
                const endStr = row.querySelector('.end-time').value;

                if (startStr && endStr) {
                    const startDec = parseTimeToDecimal(startStr);
                    const endDec = parseTimeToDecimal(endStr);
                    if (startDec < endDec) {
                        tempIntervals.push([startDec, endDec]);
                    } else {
                        alert("L'heure de début doit être avant l'heure de fin.");
                        return;
                    }
                }
            }
            if (tempIntervals.length === 0) {
                alert("Veuillez définir au moins une plage horaire ou cocher 'Fermé'.");
                return;
            }
            schedule = tempIntervals;
        }

        saveHoursBtn.textContent = 'Enregistrement...';
        saveHoursBtn.disabled = true;

        try {
            const payload = {
                date: dateStr,
                is_closed: isClosed,
                schedule: schedule
            };

            let error;
            if (selectedRecord) {
                // Update
                const res = await supabase.from('temporary_hours').update(payload).eq('id', selectedRecord.id);
                error = res.error;
            } else {
                // Insert
                const res = await supabase.from('temporary_hours').insert([payload]);
                error = res.error;
            }

            if (error) throw error;

            alert('✅ Horaires enregistrés avec succès.');
            await renderCalendar(); // refresh ui

        } catch (error) {
            console.error("Error saving hours", error);
            alert("❌ Erreur de base de données : " + (error.message || "Impossible d'enregistrer"));
            alert("CONSEIL : Vérifiez que votre table 'temporary_hours' autorise l'ajout (INSERT) et la modification (UPDATE) dans Supabase (onglet Policies).");
        } finally {
            saveHoursBtn.textContent = 'Enregistrer les modifications';
            saveHoursBtn.disabled = false;
        }
    });

    deleteHoursBtn.addEventListener('click', async () => {
        if (!supabase || !selectedRecord) return;

        if (confirm("Voulez-vous supprimer ces horaires modifiés et revenir aux horaires par défaut ?")) {
            deleteHoursBtn.disabled = true;
            try {
                const dateStr = formatDate(selectedDate);
                const { error } = await supabase.from('temporary_hours').delete().eq('date', dateStr);
                if (error) throw error;

                alert('✅ Horaires par défaut rétablis.');
                editorContainer.style.display = 'none';
                noDateMsg.style.display = 'block';
                await renderCalendar();
            } catch (error) {
                console.error("Error deleting", error);
                alert("❌ Erreur de suppression : " + (error.message || "Accès refusé"));
                alert("CONSEIL : Vérifiez que votre table 'temporary_hours' autorise la suppression (DELETE) dans Supabase.");
            } finally {
                deleteHoursBtn.disabled = false;
            }
        }
    });

    // INIT
    renderCalendar();
});
