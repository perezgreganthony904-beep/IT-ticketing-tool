const SLA_HOURS = { Critical: 4, High: 8, Medium: 24, Low: 72 };
const categoryIcons = { Hardware: '⌘', Software: '▧', Network: '⌁', Account: '◎' };
const colors = ['green', 'coral', 'blue', 'yellow'];
const hour = 60 * 60 * 1000;
let tickets = [];
let activeStatus = 'all';
let toastTimer;
let supabaseClient;
let currentUser;
let refreshGeneration = 0;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
}

function avatarColor(value = '') {
  return colors[[...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

function fromDatabase(record) {
  return {
    dbId: record.id,
    id: `HD-${record.ticket_number}`,
    title: record.title,
    description: record.description || '',
    requester: record.requester,
    email: record.email || '',
    category: record.category,
    priority: record.priority,
    assignee: record.assignee,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    closedAt: record.closed_at
  };
}

async function refreshTickets() {
  if (!supabaseClient || !currentUser) return;
  const generation = ++refreshGeneration;
  try {
    const { data, error } = await supabaseClient.from('tickets').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (generation !== refreshGeneration || !currentUser) return;
    tickets = data.map(fromDatabase);
    renderAll();
  } catch (error) {
    if (generation === refreshGeneration) showToast(`Could not load tickets: ${error.message}`);
  }
}

function setAuthMessage(message, isError = false) {
  const element = document.getElementById('auth-message');
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function showAuth() {
  refreshGeneration += 1;
  currentUser = null;
  tickets = [];
  document.getElementById('app-shell').hidden = true;
  document.getElementById('auth-screen').hidden = false;
}

async function showWorkspace(user) {
  const { data: member, error } = await supabaseClient.from('team_members').select('display_name').eq('user_id', user.id).maybeSingle();
  if (error || !member) {
    showAuth();
    setAuthMessage(error ? 'Workspace access could not be verified. Contact your administrator.' : 'Your account has not been added to this team yet. Contact your administrator.', true);
    void supabaseClient.auth.signOut();
    return;
  }
  currentUser = user;
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app-shell').hidden = false;
  document.getElementById('auth-user').textContent = user.email || '';
  document.getElementById('team-user').textContent = member.display_name || user.email?.split('@')[0] || 'Technician';
  document.getElementById('team-email-label').textContent = user.email || '';
  document.getElementById('team-avatar').textContent = initials(member.display_name || user.email || 'IT');
  renderAll();
  const initialView = location.hash.replace('#', '');
  switchView(['dashboard', 'tickets', 'reports'].includes(initialView) ? initialView : 'dashboard');
  await refreshTickets();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = document.getElementById('login-email').value.trim();
  const submit = document.getElementById('auth-submit');
  submit.disabled = true;
  setAuthMessage('');
  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
    });
    if (error) throw error;
    setAuthMessage('If this email belongs to an invited technician, a sign-in link is on its way. Check your inbox.');
  } catch (error) {
    setAuthMessage(error.message || 'Could not send a sign-in link. Please try again.', true);
  } finally {
    submit.disabled = false;
  }
}

async function initializeAuth() {
  const config = window.FIELDNOTE_CONFIG || {};
  const warning = document.getElementById('setup-warning');
  const submit = document.getElementById('auth-submit');
  document.getElementById('export-legacy').hidden = readLegacyTickets().length === 0;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    warning.hidden = false;
    submit.disabled = true;
    return;
  }
  if (!window.supabase?.createClient) {
    setAuthMessage('The authentication service could not load. Check your internet connection and reload.', true);
    submit.disabled = true;
    return;
  }
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session) {
      showAuth();
    } else if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY'].includes(event)) {
      setTimeout(() => { if (session) void showWorkspace(session.user); }, 0);
    }
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) setAuthMessage(error.message, true);
  if (data?.session) await showWorkspace(data.session.user);
}

function ticketDue(ticket) {
  return new Date(new Date(ticket.createdAt).getTime() + SLA_HOURS[ticket.priority] * hour);
}

