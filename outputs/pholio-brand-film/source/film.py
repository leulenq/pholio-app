"""PHOLIO / FIRST IMPRESSIONS — original portrait film. Deterministic frame renderer."""
from pathlib import Path
import math, json, subprocess, sys, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import cv2
from scipy.signal import find_peaks
ROOT=Path(__file__).resolve().parents[1]
ASSETS=Path('/Users/lenquanhone/Downloads/PHOLIO-Brand-Film/source/plates')
FONTS=Path('/Users/lenquanhone/Projects/pholio-judge/fonts')
AUDIO='/Users/lenquanhone/Downloads/PHOLIO-Video-Editor-Handoff/PHOLIO-Approved-Master-48k.wav'
W,H=1080,1920; FPS=30; DURATION=64.663039
INK=(5,5,5); CREAM=(250,247,242); GOLD=(201,165,90); GRAY=(123,120,115)
cv2.setNumThreads(2)
@functools.lru_cache(maxsize=256)
def font(sz,face='serif'):
 f={'serif':'NotoSerifDisplay[wdth,wght].ttf','italic':'NotoSerifDisplay-Italic[wdth,wght].ttf','sans':'Inter[opsz,wght].ttf','mono':'JetBrainsMono[wght].ttf'}[face]
 a=ImageFont.truetype(str(FONTS/f),int(sz))
 try:
  axes=a.get_variation_axes(); vals=[x['default'] for x in axes]
  for i,x in enumerate(axes):
   if b'Weight' in x['name']: vals[i]=500 if face=='sans' else 400
  a.set_variation_by_axes(vals)
 except: pass
 return a
@functools.lru_cache(maxsize=400)
def typeplate(text,sz,face='serif',color=CREAM):
 f=font(sz,face); b=f.getbbox(text); im=Image.new('RGBA',(max(1,b[2]-b[0]+8),max(1,b[3]-b[1]+8)))
 ImageDraw.Draw(im).text((4-b[0],4-b[1]),text,font=f,fill=color)
 return im

def text(im,s,sz,x,y,face='serif',color=CREAM,align='left',alpha=1):
 p=typeplate(s,sz,face,color)
 if alpha<1:
  p=p.copy(); p.putalpha(p.getchannel('A').point(lambda v:int(v*max(0,alpha))))
 if align=='center': x-=p.width/2
 elif align=='right': x-=p.width
 im.paste(p,(int(x),int(y)),p)
 return p.width,p.height

def fittext(im,s,sz,x,y,maxw,face='serif',color=CREAM,align='left',alpha=1):
 p=typeplate(s,sz,face,color)
 if p.width>maxw:
  sz=int(sz*maxw/p.width)
 return text(im,s,sz,x,y,face,color,align,alpha)

def ease(v): return 1-(1-max(0,min(1,v)))**3

def smooth(v): v=max(0,min(1,v)); return v*v*(3-2*v)

imgs={k:Image.open(ASSETS/f'{k}.jpg').convert('RGB') for k in [696,697,698,700,23,19,534,537,768,776,780,617,690,694,675,637,761]}

@functools.lru_cache(maxsize=120)
def plate(k,w,h,bw=False):
 p=ImageOps.fit(imgs[k],(w,h),method=Image.Resampling.LANCZOS,centering=(.5,.35))
 if bw:p=ImageOps.grayscale(p).convert('RGB')
 return p

def photo(k,w=W,h=H,z=1,pan=.5,bw=False):
 p=plate(k,w,h,bw)
 if abs(z-1)<.003: return p.copy()
 nw,nh=int(w*z),int(h*z); p=p.resize((nw,nh),Image.Resampling.BICUBIC)
 x=int((nw-w)*pan); y=int((nh-h)*.36)
 return p.crop((x,y,x+w,y+h))

