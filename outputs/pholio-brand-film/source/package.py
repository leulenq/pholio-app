from pathlib import Path
import json,csv
R=Path(__file__).resolve().parents[1]
words=json.load(open('/Users/lenquanhone/Downloads/PHOLIO-Brand-Film/source/words.json'))
# Original unprocessed narration supplied word timing; closing audible onset confirmed by handoff.
for w in words:
 if w['word'].strip()=='PHOLIO.':w['start']=51.37
 if w['word'].strip()=='Pholio,':w['word']=' PHOLIO,'
 if w['word'].strip()=='Let':w['word']=" Let's"
words=[w for w in words if w['word'].strip()!='s']
def tc(s):
 ms=round(s*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); sec,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{sec:02},{ms:03}'
groups=[]; g=[]
for w in words:
 if g and (len(g)>=6 or w['start']-g[-1]['end']>.35):groups.append(g);g=[]
 g.append(w)
 if any(w['word'].strip().endswith(x) for x in ['.',',']):groups.append(g);g=[]
if g:groups.append(g)
with open(R/'PHOLIO-Captions.srt','w') as f:
 for i,g in enumerate(groups):
  end=max(g[-1]['end'],g[0]['start']+.7)
  if i+1<len(groups):end=min(end,groups[i+1][0]['start']-.025)
  f.write(f'{i+1}\n{tc(g[0]["start"])} --> {tc(end)}\n'+''.join(w['word'] for w in g).strip()+'\n\n')
asset=json.load(open('/Users/lenquanhone/Downloads/PHOLIO-Brand-Film/source/asset-credits.json'))
with open(R/'Asset-Credits.md','w') as f:
 f.write('# PHOLIO — First Impressions\n\nOriginal direction, graphics, animation and edit created for this film.\n\n## Audio\n\nOwner-selected finished soundtrack: `PHOLIO-Approved-Master-48k.wav`, from the approved PHOLIO Vocal Design mix. Placed at zero with no edits, ducking, effects or retiming. Full musical tail retained. AAC encoding only for the MP4.\n\n## Photography\n\nStock performers are illustrative; they are not presented as PHOLIO customers. Raw images sourced previously through Openverse/StockSnap, reused in this original edit.\n\n')
 for a in asset:
  f.write(f'- {a.get("title","")} — {a.get("creator","")}. {a.get("license","").upper()} {a.get("lv","")}. {a.get("landing","")}\n')
 f.write('\n## Footage\n\nMixkit studio portrait series: clips 34415, 34421, 34423, 34424, 34425, 34426, 34427 and 34428. Previously sourced under the Mixkit Stock Video Free License. https://mixkit.co/license/#videoFree\n\n## Type and brand\n\nNoto Serif Display, Inter, JetBrains Mono — SIL Open Font License (Google Fonts). PHOLIO typography and palette: ink #050505, cream #FAF7F2, gold #C9A55A.\n\n## Craft reference\n\nNothing / Playground, BUCK: https://buck.co/work/nothing-playground\nReference only; no reference-film picture assets used.\n')
(R/'README.md').write_text('''# PHOLIO / First Impressions

A 64.663-second portrait brand film: the introduction is a fragmented image until the person comes into focus. Optical shutters, rolling contact sheets, cropped portraits and oversized editorial typography move from friction to confident self-expression.

- Main delivery: PHOLIO-First-Impressions-1080x1920.mp4
- 1080 × 1920, 9:16, 30 fps, H.264 / yuv420p, AAC stereo at 48 kHz / 320 kbps; fast-start MP4.
- PHOLIO-Reel-Cover.jpg: portrait cover, exported from the film.
- PHOLIO-Captions.srt: optional narration captions, supplied separately so the graphic composition remains clean.
- Review-Contact-Sheet.jpg: representative frames.
- Asset-Credits.md: asset provenance.

The owner-approved Vocal Design master is preserved at timeline zero. The first brand transition is at 26.080 seconds and the closing reveal at 51.370 seconds. The full outro is retained.

## Render source

source/film.py is the deterministic frame renderer. Python dependencies: Pillow, NumPy, SciPy, OpenCV; FFmpeg on PATH. It currently references the local raw-asset package, fonts and approved soundtrack by absolute path. No app code is involved.

Run `python source/film.py frames` for review frames or `python source/film.py` for the full film. All visual effects are computed frame by frame; the soundtrack has no processing beyond delivery encoding.
''')
