const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'.'),hash=crypto.createHash('sha256');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()){hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));}}}
for(const item of ['addin','node-host'])walk(path.join(root,item));
hash.update(fs.readFileSync(path.join(root,'package-lock.json')));
fs.writeFileSync(path.join(root,'build-id'),hash.digest('hex')+'\n');
