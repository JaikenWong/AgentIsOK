const { Menu, Tray } = require('electron');

function formatUsd(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `$${value.toFixed(2)}`;
}

module.exports = function createTray({ icon, onOpenDashboard, onRefresh, onQuit }) {
  const tray = new Tray(icon);
  tray.setToolTip('ThatIsOk');

  function updateSummary(summary) {
    const title = `${formatUsd(summary.overview.totalBalanceUsd)} | today ${formatUsd(summary.overview.todayCostUsd)}`;

    if (process.platform === 'darwin') {
      tray.setTitle(title);
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Balance: ${formatUsd(summary.overview.totalBalanceUsd)}`,
        enabled: false
      },
      {
        label: `Today: ${formatUsd(summary.overview.todayCostUsd)}`,
        enabled: false
      },
      {
        label: `Month: ${formatUsd(summary.overview.monthCostUsd)}`,
        enabled: false
      },
      {
        label: `Runway: ${summary.overview.runwayDaysLabel}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: onOpenDashboard
      },
      {
        label: 'Refresh',
        click: onRefresh
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: onQuit
      }
    ]);

    tray.setContextMenu(contextMenu);
  }

  tray.on('click', onOpenDashboard);

  updateSummary({
    overview: {
      totalBalanceUsd: 0,
      todayCostUsd: 0,
      monthCostUsd: 0,
      runwayDaysLabel: '--'
    }
  });

  return {
    tray,
    updateSummary
  };
};
