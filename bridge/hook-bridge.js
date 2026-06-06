#!/usr/bin/env node
const net = require('net');
const { getIpcConfig } = require('../shared/ipc-config');

const args = process.argv.slice(2);
const source = getArgValue('--source') || 'unknown';
const eventName = getArgValue('--event') || 'unknown';
let lastPayload = null;

let inputData = '';
process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    flush(inputData);
});

if (process.stdin.isTTY) {
    const fallback = getFallbackText();
    flush(fallback);
}

function flush(data) {
    const config = getIpcConfig();
    const onConnect = () => {
        client.write(`${JSON.stringify(buildHookMessage(data))}\n`);
    };
    const client = config.mode === 'pipe'
        ? net.createConnection(config.pipeName, onConnect)
        : net.createConnection(config.port, config.host, onConnect);
    wireClient(client);
}

function buildHookMessage(data) {
    lastPayload = parsePayload(data);
    return {
        event: 'hook-event',
        data: {
            source,
            event: eventName,
            raw: data,
            payload: lastPayload
        }
    };
}

function wireClient(client) {
    let buffer = '';
    client.on('data', (response) => {
        buffer += response.toString();
        const messages = buffer.split('\n');
        buffer = messages.pop() || '';

        for (const line of messages) {
            if (!line.trim()) {
                continue;
            }
            handleResponse(JSON.parse(line));
        }
    });

    client.on('error', () => {
        process.exit(0);
    });

    const isBlocking = eventName.toLowerCase() === 'permissionrequest'
        || eventName.toLowerCase() === 'pretooluse';
    const timeoutMs = isBlocking ? 86400000 : 5000;
    setTimeout(() => process.exit(0), timeoutMs);
}

function handleResponse(response) {
    if (eventName.toLowerCase() === 'permissionrequest') {
        handlePermissionResponse(response);
        return;
    }

    if (eventName.toLowerCase() === 'pretooluse') {
        handlePreToolUseResponse(response);
        return;
    }

    process.exit(0);
}

function handlePermissionResponse(response) {
    if (response && response.requiresDecision) {
        const output = source === 'claude'
            ? buildClaudePermissionOutput(response)
            : buildCodexPermissionOutput(response);
        const exitCode = source === 'codex'
            ? (response && response.approved ? 0 : 2)
            : 0;

        process.stdout.write(`${JSON.stringify(output)}\n`, () => {
            process.exit(exitCode);
        });
        return;
    }

    const exitCode = source === 'codex'
        ? (response && response.approved ? 0 : 2)
        : 0;
    process.exit(exitCode);
}

function handlePreToolUseResponse(response) {
    if (response && response.requiresDecision) {
        const output = source === 'claude'
            ? buildClaudePreToolUseOutput(response)
            : buildCodexPreToolUseOutput(response);
        const exitCode = source === 'codex'
            ? (response && response.approved ? 0 : 2)
            : 0;

        process.stdout.write(`${JSON.stringify(output)}\n`, () => {
            process.exit(exitCode);
        });
        return;
    }

    process.exit(0);
}

function buildCodexPermissionOutput(response) {
    const output = {
        behavior: response.approved ? 'allow' : 'deny'
    };

    if (response.allowPersistent) {
        output.allow_persistent = true;
    }
    if (!response.approved) {
        output.message = 'Denied from ThatIsOk';
    }

    return output;
}

function buildClaudePermissionOutput(response) {
    const decision = {
        behavior: response.approved ? 'allow' : 'deny'
    };

    if (response.approved && response.allowPersistent) {
        const updatedPermissions = extractClaudeUpdatedPermissions(lastPayload);
        if (updatedPermissions.length) {
            decision.updatedPermissions = updatedPermissions;
        }
    }

    if (!response.approved) {
        decision.message = 'Denied from ThatIsOk';
    }

    return {
        hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision
        }
    };
}

function buildClaudePreToolUseOutput(response) {
    const decision = {
        behavior: response.approved ? 'allow' : 'deny'
    };

    if (!response.approved) {
        decision.message = 'Denied from ThatIsOk';
    }

    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            decision
        }
    };
}

function buildCodexPreToolUseOutput(response) {
    return {
        behavior: response.approved ? 'allow' : 'deny'
    };
}

function extractClaudeUpdatedPermissions(payload) {
    if (!payload || !Array.isArray(payload.permission_suggestions)) {
        return [];
    }

    return payload.permission_suggestions.filter((entry) => entry && entry.behavior === 'allow');
}

function parsePayload(data) {
    if (!data || !String(data).trim()) {
        return null;
    }

    try {
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

function getArgValue(flag) {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
}

function getFallbackText() {
    const filtered = [];
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        if (value === '--source' || value === '--event') {
            index += 1;
            continue;
        }
        filtered.push(value);
    }

    return filtered.join(' ');
}
