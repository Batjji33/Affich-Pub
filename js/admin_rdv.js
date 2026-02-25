/**
 * Admin Reservation Calendar Logic
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
    let selectedTimeSlot = null;
    let existingBookings = []; // Complete row data
    let selectedBooking = null; // To hold data for the selected slot
    let temporaryHoursRecord = null; // Stores temporary hours for the selected date

    // --- DOM ELEMENTS ---
    const monthDisplay = document.getElementById('currentMonth');
    const calendarDays = document.getElementById('calendarDays');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const timeSlotsContainer = document.getElementById('timeSlotsContainer');
    const timeSlotsGrid = document.getElementById('timeSlots');
    const noSlotsMsg = document.getElementById('noSlotsMsg');

    const slotActionContainer = document.getElementById('slotActionContainer');
    const selectedSlotDisplay = document.getElementById('selectedSlotDisplay');
    const slotDetails = document.getElementById('slotDetails');

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
    const renderCalendar = () => {
        monthDisplay.textContent = `${getMonthName(currentMonth)} ${currentYear}`;
        calendarDays.innerHTML = '';

        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

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

            dayEl.addEventListener('click', () => selectDate(dateObj, dayEl));

            if (dateObj.getTime() === today.getTime()) {
                dayEl.classList.add('today');
            }

            if (selectedDate && formatDate(selectedDate) === dateStr) {
                dayEl.classList.add('selected');
            }

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
        const prevSelected = document.querySelector('.cal-day.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        element.classList.add('selected');

        selectedDate = date;
        selectedDateDisplay.textContent = formatDateFR(date);
        selectedTimeSlot = null;
        selectedBooking = null;

        hideActionPanel();
        noSlotsMsg.style.display = 'none';
        timeSlotsContainer.style.display = 'block';

        await fetchBookingsForDate(formatDate(date));
        renderTimeSlots();
    };

    const fetchBookingsForDate = async (dateStr) => {
        if (!supabase) {
            existingBookings = [];
            return;
        }
        try {
            const { data, error } = await supabase
                .from('reservations')
                .select('*')
                .eq('date', dateStr);

            if (error) throw error;
            existingBookings = data || [];

            // Fetch temporary hours for this date
            const { data: tempHours } = await supabase
                .from('temporary_hours')
                .select('*')
                .eq('date', dateStr)
                .single();
            temporaryHoursRecord = tempHours || null;

        } catch (error) {
            if (error.code !== 'PGRST116') {
                console.error("Error fetching bookings:", error);
            }
            if (!existingBookings.length && !temporaryHoursRecord) {
                // If there was an error not related to 0 rows
            }
        }
    };

    const getAvailableHoursForDay = (date) => {
        // Same logic as client side
        const dayOfWeek = date.getDay();
        const dateStr = formatDate(date);

        const vacationPeriods = [
            { start: '2025-10-18', end: '2025-11-02' },
            { start: '2025-12-20', end: '2026-01-04' },
            { start: '2026-02-14', end: '2026-03-01' },
            { start: '2026-04-11', end: '2026-04-26' },
            { start: '2026-05-14', end: '2026-05-17' },
            { start: '2026-07-04', end: '2026-08-31' }
        ];

        const isVacation = vacationPeriods.some(period => dateStr >= period.start && dateStr <= period.end);
        const slots = [];

        const addSlots = (startHour, endHour) => {
            let current = startHour;
            while (current < endHour) {
                const hh = Math.floor(current);
                const mm = (current % 1 === 0) ? "00" : "30";
                slots.push(`${hh.toString().padStart(2, '0')}:${mm}`);
                current += 0.5;
            }
        };

        if (temporaryHoursRecord) {
            if (temporaryHoursRecord.is_closed) return [];
            const sched = temporaryHoursRecord.schedule || [];
            sched.forEach(interval => addSlots(interval[0], interval[1]));
            return slots;
        }

        if (!isVacation) {
            if (dayOfWeek === 3) addSlots(17, 19);
            else if (dayOfWeek >= 1 && dayOfWeek <= 4) addSlots(18, 19);
            else if (dayOfWeek === 6) { addSlots(11, 12); addSlots(14, 18); }
            else if (dayOfWeek === 0) addSlots(14, 18);
        } else {
            if (dayOfWeek === 1) addSlots(14, 18);
            else if (dayOfWeek >= 2 && dayOfWeek <= 4) { addSlots(11, 12); addSlots(14, 18); }
            else if (dayOfWeek === 5 || dayOfWeek === 6) { addSlots(11, 12); addSlots(14, 19); }
            else if (dayOfWeek === 0) addSlots(14, 18);
        }
        return slots;
    };

    const renderTimeSlots = () => {
        timeSlotsGrid.innerHTML = '';
        const slots = getAvailableHoursForDay(selectedDate);

        if (slots.length === 0) {
            timeSlotsContainer.style.display = 'none';
            noSlotsMsg.style.display = 'block';
            noSlotsMsg.textContent = "Aucun horaire prévu pour ce jour (Fermé).";
            return;
        }

        slots.forEach(time => {
            const slotEl = document.createElement('div');
            slotEl.classList.add('time-slot');

            // Find booking for this slot
            // Improved comparison: check for both exact and substring match
            const booking = existingBookings.find(b => {
                if (!b.time) return false;
                const bTime = b.time.length > 5 ? b.time.substring(0, 5) : b.time;
                return bTime === time;
            });

            if (booking) {
                if (booking.last_name === 'BLOCKED') {
                    slotEl.classList.add('blocked-admin');
                    slotEl.title = "Bloqué par vous";
                } else {
                    slotEl.classList.add('booked-client');
                    slotEl.title = `Réservé par ${booking.first_name} ${booking.last_name}`;
                }
            } else {
                slotEl.classList.add('available');
                slotEl.title = "Créneau libre";
            }

            slotEl.textContent = time;
            slotEl.addEventListener('click', () => selectTimeSlot(time, slotEl, booking));

            timeSlotsGrid.appendChild(slotEl);
        });
    };

    const selectTimeSlot = (time, element, booking) => {
        const prevSelected = document.querySelector('.time-slot.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        element.classList.add('selected');

        selectedTimeSlot = time;
        selectedBooking = booking;
        showActionPanel(time, booking);
    };

    // --- ACTION PANEL ---
    const showActionPanel = (time, booking) => {
        slotActionContainer.style.display = 'block';
        selectedSlotDisplay.textContent = `${formatDateFR(selectedDate)} à ${time}`;

        slotDetails.innerHTML = ''; // clear

        if (booking) {
            if (booking.last_name === 'BLOCKED') {
                slotDetails.innerHTML = `
                    <p style="color: #f59e0b; font-weight: bold;">🚫 Ce créneau est actuellement bloqué.</p>
                    <p>Les clients ne peuvent pas le réserver.</p>
                    <button class="slot-action-btn btn-unblock" id="unblockBtn">Débloquer ce créneau</button>
                `;
                const btn = document.getElementById('unblockBtn');
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = 'Déblocage en cours...';
                    await deleteBooking(booking.id, formatDate(selectedDate), time);
                });
            } else {
                slotDetails.innerHTML = `
                    <p style="color: #ef4444; font-weight: bold;">📅 Réservé par un client</p>
                    <p><strong>Nom :</strong> ${booking.last_name}</p>
                    <p><strong>Prénom :</strong> ${booking.first_name}</p>
                    <p><strong>Téléphone :</strong> ${booking.phone}</p>
                    <button class="slot-action-btn btn-cancel" id="cancelBtn">Annuler ce RDV</button>
                `;
                const btn = document.getElementById('cancelBtn');
                btn.addEventListener('click', async () => {
                    if (confirm(`Voulez-vous vraiment annuler le RDV de ${booking.first_name} ${booking.last_name} ?`)) {
                        btn.disabled = true;
                        btn.textContent = 'Annulation en cours...';
                        await deleteBooking(booking.id, formatDate(selectedDate), time);
                    }
                });
            }
        } else {
            slotDetails.innerHTML = `
                <p style="color: #10b981; font-weight: bold;">✅ Créneau libre</p>
                <p>Aucune réservation pour le moment.</p>
                <button class="slot-action-btn btn-block" id="blockBtn">Bloquer ce créneau</button>
            `;
            const btn = document.getElementById('blockBtn');
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'Blocage...';
                await blockSlot();
            });
        }

        slotActionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const hideActionPanel = () => {
        slotActionContainer.style.display = 'none';
        slotDetails.innerHTML = '';
    };

    // --- SUPABASE ACTIONS ---
    const deleteBooking = async (id, dateStr, timeStr) => {
        if (!supabase) return;

        try {
            console.log(`[Admin] Tentative de suppression ID: ${id}`);

            // Tentative 1 : Par ID (recommandé)
            const { error: errorID } = await supabase
                .from('reservations')
                .delete()
                .eq('id', id);

            if (errorID) {
                console.warn("[Admin] Échec suppression par ID, tentative par date/heure...", errorID);

                // Tentative 2 : Par Date et Heure (Fallback)
                const fullTime = timeStr.length === 5 ? timeStr + ':00' : timeStr;
                const { error: errorMatch } = await supabase
                    .from('reservations')
                    .delete()
                    .match({ date: dateStr, time: fullTime });

                if (errorMatch) throw errorMatch;
            }

            // On considère que c'est réussi si aucune erreur n'est remontée
            console.log("[Admin] Suppression demandée avec succès.");
            hideActionPanel();

            // On attend un tout petit peu que Supabase propage avant de rafraîchir
            setTimeout(async () => {
                await fetchBookingsForDate(dateStr);
                renderTimeSlots();
                alert("✅ Le créneau a été débloqué/annulé.");
            }, 300);

        } catch (error) {
            console.error("[Admin] Erreur lors de la suppression:", error);
            alert("❌ Erreur de base de données : " + (error.message || "Accès refusé"));
            alert("CONSEIL : Si l'erreur persiste, vérifiez que votre table 'reservations' autorise la suppression (DELETE) pour les utilisateurs anonymes dans l'onglet 'Policies' de Supabase.");
        }
    };

    const blockSlot = async () => {
        if (!supabase || !selectedDate || !selectedTimeSlot) return;

        try {
            const { error } = await supabase
                .from('reservations')
                .insert([{
                    date: formatDate(selectedDate),
                    time: selectedTimeSlot + ':00',
                    first_name: 'ADMIN',
                    last_name: 'BLOCKED',
                    phone: '0000000000'
                }]);

            if (error) throw error;

            hideActionPanel();
            await fetchBookingsForDate(formatDate(selectedDate));
            renderTimeSlots();
        } catch (error) {
            console.error("Error blocking:", error);
            alert("Erreur lors du blocage.");
        }
    };

    // INIT
    renderCalendar();
});
