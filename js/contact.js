/* ============================================
   CONTACT.JS — Open/Closed status logic (Using Shared StatusManager)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const elements = {
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('statusText'),
        closeTime: document.getElementById('closeTime'),
        exceptionNotice: document.getElementById('exceptionNotice')
    };

    const weeklyExceptionsContainer = document.getElementById('weeklyExceptionsContainer');
    const schoolPeriod = document.getElementById('schoolPeriod');
    const vacationPeriod = document.getElementById('vacationPeriod');

    // Toggle periods display based on current date
    const now = new Date();
    const { isVacation } = StatusManager.getDefaultSchedule(now.getDay(), now.toISOString().split('T')[0]);

    if (isVacation) {
        if (schoolPeriod) schoolPeriod.style.display = 'none';
    } else {
        if (vacationPeriod) vacationPeriod.style.display = 'none';
    }

    function renderWeeklyExceptions(weeklyExceptions) {
        if (!weeklyExceptionsContainer) return;
        weeklyExceptionsContainer.innerHTML = '';

        if (!weeklyExceptions || weeklyExceptions.length === 0) return;

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
            const { schedule: defaultSch } = StatusManager.getDefaultSchedule(d.getDay(), record.date);
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

    // Initialize using StatusManager
    StatusManager.init(elements).then(() => {
        renderWeeklyExceptions(StatusManager.getWeeklyExceptions());
    });
});
