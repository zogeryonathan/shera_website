import { memo } from "react";

export const ClassCard = memo(function ClassCard({ classItem, onReserve }) {
  const isFull = classItem.remainingSpots <= 0;
  const spotLabel = isFull
    ? "Class full"
    : `${classItem.remainingSpots} / ${classItem.capacity} Spots Remaining`;

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
        <div>
          <dt>Availability</dt>
          <dd className={isFull ? "spots spots--full" : "spots"}>{spotLabel}</dd>
        </div>
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
