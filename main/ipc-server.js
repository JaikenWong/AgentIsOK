const net = require('net');
const { getIpcConfig } = require('../shared/ipc-config');

class IPCServer {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.server = null;
        this.bufferBySocket = new WeakMap();
    }

    start() {
        const config = getIpcConfig();
        this.server = net.createServer((socket) => {
            try {
                console.log('Bridge client connected');
            } catch (e) {
                // Ignore console errors during shutdown
            }

            socket.on('error', (err) => {
                // Client disconnected abruptly - ignore
            });

            socket.on('data', (data) => {
                this.handleSocketData(socket, data);
            });

            socket.on('close', () => {
                this.bufferBySocket.delete(socket);
            });
        });

        this.server.on('error', (err) => {
            // Server-level errors - log but don't crash
            console.error('IPC Server error:', err.message);
        });

        if (config.mode === 'pipe') {
            this.server.listen(config.pipeName, () => {
                console.log(`IPC Server listening on ${config.pipeName}`);
            });
            return;
        }

        this.server.listen(config.port, config.host, () => {
            console.log(`IPC Server listening on ${config.host}:${config.port}`);
        });
    }

    handleSocketData(socket, chunk) {
        const previous = this.bufferBySocket.get(socket) || '';
        const next = previous + chunk.toString();
        const messages = next.split('\n');
        this.bufferBySocket.set(socket, messages.pop() || '');

        for (const line of messages) {
            if (!line.trim()) {
                continue;
            }

            try {
                const message = JSON.parse(line);
                this.handleMessage(message, socket);
            } catch (err) {
                console.error('Failed to parse IPC message:', err);
            }
        }
    }

    handleMessage(message, socket) {
        if (this.callbacks[message.event]) {
            this.callbacks[message.event](message.data, (response) => {
                try {
                    socket.write(`${JSON.stringify(response)}\n`);
                } catch (e) {
                    // Socket may have closed - ignore
                }
            });
        }
    }
}

module.exports = { IPCServer };
