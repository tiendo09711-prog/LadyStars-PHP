const fs = require('fs');
const file = 'e2e/tests/care-visual-check.spec.ts';
let s = fs.readFileSync(file, 'utf8');
if (!s.includes('loginViaNodeOnce')) {
  s = s.replace('function loginViaNode(): Promise<string> {\n  return new Promise((resolve, reject) => {', 'function loginViaNodeOnce(): Promise<string> {\n  return new Promise((resolve, reject) => {');
}
const retryFn = `async function loginViaNode(): Promise<string> {
  let lastErr: Error | null = null;
  for (let i = 0; i < 6; i++) {
    try { return await loginViaNodeOnce(); } catch (e) { lastErr = e as Error; await new Promise((r) => setTimeout(r, 400)); }
  }
  throw lastErr || new Error('login failed');
}
`;
// Replace any existing loginViaNode declaration (the one without 'Once') with retry wrapper
s = s.replace(/async function loginViaNode\(\): Promise<string> \{[\s\S]*?\n\}\n/, retryFn);
if (!s.includes('async function loginViaNode')) {
  // fallback: insert retryFn before the original 'function loginViaNodeOnce'
  s = s.replace('function loginViaNodeOnce()', retryFn + 'function loginViaNodeOnce()');
}
fs.writeFileSync(file, s);
console.log('done; hasRetry=', s.includes('async function loginViaNode'), 'hasOnce=', s.includes('loginViaNodeOnce'));
