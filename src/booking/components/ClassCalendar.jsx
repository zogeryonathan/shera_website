const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toLocalDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(date);
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function ClassCalendar({ availableDates, selectedDate, visibleMonth, onMonthChange, onSelectDate }) {
  if (!availableDates.length || !visibleMonth) return null;

  const activeDates = new Set(availableDates);
  const firstAvailableMonth = firstDayOfMonth(toLocalDate(availableDates[0]));
  const lastAvailableMonth = firstDayOfMonth(toLocalDate(availableDates[availableDates.length - 1]));
  const monthStart = firstDayOfMonth(visibleMonth);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const cells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    if (index < leadingDays) return null;
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), index - leadingDays + 1);
  });
  const canGoBack = monthStart > firstAvailableMonth;
  const canGoForward = monthStart < lastAvailableMonth;

  return (
    <section className="class-calendar" aria-labelledby="class-calendar-title">
      <div className="class-calendar__head">
        <div>
          <p className="eyebrow">Choose a date</p>
          <h3 id="class-calendar-title">Find a class that fits your week.</h3>
        </div>
        <div className="class-calendar__controls" aria-label="Calendar month controls">
          <button className="class-calendar__month-button" type="button" onClick={() => onMonthChange(addMonths(monthStart, -1))} disabled={!canGoBack} aria-label="Show previous month">‹</button>
          <p className="class-calendar__month" aria-live="polite">{formatMonth(monthStart)}</p>
          <button className="class-calendar__month-button" type="button" onClick={() => onMonthChange(addMonths(monthStart, 1))} disabled={!canGoForward} aria-label="Show next month">›</button>
        </div>
      </div>

      <div className="class-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="class-calendar__days">
        {cells.map((date, index) => {
          if (!date) return <span className="class-calendar__blank" key={`blank-${index}`} aria-hidden="true" />;
          const isoDate = dateKey(date);
          const hasClasses = activeDates.has(isoDate);
          const selected = isoDate === selectedDate;
          const label = hasClasses
            ? `${formatDateLabel(date)}. Classes available.`
            : `${formatDateLabel(date)}. No classes scheduled.`;

          return hasClasses ? (
            <button className={`class-calendar__day${selected ? " is-selected" : ""}`} type="button" key={isoDate} onClick={() => onSelectDate(isoDate)} aria-label={label} aria-pressed={selected}>
              {date.getDate()}
            </button>
          ) : (
            <span className="class-calendar__day class-calendar__day--disabled" key={isoDate} aria-label={label}>{date.getDate()}</span>
          );
        })}
      </div>
      <p className="class-calendar__hint">Dates shown in green have scheduled classes. Choose one to view its available sessions.</p>
    </section>
  );
}
