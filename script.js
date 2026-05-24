/* ═══════════════════════════════════════════════════
   script.js  –  Debt Recycling Calculator logic
════════════════════════════════════════════════════ */

'use strict';

// ── Advanced options toggle ──────────────────────────
const advancedToggle = document.getElementById('advancedToggle');
const advancedPanel  = document.getElementById('advancedPanel');
const advancedChevron = document.getElementById('advancedChevron');

advancedToggle.addEventListener('click', () => {
  advancedPanel.classList.toggle('open');
  advancedChevron.classList.toggle('open');
});

// ── Calculate button ─────────────────────────────────
document.getElementById('calculateBtn').addEventListener('click', calculate);

// ── Chart instance (so we can destroy/re-create) ─────
let chartInstance = null;

// ── Helper: format currency ──────────────────────────
function fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000)     return '$' + (n / 1_000).toFixed(1)     + 'k';
  return '$' + Math.round(n).toLocaleString();
}

// ── Debt recycling projection model ──────────────────
/*
  Each year:
  1. Extra repayment = annual investment amount (same $ reborrowed as investment)
  2. Mortgage reduces by extra repayment + (dividends + tax savings)
  3. Investment loan (good debt) increases by annual investment amount
  4. Portfolio grows by capital growth + dividends reinvested
  5. Tax saving = investment loan balance × mortgage rate × marginal rate × franking adj
*/
function project(inputs) {
  const {
    salary, initialInvestment, annualInvestment,
    mortgage, mortgageRate, dividendRate, growthRate,
    projectionYears, taxRate, frankingRate
  } = inputs;

  const r_m  = mortgageRate  / 100;
  const r_d  = dividendRate  / 100;
  const r_g  = growthRate    / 100;
  const t    = taxRate       / 100;
  const f    = frankingRate  / 100;       // fraction of dividends franked

  const labels    = [];
  const goodDebt  = [];   // investment loan (deductible)
  const badDebt   = [];   // mortgage
  const invested  = [];   // portfolio value

  let mortgageBal = mortgage;
  let investLoan  = initialInvestment;  // initial investment financed
  let portfolio   = initialInvestment;
  let totalTaxSavings = 0;

  for (let y = 1; y <= projectionYears; y++) {
    // Portfolio grows
    const capitalGain = portfolio * r_g;
    const dividends   = portfolio * r_d;

    // Tax deduction: interest on investment loan
    const interestOnLoan = investLoan * r_m;
    // Franking gross-up gives extra credit
    const frankingCredit = dividends * f * (30 / 70);  // company tax 30%
    const taxableDividend = dividends + frankingCredit;
    const taxSaving = interestOnLoan * t + frankingCredit;
    totalTaxSavings += taxSaving;

    // Annual cash recycled = dividends + tax saving → extra mortgage repayment
    const extraRepayment = dividends + taxSaving;

    // Reduce mortgage (normal + extra)
    const normalRepayment = mortgageBal * r_m;  // interest-only simplification; for a P&I loan you'd add principal
    mortgageBal = Math.max(0, mortgageBal - extraRepayment);

    // Reborrow same amount as annual investment
    investLoan += annualInvestment;

    // Portfolio value grows
    portfolio = portfolio * (1 + r_g) + dividends + annualInvestment;

    labels.push('Year ' + y);
    goodDebt.push(Math.round(investLoan));
    badDebt.push(Math.round(mortgageBal));
    invested.push(Math.round(portfolio));
  }

  return { labels, goodDebt, badDebt, invested, totalTaxSavings,
           finalPortfolio: invested[invested.length - 1],
           finalGoodDebt:  goodDebt[goodDebt.length - 1],
           finalBadDebt:   badDebt[badDebt.length - 1] };
}

// ── Main calculate function ───────────────────────────
function calculate() {
  const inputs = {
    salary:           parseFloat(document.getElementById('salary').value)            || 120000,
    initialInvestment:parseFloat(document.getElementById('initialInvestment').value) || 50000,
    annualInvestment: parseFloat(document.getElementById('annualInvestment').value)  || 24000,
    mortgage:         parseFloat(document.getElementById('mortgage').value)          || 600000,
    mortgageRate:     parseFloat(document.getElementById('mortgageRate').value)      || 6.2,
    dividendRate:     parseFloat(document.getElementById('dividendRate').value)      || 4.0,
    growthRate:       parseFloat(document.getElementById('growthRate').value)        || 7.0,
    projectionYears:  parseInt(document.getElementById('projectionYears').value)     || 20,
    taxRate:          parseFloat(document.getElementById('taxRate').value)           || 37,
    frankingRate:     parseFloat(document.getElementById('frankingRate').value)      || 70,
  };

  const result = project(inputs);

  // ── Show results section ─────────────────────────
  const section = document.getElementById('resultsSection');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── Render stat cards ────────────────────────────
  document.getElementById('resultStats').innerHTML = `
    <div class="result-stat">
      <div class="result-stat__label">PORTFOLIO VALUE</div>
      <div class="result-stat__value result-stat__value--blue">${fmt(result.finalPortfolio)}</div>
    </div>
    <div class="result-stat">
      <div class="result-stat__label">TOTAL TAX SAVINGS</div>
      <div class="result-stat__value result-stat__value--green">${fmt(result.totalTaxSavings)}</div>
    </div>
    <div class="result-stat">
      <div class="result-stat__label">GOOD DEBT</div>
      <div class="result-stat__value result-stat__value--blue">${fmt(result.finalGoodDebt)}</div>
    </div>
    <div class="result-stat">
      <div class="result-stat__label">MORTGAGE REMAINING</div>
      <div class="result-stat__value result-stat__value--red">${fmt(result.finalBadDebt)}</div>
    </div>
  `;

  // ── Render chart ─────────────────────────────────
  if (chartInstance) { chartInstance.destroy(); }

  const ctx = document.getElementById('wealthChart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: result.labels,
      datasets: [
        {
          label: 'Good debt (recycled)',
          data: result.goodDebt,
          borderColor: '#3a6fd8',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#3a6fd8',
          tension: 0.3,
        },
        {
          label: 'Bad debt (mortgage)',
          data: result.badDebt,
          borderColor: '#e84d8a',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 4,
          pointBackgroundColor: '#e84d8a',
          tension: 0.3,
        },
        {
          label: 'Amount invested',
          data: result.invested,
          borderColor: '#b8860b',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#b8860b',
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyleWidth: 20, padding: 16, font: { size: 12 } },
        },
        title: {
          display: true,
          text: ['Long-term wealth comparison',
                 'Good debt rising, bad debt falling, portfolio growing — over ' + inputs.projectionYears + ' years'],
          align: 'start',
          color: '#1a2340',
          font: [{ size: 15, weight: '600' }, { size: 12, weight: '400' }],
          padding: { bottom: 16 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { size: 12 }, color: '#6b7a99' },
        },
        y: {
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: {
            font: { size: 12 },
            color: '#6b7a99',
            callback: v => fmt(v),
          },
        },
      },
    },
  });
}
