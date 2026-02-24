/**
 * Reservation Calendar Logic
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- VARIABLES & STATE ---
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDate = null;
    let selectedTimeSlot = null;
    let existingBookings = []; // Will store {date: 'YYYY-MM-DD', time: 'HH:MM'}

    // --- DOM ELEMENTS ---
    const monthDisplay = document.getElementById('currentMonth');
    const calendarDays = document.getElementById('calendarDays');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const timeSlotsContainer = document.getElementById('timeSlotsContainer');
    const timeSlotsGrid = document.getElementById('timeSlots');
    const noSlotsMsg = document.getElementById('noSlotsMsg');

    const reservationFormContainer = document.getElementById('reservationFormContainer');
    const selectedSlotDisplay = document.getElementById('selectedSlotDisplay');
    const rdvForm = document.getElementById('rdvForm');
    const cancelFormBtn = document.getElementById('cancelFormBtn');
    const confirmRdvBtn = document.getElementById('confirmRdvBtn');

    // --- SUPABASE CONFIG ---
    const SUPABASE_URL = 'https://cyeppawyuxjlvjmpgnvr.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8oqpftdX0RKpD4WPdVWBvg_IbUMafrW';
    // Initialize Supabase client
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
        return `${y}-${m}-${d}`; // Format for DB and comparison
    };

    const formatDateFR = (date) => {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const dayName = days[date.getDay()];
        return `${dayName} ${date.getDate()} ${getMonthName(date.getMonth())} ${date.getFullYear()}`;
    };

    // --- CALENDAR RENDERING ---
    const renderCalendar = () => {
        monthDisplay.textContent = `${getMonthName(currentMonth)} ${currentYear}`;
        calendarDays.innerHTML = '';

        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Adjust so Monday is the first day of the week
        const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        // Empty slots before first day
        for (let i = 0; i < startDay; i++) {
            const emptyDay = document.createElement('div');
            calendarDays.appendChild(emptyDay);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(currentYear, currentMonth, i);
            const dateStr = formatDate(dateObj);
            const dayEl = document.createElement('div');
            dayEl.classList.add('cal-day');
            dayEl.textContent = i;

            // Disable past dates, Sundays, and maybe some custom logic
            if (dateObj < today) {
                dayEl.classList.add('disabled');
            } else {
                dayEl.addEventListener('click', () => selectDate(dateObj, dayEl));
            }

            if (dateObj.getTime() === today.getTime()) {
                dayEl.classList.add('today');
            }

            if (selectedDate && formatDate(selectedDate) === dateStr) {
                dayEl.classList.add('selected');
            }

            // Note: We could mark days fully booked here if we know

            calendarDays.appendChild(dayEl);
        }
    };

    // --- EVENT LISTENERS FOR NAV ---
    prevMonthBtn.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendar();
    });

    // --- TIMESLOT LOGIC ---
    const selectDate = async (date, element) => {
        // Reset previously selected UI
        const prevSelected = document.querySelector('.cal-day.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        element.classList.add('selected');

        selectedDate = date;
        const formattedDateFR = formatDateFR(date);
        selectedDateDisplay.textContent = formattedDateFR;
        selectedTimeSlot = null;

        hideForm();

        noSlotsMsg.style.display = 'none';
        timeSlotsContainer.style.display = 'block';

        // Retrieve bookings for this day
        await fetchBookingsForDate(formatDate(date));

        renderTimeSlots();
    };

    const fetchBookingsForDate = async (dateStr) => {
        if (!supabase) {
            console.log("Supabase not set up yet. Mocking empty bookings.");
            existingBookings = [];
            return;
        }

        try {
            const { data, error } = await supabase
                .from('reservations')
                .select('time')
                .eq('date', dateStr);

            if (error) throw error;

            existingBookings = data.map(row => {
                // Formatting time 'HH:MM:SS' to 'HH:MM'
                return row.time.substring(0, 5);
            });
        } catch (error) {
            console.error("Error fetching bookings:", error);
            existingBookings = [];
        }
    };

    const getAvailableHoursForDay = (date) => {
        const dayOfWeek = date.getDay(); // 0 = Sun
        const dateStr = formatDate(date);

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
        const slots = [];

        const addSlots = (startHour, endHour) => {
            for (let h = startHour; h < endHour; h++) {
                slots.push(`${h.toString().padStart(2, '0')}:00`);
                slots.push(`${h.toString().padStart(2, '0')}:30`);
            }
        };

        if (!isVacation) {
            // School Period
            if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                addSlots(18, 19);
            } else if (dayOfWeek === 6) {
                addSlots(11, 12);
                addSlots(14, 18);
            } else if (dayOfWeek === 0) {
                addSlots(14, 18);
            }
            // Fri (5) is closed -> no slots added
        } else {
            // Vacation Period
            if (dayOfWeek === 1) {
                addSlots(14, 18);
            } else if (dayOfWeek >= 2 && dayOfWeek <= 4) {
                addSlots(11, 12);
                addSlots(14, 18);
            } else if (dayOfWeek === 5 || dayOfWeek === 6) {
                addSlots(11, 12);
                addSlots(14, 19);
            } else if (dayOfWeek === 0) {
                addSlots(14, 18);
            }
        }

        return slots;
    };

    const renderTimeSlots = () => {
        timeSlotsGrid.innerHTML = '';
        const slots = getAvailableHoursForDay(selectedDate);

        if (slots.length === 0) {
            timeSlotsContainer.style.display = 'none';
            noSlotsMsg.style.display = 'block';
            noSlotsMsg.textContent = "Aucun horaire disponible pour ce jour (Fermé).";
            return;
        }

        let hasAvailableSlot = false;

        slots.forEach(time => {
            const slotEl = document.createElement('div');
            slotEl.classList.add('time-slot');

            const isBooked = existingBookings.includes(time);

            if (isBooked) {
                slotEl.classList.add('booked');
                const span = document.createElement('span');
                span.textContent = time;
                slotEl.appendChild(span);
            } else {
                slotEl.textContent = time;
                hasAvailableSlot = true;
                slotEl.addEventListener('click', () => selectTimeSlot(time, slotEl));
            }

            timeSlotsGrid.appendChild(slotEl);
        });

        if (!hasAvailableSlot) {
            timeSlotsContainer.style.display = 'none';
            noSlotsMsg.style.display = 'block';
            noSlotsMsg.textContent = "Tous les créneaux sont réservés pour ce jour.";
        }
    };

    const selectTimeSlot = (time, element) => {
        const prevSelected = document.querySelector('.time-slot.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        element.classList.add('selected');

        selectedTimeSlot = time;
        showForm();
    };

    // --- FORM LOGIC ---
    const showForm = () => {
        reservationFormContainer.style.display = 'block';
        selectedSlotDisplay.textContent = `${formatDateFR(selectedDate)} à ${selectedTimeSlot}`;
        reservationFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const hideForm = () => {
        reservationFormContainer.style.display = 'none';
        rdvForm.reset();
    };

    cancelFormBtn.addEventListener('click', () => {
        hideForm();
        const prevSelected = document.querySelector('.time-slot.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        selectedTimeSlot = null;
    });

    // --- SUBMISSION ---
    rdvForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!selectedDate || !selectedTimeSlot) return;

        if (!rdvForm.checkValidity()) {
            rdvForm.reportValidity();
            return;
        }

        if (!supabase) {
            alert("⚠️ La base de données n'est pas encore connectée. Veuillez attendre la configuration.");
            return;
        }

        // 2 clicks validation -> simply check if a flag exists, but button text says "Valider (2 clics)"
        // It could just mean it's fast. Let's process insertion.

        const nom = document.getElementById('rdvNom').value;
        const prenom = document.getElementById('rdvPrenom').value;
        const tel = document.getElementById('rdvTel').value;

        const dateStr = formatDate(selectedDate);

        const originalBtnText = confirmRdvBtn.textContent;
        confirmRdvBtn.textContent = 'Réservation en cours...';
        confirmRdvBtn.disabled = true;

        try {
            const { data, error } = await supabase
                .from('reservations')
                .insert([
                    {
                        date: dateStr,
                        time: selectedTimeSlot + ':00',
                        first_name: prenom,
                        last_name: nom,
                        phone: tel
                    }
                ]);

            if (error) throw error;

            // Success!
            alert(`✅ Votre rendez-vous est confirmé pour le ${formatDateFR(selectedDate)} à ${selectedTimeSlot} !`);

            // Clean up
            hideForm();
            selectedTimeSlot = null;
            // Refresh slots
            await fetchBookingsForDate(dateStr);
            renderTimeSlots();

        } catch (error) {
            console.error("Réservation error:", error);
            alert("Une erreur est survénue. Le créneau a peut-être déjà été réservé.");
        } finally {
            confirmRdvBtn.textContent = originalBtnText;
            confirmRdvBtn.disabled = false;
        }
    });

    // INIT
    renderCalendar();
});
