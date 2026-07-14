const { spawn } = require('node:child_process');
const path = require('node:path');

const clientPort = process.argv[2] || '15173';
const backendPort = process.argv[3] || '18000';
const rootDirectory = path.resolve(__dirname, '..');
const npmCli = path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const environment = {
  ...process.env,
  VITE_API_URL: '/api',
  VITE_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
};

const server = spawn(
  process.execPath,
  [npmCli, 'run', 'dev:laravel-local', '--workspace=client', '--', '--host=127.0.0.1', `--port=${clientPort}`, '--strictPort'],
  { cwd: rootDirectory, env: environment, stdio: 'inherit' },
);

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
