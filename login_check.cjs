require('dotenv').config({ path: '.env.e2e.local' });
const http = require('http');
const body = JSON.stringify({ email: process.env.E2E_AUTH_EMAIL, password: process.env.E2E_AUTH_PASSWORD });
const req = http.request({ hostname: 'localhost', port: 4100, path: '/api/auth/login', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => console.log('STATUS', res.statusCode, 'BODY', data.slice(0, 300)));
});
req.on('error', (e) => console.log('ERR', e.message));
req.write(body);
req.end();