caps={}; caplast={}
def video(k,t,w=W,h=H,bw=False):
 if k not in caps:
  caps[k]=cv2.VideoCapture(str(ASSETS/f'{k}.mp4')); caplast[k]=-2
 c=caps[k]; rate=c.get(cv2.CAP_PROP_FPS); total=c.get(cv2.CAP_PROP_FRAME_COUNT)
 idx=min(int(t*rate),int(total)-2)
 if idx!=caplast[k]+1: c.set(cv2.CAP_PROP_POS_FRAMES,idx)
 ok,a=c.read(); caplast[k]=idx
 if not ok: return photo(697,w,h)
 ih,iw=a.shape[:2]; s=max(w/iw,h/ih); a=cv2.resize(a,(int(iw*s),int(ih*s)),interpolation=cv2.INTER_LINEAR)
 x=(a.shape[1]-w)//2; y=int((a.shape[0]-h)*.38); a=a[y:y+h,x:x+w]
 if bw: a=cv2.cvtColor(cv2.cvtColor(a,cv2.COLOR_BGR2GRAY),cv2.COLOR_GRAY2RGB)
 else:a=cv2.cvtColor(a,cv2.COLOR_BGR2RGB)
 return Image.fromarray(a)

def dark(im,amount=.3): return Image.blend(im,Image.new('RGB',im.size,INK),amount)

def rules(im,p=.0,color=GOLD):
 d=ImageDraw.Draw(im)
 x=76; y=190; w=928; h=1400; L=38+int(35*p)
 for xx,yy,dx,dy in [(x,y,1,1),(x+w,y,-1,1),(x,y+h,1,-1),(x+w,y+h,-1,-1)]:
  d.line((xx,yy,xx+L*dx,yy),fill=color,width=2); d.line((xx,yy,xx,yy+L*dy),fill=color,width=2)

def logo(im,y=800,color=INK,width=900,alpha=1):
 return fittext(im,'PHOLIO',190,W/2,y,width,'serif',color,'center',alpha)

def keylines(im,lines,y=580,size=180,color=CREAM,face='serif',u=10):
 for j,s in enumerate(lines):
  a=ease((u-j*.10)/.55); text(im,s,size,W/2,y+j*(size*.91)+55*(1-a),face,color,'center',a)

raw=subprocess.check_output(['ffmpeg','-v','error','-i',AUDIO,'-ac','1','-ar','12000','-f','f32le','-'])
y=np.frombuffer(raw,dtype=np.float32); amp=np.array([np.sqrt(np.mean(y[i:i+400]**2)) for i in range(0,len(y),400)])
flux=np.maximum(0,amp-np.roll(amp,2)); peaks,_=find_peaks(flux,distance=7,prominence=.003)
beats=peaks/FPS

def pulse(t):
 ix=np.searchsorted(beats,t)-1
 return math.exp(-max(0,t-beats[max(0,ix)])*18) if ix>=0 else 0

def aperture(im,p,r=None):
 mask=Image.new('L',(W,H)); d=ImageDraw.Draw(mask)
 if r is None:r=60+1250*ease(p)
 d.ellipse((W/2-r,H/2-r,W/2+r,H/2+r),fill=255)
 bg=Image.new('RGB',(W,H),INK); bg.paste(im,(0,0),mask); return bg

def card(k,w=500,h=730):
 a=Image.new('RGB',(w,h),CREAM); a.paste(plate(k,w-34,h-145),(17,17)); text(a,'PHOLIO',35,17,h-106,color=INK)
 ImageDraw.Draw(a).line((17,h-50,w-17,h-50),fill=GOLD,width=2)
 return a

# Each cut serves a phrase; two master brand impacts are locked to the supplied soundtrack.
SCENES=[(0,'opening'),(3.15,'eyes'),(5.75,'before'),(9.05,'casting'),(13.65,'screen'),(15.85,'lost'),(18.31,'old'),(19.47,'link'),(20.69,'email'),(23.37,'deserve'),(26.080,'welcome'),(27.57,'parts'),(30.05,'together'),(31.29,'way'),(33.29,'personal'),(37.09,'three'),(39.85,'gather'),(41.01,'out'),(42.59,'person'),(45.09,'technology'),(47.23,'around'),(48.41,'ready'),(49.51,'yours'),(51.370,'brand'),(54.10,'outro'),(60.15,'end')]
STARTS=np.array([x[0] for x in SCENES])

