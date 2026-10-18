import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { FIELDNOTE_CONFIG } from '../config.js';

const SLA_HOURS = { Critical: 4, High: 8, Medium: 24, Low: 72 };
const categories = ['Hardware', 'Software', 'Network', 'Account'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const statusOptions = ['open', 'in-progress', 'closed'];
const hour = 60 * 60 * 1000;
const colors = ['green', 'coral', 'blue', 'yellow'];
const emptyTicket = {
  title: '', description: '', requester: '', email: '', category: 'Hardware',
  priority: 'Medium', assignee: 'Unassigned', status: 'open'
};
export const client = FIELDNOTE_CONFIG.supabaseUrl && FIELDNOTE_CONFIG.supabaseAnonKey
  ? createClient(FIELDNOTE_CONFIG.supabaseUrl, FIELDNOTE_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
}

function avatarColor(value = '') {
  return colors[[...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

function fromDatabase(record) {
  return {
    dbId: record.id, id: `HD-${record.ticket_number}`, title: record.title,
    description: record.description || '', requester: record.requester,
    email: record.email || '', category: record.category, priority: record.priority,
    assignee: record.assignee, status: record.status, createdAt: record.created_at,
    updatedAt: record.updated_at, closedAt: record.closed_at
  };
}

function ticketDue(ticket) {
  return new Date(new Date(ticket.createdAt).getTime() + SLA_HOURS[ticket.priority] * hour);
}

function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function formatDuration(milliseconds) {
  const totalHours = Math.max(0, Math.floor(milliseconds / hour));
  if (totalHours < 1) return `${Math.max(1, Math.floor(milliseconds / 60000))}m`;
  const days = Math.floor(totalHours / 24);
  return days ? `${days}d ${totalHours % 24}h` : `${totalHours}h`;
}

function isOverdue(ticket) {
  return ticket.status !== 'closed' && ticketDue(ticket).getTime() < Date.now();
}

function SlaCell({ ticket }) {
  if (ticket.status === 'closed') {
    const resolvedAt = ticket.closedAt || ticket.updatedAt;
    return <span className="sla-cell resolved">Resolved {formatDuration(new Date(resolvedAt) - new Date(ticket.createdAt))}<small>{formatDate(resolvedAt)}</small></span>;
  }
  const due = ticketDue(ticket);
  if (isOverdue(ticket)) return <span className="sla-cell overdue">Overdue {formatDuration(Date.now() - due)}<small>Due {formatDate(due, { hour: 'numeric', minute: '2-digit' })}</small></span>;
  return <span className="sla-cell">{formatDate(due, { hour: 'numeric', minute: '2-digit' })}<small>{due.toDateString() === new Date().toDateString() ? 'Due today' : `Due ${formatDate(due)}`}</small></span>;
}

function csvEscape(value) {
  const text = String(value ?? '');
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function csvRows(list) {
  const header = ['Ticket ID', 'Title', 'Description', 'Requester', 'Email', 'Category', 'Priority', 'Technician', 'Status', 'Created at', 'SLA due at', 'Closed at', 'Resolution hours', 'SLA outcome'];
  return [header, ...list.map(ticket => {
    const closedAt = ticket.closedAt || (ticket.status === 'closed' ? ticket.updatedAt : '');
    const resolutionMs = closedAt ? new Date(closedAt) - new Date(ticket.createdAt) : '';
    return [ticket.id, ticket.title, ticket.description, ticket.requester, ticket.email, ticket.category, ticket.priority, ticket.assignee, ticket.status, ticket.createdAt, ticketDue(ticket).toISOString(), closedAt, resolutionMs === '' ? '' : (resolutionMs / hour).toFixed(2), closedAt ? (new Date(closedAt) <= ticketDue(ticket) ? 'Met' : 'Missed') : (isOverdue(ticket) ? 'Overdue' : 'In progress')];
  })];
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TicketRow({ ticket, menuOpen, onMenu, onEdit, onStatus }) {
  const statusLabel = ticket.status === 'closed' ? 'Closed' : ticket.status === 'in-progress' ? 'In progress' : 'Open';
  return <tr>
    <td><span className="ticket-id">{ticket.id}</span><span className="ticket-name">{ticket.title}</span></td>
    <td><span className="requester-cell"><span className={`mini-avatar ${avatarColor(ticket.requester)}`}>{initials(ticket.requester)}</span>{ticket.requester}</span></td>
    <td><span className="category-cell"><span className="category-icon">{({ Hardware: '⌘', Software: '▧', Network: '⌁', Account: '◎' })[ticket.category]}</span>{ticket.category}</span></td>
    <td><span className={`priority priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
    <td><span className="assignee"><span className={`mini-avatar ${avatarColor(ticket.assignee)}`}>{initials(ticket.assignee)}</span>{ticket.assignee}</span></td>
    <td><span className={`status-pill status-${ticket.status}`}>{statusLabel}</span></td>
    <td><SlaCell ticket={ticket} /></td>
    <td className="row-actions"><button className="row-menu" aria-label={`Actions for ${ticket.id}`} aria-expanded={menuOpen} onClick={onMenu}>···</button>{menuOpen && <div className="row-menu-list"><button onClick={onEdit}>Edit ticket</button><button onClick={() => onStatus(ticket.status === 'closed' ? 'open' : 'closed')}>{ticket.status === 'closed' ? 'Reopen ticket' : 'Close ticket'}</button></div>}</td>
  </tr>;
}

function TicketTable({ tickets, onEdit, onStatus }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [menuTicket, setMenuTicket] = useState(null);
  const rows = [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(ticket => {
    const query = search.trim().toLowerCase();
    const content = [ticket.id, ticket.title, ticket.requester, ticket.assignee, ticket.category, ticket.priority].join(' ').toLowerCase();
    return (activeStatus === 'all' || ticket.status === activeStatus) && (!query || content.includes(query)) && (category === 'all' || ticket.category === category);
  });
  const counts = {
    all: tickets.length,
    open: tickets.filter(ticket => ticket.status === 'open').length,
    progress: tickets.filter(ticket => ticket.status === 'in-progress').length,
    closed: tickets.filter(ticket => ticket.status === 'closed').length
  };
  const tabs = [['all', 'All', counts.all], ['open', 'Open', counts.open], ['in-progress', 'In progress', counts.progress], ['closed', 'Closed', counts.closed]];
  return <>
    <div className="queue-controls">
      <div className="filter-tabs" role="tablist" aria-label="Filter tickets">{tabs.map(([value, label, count]) => <button key={value} className={`filter-tab ${activeStatus === value ? 'selected' : ''}`} aria-selected={activeStatus === value} onClick={() => setActiveStatus(value)}>{label} <span>{count}</span></button>)}</div>
      <div className="queue-filters"><label className="search-box"><span>⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tickets" aria-label="Search tickets" /></label><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div>
    </div>
    <div className="table-wrap"><table className="ticket-table"><thead><tr><th>TICKET</th><th>REQUESTER</th><th>CATEGORY</th><th>PRIORITY</th><th>ASSIGNEE</th><th>STATUS</th><th>SLA DUE</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {rows.map(ticket => <TicketRow key={ticket.dbId} ticket={ticket} menuOpen={menuTicket === ticket.dbId} onMenu={() => setMenuTicket(menuTicket === ticket.dbId ? null : ticket.dbId)} onEdit={() => { setMenuTicket(null); onEdit(ticket); }} onStatus={status => { setMenuTicket(null); onStatus(ticket, status); }} />)}
    </tbody></table>{rows.length === 0 && <div className="empty-state"><span className="empty-glyph">⌁</span><strong>Nothing in this queue</strong><span>Try another filter or create a new ticket.</span></div>}</div>
    <div className="table-footer"><span>Showing {rows.length} {rows.length === 1 ? 'ticket' : 'tickets'}</span><span>Times shown in your local timezone</span></div>
  </>;
}

function TicketModal({ ticket, onClose, onSave }) {
  const [form, setForm] = useState(ticket ? { ...emptyTicket, ...ticket } : emptyTicket);
  const [saving, setSaving] = useState(false);
  const set = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form, ticket); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><div className="eyebrow">{ticket?.id || 'NEW REQUEST'}</div><h2 id="modal-title">{ticket ? 'Update ticket' : 'Create a ticket'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">×</button></div>
      <form onSubmit={submit}>
        <label className="field full-field">Issue summary<input name="title" value={form.title} onChange={set} maxLength="100" required placeholder="What does the person need help with?" /></label>
        <label className="field full-field">Description<textarea name="description" value={form.description} onChange={set} rows="3" maxLength="500" placeholder="Add helpful details, error messages, or troubleshooting already tried." /></label>
        <div className="form-grid">
          <label className="field">Requester<input name="requester" value={form.requester} onChange={set} required maxLength="80" placeholder="Name" /></label>
          <label className="field">Email<input name="email" type="email" value={form.email} onChange={set} maxLength="120" placeholder="name@company.com" /></label>
          <label className="field">Category<select name="category" value={form.category} onChange={set}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Priority<select name="priority" value={form.priority} onChange={set}>{priorities.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Assigned technician<select name="assignee" value={form.assignee} onChange={set}>{['Unassigned', 'Jordan Miles', 'Priya Shah', 'Marcus Chen', 'Elena Rossi'].map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Status<select name="status" value={form.status} onChange={set}>{statusOptions.map(item => <option key={item} value={item}>{item === 'in-progress' ? 'In progress' : item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
        </div>
        <div className="modal-footer"><button type="button" className="button button-text" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'} <span className="button-arrow">↗</span></button></div>
      </form>
    </section>
  </div>;
}

function ReportView({ tickets, month, setMonth, onExport }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthTickets = tickets.filter(ticket => { const date = new Date(ticket.createdAt); return date.getFullYear() === year && date.getMonth() + 1 === monthNumber; });
  const closed = tickets.filter(ticket => { const date = new Date(ticket.closedAt || ticket.updatedAt); return ticket.status === 'closed' && date.getFullYear() === year && date.getMonth() + 1 === monthNumber; });
  const withinSla = closed.filter(ticket => new Date(ticket.closedAt || ticket.updatedAt) <= ticketDue(ticket));
  const average = closed.length ? formatDuration(closed.reduce((sum, ticket) => sum + (new Date(ticket.closedAt || ticket.updatedAt) - new Date(ticket.createdAt)), 0) / closed.length) : '—';
  const days = new Date(year, monthNumber, 0).getDate();
  const daily = Array.from({ length: days }, (_, index) => ({ day: index + 1, count: monthTickets.filter(ticket => new Date(ticket.createdAt).getDate() === index + 1).length }));
  const peak = Math.max(1, ...daily.map(item => item.count));
  const categoryCounts = categories.map(category => [category, monthTickets.filter(ticket => ticket.category === category).length]);
  const categoryPeak = Math.max(1, ...categoryCounts.map(([, count]) => count));
  return <section className="view active" aria-labelledby="reports-title">
    <div className="page-heading compact-heading"><div><div className="eyebrow">PERFORMANCE</div><h1 id="reports-title">Monthly reports</h1><p className="subheading">Resolution pace, SLA health, and a clean export.</p></div><label className="month-picker"><span>REPORTING PERIOD</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
    <div className="report-summary"><div className="report-kpi"><span>Tickets created</span><strong>{monthTickets.length}</strong><small>{formatDate(`${month}-02`, { month: 'long', year: 'numeric' })}</small></div><div className="report-kpi"><span>Resolved</span><strong>{closed.length}</strong><small>{monthTickets.filter(ticket => ticket.status !== 'closed').length} still active</small></div><div className="report-kpi"><span>Within SLA</span><strong>{closed.length ? `${Math.round(withinSla.length / closed.length * 100)}%` : '—'}</strong><small>{closed.length ? `${withinSla.length} of ${closed.length} resolved on time` : 'No resolved tickets yet'}</small></div><div className="report-kpi"><span>Avg. resolution</span><strong>{average}</strong><small>For tickets resolved this month</small></div></div>
    <div className="report-layout"><section className="report-panel"><div className="panel-heading"><div><h2>Ticket volume</h2><p className="section-caption">Created during this reporting period</p></div><span className="panel-icon">▥</span></div><div className="volume-chart">{daily.map(({ day, count }) => <div className="chart-col" key={day}><span className="chart-value">{count || ''}</span><div className="chart-bar" style={{ height: `${Math.max(count ? 8 : 2, count / peak * 100)}%` }} title={`${count} ticket${count === 1 ? '' : 's'} on ${day}`} /><span className="chart-label">{day % 5 === 1 || day === days ? day : ''}</span></div>)}</div></section><section className="report-panel"><div className="panel-heading"><div><h2>Category mix</h2><p className="section-caption">Tickets created this month</p></div><span className="panel-icon">◉</span></div><div className="category-breakdown">{categoryCounts.map(([category, count]) => <div className="category-row" key={category}><span>{category}</span><div className="category-track"><div className="category-fill" style={{ width: `${count / categoryPeak * 100}%` }} /></div><span className="category-count">{count}</span></div>)}</div></section></div>
    <div className="report-export"><div><span className="export-symbol">↓</span><span><strong>Take the numbers with you</strong><small>Export this month’s ticket history and SLA outcomes as CSV.</small></span></div><button className="button button-dark" onClick={() => onExport(monthTickets)}>Export monthly report <span className="button-arrow">↗</span></button></div><div className="report-footnote">SLA targets: Critical 4h · High 8h · Medium 24h · Low 72h</div>
  </section>;
}

export default function App() {
  const signInEnabled = FIELDNOTE_CONFIG.signInEnabled === true;
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [member, setMember] = useState(undefined);
  const [tickets, setTickets] = useState([]);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [view, setView] = useState(['dashboard', 'tickets', 'reports'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
  const [month, setMonth] = useState(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
  const [modalTicket, setModalTicket] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!client) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setEmail(nextSession?.user?.email || '');
        setRecoveryMode(true);
      } else if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
      }
      setSession(nextSession);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) showAuthError(error.message);
      setSession(data?.session || null);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!client || !session?.user?.id || recoveryMode) {
      setMember(null);
      setTickets([]);
      return;
    }
    let active = true;
    setMember(undefined);
    client.from('team_members').select('user_id, display_name').eq('user_id', session.user.id).maybeSingle().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setMember(null);
        setAuthError(true);
        setAuthMessage(error ? 'Workspace access could not be verified. Contact your administrator.' : 'Your account has not been added to this team yet. Contact your administrator.');
        if (error || !data) await client.auth.signOut();
        return;
      }
      setMember(data);
    });
    return () => { active = false; };
  }, [client, recoveryMode, session?.user?.id]);

  useEffect(() => {
    if (!client || !member?.user_id) return undefined;
    let active = true;
    async function loadTickets() {
      const { data, error } = await client.from('tickets').select('*').order('created_at', { ascending: false });
      if (!active) return;
      if (error) showToast(`Could not load tickets: ${error.message}`);
      else setTickets(data.map(fromDatabase));
    }
    void loadTickets();
    const refresh = () => { if (!document.hidden) void loadTickets(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; document.removeEventListener('visibilitychange', refresh); };
  }, [client, member?.user_id]);

  function showAuthError(message) { setAuthError(true); setAuthMessage(message); }
  function showToast(message) { setToast(message); window.setTimeout(() => setToast(''), 2600); }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!client || !signInEnabled) return;
    setAuthBusy(true);
    setAuthMessage('');
    setAuthError(false);
    try {
      if (recoveryMode) {
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setRecoveryMode(false);
        setNewPassword('');
        setAuthMessage('Password updated. You can now sign in with your email and password.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      const message = error.message || '';
      showAuthError(message.toLowerCase().includes('invalid login credentials')
        ? 'Email or password is incorrect.'
        : message || 'Could not sign in. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPasswordReset() {
    if (!client || !signInEnabled || !email.trim()) return;
    setAuthBusy(true);
    setAuthMessage('');
    setAuthError(false);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setAuthMessage('If this is an invited account, a password reset link will arrive by email.');
    } catch (error) {
      showAuthError(error.message || 'Could not send a password reset email. Please try again later.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveTicket(form, ticket) {
    const now = new Date().toISOString();
    const values = {
      title: form.title.trim(), description: form.description.trim(), requester: form.requester.trim(),
      email: form.email.trim(), category: form.category, priority: form.priority, assignee: form.assignee,
      status: form.status, updated_at: now,
      closed_at: form.status === 'closed' ? (ticket?.closedAt || now) : null
    };
    const query = ticket ? client.from('tickets').update(values).eq('id', ticket.dbId) : client.from('tickets').insert(values);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    const saved = fromDatabase(data);
    setTickets(current => ticket ? current.map(item => item.dbId === ticket.dbId ? saved : item) : [saved, ...current]);
    setModalOpen(false);
    showToast(ticket ? `${saved.id} updated` : `${saved.id} created`);
  }

  async function updateStatus(ticket, status) {
    const now = new Date().toISOString();
    const { data, error } = await client.from('tickets').update({ status, closed_at: status === 'closed' ? now : null, updated_at: now }).eq('id', ticket.dbId).select('*').single();
    if (error) { showToast(`Could not update ${ticket.id}: ${error.message}`); return; }
    setTickets(current => current.map(item => item.dbId === ticket.dbId ? fromDatabase(data) : item));
    showToast(status === 'closed' ? `${ticket.id} resolved` : `${ticket.id} reopened`);
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) showToast(`Could not sign out: ${error.message}`);
  }

  function exportTickets(list, filename = 'fieldnote-ticket-history.csv') {
    downloadCsv(filename, csvRows(list));
    showToast(`${filename} downloaded`);
  }

  function navigate(nextView) {
    setView(nextView);
    history.replaceState(null, '', `#${nextView}`);
  }

  if (recoveryMode || !session || !member?.user_id) {
    const checking = Boolean(session && member === undefined);
    return <section className="auth-screen" aria-labelledby="auth-title"><div className="auth-card">
      <a className="brand auth-brand" href="#" aria-label="Fieldnote"><span className="brand-mark">F</span><span>fieldnote<span className="brand-dot">.</span><small>IT SERVICE DESK</small></span></a>
      <div className="eyebrow">{recoveryMode ? 'ACCOUNT RECOVERY' : 'INVITED TEAM ACCESS'}</div><h1 id="auth-title">{checking || !authReady ? 'Checking access.' : recoveryMode ? 'Choose a new password.' : 'Welcome back.'}</h1>
      <p className="auth-copy">{recoveryMode ? 'Enter a new password for your account.' : signInEnabled ? 'Sign in with your invited team email and password.' : 'Sign-in is temporarily disabled. Contact your workspace administrator.'}</p>
      {checking || !authReady ? <p className="auth-message" role="status">Checking your session…</p> : <form className="auth-form" onSubmit={handleAuthSubmit}>
        {signInEnabled && <label className="field">Work email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="you@company.com" readOnly={recoveryMode} /></label>}
        {signInEnabled && <label className="field">{recoveryMode ? 'New password' : 'Password'}<input type="password" value={recoveryMode ? newPassword : password} onChange={event => recoveryMode ? setNewPassword(event.target.value) : setPassword(event.target.value)} required minLength="8" autoComplete={recoveryMode ? 'new-password' : 'current-password'} placeholder={recoveryMode ? 'At least 8 characters' : 'Your password'} /></label>}
        <button className="button button-dark auth-submit" type="submit" disabled={!client || !signInEnabled || authBusy}>{authBusy ? 'Please wait…' : recoveryMode ? 'Save new password' : signInEnabled ? <>Sign in <span className="button-arrow">↗</span></> : 'Sign-in disabled'}</button>
      </form>}
      {!recoveryMode && signInEnabled && !checking && authReady && <button className="auth-link" type="button" disabled={!email.trim() || authBusy} onClick={requestPasswordReset}>Forgot password?</button>}
      {!recoveryMode && <a className="auth-link" href="/request">Need IT help? Submit a ticket</a>}
      <p className={`auth-message ${authError ? 'error' : ''}`} role="status" aria-live="polite">{authMessage}</p>
      {!FIELDNOTE_CONFIG.supabaseUrl || !FIELDNOTE_CONFIG.supabaseAnonKey ? <p className="setup-warning">Authentication is not configured. Set the Supabase URL and public key in <strong>config.js</strong>, then reload.</p> : null}
    </div><div className="auth-footer">FIELDNOTE <span>·</span> PRIVATE TEAM WORKSPACE</div></section>;
  }

  const active = tickets.filter(ticket => ticket.status !== 'closed');
  const overdue = active.filter(isOverdue).length;
  const highPriority = active.filter(ticket => ['Critical', 'High'].includes(ticket.priority)).length;
  const closedThisMonth = tickets.filter(ticket => ticket.status === 'closed' && new Date(ticket.closedAt || ticket.updatedAt).getMonth() === new Date().getMonth() && new Date(ticket.closedAt || ticket.updatedAt).getFullYear() === new Date().getFullYear());
  const average = closedThisMonth.length ? formatDuration(closedThisMonth.reduce((sum, item) => sum + (new Date(item.closedAt || item.updatedAt) - new Date(item.createdAt)), 0) / closedThisMonth.length) : '—';
  const today = new Date();
  const title = ({ dashboard: 'Overview', tickets: 'All tickets', reports: 'Reports' })[view];
  const displayedTickets = view === 'reports' ? null : <>
    {view === 'dashboard' ? <><div className="metric-grid">{[['Active tickets', active.length, 'Across all categories', '↗', ''], ['Past SLA', overdue, overdue ? 'Needs attention now' : 'Everything within target', '!', overdue ? 'alert' : ''], ['High priority', highPriority, 'Critical and high requests', '◉', ''], ['Avg. resolution', average, 'Closed this month', '◷', '']].map(([label, value, foot, accent, extra]) => <div className={`metric-card ${extra}`} key={label}><span className="metric-label">{label}</span><span className="metric-accent">{accent}</span><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>)}</div><div className="content-toolbar"><div><h2>Ticket queue</h2><p className="section-caption">A live look at incoming and active work</p></div><button className="button button-outline" onClick={() => exportTickets(tickets)}><span className="download-icon">↓</span> Export history</button></div></> : <><div className="metric-strip"><div className="strip-item"><strong>{tickets.length}</strong><span>Total tickets</span></div><div className="strip-item"><strong>{active.length}</strong><span>Active requests</span></div><div className="strip-item"><strong>{overdue}</strong><span>Past SLA</span></div></div><div className="content-toolbar"><div><h2>Ticket queue</h2><p className="section-caption">Manage, assign, and resolve requests</p></div><button className="button button-outline" onClick={() => exportTickets(tickets)}><span className="download-icon">↓</span> Export history</button></div></>}
    <TicketTable tickets={tickets} onEdit={ticket => { setModalTicket(ticket); setModalOpen(true); }} onStatus={updateStatus} />
  </>;

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation"><a className="brand" href="#dashboard" aria-label="Fieldnote home"><span className="brand-mark">F</span><span>fieldnote<span className="brand-dot">.</span><small>IT SERVICE DESK</small></span></a><div className="workspace-label">WORKSPACE</div><nav className="side-nav">{[['dashboard', '◫', 'Overview'], ['tickets', '▤', 'All tickets'], ['reports', '▥', 'Reports']].map(([key, icon, label]) => <button className={`nav-item ${view === key ? 'active' : ''}`} key={key} onClick={() => navigate(key)}><span className="nav-icon">{icon}</span>{label}{key === 'tickets' && <span className="nav-count">{active.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="team-heading">ON SHIFT <span className="live-dot" /></div><div className="team-member"><span className={`avatar avatar-coral ${avatarColor(member.display_name)}`} id="team-avatar">{initials(member.display_name)}</span><span className="team-member-info"><span>{member.display_name || session.user.email?.split('@')[0] || 'Technician'}</span><small title={session.user.email}>{session.user.email}</small></span></div><div className="sidebar-foot"><span className="status-indicator" />Private workspace <span className="version">v1.0</span></div></div></aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{title}</strong></div><div className="top-actions"><span className="auth-user">{session.user.email}</span><span className="today-label">{formatDate(today, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><button className="button button-outline sign-out-button" onClick={signOut}>Sign out</button>{view !== 'reports' && <button className="button button-dark" onClick={() => { setModalTicket(null); setModalOpen(true); }}><span className="button-plus">+</span> New ticket</button>}</div></header>
      {view === 'reports' ? <ReportView tickets={tickets} month={month} setMonth={setMonth} onExport={list => exportTickets(list, `fieldnote-report-${month}.csv`)} /> : <section className={`view active ${view === 'tickets' ? 'tickets-view' : ''}`}><div className={`page-heading ${view === 'tickets' ? 'compact-heading' : ''}`}><div><div className="eyebrow">{view === 'dashboard' ? formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase() : 'SERVICE DESK'}</div><h1>{view === 'dashboard' ? <>Service desk <span className="heading-mark">/</span> overview</> : 'All tickets'}</h1><p className="subheading">{view === 'dashboard' ? 'A clear view of what needs attention today.' : 'Every request, from first report to resolution.'}</p></div>{view === 'dashboard' ? <div className="heading-note"><span className="note-mark">✳</span><span>Keep the queue moving.<small>Live service desk</small></span></div> : <button className="button button-dark" onClick={() => { setModalTicket(null); setModalOpen(true); }}><span className="button-plus">+</span> New ticket</button>}</div>{displayedTickets}</section>}
    </main>
    {modalOpen && <TicketModal key={modalTicket?.dbId || 'new-ticket'} ticket={modalTicket} onClose={() => setModalOpen(false)} onSave={saveTicket} />}
    <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}