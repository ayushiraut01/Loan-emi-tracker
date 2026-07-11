// ---------------------------------------------------------------------------
// Loan EMI Tracker — frontend
// Plain JS, no framework/build step. Talks to the Express API on the same
// origin. Auth token is kept in memory + localStorage (mock auth, fine for
// this assignment — documented in the README).
// ---------------------------------------------------------------------------

const state = {
  token: localStorage.getItem('emi_token') || null,
  members: [],
  loans: [],
  currentLoanId: null,
};

// Indian Rupee formatting: ₹1,23,456 (no paise)
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
function formatINR(n) {
  return inr.format(n);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// --- API helper --------------------------------------------------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// --- Element refs -------------------------------------------------------
const el = (id) => document.getElementById(id);

// --- Login ---------------------------------------------------------------
el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('login-error').textContent = '';
  const username = el('login-username').value.trim();
  const password = el('login-password').value;
  try {
    const { token } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = token;
    localStorage.setItem('emi_token', token);
    await enterApp();
  } catch (err) {
    el('login-error').textContent = err.message;
  }
});

el('logout-btn').addEventListener('click', () => {
  state.token = null;
  localStorage.removeItem('emi_token');
  el('app-shell').classList.add('hidden');
  el('login-screen').classList.remove('hidden');
});

async function enterApp() {
  el('login-screen').classList.add('hidden');
  el('app-shell').classList.remove('hidden');
  await Promise.all([loadMembers(), loadLoans()]);
  switchTab('members');
}

// Try to resume a session if a token is already stored.
(async function tryResume() {
  if (!state.token) return;
  try {
    await loadMembers();
    await loadLoans();
    el('login-screen').classList.add('hidden');
    el('app-shell').classList.remove('hidden');
    switchTab('members');
  } catch {
    state.token = null;
    localStorage.removeItem('emi_token');
  }
})();

// --- Tabs ------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  el(`tab-${name}`).classList.add('active');
  if (name === 'report') loadReport();
}

// --- Members ---------------------------------------------------------------
async function loadMembers() {
  state.members = await api('/api/members');
  renderMembers();
  populateMemberDropdown();
}

function renderMembers() {
  const tbody = el('members-tbody');
  tbody.innerHTML = '';
  el('members-empty').classList.toggle('hidden', state.members.length > 0);
  for (const m of state.members) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.memberId)}</td><td>${formatINR(m.salary)}</td>`;
    tbody.appendChild(tr);
  }
}

function populateMemberDropdown() {
  const select = el('loan-member');
  select.innerHTML = state.members
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.memberId)})</option>`)
    .join('');
}

el('show-add-member').addEventListener('click', () => el('add-member-form').classList.remove('hidden'));
el('cancel-add-member').addEventListener('click', () => {
  el('add-member-form').classList.add('hidden');
  el('add-member-form').reset();
  el('member-error').textContent = '';
});

el('add-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('member-error').textContent = '';
  const name = el('member-name').value.trim();
  const memberId = el('member-code').value.trim();
  const salary = Number(el('member-salary').value);

  if (!name || !memberId || !salary) {
    el('member-error').textContent = 'All fields are required.';
    return;
  }
  try {
    await api('/api/members', { method: 'POST', body: JSON.stringify({ name, memberId, salary }) });
    el('add-member-form').reset();
    el('add-member-form').classList.add('hidden');
    await loadMembers();
  } catch (err) {
    el('member-error').textContent = err.message;
  }
});

// --- Loans -----------------------------------------------------------------
async function loadLoans() {
  state.loans = await api('/api/loans');
  renderLoans();
}

function renderLoans() {
  const tbody = el('loans-tbody');
  tbody.innerHTML = '';
  el('loans-empty').classList.toggle('hidden', state.loans.length > 0);
  for (const l of state.loans) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(l.memberName)}</td>
      <td>${formatINR(l.principal)}</td>
      <td>${l.tenure} mo</td>
      <td>${formatINR(l.emi)}</td>
      <td>${formatINR(l.outstanding)}</td>
      <td><span class="status-pill ${l.status === 'Active' ? 'status-active' : 'status-closed'}">${l.status}</span></td>
      <td><button class="link-btn" data-loan-id="${l.id}">View schedule</button></td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('button[data-loan-id]').forEach((btn) => {
    btn.addEventListener('click', () => openLoanDetail(Number(btn.dataset.loanId)));
  });
}

el('show-add-loan').addEventListener('click', () => {
  if (state.members.length === 0) {
    el('loan-error').textContent = 'Add a member first before creating a loan.';
  }
  el('add-loan-form').classList.remove('hidden');
});
el('cancel-add-loan').addEventListener('click', () => {
  el('add-loan-form').classList.add('hidden');
  el('add-loan-form').reset();
  el('loan-error').textContent = '';
});

