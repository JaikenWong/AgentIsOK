const { ipcRenderer } = require('electron');

const overviewCards = document.getElementById('overviewCards');
const accountsList = document.getElementById('accountsList');
const trendList = document.getElementById('trendList');
const eventsList = document.getElementById('eventsList');
const syncButton = document.getElementById('syncButton');

function formatUsd(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `$${value.toFixed(2)}`;
}

function renderEmpty(target, text) {
  target.innerHTML = `<div class="empty">${text}</div>`;
}

function renderOverview(data) {
  const cards = [
    ['Balance', formatUsd(data.overview.totalBalanceUsd)],
    ['Today', formatUsd(data.overview.todayCostUsd)],
    ['Month', formatUsd(data.overview.monthCostUsd)],
    ['Runway', data.overview.runwayDaysLabel]
  ];

  overviewCards.innerHTML = cards
    .map(([label, value]) => `
      <div class="card">
        <div class="card-label">${label}</div>
        <div class="card-value">${value}</div>
      </div>
    `)
    .join('');
}

function renderAccounts(data) {
  if (!data.accounts.length) {
    renderEmpty(accountsList, 'No account snapshot');
    return;
  }

  accountsList.innerHTML = data.accounts
    .map((account) => `
      <div class="row">
        <div>
          <div>${account.label || account.accountId}</div>
          <div class="meta">${account.provider} · ${account.status || 'ok'}${account.message ? ` · ${account.message}` : ''}</div>
        </div>
        <div>${formatUsd(account.balanceUsd)}</div>
      </div>
    `)
    .join('');
}

function renderTrend(data) {
  if (!data.dailySeries.length) {
    renderEmpty(trendList, 'No usage trend');
    return;
  }

  trendList.innerHTML = data.dailySeries
    .map((item) => `
      <div class="row">
        <div>${item.date}</div>
        <div>${formatUsd(item.costUsd)}</div>
      </div>
    `)
    .join('');
}

function renderEvents(data) {
  if (!data.recentEvents.length) {
    renderEmpty(eventsList, 'No local usage events');
    return;
  }

  eventsList.innerHTML = data.recentEvents
    .map((event) => `
      <div class="row">
        <div>
          <div>${event.provider} · ${event.model}</div>
          <div class="meta">${event.project} · ${new Date(event.timestamp).toLocaleString()}</div>
        </div>
        <div>${formatUsd(event.costUsd)}</div>
      </div>
    `)
    .join('');
}

function renderDashboard(data) {
  renderOverview(data);
  renderAccounts(data);
  renderTrend(data);
  renderEvents(data);
}

ipcRenderer.on('dashboard-data', (_event, data) => {
  renderDashboard(data);
});

syncButton.addEventListener('click', async () => {
  syncButton.disabled = true;
  try {
    const data = await ipcRenderer.invoke('dashboard:sync-now');
    renderDashboard(data);
  } finally {
    syncButton.disabled = false;
  }
});

ipcRenderer.invoke('dashboard:get-data').then(renderDashboard);
