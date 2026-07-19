export function DayFilter({ days, selectedDay, onSelect, label = "Filter by day" }) {
  return (
    <div className="day-filter" role="group" aria-label={label}>
      <span className="day-filter__label">{label}</span>
      <button type="button" className={selectedDay === "All" ? "active" : ""} onClick={() => onSelect("All")}>
        All Days
      </button>
      {days.map((day) => (
        <button type="button" className={selectedDay === day ? "active" : ""} onClick={() => onSelect(day)} key={day}>
          {day}
        </button>
      ))}
    </div>
  );
}
