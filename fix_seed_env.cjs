const fs = require('fs');
const file = 'server/src/scripts/seed-care-e2e-user.ts';
let s = fs.readFileSync(file, 'utf8');
s = s.replace("import 'dotenv/config';", "import dotenv from 'dotenv';\ndotenv.config({ path: '.env.e2e.local' });\ndotenv.config({ path: '.env' });");
fs.writeFileSync(file, s);
console.log('patched');
