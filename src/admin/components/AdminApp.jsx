import { useCallback, useMemo, useState } from "react";
import { cancelClientBooking, createClass, deleteClass, generateClasses, getAdminDashboard, updateClass, updateTemplate } from "../adminService.js";
import { ClassManager } from "./ClassManager.jsx";
import { GoogleAdminLogin } from "./GoogleAdminLogin.jsx";
import { ScheduleManager } from "./ScheduleManager.jsx";
import { SummaryCards } from "./SummaryCards.jsx";
import { DayFilter } from "../../shared/DayFilter.jsx";

export function AdminApp() {
  const [credential, setCredential] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [activeView, setActiveView] = useState("classes");
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [selectedDay, setSelectedDay] = useState("All");

  const availableDays = useMemo(() => (
    dashboard ? [...new Set(dashboard.classes.map((classItem) => classItem.day))] : []
  ), [dashboard]);
  const filteredClasses = useMemo(() => {
    if (!dashboard || selectedDay === "All") return dashboard?.classes || [];
    return dashboard.classes.filter((classItem) => classItem.day === selectedDay);
  }, [dashboard, selectedDay]);
  const filteredSummary = useMemo(() => ({
    upcomingClasses: filteredClasses.length,
    activeBookings: filteredClasses.reduce((total, classItem) => total + classItem.bookedCount, 0),
    fullClasses: filteredClasses.filter((classItem) => classItem.remainingSpots === 0).length,
  }), [filteredClasses]);

  const loadDashboard = useCallback(async (token) => {
    setIsBusy(true);
    setStatus(null);
    try {
      setDashboard(await getAdminDashboard(token));
    } catch (error) {
      setCredential("");
      setDashboard(null);
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleCredential = useCallback((token) => {
    setCredential(token);
    loadDashboard(token);
  }, [loadDashboard]);

  async function mutate(action, successMessage) {
    setIsBusy(true);
    setStatus(null);
    try {
      const result = await action();
      setDashboard(await getAdminDashboard(credential));
      setStatus({ type: "success", message: result.message || successMessage });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsBusy(false);
    }
  }

  if (!credential || !dashboard) {
    return <><GoogleAdminLogin onCredential={handleCredential} />{status && <div className={`admin-toast admin-toast--${status.type}`} role="alert">{status.message}</div>}</>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="index.html" aria-label="Sherazade Mami home"><img src="/assets/images/sherazade-mami-logo.png" alt="Sherazade Mami" /></a>
        <div><p className="eyebrow">Studio owner</p><h1>Booking dashboard</h1></div>
        <button className="button secondary" type="button" onClick={() => { window.google?.accounts?.id?.disableAutoSelect(); setCredential(""); setDashboard(null); }}>Sign Out</button>
      </header>
      <main className="admin-main">
        <SummaryCards summary={filteredSummary} />
        {status && <div className={`admin-alert admin-alert--${status.type}`} role="status">{status.message}</div>}
        <DayFilter days={availableDays} selectedDay={selectedDay} onSelect={setSelectedDay} label="Show status for" />
        <nav className="admin-tabs" aria-label="Dashboard sections">
          <button type="button" className={activeView === "classes" ? "active" : ""} onClick={() => setActiveView("classes")}>Classes & Bookings</button>
          <button type="button" className={activeView === "schedule" ? "active" : ""} onClick={() => setActiveView("schedule")}>Weekly Schedule</button>
          <button type="button" onClick={() => loadDashboard(credential)} disabled={isBusy}>Refresh</button>
        </nav>
        {isBusy && <div className="admin-progress" role="status">Updating dashboard…</div>}
        {activeView === "classes" ? (
          <ClassManager classes={filteredClasses} templates={dashboard.templates} isBusy={isBusy}
            onCreate={(item) => mutate(() => createClass(credential, item), "Class added.")}
            onUpdate={(item) => mutate(() => updateClass(credential, item), "Class updated.")}
            onDelete={(classId) => { if (window.confirm("Delete this class?")) mutate(() => deleteClass(credential, classId), "Class deleted."); }}
            onCancelBooking={(bookingId) => { if (window.confirm("Cancel this client booking?")) mutate(() => cancelClientBooking(credential, bookingId), "Booking cancelled."); }} />
        ) : (
          <ScheduleManager templates={dashboard.templates} isBusy={isBusy}
            onUpdate={(item) => mutate(() => updateTemplate(credential, item), "Weekly schedule updated.")}
            onGenerate={() => mutate(() => generateClasses(credential), "Missing classes generated.")} />
        )}
      </main>
    </div>
  );
}
