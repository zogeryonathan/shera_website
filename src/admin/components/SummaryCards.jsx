export function SummaryCards({ summary }) {
  const items = [
    ["Upcoming classes", summary.upcomingClasses],
    ["Active bookings", summary.activeBookings],
    ["Full classes", summary.fullClasses],
  ];
  return (
    <section className="admin-summary" aria-label="Studio summary">
      {items.map(([label, value]) => (
        <article className="admin-summary__card" key={label}><strong>{value}</strong><span>{label}</span></article>
      ))}
    </section>
  );
}
