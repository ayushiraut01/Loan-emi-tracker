const express = require('express');
const path = require('path');
const store = require('./src/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth middleware (mock — good enough for this assignment) --------------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !store.isValidToken(token)) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  next();
}

// --- Auth --------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const token = store.login(username, password);
  if (!token) return res.status(401).json({ error: 'Invalid username or password.' });
  res.json({ token });
});

// Everything below requires a valid token.
app.use('/api', requireAuth);

// --- Members -------------------------------------------------------------
app.get('/api/members', (req, res) => {
  res.json(store.listMembers());
});

app.post('/api/members', (req, res) => {
  try {
    const member = store.addMember(req.body || {});
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Loans -----------------------------------------------------------------
app.get('/api/loans', (req, res) => {
  res.json(store.listLoans());
});

app.post('/api/loans', (req, res) => {
  try {
    const loan = store.addLoan(req.body || {});
    res.status(201).json(store.summarize(loan));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/loans/:id', (req, res) => {
  const loan = store.getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found.' });
  res.json({ ...store.summarize(loan), schedule: loan.schedule, foreclosure: loan.foreclosure });
});

app.post('/api/loans/:id/foreclose', (req, res) => {
  try {
    const { completedEmis } = req.body || {};
    const loan = store.foreclose(req.params.id, completedEmis ?? 0);
    res.json({ ...store.summarize(loan), schedule: loan.schedule, foreclosure: loan.foreclosure });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Report ----------------------------------------------------------------
app.get('/api/report/member-outstanding', (req, res) => {
  res.json(store.memberOutstandingReport());
});

app.get('/api/report/member-outstanding/csv', (req, res) => {
  const rows = store.memberOutstandingReport();
  const header = 'Member Code,Name,Active Loans,Total Outstanding (INR)';
  const lines = rows.map(
    (r) => `${r.memberCode},"${r.name}",${r.activeLoans},${r.totalOutstanding}`
  );
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="member-outstanding-report.csv"');
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Loan EMI Tracker running at http://localhost:${PORT}`);
  console.log(`Login with username: admin / password: admin123`);
});
