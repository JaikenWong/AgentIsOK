const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_HOOK_EVENTS = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'PermissionRequest'
];

const CODEX_HOOK_EVENTS = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'Stop'
];

class ConfigInjector {
    static injectClaude() {
        const configPath = path.join(os.homedir(), '.claude', 'settings.json');

        if (!fs.existsSync(configPath)) {
            console.log('Claude settings not found at:', configPath);
            return;
        }

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config.hooks = config.hooks || {};

            for (const eventName of CLAUDE_HOOK_EVENTS) {
                const existing = config.hooks[eventName] || [];
                const managedKey = 'ThatIsOk';
                const managedEntry = {
                    matcher: '*',
                    hooks: [
                        {
                            type: 'command',
                            command: this.buildBridgeCommand('claude', eventName),
                            timeout: eventName === 'PermissionRequest' ? 86400 : 10
                        }
                    ],
                    _managedBy: managedKey
                };

                const filtered = existing.filter(
                    (entry) => entry && entry._managedBy !== managedKey
                );
                config.hooks[eventName] = [...filtered, managedEntry];
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('Successfully injected ThatIsOk hooks into Claude settings.');
        } catch (err) {
            console.error('Failed to inject into Claude settings:', err);
        }
    }

    static injectCodex() {
        const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');

        try {
            const config = fs.existsSync(hooksPath)
                ? JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
                : { hooks: {} };

            config.hooks = config.hooks || {};

            for (const eventName of CODEX_HOOK_EVENTS) {
                const existing = config.hooks[eventName] || [];
                const managedKey = 'ThatIsOk';
                const managedEntry = {
                    hooks: [
                        {
                            type: 'command',
                            command: this.buildBridgeCommand('codex', eventName),
                            timeout: 10
                        }
                    ],
                    _managedBy: managedKey
                };

                const filtered = existing.filter(
                    (entry) => entry && entry._managedBy !== managedKey
                );
                config.hooks[eventName] = [...filtered, managedEntry];
            }

            fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
            fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
            console.log('Successfully injected ThatIsOk hooks into Codex hooks.');
        } catch (err) {
            console.error('Failed to inject into Codex hooks:', err);
        }
    }

    static uninjectClaude() {
        const configPath = path.join(os.homedir(), '.claude', 'settings.json');

        if (!fs.existsSync(configPath)) {
            return;
        }

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.hooks) {
                return;
            }

            for (const eventName of CLAUDE_HOOK_EVENTS) {
                if (config.hooks[eventName]) {
                    config.hooks[eventName] = config.hooks[eventName].filter(
                        (entry) => entry && entry._managedBy !== 'ThatIsOk'
                    );
                    if (config.hooks[eventName].length === 0) {
                        delete config.hooks[eventName];
                    }
                }
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('Removed ThatIsOk hooks from Claude settings.');
        } catch (err) {
            console.error('Failed to uninject Claude settings:', err);
        }
    }

    static uninjectCodex() {
        const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');

        if (!fs.existsSync(hooksPath)) {
            return;
        }

        try {
            const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
            if (!config.hooks) {
                return;
            }

            for (const eventName of CODEX_HOOK_EVENTS) {
                if (config.hooks[eventName]) {
                    config.hooks[eventName] = config.hooks[eventName].filter(
                        (entry) => entry && entry._managedBy !== 'ThatIsOk'
                    );
                    if (config.hooks[eventName].length === 0) {
                        delete config.hooks[eventName];
                    }
                }
            }

            fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
            console.log('Removed ThatIsOk hooks from Codex hooks.');
        } catch (err) {
            console.error('Failed to uninject Codex hooks:', err);
        }
    }

    static getClaudeStatus() {
        const configPath = path.join(os.homedir(), '.claude', 'settings.json');
        if (!fs.existsSync(configPath)) {
            return { installed: false, reason: 'settings.json not found' };
        }

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const hooks = config.hooks || {};
            const installed = CLAUDE_HOOK_EVENTS.some(
                (event) => hooks[event] && hooks[event].some(
                    (entry) => entry && entry._managedBy === 'ThatIsOk'
                )
            );
            return { installed };
        } catch (err) {
            return { installed: false, reason: err.message };
        }
    }

    static getCodexStatus() {
        const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
        if (!fs.existsSync(hooksPath)) {
            return { installed: false, reason: 'hooks.json not found' };
        }

        try {
            const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
            const hooks = config.hooks || {};
            const installed = CODEX_HOOK_EVENTS.some(
                (event) => hooks[event] && hooks[event].some(
                    (entry) => entry && entry._managedBy === 'ThatIsOk'
                )
            );
            return { installed };
        } catch (err) {
            return { installed: false, reason: err.message };
        }
    }

    static buildBridgeCommand(source, eventName) {
        const bridgePath = path.join(process.cwd(), 'bridge', 'hook-bridge.js');
        if (process.platform === 'win32') {
            const escaped = bridgePath.replace(/"/g, '\\"');
            return `cmd /d /s /c "node \\"${escaped}\\" --source ${source} --event ${eventName}"`;
        }

        return `"/usr/bin/env" node "${bridgePath}" --source ${source} --event ${eventName}`;
    }
}

module.exports = ConfigInjector;
