const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateEMISchedule, calculateForeclosure } = require('../src/emi');

test('schedule has correct length and closes to exactly zero', () => {
  const { schedule } = calculateEMISchedule({ principal: 100000, tenureMonths: 12, annualRatePercent: 8 });
  assert.equal(schedule.length, 12);
  assert.equal(schedule[schedule.length - 1].balanceAfter, 0);
});

test('interest decreases and principal component increases over time (reducing balance)', () => {
  const { schedule } = calculateEMISchedule({ principal: 100000, tenureMonths: 12, annualRatePercent: 8 });
  assert.ok(schedule[0].interestComponent > schedule[11].interestComponent);
  assert.ok(schedule[0].principalComponent < schedule[11].principalComponent);
});

test('EMI amount is constant except possibly the final instalment', () => {
  const { emi, schedule } = calculateEMISchedule({ principal: 250000, tenureMonths: 24, annualRatePercent: 8 });
  for (let i = 0; i < schedule.length - 1; i++) {
    assert.equal(schedule[i].emiAmount, emi);
  }
});

test('sum of principal components equals the original principal', () => {
  const principal = 100000;
  const { schedule } = calculateEMISchedule({ principal, tenureMonths: 12, annualRatePercent: 8 });
  const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalComponent, 0);
  assert.equal(totalPrincipal, principal);
});

test('a 1-month loan is a single instalment that clears the balance', () => {
  const { schedule } = calculateEMISchedule({ principal: 10000, tenureMonths: 1, annualRatePercent: 8 });
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].balanceAfter, 0);
  // One month of interest on 10000 at 8% p.a. (r = 8/1200): 10000 * (8/1200) = 66.67 -> rounds to 67
  assert.equal(schedule[0].interestComponent, 67);
  assert.equal(schedule[0].principalComponent, 10000);
});

test('tenure of 0 is rejected (edge case)', () => {
  assert.throws(() => calculateEMISchedule({ principal: 10000, tenureMonths: 0 }));
});

test('negative or zero principal is rejected (edge case)', () => {
  assert.throws(() => calculateEMISchedule({ principal: 0, tenureMonths: 12 }));
  assert.throws(() => calculateEMISchedule({ principal: -5000, tenureMonths: 12 }));
});

test('non-integer tenure is rejected (edge case)', () => {
  assert.throws(() => calculateEMISchedule({ principal: 10000, tenureMonths: 6.5 }));
});

test('foreclosure settlement = outstanding principal + current month interest only', () => {
  const { schedule } = calculateEMISchedule({ principal: 100000, tenureMonths: 12, annualRatePercent: 8 });
  // Foreclose after 3 completed EMIs
  const result = calculateForeclosure(schedule, 3, 8);
  const expectedBalance = schedule[2].balanceAfter;
  const expectedInterest = Math.round(expectedBalance * (8 / 1200));
  assert.equal(result.balanceBeforeForeclosure, expectedBalance);
  assert.equal(result.interestForCurrentMonth, expectedInterest);
  assert.equal(result.settlementAmount, expectedBalance + expectedInterest);
});

test('foreclosure with 0 completed EMIs uses the full original principal', () => {
  const { schedule } = calculateEMISchedule({ principal: 50000, tenureMonths: 6, annualRatePercent: 8 });
  const result = calculateForeclosure(schedule, 0, 8);
  assert.equal(result.balanceBeforeForeclosure, 50000);
});
