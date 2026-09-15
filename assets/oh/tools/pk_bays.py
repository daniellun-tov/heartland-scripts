import json, numpy as np, cv2
from PIL import Image
im=np.array(Image.open('parking-raw.png').convert('RGB')).astype(int)
H,W=im.shape[:2]
rows=json.load(open('pk_rows.json'))
M=np.array(json.load(open('brochure2raster.json')))
pos={int(k):v for k,v in rows.items()}
# orientation for singles: nearest row bay's v
withv=[(n,v) for n,v in pos.items() if v['v']]
for n,v in pos.items():
    if not v['v']:
        m=min(withv,key=lambda t:np.hypot(t[1]['x']-v['x'],t[1]['y']-v['y']))
        v['v']=m[1]['v']; v['single']=True
def colour_at(x,y):
    x=int(round(x)); y=int(round(y))
    if 0<=x<W and 0<=y<H: return im[y,x]
    return None
def scan(cx,cy,dx,dy,ref,maxd):
    d=9; last=9
    while d<maxd:
        c=colour_at(cx+dx*d,cy+dy*d)
        if c is None: break
        # allow thin lines: look ahead 3px
        if np.abs(c-ref).sum()>90:
            c2=colour_at(cx+dx*(d+3),cy+dy*(d+3))
            if c2 is None or np.abs(c2-ref).sum()>90: break
        last=d; d+=1
    return last
bays=[]
for n in sorted(pos):
    p=pos[n]; v=np.array(p['v']); w=np.hypot(*v); u=v/w; perp=np.array([-u[1],u[0]])
    cx,cy=p['x'],p['y']
    # reference fill colour: sample at +-(w*0.45) along the row? no - sample just outside the label box along perp
    samples=[colour_at(cx+perp[0]*s,cy+perp[1]*s) for s in (10,-10,12,-12)]
    samples=[s for s in samples if s is not None]
    ref=np.median(np.array(samples),0)
    d1=scan(cx,cy,perp[0],perp[1],ref,int(w*1.6)); d2=scan(cx,cy,-perp[0],-perp[1],ref,int(w*1.6))
    if d1+d2<1.3*w or p.get('single'):
        d1=d2=w  # fallback 2:1 bay
    depth=d1+d2
    # if strongly asymmetric, still trust
    c=np.array([cx,cy]); hw=u*(w*0.5)
    poly=np.array([c+perp*d1-hw, c+perp*d1+hw, c-perp*d2+hw, c-perp*d2-hw])
    polyR=(M[:,:2]@poly.T).T+M[:,2]
    bays.append(dict(bay=f'PB{n}',n=n,poly=polyR.round(1).tolist(),poly_b=poly.round(1).tolist(),w=float(round(w,1)),depth=float(round(depth,1)),tandem=bool(depth>2.7*w)))
json.dump(bays,open('bays.json','w'))
print(len(bays),'tandem',sum(b['tandem'] for b in bays),'mean w',np.mean([b['w'] for b in bays]).round(1),'depth/w',np.median([b['depth']/b['w'] for b in bays]).round(2))
ov=np.array(Image.open('parking-raw.png').convert('RGB'))
for b in bays: cv2.polylines(ov,[np.round(np.array(b['poly_b'])).astype(np.int32)],True,(220,0,0),1,cv2.LINE_AA)
Image.fromarray(ov[600:1300,2000:2900]).resize((1800,1400)).save('bays_crop.png')
Image.fromarray(ov).resize((1723,1245)).save('bays_all.png')
