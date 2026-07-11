const crypto = require('crypto');
const { calculateEMISchedule } = require('./emi');

// --- In-memory "database" -------------------------------------------------
// Assumption (documented in README): a full DB (SQLite/Postgres) was left
// out to keep setup to a single `npm install && npm start`. Data resets on
// server restart. Swapping this module for a real DB layer would not
// require touching server.js's route logic, since all access goes through
// the functions exported below.

const state = {
  members: [],
  loans: [],
  nextMemberId: 1,
  nextLoanId: 1,
  tokens: new Set(), // valid auth tokens (mock auth)
};

const ANNUAL_RATE_PERCENT = 8; // fixed per assignment spec

// --- Auth ------------------------------------------------------------------
const HARDCODED_USER = { username: 'admin', password: 'admin123' };

function login(username, password) {
  if (username === HARDCODED_USER.username && password === HARDCODED_USER.password) {
    const token = crypto.randomBytes(16).toString('hex');
    state.tokens.add(token);
    return token;
  }
  return null;
}

function isValidToken(token) {
  return state.tokens.has(token);
}

// --- Members -----------------------------------------------------------
function listMembers() {
  return state.members;
}

function addMember({ name, memberId, salary }) {
  if (!name || !memberId || salary === undefined || salary === null) {
    throw new Error('name, memberId and salary are all required.');
  }
  if (!Number.isFinite(Number(salary)) || Number(salary) <= 0) {
    throw new Error('salary must be a positive number.');
  }
  if (state.members.some((m) => m.memberId === memberId)) {
    throw new Error(`A member with memberId "${memberId}" already exists.`);
  }
  const member = {
    id: state.nextMemberId++,
    name: String(name).trim(),
    memberId: String(memberId).trim(),
    salary: Number(salary),
  };
  state.members.push(member);
  return member;
}

function getMember(id) {
  return state.members.find((m) => m.id === Number(id));
}

// --- Loans -----------------------------------------------------------------
function listLoans() {
  return state.loans.map(summarize);
}

function summarize(loan) {
  const member = getMember(loan.memberId);
  const lastRow = loan.schedule[loan.schedule.length - 1];
  const outstanding = loan.status === 'Closed' ? 0 : currentOutstanding(loan);
  return {
    id: loan.id,
    memberId: loan.memberId,
    memberName: member ? member.name : 'Unknown',
    principal: loan.principal,
    tenure: loan.tenure,
    annualRatePercent: loan.annualRatePercent,
    emi: loan.emi,
    outstanding,
    status: loan.status,
    createdDate: loan.createdDate,
  };
}

// Outstanding balance "right now" = balance after the last instalment whose
// due date has already passed. For a brand-new loan, that's the full principal.
function currentOutstanding(loan) {
  if (loan.status === 'Closed') return 0;
  const today = new Date();
  let outstanding = loan.principal;
  for (const row of loan.schedule) {
    if (new Date(row.dueDate) <= today) {
      outstanding = row.balanceAfter;
    }
  }
  return outstanding;
}

function addLoan({ memberId, principal, tenure }) {
  const member = getMember(memberId);
  if (!member) throw new Error(`No member found with id ${memberId}.`);

  const P = Number(principal);
  const n = Number(tenure);
  if (!Number.isFinite(P) || P <= 0) throw new Error('principal must be a positive number.');
  if (!Number.isInteger(n) || n < 1) throw new Error('tenure must be a whole number of at least 1 month.');

  const createdDate = new Date().toISOString().slice(0, 10);
  const { emi, schedule } = calculateEMISchedule({
    principal: P,
    tenureMonths: n,
    annualRatePercent: ANNUAL_RATE_PERCENT,
    startDate: createdDate,
  });

  const loan = {
    id: state.nextLoanId++,
    memberId: member.id,
    principal: P,
    tenure: n,
    annualRatePercent: ANNUAL_RATE_PERCENT,
    emi,
    schedule,
    status: 'Active',
    createdDate,
    foreclosure: null,
  };
  state.loans.push(loan);
  return loan;
}

function getLoan(id) {
  return state.loans.find((l) => l.id === Number(id));
}

function foreclose(id, completedEmis) {
  const loan = getLoan(id);
  if (!loan) throw new Error(`No loan found with id ${id}.`);
  if (loan.status === 'Closed') throw new Error('Loan is already closed.');

  const { calculateForeclosure } = require('./emi');
  const result = calculateForeclosure(loan.schedule, Number(completedEmis), loan.annualRatePercent);

  loan.status = 'Closed';
  loan.foreclosure = {
    completedEmis: Number(completedEmis),
    ...result,
    foreclosedOn: new Date().toISOString().slice(0, 10),
  };
  return loan;
}

// --- Report ------------------------------------------------------------
function memberOutstandingReport() {
  return state.members.map((member) => {
    const loans = state.loans.filter((l) => l.memberId === member.id);
    const totalOutstanding = loans.reduce(
      (sum, l) => sum + (l.status === 'Closed' ? 0 : currentOutstanding(l)),
      0
    );
    return {
      memberId: member.id,
      memberCode: member.memberId,
      name: member.name,
      totalOutstanding,
      activeLoans: loans.filter((l) => l.status === 'Active').length,
    };
  });
}

// --- Seed data so the app isn't empty on first run ------------------------
function seed() {
  const alice = addMember({ name: 'Asha Rao', memberId: 'EMP-001', salary: 45000 });
  const bala = addMember({ name: 'Bala Krishnan', memberId: 'EMP-002', salary: 60000 });
  addMember({ name: 'Chitra Iyer', memberId: 'EMP-003', salary: 38000 });

  addLoan({ memberId: alice.id, principal: 100000, tenure: 12 });
  addLoan({ memberId: bala.id, principal: 250000, tenure: 24 });
}
seed();

module.exports = {
  login,
  isValidToken,
  listMembers,
  addMember,
  getMember,
  listLoans,
  addLoan,
  getLoan,
  foreclose,
  memberOutstandingReport,
  summarize,
  currentOutstanding,
  ANNUAL_RATE_PERCENT,
};
