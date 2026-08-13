/**
 * diagnose-msi.mjs  —  Run: node scripts/diagnose-msi.mjs /path/to/file.msi
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CFB = require('cfb');

const msiPath = process.argv[2];
if (!msiPath) { console.error('Usage: node scripts/diagnose-msi.mjs <path.msi>'); process.exit(1); }

const data = new Uint8Array(readFileSync(msiPath));
const cfb  = CFB.read(data, { type: 'array' });

const TABLE_PREFIX = '\u4840';
function mime2utf(x) {
  if (x < 10) return String.fromCharCode(x+48);
  if (x < 36) return String.fromCharCode(x-10+65);
  if (x < 62) return String.fromCharCode(x-36+97);
  if (x===62) return '.'; return '_';
}
function utf2mime(c) {
  const code = typeof c==='number'?c:c.charCodeAt(0);
  if(code>=48&&code<=57) return code-48;
  if(code>=65&&code<=90) return code-65+10;
  if(code>=97&&code<=122) return code-97+36;
  if(code===46) return 62; if(code===95) return 63; return null;
}
function encode(name,isTable=false) {
  let out=isTable?TABLE_PREFIX:'';
  for(let i=0;i<name.length;i++){
    const v1=utf2mime(name[i]);
    if(v1!==null){if(i+1<name.length){const v2=utf2mime(name[i+1]);if(v2!==null){out+=String.fromCharCode(0x3800+(v2<<6)+v1);i++;continue;}}out+=String.fromCharCode(0x4800+v1);}else{out+=name[i];}
  }
  return out;
}
function decode(name) {
  let out='',start=0;
  if(name.startsWith(TABLE_PREFIX))start=1;
  for(let i=start;i<name.length;i++){
    const v=name.charCodeAt(i);
    if(v>=0x3800&&v<0x4800){const d=v-0x3800;out+=mime2utf(d&0x3F);out+=mime2utf(d>>6);}
    else if(v>=0x4800&&v<=0x487F){out+=mime2utf(v-0x4800);}else{out+=name[i];}
  }
  return out;
}
function toU8(c){
  if(c instanceof Uint8Array)return c;
  if(c instanceof ArrayBuffer)return new Uint8Array(c);
  if(ArrayBuffer.isView(c))return new Uint8Array(c.buffer,c.byteOffset,c.byteLength);
  if(Array.isArray(c))return new Uint8Array(c);
  if(c&&typeof c.buffer==='object')return new Uint8Array(c.buffer,c.byteOffset,c.byteLength);
  return new Uint8Array(0);
}
function find(name,isTable){
  const e1=encode(name,true),e2=encode(name,false);
  for(const e of cfb.FileIndex){if(!e.content)continue;if(e.name===e1||e.name===e2||e.name===name||decode(e.name)===name)return e;}
  return null;
}

console.log('\n=== CFB STREAMS ===');
for(const e of cfb.FileIndex){
  const cps=[...(e.name||'')].map(c=>'0x'+c.charCodeAt(0).toString(16)).join(' ');
  const dec=decode(e.name||'');
  const sz=e.content?(e.content.length||e.content.byteLength||0):0;
  console.log(`  name=${JSON.stringify(e.name)}  codepoints=[${cps}]  decoded="${dec}"  size=${sz}`);
}

console.log('\n=== STREAM LOOKUP ===');
for(const [nm,isT] of [['_StringPool',true],['_StringData',true],['Property',true]]){
  const f=find(nm,isT);
  const sz=f?(f.content.length||f.content.byteLength||0):0;
  console.log(f?`  OK  "${nm}" → "${f.name}" (${sz} bytes)`:(`  MISS "${nm}"  searched: ${JSON.stringify(encode(nm,true))} or ${JSON.stringify(encode(nm,false))}`));
}

const pe=find('_StringPool',true), de=find('_StringData',true);
if(pe&&de){
  const pb=toU8(pe.content),db=toU8(de.content);
  const pv=new DataView(pb.buffer,pb.byteOffset,pb.byteLength);
  const hdr=pv.getUint32(0,true);
  const longRefs=!!(hdr&0x80000000), cp=hdr&0x7FFFFFFF;
  console.log(`\n=== STRING POOL ===`);
  console.log(`  header=0x${hdr.toString(16)}  codepage=${cp}  longRefs=${longRefs}  poolSize=${pb.length}  dataSize=${db.length}`);
  const dec2=new TextDecoder('utf-8',{fatal:false});
  const strs=[]; let pos=4,doff=0;
  while(pos+3<pb.length){
    let len=pv.getUint16(pos,true);pos+=2;
    let ref=pv.getUint16(pos,true);pos+=2;
    if(len===0&&ref>0){if(pos+3<pb.length){len=pv.getUint32(pos,true);pos+=4;}}
    if(len>0&&doff+len<=db.length){strs.push(dec2.decode(db.slice(doff,doff+len)));doff+=len;}else{strs.push('');}
  }
  console.log(`  total strings: ${strs.length}`);
  console.log('\n  First 30 strings (0-indexed, DB refs are 1-based):');
  for(let i=0;i<Math.min(30,strs.length);i++) console.log(`  [${i}] ref=${i+1}: "${strs[i]}"`);

  const pr=find('Property',true);
  if(pr){
    const prb=toU8(pr.content);
    console.log(`\n=== PROPERTY TABLE (${prb.length} bytes) ===`);
    const prv=new DataView(prb.buffer,prb.byteOffset,prb.byteLength);
    for(const rw of [2,3]){
      const stride=rw*2;
      if(prb.length%stride!==0){console.log(`  refWidth=${rw}: NOT divisible by stride ${stride}`);continue;}
      const nRows=prb.length/stride, col1=nRows*rw;
      console.log(`\n  refWidth=${rw}, ${nRows} rows:`);
      for(let r=0;r<Math.min(nRows,25);r++){
        let ki=prv.getUint16(r*rw,true); if(rw===3)ki|=(prv.getUint8(r*rw+2)<<16);
        let vi=prv.getUint16(col1+r*rw,true); if(rw===3)vi|=(prv.getUint8(col1+r*rw+2)<<16);
        const k=ki===0?'(null)':(ki-1<strs.length?strs[ki-1]:`(OOB:${ki})`);
        const v=vi===0?'(null)':(vi-1<strs.length?strs[vi-1]:`(OOB:${vi})`);
        console.log(`    row ${String(r).padStart(2)}: key=[ref ${ki}]"${k}"  val=[ref ${vi}]"${v}"`);
      }
    }
  }
}
