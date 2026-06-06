const net = require('net');
const path = require('path');
const os = require('os');

const TCP_HOST = '127.0.0.1';
const TCP_PORT = 45873;

function getIpcConfig() {
    return { mode: 'tcp', host: TCP_HOST, port: TCP_PORT };
}

function sendToBridge(eventName, data) {
    return new Promise((resolve) => {
        const config = getIpcConfig();
        const message = JSON.stringify({
            event: 'hook-event',
            data: {
                source: 'opencode',
                event: eventName,
                raw: JSON.stringify(data),
                payload: data
            }
        }) + '\n';

        const client = net.createConnection(config.port, config.host, () => {
            client.write(message);
        });

        let buffer = '';
        client.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        resolve(JSON.parse(line));
                    } catch (e) {
                        resolve(null);
                    }
                }
            }
        });

        client.on('error', () => resolve(null));
        setTimeout(() => {
            client.destroy();
            resolve(null);
        }, 5000);
    });
}

module.exports = function createPlugin(api) {
    const plugin = {
        name: 'thatisok',
        version: '1.0.0',

        async onSessionStart(session) {
            await sendToBridge('SessionStart', {
                session_id: session?.id || 'unknown',
                model: session?.model || 'unknown'
            });
        },

        async onStop(session) {
            await sendToBridge('Stop', {
                session_id: session?.id || 'unknown'
            });
        },

        async onUserPromptSubmit(prompt) {
            await sendToBridge('UserPromptSubmit', {
                prompt: typeof prompt === 'string' ? prompt.slice(0, 200) : ''
            });
        },

        async onPreToolUse(toolName, toolInput) {
            const result = await sendToBridge('PreToolUse', {
                tool_name: toolName,
                tool_input: toolInput
            });

            if (result && result.requiresDecision) {
                return {
                    behavior: result.approved ? 'allow' : 'deny'
                };
            }

            return undefined;
        },

        async onPostToolUse(toolName, toolInput, output) {
            await sendToBridge('PostToolUse', {
                tool_name: toolName,
                tool_input: toolInput
            });
        },

        async onPermissionRequest(request) {
            const result = await sendToBridge('PermissionRequest', {
                tool_name: request?.tool || 'unknown',
                tool_input: request?.input || {},
                command: request?.command || '',
                permission_mode: request?.mode || ''
            });

            if (result && result.requiresDecision) {
                return {
                    behavior: result.approved ? 'allow' : 'deny',
                    message: result.approved ? 'Approved via ThatIsOk' : 'Denied via ThatIsOk'
                };
            }

            return undefined;
        }
    };

    return plugin;
};