function isOverdue(ticket) {
  return ticket.status !== 'closed' && ticketDue(ticket).getTime() < Date.now();
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

function slaMarkup(ticket) {
  if (ticket.status === 'closed') {
    const resolution = new Date(ticket.closedAt || ticket.updatedAt) - new Date(ticket.createdAt);
    return `<span class="sla-cell resolved">Resolved ${formatDuration(resolution)}<small>${formatDate(ticket.closedAt || ticket.updatedAt, { month: 'short', day: 'numeric' })}</small></span>`;
  }
  const due = ticketDue(ticket);
  if (isOverdue(ticket)) return `<span class="sla-cell overdue">Overdue ${formatDuration(Date.now() - due)}<small>Due ${formatDate(due, { hour: 'numeric', minute: '2-digit' })}</small></span>`;
  const dueLabel = due.toDateString() === new Date().toDateString() ? 'Due today' : `Due ${formatDate(due)}`;
  return `<span class="sla-cell">${formatDate(due, { hour: 'numeric', minute: '2-digit' })}<small>${dueLabel}</small></span>`;
}

function rowMarkup(ticket) {
  const closed = ticket.status === 'closed';
  const statusLabel = closed ? 'Closed' : ticket.status === 'in-progress' ? 'In progress' : 'Open';
  return `<tr>
    <td><span class="ticket-id">${escapeHtml(ticket.id)}</span><span class="ticket-name">${escapeHtml(ticket.title)}</span></td>
    <td><span class="requester-cell"><span class="mini-avatar ${avatarColor(ticket.requester)}">${escapeHtml(initials(ticket.requester))}</span>${escapeHtml(ticket.requester)}</span></td>
    <td><span class="category-cell"><span class="category-icon">${categoryIcons[ticket.category] || '·'}</span>${escapeHtml(ticket.category)}</span></td>
    <td><span class="priority priority-${ticket.priority.toLowerCase()}">${escapeHtml(ticket.priority)}</span></td>
    <td><span class="assignee"><span class="mini-avatar ${avatarColor(ticket.assignee)}">${escapeHtml(initials(ticket.assignee))}</span>${escapeHtml(ticket.assignee)}</span></td>
    <td><span class="status-pill status-${ticket.status}">${statusLabel}</span></td>
    <td>${slaMarkup(ticket)}</td>
    <td class="row-actions"><button class="row-menu" aria-label="Actions for ${escapeHtml(ticket.id)}" data-menu="${escapeHtml(ticket.id)}">···</button><div class="row-menu-list" data-menu-list="${escapeHtml(ticket.id)}" hidden><button data-edit="${escapeHtml(ticket.id)}">Edit ticket</button>${closed ? `<button data-reopen="${escapeHtml(ticket.id)}">Reopen ticket</button>` : `<button data-close="${escapeHtml(ticket.id)}">Close ticket</button>`}</div></td>
  </tr>`;
}

function matchingTickets(search, category) {
  const term = search.trim().toLowerCase();
  return [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(ticket => {
    const matchesStatus = activeStatus === 'all' || ticket.status === activeStatus;
    const haystack = [ticket.id, ticket.title, ticket.requester, ticket.assignee, ticket.category, ticket.priority].join(' ').toLowerCase();
    return matchesStatus && (!term || haystack.includes(term)) && (category === 'all' || ticket.category === category);
  });
}

function renderTable(suffix = '') {
  const search = document.getElementById(`ticket-search${suffix}`)?.value || '';
  const category = document.getElementById(`category-filter${suffix}`)?.value || 'all';
  const rows = matchingTickets(search, category);
  document.getElementById(`ticket-rows${suffix}`).innerHTML = rows.map(rowMarkup).join('');
  document.getElementById(`empty-state${suffix}`).hidden = rows.length > 0;
  document.getElementById(`result-count${suffix}`).textContent = `Showing ${rows.length} ${rows.length === 1 ? 'ticket' : 'tickets'}`;
  const counts = { all: tickets.length, open: tickets.filter(ticket => ticket.status === 'open').length, progress: tickets.filter(ticket => ticket.status === 'in-progress').length, closed: tickets.filter(ticket => ticket.status === 'closed').length };
  Object.entries({ 'count-all': counts.all, 'count-open': counts.open, 'count-progress': counts.progress, 'count-closed': counts.closed }).forEach(([id, value]) => {
    const target = document.getElementById(id + (suffix ? '-list' : ''));
    if (target) target.textContent = value;
  });
  document.querySelectorAll(`#${suffix ? 'tickets' : 'dashboard'}-view .filter-tab`).forEach(button => button.classList.toggle('selected', button.dataset.status === activeStatus));
}

function renderMetrics() {
  const active = tickets.filter(ticket => ticket.status !== 'closed');
  const overdue = active.filter(isOverdue).length;
  const high = active.filter(ticket => ['Critical', 'High'].includes(ticket.priority)).length;
  const closedThisMonth = tickets.filter(ticket => ticket.status === 'closed' && new Date(ticket.closedAt || ticket.updatedAt).getMonth() === new Date().getMonth() && new Date(ticket.closedAt || ticket.updatedAt).getFullYear() === new Date().getFullYear());
  const average = closedThisMonth.length ? formatDuration(closedThisMonth.reduce((sum, ticket) => sum + (new Date(ticket.closedAt || ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime()), 0) / closedThisMonth.length) : '—';
  const metrics = [['Active tickets', active.length, 'Across all categories', '↗', ''], ['Past SLA', overdue, overdue ? 'Needs attention now' : 'Everything within target', '!', overdue ? 'alert' : ''], ['High priority', high, 'Critical and high requests', '◉', ''], ['Avg. resolution', average, 'Closed this month', '◷', '']];
  document.getElementById('metric-grid').innerHTML = metrics.map(([label, value, foot, accent, extra]) => `<div class="metric-card ${extra}"><span class="metric-label">${label}</span><span class="metric-accent">${accent}</span><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></div>`).join('');
  document.getElementById('nav-open-count').textContent = active.length;
  document.getElementById('ticket-summary').innerHTML = `<div class="strip-item"><strong>${tickets.length}</strong><span>Total tickets</span></div><div class="strip-item"><strong>${active.length}</strong><span>Active requests</span></div><div class="strip-item"><strong>${overdue}</strong><span>Past SLA</span></div>`;
}

function selectedReportPeriod() {
  const input = document.getElementById('report-month');
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(input.value);
  if (match) return [Number(match[1]), Number(match[2])];
  const current = new Date();
  input.value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  return [current.getFullYear(), current.getMonth() + 1];
}

function reportTickets() {
  const [year, month] = selectedReportPeriod();
  return tickets.filter(ticket => { const date = new Date(ticket.createdAt); return date.getFullYear() === year && date.getMonth() + 1 === month; });
}

function reportCsvTickets() {
  const [year, month] = selectedReportPeriod();
  return tickets.filter(ticket => {
    const createdAt = new Date(ticket.createdAt);
    const closedAt = ticket.closedAt ? new Date(ticket.closedAt) : null;
    const createdThisMonth = createdAt.getFullYear() === year && createdAt.getMonth() + 1 === month;
    const closedThisMonth = closedAt && closedAt.getFullYear() === year && closedAt.getMonth() + 1 === month;
    return createdThisMonth || closedThisMonth;
  });
}

function renderReport() {
  const [year, month] = selectedReportPeriod();
  const monthTickets = reportTickets();
  const closed = tickets.filter(ticket => {
    const closedAt = new Date(ticket.closedAt || ticket.updatedAt);
    return ticket.status === 'closed' && closedAt.getFullYear() === year && closedAt.getMonth() + 1 === month;
  });
  const activeCreated = monthTickets.filter(ticket => ticket.status !== 'closed').length;
  const slaMet = closed.filter(ticket => new Date(ticket.closedAt || ticket.updatedAt) <= ticketDue(ticket));
  const average = closed.length ? formatDuration(closed.reduce((sum, ticket) => sum + (new Date(ticket.closedAt || ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime()), 0) / closed.length) : '—';
  const rate = closed.length ? `${Math.round(slaMet.length / closed.length * 100)}%` : '—';
  document.getElementById('report-summary').innerHTML = `<div class="report-kpi"><span>Tickets created</span><strong>${monthTickets.length}</strong><small>${formatDate(`${year}-${String(month).padStart(2, '0')}-02`, { month: 'long', year: 'numeric' })}</small></div><div class="report-kpi"><span>Resolved</span><strong>${closed.length}</strong><small>${activeCreated} still active</small></div><div class="report-kpi"><span>Within SLA</span><strong>${rate}</strong><small>${closed.length ? `${slaMet.length} of ${closed.length} resolved on time` : 'No resolved tickets yet'}</small></div><div class="report-kpi"><span>Avg. resolution</span><strong>${average}</strong><small>For tickets resolved this month</small></div>`;
  const days = new Date(year, month, 0).getDate();
  const slots = Array.from({ length: days }, (_, index) => ({ day: index + 1, count: 0 }));
  monthTickets.forEach(ticket => { slots[new Date(ticket.createdAt).getDate() - 1].count += 1; });
  const peak = Math.max(1, ...slots.map(slot => slot.count));
  document.getElementById('volume-chart').innerHTML = slots.map(({ day, count }) => `<div class="chart-col"><span class="chart-value">${count || ''}</span><div class="chart-bar" style="height:${Math.max(count ? 8 : 2, count / peak * 100)}%" title="${count} ticket${count === 1 ? '' : 's'} on ${formatDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}"></div><span class="chart-label">${day % 5 === 1 || day === days ? day : ''}</span></div>`).join('');
  const categoryCounts = ['Hardware', 'Software', 'Network', 'Account'].map(category => [category, monthTickets.filter(ticket => ticket.category === category).length]);
  const maxCategory = Math.max(1, ...categoryCounts.map(([, count]) => count));
  document.getElementById('category-breakdown').innerHTML = categoryCounts.map(([category, count]) => `<div class="category-row"><span>${category}</span><div class="category-track"><div class="category-fill" style="width:${count / maxCategory * 100}%"></div></div><span class="category-count">${count}</span></div>`).join('');
}

function renderAll() { renderMetrics(); renderTable(); renderTable('-list'); renderReport(); }
function switchView(view) {
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.getElementById('breadcrumb-current').textContent = ({ dashboard: 'Overview', tickets: 'All tickets', reports: 'Reports' })[view];
  history.replaceState(null, '', `#${view}`);
}

function openModal(ticket = null) {
  const form = document.getElementById('ticket-form'); form.reset();
  document.getElementById('ticket-id').value = ticket?.id || '';
  document.getElementById('modal-title').textContent = ticket ? 'Update ticket' : 'Create a ticket';
  document.getElementById('modal-eyebrow').textContent = ticket ? ticket.id : 'NEW REQUEST';
  document.getElementById('save-ticket').innerHTML = ticket ? 'Save changes <span class="button-arrow">↗</span>' : 'Create ticket <span class="button-arrow">↗</span>';
  if (ticket) {
    document.getElementById('ticket-title').value = ticket.title; document.getElementById('ticket-description').value = ticket.description || '';
    document.getElementById('ticket-requester').value = ticket.requester; document.getElementById('ticket-email').value = ticket.email || '';
    document.getElementById('ticket-category').value = ticket.category; document.getElementById('ticket-priority').value = ticket.priority;
    document.getElementById('ticket-assignee').value = ticket.assignee; document.getElementById('ticket-status').value = ticket.status;
  }
  document.getElementById('ticket-modal').hidden = false; document.getElementById('ticket-title').focus();
}

function closeModal() { document.getElementById('ticket-modal').hidden = true; }
function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
async function saveTicket(event) {
  event.preventDefault();
  if (!supabaseClient || !currentUser) return;
  const id = document.getElementById('ticket-id').value;
  const previous = tickets.find(ticket => ticket.id === id);
  const status = document.getElementById('ticket-status').value;
  const now = new Date().toISOString();
  const values = {
    title: document.getElementById('ticket-title').value.trim(),
    description: document.getElementById('ticket-description').value.trim(),
    requester: document.getElementById('ticket-requester').value.trim(),
    email: document.getElementById('ticket-email').value.trim(),
    category: document.getElementById('ticket-category').value,
    priority: document.getElementById('ticket-priority').value,
    assignee: document.getElementById('ticket-assignee').value,
    status,
    updated_at: now,
    closed_at: status === 'closed' ? (previous?.closedAt || now) : null
  };
  const saveButton = document.getElementById('save-ticket');
  saveButton.disabled = true;
  try {
    const query = previous
      ? supabaseClient.from('tickets').update(values).eq('id', previous.dbId)
      : supabaseClient.from('tickets').insert(values);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    const ticket = fromDatabase(data);
    if (previous) tickets = tickets.map(item => item.id === id ? ticket : item);
    else tickets.push(ticket);
    closeModal(); renderAll(); showToast(previous ? `${ticket.id} updated` : `${ticket.id} created`);
  } catch (error) {
    showToast(`Could not save ticket: ${error.message}`);
  } finally {
    saveButton.disabled = false;
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const downloadUrl = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = downloadUrl; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast(`${filename} downloaded`);
}
function ticketCsvRows(list) {
  const header = ['Ticket ID', 'Title', 'Description', 'Requester', 'Email', 'Category', 'Priority', 'Technician', 'Status', 'Created at', 'SLA due at', 'Closed at', 'Resolution hours', 'SLA outcome'];
  return [header, ...list.map(ticket => {
    const closedAt = ticket.closedAt || (ticket.status === 'closed' ? ticket.updatedAt : '');
    const resolutionMs = closedAt ? new Date(closedAt) - new Date(ticket.createdAt) : '';
    return [ticket.id, ticket.title, ticket.description, ticket.requester, ticket.email, ticket.category, ticket.priority, ticket.assignee, ticket.status, ticket.createdAt, ticketDue(ticket).toISOString(), closedAt, resolutionMs === '' ? '' : (resolutionMs / hour).toFixed(2), closedAt ? (new Date(closedAt) <= ticketDue(ticket) ? 'Met' : 'Missed') : (isOverdue(ticket) ? 'Overdue' : 'In progress')];
  })];
}

function readLegacyTickets() {
  try {
    const legacy = JSON.parse(localStorage.getItem('fieldnote.tickets.v1') || 'null');
    return Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}

function exportLegacyHistory() {
  const legacy = readLegacyTickets();
  if (legacy.length) downloadCsv('fieldnote-browser-ticket-backup.csv', ticketCsvRows(legacy));
}

async function updateTicketStatus(id, status) {
  const ticket = tickets.find(item => item.id === id);
  if (!ticket || !supabaseClient || !currentUser) return;
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabaseClient.from('tickets').update({
      status,
      closed_at: status === 'closed' ? now : null,
      updated_at: now
    }).eq('id', ticket.dbId).select('*').single();
    if (error) throw error;
    tickets = tickets.map(item => item.id === id ? fromDatabase(data) : item);
    renderAll();
    showToast(status === 'closed' ? `${id} resolved` : `${id} reopened`);
  } catch (error) {
    showToast(`Could not update ${id}: ${error.message}`);
  }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[id^="new-ticket"]').forEach(button => button.addEventListener('click', () => openModal()));
document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => { activeStatus = button.dataset.status; renderTable(); renderTable('-list'); }));
document.getElementById('ticket-search').addEventListener('input', () => renderTable());
document.getElementById('category-filter').addEventListener('change', () => renderTable());
document.getElementById('ticket-search-list').addEventListener('input', () => renderTable('-list'));
document.getElementById('category-filter-list').addEventListener('change', () => renderTable('-list'));
document.getElementById('ticket-form').addEventListener('submit', saveTicket);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('ticket-modal').addEventListener('click', event => { if (event.target.id === 'ticket-modal') closeModal(); });
document.getElementById('report-month').addEventListener('change', renderReport);
document.getElementById('export-history').addEventListener('click', () => downloadCsv('fieldnote-ticket-history.csv', ticketCsvRows(tickets)));
document.getElementById('export-history-list').addEventListener('click', () => downloadCsv('fieldnote-ticket-history.csv', ticketCsvRows(tickets)));
document.getElementById('export-monthly').addEventListener('click', () => {
  const [year, month] = selectedReportPeriod();
  downloadCsv(`fieldnote-report-${year}-${String(month).padStart(2, '0')}.csv`, ticketCsvRows(reportCsvTickets()));
});

document.addEventListener('click', event => {
  const menuButton = event.target.closest('[data-menu]');
  if (menuButton) { document.querySelectorAll('.row-menu-list').forEach(menu => { menu.hidden = menu.dataset.menuList !== menuButton.dataset.menu; }); return; }
  const editButton = event.target.closest('[data-edit]');
  if (editButton) { const ticket = tickets.find(item => item.id === editButton.dataset.edit); if (ticket) openModal(ticket); return; }
  const closeButton = event.target.closest('[data-close]'); const reopenButton = event.target.closest('[data-reopen]');
  if (closeButton || reopenButton) {
    const id = (closeButton || reopenButton).dataset.close || (closeButton || reopenButton).dataset.reopen;
    void updateTicketStatus(id, closeButton ? 'closed' : 'open');
  }
  if (!event.target.closest('.row-actions')) document.querySelectorAll('.row-menu-list').forEach(menu => { menu.hidden = true; });
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(); document.querySelectorAll('.row-menu-list').forEach(menu => { menu.hidden = true; }); } });
const reportMonth = new Date();
document.getElementById('report-month').value = `${reportMonth.getFullYear()}-${String(reportMonth.getMonth() + 1).padStart(2, '0')}`;
document.getElementById('today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
document.querySelector('.page-heading .eyebrow').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
document.getElementById('login-form').addEventListener('submit', handleAuthSubmit);
document.getElementById('export-legacy').addEventListener('click', exportLegacyHistory);
document.getElementById('sign-out').addEventListener('click', async () => {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    showToast(`Could not sign out: ${error.message}`);
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) void refreshTickets(); });
void initializeAuth();