import { memo } from "react";

export const ClassCard = memo(function ClassCard({ classItem, onReserve }) {
  const isFull = classItem.inPersonRemaining <= 0 && classItem.onlineRemaining <= 0;

  return (
    <article className={`booking-card${isFull ? " booking-card--full" : ""}`}>
      <div className="booking-card__heading">
        <p className="booking-card__date">{classItem.day} · {classItem.date}</p>
        <h3>{classItem.className}</h3>
      </div>

      <dl className="booking-card__details">
        <div>
          <dt>Time</dt>
          <dd>{classItem.time}</dd>
        </div>
        <div>
          <dt>Instructor</dt>
          <dd>{classItem.instructor}</dd>
        </div>
        <div><dt>In person</dt><dd className="spots">{classItem.inPersonRemaining} / {classItem.inPersonCapacity} spots left</dd></div>
        <div><dt>Online</dt><dd className="spots">{classItem.onlineCapacity ? `${classItem.onlineRemaining} / ${classItem.onlineCapacity} spots left` : "Not available"}</dd></div>
      </dl>

      <button
        className="button gold booking-card__button"
        data-testid={`reserve-${classItem.classId}`}
        type="button"
        disabled={isFull}
        onClick={() => onReserve(classItem)}
      >
        {isFull ? "CLASS FULL" : "Reserve Spot"}
      </button>
    </article>
  );
});
