import { useMemo, useState } from "react";

const emptyClient = { firstName: "", lastName: "", email: "", sessions: 0 };

export function ClientManager({ clients, history, isBusy, onCreate, onUpdate, onTopUp }) {
  const [newClient, setNewClient] = useState(emptyClient);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [topUp, setTopUp] = useState("10");
  const visible = useMemo(() => clients.filter((client) => `${client.firstName} ${client.lastName} ${client.email}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  const selected = clients.find((client) => client.clientId === selectedId) || null;
  const clientHistory = selected ? history.filter((item) => item.clientId === selected.clientId) : [];
  return <section className="admin-panel" aria-labelledby="clients-title"><div className="admin-panel__head"><div><p className="eyebrow">Client database</p><h2 id="clients-title">Clients & sessions</h2></div></div>
    <p className="admin-help">Create each client once, then add new paid sessions whenever they purchase another package. Booking balances update automatically.</p>
    <form className="admin-add-class" onSubmit={(event) => { event.preventDefault(); onCreate({ ...newClient, sessions: Number(newClient.sessions) }); setNewClient(emptyClient); }}><label>First name<input value={newClient.firstName} onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })} required /></label><label>Last name<input value={newClient.lastName} onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })} required /></label><label>Email<input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} required /></label><label>Paid sessions<input type="number" min="0" value={newClient.sessions} onChange={(e) => setNewClient({ ...newClient, sessions: e.target.value })} required /></label><button className="button gold" type="submit" disabled={isBusy}>Add client</button></form>
    <label className="admin-client-search">Find client<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" /></label>
    <div className="admin-client-list">{visible.map((client) => <button type="button" className={selected?.clientId === client.clientId ? "admin-client-row active" : "admin-client-row"} key={client.clientId} onClick={() => setSelectedId(client.clientId)}><span><strong>{client.firstName} {client.lastName}</strong><small>{client.email}</small></span><span><strong>{client.sessionsRemaining}</strong><small>of {client.sessionsPurchased} sessions left</small></span></button>)}</div>
    {selected && <div className="admin-client-detail"><h3>{selected.firstName} {selected.lastName}</h3><form className="admin-add-class" onSubmit={(event) => { event.preventDefault(); onUpdate(selected); }}><label>First name<input value={selected.firstName} onChange={(e) => onUpdate({ ...selected, firstName: e.target.value }, true)} /></label><label>Last name<input value={selected.lastName} onChange={(e) => onUpdate({ ...selected, lastName: e.target.value }, true)} /></label><label>Email<input type="email" value={selected.email} onChange={(e) => onUpdate({ ...selected, email: e.target.value }, true)} /></label><button className="button secondary" disabled={isBusy}>Save details</button></form><div className="admin-topup"><label>Add paid sessions<input type="number" min="1" value={topUp} onChange={(e) => setTopUp(e.target.value)} /></label><button className="button gold" type="button" disabled={isBusy} onClick={() => onTopUp(selected.clientId, Number(topUp))}>Add sessions</button></div><h4>Session history</h4>{clientHistory.length ? <ul>{clientHistory.map((item) => <li key={item.transactionId}>{item.createdAt} · {item.type} {item.amount > 0 ? "+" : ""}{item.amount} · balance {item.balanceAfter}{item.note ? ` — ${item.note}` : ""}</li>)}</ul> : <p>No session activity yet.</p>}</div>}
  </section>;
}