el('add-loan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('loan-error').textContent = '';
  const memberId = Number(el('loan-member').value);
  const principal = Number(el('loan-principal').value);
  const tenure = Number(el('loan-tenure').value);

  if (!memberId) {
    el('loan-error').textContent = 'Please add a member first.';
    return;
  }
  if (!principal || principal <= 0) {
    el('loan-error').textContent = 'Principal must be a positive number.';
    return;
  }
  if (!Number.isInteger(tenure) || tenure < 1) {
    el('loan-error').textContent = 'Tenure must be a whole number of at least 1 month.';
    return;
  }

  try {
    await api('/api/loans', { method: 'POST', body: JSON.stringify({ memberId, principal, tenure }) });
    el('add-loan-form').reset();
    el('add-loan-form').classList.add('hidden');
    await loadLoans();
  } catch (err) {
    el('loan-error').textContent = err.message;
  }
});

// --- Loan detail -------------------------------------------------------
async function openLoanDetail(loanId) {
  state.currentLoanId = loanId;
  const loan = await api(`/api/loans/${loanId}`);
  renderLoanDetail(loan);
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  el('tab-loan-detail').classList.add('active');
}

function renderLoanDetail(loan) {
  const header = el('loan-detail-header');
  const foreclosedNote = loan.foreclosure
    ? `<div class="stat"><span class="stat-label">Foreclosed on</span><span class="stat-value">${formatDate(loan.foreclosure.foreclosedOn)}</span></div>
       <div class="stat"><span class="stat-label">Settlement paid</span><span class="stat-value">${formatINR(loan.foreclosure.settlementAmount)}</span></div>`
    : '';

  header.innerHTML = `
    <div class="stat"><span class="stat-label">Member</span><span class="stat-value">${escapeHtml(loan.memberName)}</span></div>
    <div class="stat"><span class="stat-label">Principal</span><span class="stat-value">${formatINR(loan.principal)}</span></div>
    <div class="stat"><span class="stat-label">Tenure</span><span class="stat-value">${loan.tenure} months</span></div>
    <div class="stat"><span class="stat-label">EMI</span><span class="stat-value">${formatINR(loan.emi)}</span></div>
    <div class="stat"><span class="stat-label">Outstanding now</span><span class="stat-value">${formatINR(loan.outstanding)}</span></div>
    <div class="stat"><span class="stat-label">Status</span><span class="status-pill ${loan.status === 'Active' ? 'status-active' : 'status-closed'}">${loan.status}</span></div>
    ${foreclosedNote}
    ${loan.status === 'Active' ? `<button class="btn btn-danger" id="open-foreclose-modal">Foreclose loan</button>` : ''}
  `;

  const tbody = el('schedule-tbody');
  tbody.innerHTML = '';
  for (const row of loan.schedule) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.emiNo}</td>
      <td>${formatDate(row.dueDate)}</td>
      <td>${formatINR(row.emiAmount)}</td>
      <td>${formatINR(row.principalComponent)}</td>
      <td>${formatINR(row.interestComponent)}</td>
      <td>${formatINR(row.balanceAfter)}</td>
    `;
    tbody.appendChild(tr);
  }

  const forecloseBtn = el('open-foreclose-modal');
  if (forecloseBtn) {
    forecloseBtn.addEventListener('click', () => {
      el('foreclose-completed').max = loan.tenure - 1;
      el('foreclose-error').textContent = '';
      el('foreclose-modal').classList.remove('hidden');
    });
  }
}

el('back-to-loans').addEventListener('click', () => switchTab('loans'));

// --- Foreclosure modal -------------------------------------------------
el('cancel-foreclose').addEventListener('click', () => el('foreclose-modal').classList.add('hidden'));

el('confirm-foreclose').addEventListener('click', async () => {
  el('foreclose-error').textContent = '';
  const completedEmis = Number(el('foreclose-completed').value);
  try {
    await api(`/api/loans/${state.currentLoanId}/foreclose`, {
      method: 'POST',
      body: JSON.stringify({ completedEmis }),
    });
    el('foreclose-modal').classList.add('hidden');
    await loadLoans();
    await openLoanDetail(state.currentLoanId);
  } catch (err) {
    el('foreclose-error').textContent = err.message;
  }
});

// --- Report ------------------------------------------------------------
async function loadReport() {
  const rows = await api('/api/report/member-outstanding');
  const tbody = el('report-tbody');
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.memberCode)}</td>
        <td>${r.activeLoans}</td>
        <td>${formatINR(r.totalOutstanding)}</td>
      </tr>`
    )
    .join('');
}

el('export-csv-btn').addEventListener('click', (e) => {
  e.preventDefault();
  // Token-authenticated download via fetch + blob, since a plain <a href>
  // can't send an Authorization header.
  fetch('/api/report/member-outstanding/csv', {
    headers: { Authorization: `Bearer ${state.token}` },
  })
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'member-outstanding-report.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
});

// --- Utility -------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
