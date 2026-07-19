import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingApiError, getClasses } from "../bookingService.js";
import { clearLatestBooking, getLatestBooking, saveLatestBooking } from "../bookingStorage.js";
import { BookingModal } from "./BookingModal.jsx";
import { ClassCard } from "./ClassCard.jsx";
import { ManageBookingModal } from "./ManageBookingModal.jsx";
import { StatusMessage } from "./StatusMessage.jsx";

const DAY_ORDER = Object.freeze(["Monday", "Tuesday", "Wednesday", "Friday", "Saturday"]);
const AUTO_REFRESH_MS = 30000;

function groupClassesByDay(classes) {
  const groups = new Map(DAY_ORDER.map((day) => [day, []]));

  for (const classItem of classes) {
    if (!groups.has(classItem.day)) groups.set(classItem.day, []);
    groups.get(classItem.day).push(classItem);
  }

  return Array.from(groups, ([day, items]) => ({ day, items }))
    .filter(({ items }) => items.length > 0);
}

export function BookingPage() {
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [isManagingBooking, setIsManagingBooking] = useState(false);
  const [latestBooking, setLatestBooking] = useState(() => getLatestBooking());
  const [confirmation, setConfirmation] = useState(null);
  const [status, setStatus] = useState(null);

  const classGroups = useMemo(() => groupClassesByDay(classes), [classes]);

  const loadUpcomingClasses = useCallback(async ({ showLoader = true, silent = false } = {}) => {
    if (showLoader) setIsLoading(true);
    if (!silent) setLoadError(null);

    try {
      const upcomingClasses = await getClasses();
      setClasses(upcomingClasses);
    } catch (error) {
      if (!silent) {
        setLoadError({
          message: error.message,
          isConfigurationError: error instanceof BookingApiError && error.code === "API_NOT_CONFIGURED",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpcomingClasses();
  }, [loadUpcomingClasses]);

  useEffect(() => {
    const refreshInBackground = () => {
      if (document.visibilityState === "visible") {
        loadUpcomingClasses({ showLoader: false, silent: true });
      }
    };
    const intervalId = window.setInterval(refreshInBackground, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshInBackground);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshInBackground);
    };
  }, [loadUpcomingClasses]);

  const closeModal = useCallback(() => setSelectedClass(null), []);

  const handleBooked = useCallback(async (bookedClass, booking, client) => {
    const savedBooking = {
      ...booking,
      ...client,
      className: bookedClass.className,
      date: bookedClass.date,
      time: bookedClass.time,
    };
    saveLatestBooking(savedBooking);
    setLatestBooking(savedBooking);
    setConfirmation(savedBooking);
    setSelectedClass(null);
    setStatus(null);
    await loadUpcomingClasses({ showLoader: false });
  }, [loadUpcomingClasses]);

  const handleCancelled = useCallback(async (cancellation) => {
    clearLatestBooking(cancellation.bookingId);
    setLatestBooking((current) => current?.bookingId === cancellation.bookingId ? null : current);
    setConfirmation(null);
    setIsManagingBooking(false);
    setStatus({ type: "success", message: "Your reservation is cancelled and the spot is available again." });
    await loadUpcomingClasses({ showLoader: false });
  }, [loadUpcomingClasses]);

  const handleReserve = useCallback((classItem) => {
    setStatus(null);
    setConfirmation(null);
    setSelectedClass(classItem);
  }, []);

  return (
    <>
      <section className="booking-hero">
        <div className="booking-hero__inner">
          <p className="eyebrow">Class schedule</p>
          <h1>Move, strengthen, and feel at home in your body.</h1>
          <p className="lede">
            Choose an upcoming class and reserve your place with Sherazade. Availability updates after every booking.
          </p>
          <p className="location-pill">265 Finsbury Avenue · Stittsville, Ottawa</p>
        </div>
      </section>

      <section className="booking-section" aria-labelledby="upcoming-classes-title">
        <div className="wrap">
          <div className="booking-section__head">
            <div>
              <p className="eyebrow">Upcoming classes</p>
              <h2 id="upcoming-classes-title">Find your next session.</h2>
            </div>
            <div className="booking-section__actions">
              <button className="button secondary" type="button" onClick={() => setIsManagingBooking(true)}>
                Manage Booking
              </button>
              {!isLoading && !loadError && (
                <button className="button secondary refresh-button" type="button" onClick={() => loadUpcomingClasses()}>
                  Refresh Schedule
                </button>
              )}
            </div>
          </div>

          <StatusMessage status={status} />

          {confirmation && (
            <section className="booking-confirmation" role="status" aria-live="polite">
              <div>
                <p className="eyebrow">Reservation confirmed</p>
                <h3>{confirmation.className}</h3>
                <p>{confirmation.date} · {confirmation.time}</p>
              </div>
              <p className="booking-confirmation__note">
                To cancel, use the same first name, last name, and email entered for this reservation.
              </p>
              <button className="button secondary" type="button" onClick={() => setIsManagingBooking(true)}>
                Manage or Cancel
              </button>
            </section>
          )}

          {!isLoading && !loadError && (
            <p className="auto-refresh-note">Availability refreshes automatically every 30 seconds.</p>
          )}

          {isLoading && (
            <div className="booking-loading" role="status">
              <span className="loading-spinner loading-spinner--large" aria-hidden="true" />
              <span>Loading upcoming classes…</span>
            </div>
          )}

          {!isLoading && loadError && (
            <div className="booking-empty" role="alert">
              <h3>{loadError.isConfigurationError ? "Online booking is opening soon." : "We couldn't load the schedule."}</h3>
              <p>{loadError.message}</p>
              <div className="actions">
                {!loadError.isConfigurationError && (
                  <button className="button gold" type="button" onClick={() => loadUpcomingClasses()}>
                    Try Again
                  </button>
                )}
                <a className="button secondary" href="tel:+13439872421">Call (343) 987-2421</a>
              </div>
            </div>
          )}

          {!isLoading && !loadError && classes.length === 0 && (
            <div className="booking-empty" role="status">
              <h3>No upcoming classes are listed yet.</h3>
              <p>Please check back soon or call the studio for the latest availability.</p>
              <a className="button secondary" href="tel:+13439872421">Call (343) 987-2421</a>
            </div>
          )}

          {!isLoading && !loadError && classGroups.length > 0 && (
            <div className="schedule-grid">
              {classGroups.map(({ day, items }, dayIndex) => (
                <section className={`schedule-day schedule-day--${dayIndex + 1}`} key={day} aria-labelledby={`day-${day.toLowerCase()}`}>
                  <h3 className="schedule-day__title" id={`day-${day.toLowerCase()}`}>{day}</h3>
                  <div className="schedule-day__classes">
                    {items.map((classItem) => (
                      <ClassCard classItem={classItem} key={classItem.classId} onReserve={handleReserve} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedClass && (
        <BookingModal classItem={selectedClass} onCancel={closeModal} onBooked={handleBooked} />
      )}
      {isManagingBooking && (
        <ManageBookingModal
          latestBooking={latestBooking}
          onCancel={() => setIsManagingBooking(false)}
          onCancelled={handleCancelled}
        />
      )}
    </>
  );
}