def render(t):
 n=max(0,np.searchsorted(STARTS,t,side='right')-1); start,name=SCENES[n]; u=t-start; b=pulse(t)
 im=Image.new('RGB',(W,H),INK); d=ImageDraw.Draw(im)
 if name=='opening':
  p=photo(697,z=1.1-u*.018,bw=True)
  # A portrait travels from a single silver slit into an optical circle.
  mask=Image.new('L',(W,H)); md=ImageDraw.Draw(mask)
  if u<1.4:
   ww=int(4+ease(u/1.4)*W*.68); hh=int(8+ease(u/1.4)*700)
   md.rectangle((540-ww/2,900-hh/2,540+ww/2,900+hh/2),fill=255)
  else:
   r=350+ease((u-1.4)/1.75)*880; md.ellipse((540-r,960-r,540+r,960+r),fill=255)
  im.paste(p,(0,0),mask)
  if u<1.4:d=ImageDraw.Draw(im); d.line((540,740,540,1060),fill=GOLD,width=2)
  if u>1.8:
   text(im,'A first',112,80,1280,color=CREAM,alpha=ease((u-1.8)/.45))
   text(im,'impression.',112,80,1400,face='italic',color=CREAM,alpha=ease((u-2)/.45))
 elif name=='eyes':
  ids=[696,700,617,698,19]; idx=min(4,int(u*1.95)); im=photo(ids[idx],z=1.13+.025*u,bw=True)
  # Variable-width physical shutters, opening on attacks.
  p=Image.new('RGB',(W,H),INK); h=int(170+ease(u/2.6)*1600)
  p.paste(im.crop((0,900-h//2,W,900+h//2)),(0,900-h//2)); im=p
  if u<1.4:rules(im,b)
 elif name=='before':
  im=Image.new('RGB',(W,H),CREAM); d=ImageDraw.Draw(im)
  a=ease(u/.65); eye=ImageOps.grayscale(imgs[696]).convert('RGB'); eye=ImageOps.fit(eye,(900,430),centering=(.5,.08)); im.paste(eye,(90,int(1030+100*(1-a))))
  text(im,'Before',171,83,405,'serif',INK,alpha=a)
  text(im,'they meet',151,83,585,'serif',INK,alpha=ease((u-.14)/.6))
  text(im,'you.',245,83,750,'italic',INK,alpha=ease((u-.4)/.6))
  if t>=7.55:
   d.rectangle((0,270,W,985),fill=CREAM)
   text(im,'They meet',140,83,420,color=INK)
   text(im,'your',170,83,575,'italic',INK)
   fittext(im,'introduction.',147,83,755,920,color=INK)
 elif name=='casting':
  ids=[697,617,700]; q=min(2,int(u/1.05)); shift=ease((u%1.05)/.5)
  for j,k in enumerate(ids):
   p=photo(k,360,H,z=1.03+.04*shift,bw=True); im.paste(p,(j*360,0))
  im=dark(im,.35); y=1170
  words=['The casting.','The audition.','The conversation.']; q=0 if t<10.19 else 1 if t<11.05 else 2
  fittext(im,words[q],120,80,y,920,color=CREAM)
  if t>=12.25:
   text(im,'Everything',135,80,1330,'italic',GOLD,alpha=ease((t-12.25)/.4))
 elif name=='screen':
  a=ease(u/1.4); w=int(1080-410*a); h=int(1920-840*a)
  p=photo(700,w,h,z=1.06,bw=True); im.paste(p,((W-w)//2,(H-h)//2-75))
  d=ImageDraw.Draw(im); d.rectangle(((W-w)//2-10,(H-h)//2-85,(W+w)//2+10,(H+h)//2-65),outline=GOLD,width=2)
  text(im,'On a screen.',100,W/2,1530,'serif',CREAM,'center',a)
 elif name=='lost':
  p=photo(700,bw=True); strips=16
  for j in range(strips):
   yy=j*120; off=int((u/2.4)**2*W*((-1)**j)*(0.3+j/20))
   im.paste(p.crop((0,yy,W,yy+112)),(off,yy))
  im=dark(im,.45)
  keylines(im,['Something','gets lost.'],720,145,u=u)
 elif name=='old':
  im=Image.new('RGB',(W,H),CREAM); p=photo(698,720,1020,bw=True)
  p=p.resize((48,68)).resize((720,1020),Image.Resampling.NEAREST)
  im.paste(p,(180,420)); text(im,'An old photo.',88,80,1500,color=INK)
  d=ImageDraw.Draw(im); d.rectangle((180,420,900,1440),outline=GOLD,width=2)
 elif name=='link':
  im=Image.new('RGB',(W,H),INK); d=ImageDraw.Draw(im)
  x=int(80*ease(u/.8)); d.line((110,860,500-x,860),fill=GOLD,width=14); d.line((580+x,860,970,860),fill=GOLD,width=14)
  # Paired brackets lose their connection.
  text(im,'[',330,100-x,660,color=CREAM); text(im,']',330,770+x,660,color=CREAM)
  text(im,'A broken link.',90,W/2,1300,color=CREAM,align='center')
 elif name=='email':
  im=Image.new('RGB',(W,H),CREAM); d=ImageDraw.Draw(im)
  cnt=min(10,1+int(u*4.4)); y=390
  for j in range(6):
   yy=y+j*160-int((u*320)%160); opacity=1-abs(yy-790)/1000; col=tuple(int(c*opacity+CREAM[i]*(1-opacity)) for i,c in enumerate(INK))
   text(im,f'Introduction_{max(1,cnt-3+j):02d}',65,90,yy,'mono',col)
   d.line((90,yy+93,940,yy+93),fill=(218,212,201),width=2)
  d.rectangle((0,1270,W,H),fill=CREAM)
  text(im,'Ten times.',142,90,1310,'italic',INK)
  text(im,'Still not you.',65,90,1485,'sans',INK)
 elif name=='deserve':
  im=Image.new('RGB',(W,H),CREAM)
  keylines(im,['You deserve','a better'],580,142,INK,u=u)
  fittext(im,'introduction.',142,W/2,935,940,'italic',INK,'center',ease((u-.3)/.55))
  d=ImageDraw.Draw(im); a=ease((u-1.5)/1.15); d.line((80,1150,80+int(920*a),1150),fill=GOLD,width=3)
  # A small contact print becomes the next world's full frame.
  if u>2:
   h=int(220+ease((u-2)/.71)*450); w=int(h*.7); im.paste(photo(697,w,h,bw=True),((W-w)//2,1280))
 elif name=='welcome':
  im=Image.new('RGB',(W,H),CREAM)
  a=ease(u/.65)
  if u<.067: im=Image.new('RGB',(W,H),GOLD)
  # Six letter columns arrive independently and settle into the masthead.
  p=typeplate('PHOLIO',190,'serif',INK); p=p.resize((930,int(p.height*930/p.width)),Image.Resampling.LANCZOS)
  for j in range(6):
   xx=j*p.width//6; end=(j+1)*p.width//6; aa=ease((u-j*.055)/.45)
   tile=p.crop((xx,0,end,p.height)); im.paste(tile,(75+xx,int(760+(1-aa)*500)),tile)
  d=ImageDraw.Draw(im); d.line((75,1060,75+int(930*a),1060),fill=GOLD,width=3)
  if u>.8:text(im,'A better introduction.',67,W/2,1160,'serif',INK,'center',ease((u-.8)/.35))
 elif name=='parts':
  # Motion studies: human look, craft, story, all with one consistent crop system.
  k=696 if t<28.65 else 761 if t<29.37 else 534
  im=photo(k,z=1.04+.05*u,bw=t<28.65); im=dark(im,.25)
  label='Your look.' if t<28.65 else 'Your work.' if t<29.37 else 'Your story.'
  fittext(im,label,164,80,1340,920,'italic',CREAM)
  rules(im,b)
 elif name=='together':
  im=Image.new('RGB',(W,H),CREAM)
  for j,k in enumerate([696,761,534]):
   a=ease((u-j*.08)/.8); ca=card(k,620,900); angle=(j-1)*16*(1-a)
   ca=ca.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True,fillcolor=CREAM)
   x=int(20+j*230*(1-a)+230*a); yy=int(370+j*80*(1-a))
   im.paste(ca,(x,yy))
  text(im,'Together.',124,W/2,1380,'italic',INK,'center')
 elif name=='way':
  im=video(34425,1+u*.9,bw=True); im=dark(im,.13)
  text(im,'Your way.',155,80,1370,'italic',CREAM,alpha=ease(u/.45))
 elif name=='personal':
  # Not a gallery: one face becomes another in rolling vertical shutters.
  phase=int(u/.72); ids=[700,617,19,697,534]; k1=ids[phase%5]; k2=ids[(phase+1)%5]
  im=photo(k1,bw=True); other=photo(k2,bw=True); frac=ease((u%.72)/.55)
  for j in range(9):
   x=j*120; hh=int(H*max(0,min(1,frac-j*.04)))
   im.paste(other.crop((x,0,x+120,hh)),(x,H-hh))
  im=dark(im,.28)
  text(im,'More',156,80,1190,color=CREAM)
  text(im,'personal.',176,80,1370,'italic',CREAM)
 elif name=='three':
  q=0 if t<37.97 else 1 if t<38.89 else 2; ids=[761,690,776]; im=dark(photo(ids[q],z=1.08+.04*(u%1)),.25)
  words=['work.','voice.','way.']; text(im,'Your',135,80,500,color=CREAM)
  fittext(im,words[q],275,80,670,930,'italic',CREAM)
  d=ImageDraw.Draw(im); d.line((80,1020,1000,1020),fill=GOLD,width=3)
 elif name=='gather':
  im=Image.new('RGB',(W,H),CREAM)
  for j,k in enumerate([19,617,700]):
   a=ease((u-j*.06)/.75); ca=card(k,430,670); ca=ca.rotate((j-1)*11,resample=Image.Resampling.BICUBIC,expand=True,fillcolor=CREAM)
   im.paste(ca,(int(540-ca.width/2+(j-1)*310*(1-a)),int(570+(j-1)*90)))
  text(im,'Bring it together.',82,W/2,1440,color=INK,align='center')
 elif name=='out':
  a=ease(u/1.4); w=int(460+620*a); h=int(820+1100*a); p=photo(19,w,h,z=1.02,bw=False)
  im.paste(p,((W-w)//2,(H-h)//2)); im=dark(im,.16)
  text(im,'Out there.',150,80,1330,'italic',CREAM)
 elif name=='person':
  im=video(34427,1.1+u*.65,bw=True)
  # The name leaves; the person holds eye contact.
  if u<1.3:
   p=typeplate('NAME',260,'serif',CREAM); a=ease(u/1.3); im.paste(p,(int(540-p.width/2),int(750-a*1300)),p)
  else:rules(im,.1,CREAM)
 elif name=='technology':
  im=Image.new('RGB',(W,H),CREAM)
  p=photo(697,650,920,bw=True); im.paste(p,(215,500))
  d=ImageDraw.Draw(im)
  for j in range(7):
   offset=35+j*35+int(8*math.sin(u*2+j)); d.rectangle((215-offset,500-offset,865+offset,1420+offset),outline=GOLD if j==0 else (218,210,193),width=2)
  text(im,'Personal',135,80,240,color=INK)
  text(im,'technology.',125,80,1470,'italic',INK)
 elif name=='around':
  im=photo(700,bw=True); im=dark(im,.13); d=ImageDraw.Draw(im)
  for j in range(10):
   r=120+j*61+15*math.sin(u*3+j*.25)
   d.ellipse((540-r,890-r*1.45,540+r,890+r*1.45),outline=GOLD,width=2)
  text(im,'Built around',102,80,1370,color=CREAM); text(im,'you.',170,80,1480,'italic',CREAM)
 elif name=='ready':
  im=video(34424,2.2+u,bw=True); im=dark(im,.15)
  text(im,'Ready.',173,80,1370,'italic',CREAM)
 elif name=='yours':
  im=Image.new('RGB',(W,H),CREAM)
  p=photo(697,z=1.1,bw=True)
  # The portrait is the material inside the word, rather than a card beside it.
  mask=Image.new('L',(W,H)); md=ImageDraw.Draw(mask)
  f=font(435,'serif'); bb=f.getbbox('YOU'); md.text(((W-(bb[2]-bb[0]))/2,540),'YOU',font=f,fill=255)
  im.paste(p,(0,0),mask)
  text(im,'Entirely',111,W/2,1170,color=INK,align='center')
  text(im,'yours.',185,W/2,1290,'italic',INK,'center')
 elif name=='brand':
  im=Image.new('RGB',(W,H),CREAM)
  # Exact impact frame: field inversion, then the closing PHOLIO.
  if u<.09: im=Image.new('RGB',(W,H),GOLD)
  else:
   logo(im,760,INK,930,ease((u-.09)/.32))
   d=ImageDraw.Draw(im); a=ease((u-.25)/.65); d.line((75,1050,75+int(930*a),1050),fill=GOLD,width=3)
   if t>=52.15:text(im,'A better introduction.',69,W/2,1160,color=INK,align='center',alpha=ease((t-52.15)/.55))
 elif name=='outro':
  # Musical coda: new arrangements, not a static logo over twelve seconds of music.
  cuts=[0,.65,1.3,2.1,2.9,3.65,4.35,5.10]; q=max(0,np.searchsorted(cuts,u,side='right')-1); v=u-cuts[q]
  if q==0: im=video(34421,4+v,bw=True)
  elif q==1: im=photo(617,z=1.07+.05*v,bw=True)
  elif q==2:
   im=Image.new('RGB',(W,H),CREAM)
   for j,k in enumerate([19,700,534]):im.paste(photo(k,360,H,bw=True),(j*360,0))
  elif q==3: im=video(34423,2+v,bw=True)
  elif q==4:
   im=Image.new('RGB',(W,H),INK)
   for j,k in enumerate([696,697,698,700,617,19]):
    p=photo(k,540,640,bw=True); im.paste(p,((j%2)*540,(j//2)*640))
  elif q==5:im=video(34428,1+v,bw=True)
  elif q==6:
   im=Image.new('RGB',(W,H),CREAM); keylines(im,['Your work.','Your voice.','Your way.'],560,151,INK,u=1)
  else:im=aperture(video(34425,4+v,bw=True),1,r=1450*(1-smooth(v/.95))+1)
 elif name=='end':
  im=Image.new('RGB',(W,H),CREAM)
  logo(im,755,INK,930,ease(u/.6))
  text(im,'A better introduction.',69,W/2,1090,color=INK,align='center',alpha=ease((u-.15)/.65))
  text(im,'pholio.studio',42,W/2,1490,'sans',INK,'center',ease((u-.75)/.6))
  d=ImageDraw.Draw(im); d.line((75,1010,1005,1010),fill=GOLD,width=2)
 return im

if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='frames':
  times=[1,4,6.7,8.3,10,12.6,14.8,17.2,18.8,20.1,22,24.8,26.9,28.3,29.9,30.8,32.5,35,38.2,40.5,41.8,44.2,46,47.8,49,50.4,51.8,53.3,55.8,57.4,59.4,62]
  sheet=Image.new('RGB',(6*270,math.ceil(len(times)/6)*510),INK); ds=ImageDraw.Draw(sheet)
  for j,t in enumerate(times):
   fr=render(t); fr.resize((270,480),Image.Resampling.LANCZOS); sheet.paste(fr.resize((270,480)),((j%6)*270,(j//6)*510)); ds.text(((j%6)*270+8,(j//6)*510+484),f'{t:05.2f}',fill=CREAM,font=font(17,'mono'))
  sheet.save(ROOT/'Review-Contact-Sheet.jpg',quality=92); render(35).save(ROOT/'PHOLIO-Reel-Cover.jpg',quality=95)
 else:
  output=ROOT/'PHOLIO-First-Impressions-1080x1920.mp4'
  args=['ffmpeg','-v','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',AUDIO,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','21','-maxrate','12M','-bufsize','24M','-pix_fmt','yuv420p','-c:a','aac','-b:a','320k','-ar','48000','-t',str(DURATION),'-movflags','+faststart','-metadata','title=PHOLIO — First Impressions','-metadata','comment=Approved Vocal Design soundtrack; exact timing preserved.',str(output)]
  proc=subprocess.Popen(args,stdin=subprocess.PIPE)
  try:
   for i in range(math.ceil(DURATION*FPS)):
    proc.stdin.write(render(i/FPS).tobytes())
    if i%150==0: print(f'{i/FPS:.1f} / {DURATION:.3f}s',flush=True)
   proc.stdin.close(); result=proc.wait()
   if result:raise SystemExit(result)
  finally:
   for c in caps.values():c.release()
  print(output,flush=True)
