#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_SOURCE = path.join(__dirname, '..', 'plugins', 'opencode-plugin.js');

function getPluginDir() {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'opencode', 'plugins');
    }
    return path.join(os.homedir(), '.config', 'opencode', 'plugins');
}

function getPluginDest() {
    return path.join(getPluginDir(), 'thatisok-plugin.js');
}

function install() {
    if (!fs.existsSync(PLUGIN_SOURCE)) {
        console.error('Plugin source not found:', PLUGIN_SOURCE);
        process.exit(1);
    }

    const dest = getPluginDest();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(PLUGIN_SOURCE, dest);
    console.log('OpenCode plugin installed to:', dest);
    console.log('Restart OpenCode to activate.');
}

function uninstall() {
    const dest = getPluginDest();
    if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
        console.log('OpenCode plugin removed.');
    } else {
        console.log('Plugin not installed.');
    }
}

function status() {
    const dest = getPluginDest();
    const installed = fs.existsSync(dest);
    console.log('OpenCode plugin:', installed ? 'installed' : 'not installed');
    if (installed) {
        console.log('Location:', dest);
    }
}

const command = process.argv[2];
switch (command) {
    case 'install':
        install();
        break;
    case 'uninstall':
        uninstall();
        break;
    case 'status':
        status();
        break;
    default:
        console.log('Usage: node install-opencode-plugin.js [install|uninstall|status]');
}
