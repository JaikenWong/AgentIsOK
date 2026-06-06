const pty = require('node-pty');
const os = require('os');

class PTYManager {
    constructor(window, watcher) {
        this.window = window;
        this.watcher = watcher;
        this.ptyProcess = null;
        this.shell = os.platform() === 'win32' ? 'powershell.exe' : 'zsh';
    }

    start(command, args = []) {
        const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh';
        
        try {
            this.ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: process.cwd(),
                env: process.env
            });

            console.log(`PTY started with shell: ${shell}`);

            // If a command was passed, execute it in the shell
            if (command) {
                const fullCommand = `${command} ${args.join(' ')}\r`;
                console.log(`Executing in PTY: ${fullCommand}`);
                this.ptyProcess.write(fullCommand);
            }

            this.ptyProcess.onData(data => {
                process.stdout.write(data);
                this.watcher.parseContent(data);
            });

            this.ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`Process exited with code ${exitCode}`);
            });
        } catch (err) {
            console.error('Failed to spawn PTY:', err);
        }
    }

    write(data) {
        if (this.ptyProcess) {
            this.ptyProcess.write(data);
        }
    }

    kill() {
        if (this.ptyProcess) {
            this.ptyProcess.kill();
        }
    }
}

module.exports = PTYManager;
