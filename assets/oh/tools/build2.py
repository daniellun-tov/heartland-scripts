import json, math, os, numpy as np, cv2
from PIL import Image
P=os.path.dirname(os.path.abspath(__file__))+'/'
fit=json.load(open(P+'fit3.json')); units=json.load(open(P+'unit_paths.json'))
live=json.load(open(P+'../units-live.json'))
LETTER={1:'A',2:'B',3:'C',4:'D',5:'E',6:'F',7:'G',8:'H',9:'I',10:'J',11:'K',12:'L'}
SETS={'A':['A1','A2','A3','A4','A5','A6'],'B1':['B11','B12','B13','B14','B15','B16','B17'],'B2':['B21','B22','B23','B24','B25','B26','B27']}
def transform(polys,sx,sy,ang,mirror,cx,cy,fcx,fcy):
    a=math.radians(ang); ca,sa=math.cos(a),math.sin(a); out=[]
    for p in polys:
        q=np.array(p,dtype=np.float64).copy(); q[:,0]-=fcx; q[:,1]-=fcy
        if mirror: q[:,0]=-q[:,0]
        q[:,0]*=sx; q[:,1]*=sy
        out.append(np.stack([q[:,0]*ca-q[:,1]*sa+cx,q[:,0]*sa+q[:,1]*ca+cy],1))
    return out
