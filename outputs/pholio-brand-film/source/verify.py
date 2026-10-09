import json,subprocess,sys
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).parent)); import film
R=film.ROOT; movie=R/'PHOLIO-First-Impressions-1080x1920.mp4'
def audio(p):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-ac','1','-ar','12000','-f','f32le','-']),dtype=np.float32)
a=audio(movie); b=audio(film.AUDIO); n=min(len(a),len(b)); corr=float(np.corrcoef(a[:n],b[:n])[0,1]); rms=float(np.sqrt(np.mean((a[:n]-b[:n])**2)))
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]))
check=subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],capture_output=True)
cap=cv2.VideoCapture(str(movie)); times=[.5,2.6,5.73,5.77,8.7,13.9,17.8,22.3,25.9,26.067,26.1,26.333,27.0,30.2,33.5,36.1,39.8,43.2,45.9,50.8,51.333,51.4,51.7,52.6,54.8,56.6,58.3,60.133,60.5,64.55]
sheet=Image.new('RGB',(6*216,5*408),film.INK); draw=ImageDraw.Draw(sheet)
for j,t in enumerate(times):
 cap.set(cv2.CAP_PROP_POS_MSEC,t*1000); ok,v=cap.read()
 assert ok,f'Undecodable frame at {t}'
 fr=Image.fromarray(cv2.cvtColor(v,cv2.COLOR_BGR2RGB)); fr.thumbnail((216,384)); sheet.paste(fr,((j%6)*216,(j//6)*408)); draw.text(((j%6)*216+5,(j//6)*408+386),f'{t:.3f}s',font=film.font(15,'mono'),fill=film.CREAM)
cap.release(); sheet.save(R/'Encoded-Review.jpg',quality=90)
cover=Image.new('RGB',(1080,1920),film.CREAM)
film.logo(cover,250,film.INK,920)
cover.paste(film.video(34425,2.2,920,1080,bw=True),(80,500))
film.text(cover,'A better introduction.',66,540,1650,color=film.INK,align='center')
ImageDraw.Draw(cover).line((80,450,1000,450),fill=film.GOLD,width=3)
cover.save(R/'PHOLIO-Reel-Cover.jpg',quality=95)
result={'video':{'width':probe['streams'][0]['width'],'height':probe['streams'][0]['height'],'fps':probe['streams'][0]['r_frame_rate'],'duration':probe['streams'][0]['duration']},'audio':{'duration':probe['streams'][1]['duration'],'sample_rate':probe['streams'][1]['sample_rate'],'channels':probe['streams'][1]['channels'],'correlation_to_approved_master_at_zero_offset':corr,'rms_encoding_error':rms},'decode_errors':check.stderr.decode(),'brand_transition_seconds':[26.08,51.37],'final_video_frame_seconds':64.633333}
assert corr>.995, f'Unexpected soundtrack mismatch: {corr}'
assert check.returncode==0 and not check.stderr,'Decoder errors'
assert abs(float(probe['streams'][1]['duration'])-64.663039)<.002
assert probe['streams'][0]['width']==1080 and probe['streams'][0]['height']==1920
json.dump(result,open(R/'source/Verification.json','w'),indent=2);print(json.dumps(result,indent=2))
