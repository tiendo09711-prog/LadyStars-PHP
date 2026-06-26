const fs=require('fs'),path=require('path');
const dir='client/src/modules/sales';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.tsx'));
for(const f of files){
  const src=fs.readFileSync(path.join(dir,f),'utf8');
  const set=new Set();
  const re=/className=(?:\{`([^`]+)`|"([^"]+)"|'([^']+)'|\{([^}]+)\})/g;
  let m;
  while((m=re.exec(src))){
    const raw=m[1]||m[2]||m[3]||m[4]||'';
    raw.split(/\s+/).forEach(tok=>{const t=tok.replace(/[\$\{\}]/g,'').trim();if(t&&/^[a-zA-Z]/.test(t))set.add(t);});
  }
  console.log('### '+f);
  console.log([...set].sort().join(' '));
}
