const sharp=require('/Users/lenquanhone/Projects/pholio-app/node_modules/sharp');const fs=require('fs');
const dir=process.argv[2], out=process.argv[3]; const files=fs.readdirSync(dir).filter(f=>f.endsWith('.jpg')).sort();
(async()=>{const W=160,H=220,cols=9;const rows=Math.ceil(files.length/cols);const comps=[];
for(let i=0;i<files.length;i++){const buf=await sharp(dir+'/'+files[i]).resize(W,H,{fit:'contain',background:'#fff'}).toBuffer();
const label=Buffer.from(`<svg width="${W}" height="18"><rect width="${W}" height="18" fill="black"/><text x="3" y="14" font-size="13" fill="yellow">${i}</text></svg>`);
comps.push({input:buf,left:(i%cols)*W,top:Math.floor(i/cols)*(H+18)+18},{input:label,left:(i%cols)*W,top:Math.floor(i/cols)*(H+18)});
console.log(i,files[i]);}
await sharp({create:{width:cols*W,height:rows*(H+18),channels:3,background:'#888'}}).composite(comps).jpeg().toFile(out);})();
