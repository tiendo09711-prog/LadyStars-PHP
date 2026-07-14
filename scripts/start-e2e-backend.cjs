const { spawn } = require('node:child_process');
const path = require('node:path');

const port = process.argv[2] || '18000';
const backendDirectory = path.resolve(__dirname, '..', 'backend');
const environment = {
  ...process.env,
  APP_ENV: 'testing',
  APP_DEBUG: 'false',
  APP_URL: `http://127.0.0.1:${port}`,
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: ':memory:',
  SESSION_DRIVER: 'array',
  CACHE_STORE: 'array',
  QUEUE_CONNECTION: 'sync',
  MAIL_MAILER: 'array',
};

const server = spawn(
  'php',
  ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`, '--no-reload'],
  { cwd: backendDirectory, env: environment, stdio: 'inherit' },
);

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
