const fs = require('fs');
const path = require('path');
const os = require('os');

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
            config.hooks.PermissionRequest = [
                {
                    matcher: '*',
                    hooks: [
                        {
                            type: 'command',
                            command: this.buildBridgeCommand('claude', 'PermissionRequest'),
                            timeout: 86400
                        }
                    ]
                }
            ];

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('Successfully injected ThatIsOk hook into Claude settings.');
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
            config.hooks.PermissionRequest = [
                {
                    hooks: [
                        {
                            type: 'command',
                            command: this.buildBridgeCommand('codex', 'PermissionRequest'),
                            timeout: 86400
                        }
                    ]
                }
            ];

            fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
            fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
            console.log('Successfully injected ThatIsOk hook into Codex hooks.');
        } catch (err) {
            console.error('Failed to inject into Codex hooks:', err);
        }
    }

    static buildBridgeCommand(source, eventName) {
        const bridgePath = path.join(process.cwd(), 'bridge', 'hook-bridge.js');
        if (process.platform === 'win32') {
            return `cmd /d /s /c "node \\"${bridgePath}\\" --source ${source} --event ${eventName}"`;
        }

        return `"/usr/bin/env" node "${bridgePath}" --source ${source} --event ${eventName}`;
    }
}

module.exports = ConfigInjector;