# ---- footprint per set in local frame: union of units + core rect ----
def footprint_local(setname):
    names=SETS[setname]; polys=[np.array(units[n]) for n in names]
    cents=[p.mean(0) for p in polys]; ys=[c[1] for c in cents]
    top=[i for i,c in enumerate(cents) if c[1]<min(ys)+60]          # the two top units
    rest=[i for i in range(len(polys)) if i not in top]
    midx=np.mean([cents[i][0] for i in top])
    left=[i for i in rest if cents[i][0]<midx]; right=[i for i in rest if cents[i][0]>=midx]
    xL=max(polys[i][:,0].max() for i in left); xR=min(polys[i][:,0].min() for i in right)
    yT=min(polys[i][:,1].min() for i in top)
    yB=max(max(polys[i][:,1].max() for i in left),max(polys[i][:,1].max() for i in right))
    canvas=np.zeros((1200,1200),np.uint8)
    for p in polys: cv2.fillPoly(canvas,[np.round(p).astype(np.int32)],1)
    cv2.rectangle(canvas,(int(xL)-2,int(yT)),(int(xR)+2,int(yB)),1,-1)
    canvas=cv2.morphologyEx(canvas,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
    cnt,_=cv2.findContours(canvas,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    c=max(cnt,key=cv2.contourArea); ap=cv2.approxPolyDP(c,2.5,True).reshape(-1,2).astype(np.float64)
    return ap
FOOT={s:footprint_local(s) for s in SETS}
plots={}; foots={}
for b,r in fit.items():
    b=int(b)
    plots[b]=[(n[-1].zfill(2),np.array(p)) for n,p in zip(r['names'],r['polys'])]
    foots[b]=transform([FOOT[r['set']]],r['sx'],r['sy'],r['ang'],r['mirror'],r['cx'],r['cy'],r['fcx'],r['fcy'])[0]
# ---- background: registered brochure + greenery from the SDP ----
br=np.array(Image.open(P+'brochure-warped.png').convert('RGB')).astype(np.float32)
sdp=np.array(Image.open(P+'ground-1.png').convert('RGB'))
H,W=br.shape[:2]
hsv=cv2.cvtColor(sdp,cv2.COLOR_RGB2HSV).astype(np.float32)
green=(hsv[...,0]>25)&(hsv[...,0]<95)&(hsv[...,1]>60)
hull=np.load(P+'hull.npy').reshape(-1,1,2).astype(np.int32)
site=np.zeros((H,W),np.uint8); cv2.fillPoly(site,[hull],1)
green=green&site.astype(bool)
green=cv2.morphologyEx(green.astype(np.uint8),cv2.MORPH_OPEN,np.ones((5,5),np.uint8)).astype(bool)
gsoft=cv2.GaussianBlur(green.astype(np.float32),(0,0),3)[...,None]
sand=np.array([242,239,230],np.float32); sage=np.array([205,214,196],np.float32)
out=br*0.92+sand*0.08
# neutralise coloured bay fills
bh=cv2.cvtColor(np.clip(br,0,255).astype(np.uint8),cv2.COLOR_RGB2HSV).astype(np.float32)
hue=bh[...,0]; sat=bh[...,1]; val=bh[...,2]
treeg=(hue>30)&(hue<95)&(sat<110)
satm=((sat>16)&(val>70)&~treeg&site.astype(bool))
# navy boundary line -> warm mid tone
navy=(hue>100)&(hue<135)&(sat>60)&(val<140)
# keep tree greens (they are muted, hue 35-90 with low sat) -> only neutralise strongly saturated
lum=(0.3*br[...,0]+0.59*br[...,1]+0.11*br[...,2])[...,None]
neutral=np.array([231,228,221],np.float32)*(0.6+0.4*np.clip(lum,120,255)/255)
out=np.where(satm[...,None],neutral,out)
out=np.where(navy[...,None],np.array([168,158,142],np.float32),out)
# greenery tint
out=out*(1-gsoft*0.5)+sage*gsoft*0.5
# brochure tree crowns: leave. Slight overall softening outside the site
sf=cv2.GaussianBlur(site.astype(np.float32),(0,0),8)[...,None]
paper=np.array([246,244,238],np.float32)
out=out*(0.75+0.25*sf)+paper*(0.25-0.25*sf)
outu8=np.clip(out,0,255).astype(np.uint8)
Image.fromarray(outu8).save(P+'bg2-full.png')
Image.fromarray(outu8).save(P+'bg2-3380.webp',quality=80)
print('bg saved')
# ---- SVG ----
S=0.5
def fmt(p): return ' '.join(f'{x*S:.1f},{y*S:.1f}' for x,y in p)
def esc(s): return s.replace('&','&amp;')
status={u['unit_number']:u['status_key'] for u in live}
svg=['<svg class="site-plan_map-svg" viewBox="0 0 1690 1490" xmlns="http://www.w3.org/2000/svg" aria-label="Oak Hills site plan">']
svg.append('<g data-layer="blocks">'+''.join(f'<polygon id="block-{LETTER[b].lower()}" points="{fmt(foots[b])}"/>' for b in sorted(foots))+'</g>')
# feature labels (from the SDP vector text, raster px -> /2)
labels=json.load(open(P+'sdp-labels.json'))
merged={'ATTENUATION':'Attenuation pond','ELEC.':None,'KIOSK':None,'MINI-':None,'SUB':None,'POND':None,'BORE HOLE':None}
feat=[]
for l in labels:
    t=l['text']
    if t in merged:
        if merged[t]: feat.append(dict(l,text=merged[t]))
        continue
    if t=='WELGEVONDEN LINK ROAD': t='Welgevonden Link Road'
    feat.append(dict(l,text=t))
# extra context labels (raster px), outside the site
feat+= [dict(text='Welgevonden Boulevard',x=1225,y=585,ang=-33,size=30,kind='road'),
        dict(text='Main entrance',x=1385,y=735,ang=-33,size=22,kind='feature'),
        dict(text='Welgevonden',x=2950,y=2450,ang=0,size=34,kind='area')]
parts=[]
for f in feat:
    kind=f.get('kind','street' if 'Street' in f['text'] or 'Road' in f['text'] else 'feature')
    parts.append(f'<text class="site-plan_feature is-{kind}" x="{f["x"]*S:.1f}" y="{f["y"]*S:.1f}" transform="rotate({f["ang"]:.1f} {f["x"]*S:.1f} {f["y"]*S:.1f})" text-anchor="middle" dominant-baseline="middle">{esc(f["text"])}</text>')
svg.append('<g data-layer="features">'+''.join(parts)+'</g>')
# parking level (optional)
bays=json.load(open(P+'bays.json')) if os.path.exists(P+'bays.json') else None
if bays:
    parts=[]
    for bay in bays:
        pts=np.array(bay['poly']); c=pts.mean(0)
        parts.append(f'<polygon id="bay-{bay["bay"]}" data-bay="{bay["bay"]}" points="{fmt(pts)}"/>')
    svg.append('<g data-floor="0" data-level-label="Parking">'+''.join(parts)+'</g>')
for floor in (1,2,3,4):
    parts=[]; labs=[]
    for b,lst in sorted(plots.items()):
        for on,p in lst:
            if b==4 and floor==1 and on in ('06','07'): continue
            uid=f'unit-{b}-{floor}{on}'
            parts.append(f'<polygon id="{uid}" points="{fmt(p)}"/>')
            c=p.mean(0)
            labs.append(f'<text class="site-plan_unit-label" data-for="{uid}" x="{c[0]*S:.1f}" y="{c[1]*S:.1f}" text-anchor="middle" dominant-baseline="central">{floor}{on}</text>')
    svg.append(f'<g data-floor="{floor}">'+''.join(parts)+'<g data-layer="unit-labels">'+''.join(labs)+'</g></g>')
svg.append('</svg>')
open(P+'oh-site-plan.svg','w').write('\n'.join(svg))
ids='\n'.join(svg).count('id="'); print('svg ids',ids)
# preview
prev=np.array(Image.fromarray(outu8).resize((1690,1490),Image.LANCZOS)).copy()
col={'available':(127,151,128),'reserved':(221,179,101),'sold':(126,126,125),'unreleased':(181,179,173)}
ov=prev.copy()
for b in foots: cv2.fillPoly(ov,[np.round(foots[b]*S).astype(np.int32)],(214,206,192))
for b,lst in plots.items():
    for on,p in lst:
        cv2.fillPoly(ov,[np.round(p*S).astype(np.int32)],col[status.get(f'{b}-1{on}','unreleased')])
prev=(prev*0.35+ov*0.65).astype(np.uint8)
for b in foots: cv2.polylines(prev,[np.round(foots[b]*S).astype(np.int32)],True,(120,100,80),1,cv2.LINE_AA)
for b,lst in plots.items():
    for on,p in lst:
        cv2.polylines(prev,[np.round(p*S).astype(np.int32)],True,(255,255,255),1,cv2.LINE_AA)
        if status.get(f'{b}-1{on}','unreleased')!='unreleased':
            c=(p*S).mean(0); cv2.putText(prev,'1'+on,(int(c[0])-10,int(c[1])+4),cv2.FONT_HERSHEY_SIMPLEX,0.33,(60,50,40),1,cv2.LINE_AA)
    c=foots[b].mean(0)*S; cv2.putText(prev,LETTER[b],(int(c[0])-8,int(c[1])+8),cv2.FONT_HERSHEY_SIMPLEX,0.8,(95,77,63),2,cv2.LINE_AA)
for f in feat:
    cv2.putText(prev,f['text'],(int(f['x']*S)-40,int(f['y']*S)),cv2.FONT_HERSHEY_SIMPLEX,0.4,(90,80,70),1,cv2.LINE_AA)
Image.fromarray(prev).save(P+'composite2-preview.png')
print('done')
