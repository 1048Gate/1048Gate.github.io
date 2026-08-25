(() => {
  'use strict';

  const target = new Date('2026-09-01T00:00:00Z'); // August 31, 2026, 8:00 PM EDT.
  const root = document.querySelector('[data-draft-countdown]');
  if (!root || Number.isNaN(target.getTime())) return;

  const days = root.querySelector('[data-countdown-days]');
  const hours = root.querySelector('[data-countdown-hours]');
  const minutes = root.querySelector('[data-countdown-minutes]');
  const status = root.querySelector('[data-countdown-status]');
  const heading = root.querySelector('#draftCountdownHeading');

  const formatUnit = (value) => String(Math.max(0, value)).padStart(2, '0');

  const update = () => {
    const remaining = target.getTime() - Date.now();

    if (remaining <= 0) {
      days.textContent = '00';
      hours.textContent = '00';
      minutes.textContent = '00';
      status.textContent = 'The draft window is open. Good luck, gentlemen.';
      heading.textContent = 'Draft night is here.';
      root.dataset.countdownState = 'live';
      window.clearInterval(timer);
      return;
    }

    const totalMinutes = Math.floor(remaining / 60000);
    const dayCount = Math.floor(totalMinutes / 1440);
    const hourCount = Math.floor((totalMinutes % 1440) / 60);
    const minuteCount = totalMinutes % 60;

    days.textContent = formatUnit(dayCount);
    hours.textContent = formatUnit(hourCount);
    minutes.textContent = formatUnit(minuteCount);
    status.textContent = 'Countdown runs in Eastern Time.';
    root.dataset.countdownState = 'upcoming';
  };

  update();
  const timer = window.setInterval(update, 30000);
})();
