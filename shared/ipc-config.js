const os = require('os');

const WINDOWS_PIPE = '\\\\.\\pipe\\thatisok_bridge';
const TCP_HOST = '127.0.0.1';
const TCP_PORT = 45873;

function getIpcConfig() {
  if (os.platform() === 'win32') {
    return {
      mode: 'pipe',
      pipeName: WINDOWS_PIPE
    };
  }

  return {
    mode: 'tcp',
    host: TCP_HOST,
    port: TCP_PORT,
    debugName: `${TCP_HOST}:${TCP_PORT}`
  };
}

module.exports = {
  getIpcConfig
};
