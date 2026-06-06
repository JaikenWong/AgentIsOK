#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const projectRoot = path.join(__dirname, '..');

// Launch the Electron app and pass the command to it
const electron = spawn('npx', ['electron', projectRoot, ...args], {
    stdio: 'inherit',
    detached: false
});

electron.on('exit', (code) => {
    process.exit(code);
});
