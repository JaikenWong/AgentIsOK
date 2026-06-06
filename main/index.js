const { app, BrowserWindow, ipcMain, nativeImage, screen, globalShortcut } = require('electron');
const path = require('path');

const Watcher = require('./watcher');
const SessionStore = require('./session-store');
const UsageStore = require('./storage/usage-store');
const { IPCServer } = require('./ipc-server');
const ConfigInjector = require('./config-injector');
const createTray = require('./tray');
const SyncService = require('./services/sync-service');
const InterventionManager = require('./intervention-manager');
const { LocalAPI } = require('./local-api');

let islandWindow;
let trayController;
let sessionStore;
let usageStore;
let watcher;
let syncService;
let ipcServer;
let syncTimer;
let interventionManager;
let localAPI;

const WINDOW_SIZES = {
  pill: { width: 248, height: 56 },
  expanded: { width: 356, height: 404 }
};

function getTopCenterBounds(size) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    width: size.width,
    height: size.height,
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + 12)
  };
}

function createIslandWindow() {
  const bounds = getTopCenterBounds(WINDOW_SIZES.pill);

  islandWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // islandWindow.webContents.openDevTools({ mode: 'detach' });
  islandWindow.once('ready-to-show', () => islandWindow.showInactive());
}

function broadcastSummary() {
  if (!usageStore) {
    return;
  }

  const summary = usageStore.getDashboardData();
  summary.sessions = sessionStore ? sessionStore.getActiveSessions() : [];

  if (trayController) {
    trayController.updateSummary(summary);
  }

  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('island-data', summary);
    islandWindow.webContents.send('intervention-state', interventionManager ? interventionManager.getPending() : null);
  }
}

async function syncNow() {
  if (!syncService) {
    return;
  }

  try {
    await syncService.syncAllAccounts();
  } catch (error) {
    console.error('Sync failed:', error);
  }

  broadcastSummary();
}

function setIslandMode(mode = 'pill') {
  if (!islandWindow || islandWindow.isDestroyed()) {
    return;
  }

  const size = mode === 'expanded' ? WINDOW_SIZES.expanded : WINDOW_SIZES.pill;
  islandWindow.setBounds(getTopCenterBounds(size), true);
}

function setupIPC() {
  ipcMain.handle('island:get-data', () => usageStore.getDashboardData());
  ipcMain.handle('island:get-intervention', () => interventionManager ? interventionManager.getPending() : null);
  ipcMain.handle('island:sync-now', async () => {
    await syncNow();
    return usageStore.getDashboardData();
  });
  ipcMain.on('island:set-mode', (_event, mode) => {
    setIslandMode(mode);
  });
  ipcMain.on('intervention:respond', (_event, decision) => {
    if (interventionManager) {
      interventionManager.respond(decision);
    }
  });

  ipcMain.handle('hooks:get-status', () => {
    return {
      claude: ConfigInjector.getClaudeStatus(),
      codex: ConfigInjector.getCodexStatus()
    };
  });

  ipcMain.handle('hooks:install', (_event, target) => {
    if (target === 'claude') {
      ConfigInjector.injectClaude();
    } else if (target === 'codex') {
      ConfigInjector.injectCodex();
    }
    return {
      claude: ConfigInjector.getClaudeStatus(),
      codex: ConfigInjector.getCodexStatus()
    };
  });

  ipcMain.handle('hooks:uninstall', (_event, target) => {
    if (target === 'claude') {
      ConfigInjector.uninjectClaude();
    } else if (target === 'codex') {
      ConfigInjector.uninjectCodex();
    }
    return {
      claude: ConfigInjector.getClaudeStatus(),
      codex: ConfigInjector.getCodexStatus()
    };
  });

  ipcMain.handle('providers:get-visibility', () => {
    return syncService.registry.getProviderVisibility();
  });

  ipcMain.on('providers:set-visibility', (_event, provider, visible) => {
    syncService.registry.setProviderVisibility(provider, visible);
    syncNow();
  });
}

function setupBridgeServer() {
  ipcServer = new IPCServer({
    'hook-event': async (data, callback) => {
      if (sessionStore) {
        sessionStore.upsertSession(data);
      }
      const result = await watcher.handleHookEvent(data, interventionManager);
      broadcastSummary();
      callback(result || { ok: true });
    }
  });

  ipcServer.start();
}

async function createApp() {
  sessionStore = new SessionStore();
  usageStore = new UsageStore();
  watcher = new Watcher(usageStore);
  syncService = new SyncService(usageStore);
  interventionManager = new InterventionManager();
  interventionManager.setOnChange((pending) => {
    if (!islandWindow || islandWindow.isDestroyed()) {
      return;
    }

    islandWindow.webContents.send('intervention-state', pending);
    if (pending) {
      setIslandMode('expanded');
      islandWindow.showInactive();
      islandWindow.webContents.send('island-force-expand');
    }
  });

  createIslandWindow();
  trayController = createTray({
    icon: nativeImage.createEmpty(),
    onOpenDashboard: async () => {
      if (islandWindow) {
        islandWindow.showInactive();
        setIslandMode('expanded');
        islandWindow.webContents.send('island-force-expand');
        broadcastSummary();
      }
    },
    onRefresh: syncNow,
    onQuit: () => {
      app.isQuiting = true;
      app.quit();
    }
  });

  setupIPC();
  setupBridgeServer();
  ConfigInjector.injectClaude();
  ConfigInjector.injectCodex();

  localAPI = new LocalAPI(usageStore, interventionManager);
  localAPI.start();

  registerGlobalShortcuts();

  await syncNow();

  const intervalMinutes = syncService.defaultsConfig.syncIntervalMinutes || 10;
  syncTimer = setInterval(syncNow, intervalMinutes * 60 * 1000);
}

app.whenReady().then(createApp);

app.on('activate', () => {
  if (islandWindow) {
    islandWindow.showInactive();
    broadcastSummary();
  }
});

app.on('window-all-closed', () => {});

function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (islandWindow && !islandWindow.isDestroyed()) {
      if (islandWindow.isVisible()) {
        setIslandMode('pill');
      } else {
        islandWindow.showInactive();
        setIslandMode('expanded');
        broadcastSummary();
      }
    }
  });

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (interventionManager && interventionManager.getPending()) {
      interventionManager.respond('approve');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (interventionManager && interventionManager.getPending()) {
      interventionManager.respond('deny');
    }
  });
}

app.on('before-quit', () => {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  if (localAPI) {
    localAPI.stop();
  }
});
