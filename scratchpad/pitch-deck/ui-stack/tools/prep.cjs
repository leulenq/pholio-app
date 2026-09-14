const sharp=require('/Users/lenquanhone/Projects/pholio-app/node_modules/sharp');const fs=require('fs');
const P='/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack/photos';
const people=JSON.parse(fs.readFileSync(P+'/../people.json','utf8'));
(async()=>{for(const p of people){const src=`${P}/cand/${p.photo}.jpg`;const d=`${P}/${p.slug}`;fs.mkdirSync(d,{recursive:true});
const m=await sharp(src).metadata();const W=m.width,H=m.height;
// full length: whole frame fit to 2:3 cover (keep as is if portrait)
await sharp(src).resize(900,1350,{fit:'cover',position:'attention'}).jpeg({quality:88}).toFile(`${d}/full.jpg`);
// headshot: top ~55% region then 4:5 attention crop
const hh=Math.round(H*(p.headFrac||0.6));const hw=Math.min(W,Math.round(hh*0.8));
const hx=Math.max(0,Math.min(W-hw,Math.round(W*(p.faceX??0.5)-hw/2)));
await sharp(src).extract({left:hx,top:Math.round(H*(p.headTop||0)),width:hw,height:Math.min(hh,H-Math.round(H*(p.headTop||0)))}).resize(900,1125,{fit:'cover',position:'north'}).jpeg({quality:88}).toFile(`${d}/headshot.jpg`);
// profile: tighter crop offset, 4:5
const ph=Math.round(H*0.78);const pw=Math.min(W,Math.round(ph*0.8));const px=Math.max(0,Math.min(W-pw,Math.round(W*(p.faceX??0.5)-pw*0.4)));
await sharp(src).extract({left:px,top:0,width:pw,height:ph}).resize(900,1125,{fit:'cover'}).jpeg({quality:88}).toFile(`${d}/profile.jpg`);
console.log(p.slug,W,H);}})();
