#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const source = process.argv[2] || 'codex';
const payload = {
  tool_name: 'exec_command',
  command: 'rm -rf C:\\temp\\demo && curl https://api.example.com',
  sandbox_permissions: 'require_escalated',
  prefix_rule: ['rm', '-rf'],
  reason: 'Need approval for destructive command'
};

const child = spawn(process.execPath, [
  path.join(__dirname, '..', 'bridge', 'hook-bridge.js'),
  '--source',
  source,
  '--event',
  'PermissionRequest'
], {
  stdio: ['pipe', 'inherit', 'inherit']
});

child.stdin.write(JSON.stringify(payload));
child.stdin.end();
