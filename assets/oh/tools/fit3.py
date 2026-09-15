import json, math, numpy as np, cv2
from PIL import Image
from scipy.optimize import minimize
img=np.array(Image.open('ground-1.png').convert('RGB')); H,W=img.shape[:2]
R,G,B=[img[...,i].astype(int) for i in range(3)]
dark=(B>90)&(R<60)&(G>70)&(G<150); light=(R<G-12)&(R<B-12)&(G>190)&(R>150)
pink=(R>220)&(G>150)&(G<215)&(B>160)&(B<225)&(R-G>25)
pale=(R>236)&(G>=222)&(G<=244)&(B>=224)&(B<=246)&(R-G>=4)&(R-G<=22)
k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
TM={'A':cv2.morphologyEx((dark|light).astype(np.uint8),cv2.MORPH_OPEN,k),'C':cv2.morphologyEx(pink.astype(np.uint8),cv2.MORPH_OPEN,k),'B':cv2.morphologyEx(pale.astype(np.uint8),cv2.MORPH_OPEN,k)}
units=json.load(open('unit_paths.json')); fit=json.load(open('fit.json'))
live=json.load(open('../units-live.json')); typ={u['unit_number']:u['type_code'] for u in live}
SETS={'A':['A1','A2','A3','A4','A5','A6'],'B1':['B11','B12','B13','B14','B15','B16','B17'],'B2':['B21','B22','B23','B24','B25','B26','B27']}
def transform(polys,sx,sy,ang,mirror,cx,cy,fcx,fcy):
    a=math.radians(ang); ca,sa=math.cos(a),math.sin(a); out=[]
    for p in polys:
        q=np.array(p,dtype=np.float64).copy(); q[:,0]-=fcx; q[:,1]-=fcy
        if mirror: q[:,0]=-q[:,0]
        q[:,0]*=sx; q[:,1]*=sy
        out.append(np.stack([q[:,0]*ca-q[:,1]*sa+cx,q[:,0]*sa+q[:,1]*ca+cy],1))
    return out
def iou(polys,target,x0,y0):
    c=np.zeros_like(target)
    for p in polys: cv2.fillPoly(c,[np.round(p-[x0,y0]).astype(np.int32)],1)
    i=np.logical_and(c,target).sum(); u=np.logical_or(c,target).sum(); return i/u if u else 0
out={}
for b,r in fit.items():
    names=SETS[r['set']]; polys=[np.array(units[n]) for n in names]; fcx,fcy=r['fcx'],r['fcy']
    types=[typ.get(f"{b}-1{n[-1].zfill(2)}") or 'A' for n in names]
    cur=transform(polys,r['s'],r['s'],r['ang'],r['mirror'],r['cx'],r['cy'],fcx,fcy)
    allp=np.concatenate(cur); x0,y0=max(0,int(allp[:,0].min())-90),max(0,int(allp[:,1].min())-90); x1,y1=min(W,int(allp[:,0].max())+90),min(H,int(allp[:,1].max())+90)
    tg={t:TM[t][y0:y1,x0:x1] for t in TM}
    mirror=False if b=='10' else r['mirror']
    groups={t:[i for i,tt in enumerate(types) if tt==t] for t in set(types)}
    wts={t:sum(cv2.contourArea(np.float32(polys[i])) for i in ids) for t,ids in groups.items()}; tot=sum(wts.values())
    def score(g):
        return sum(wts[t]/tot*iou([g[i] for i in ids],tg[t],x0,y0) for t,ids in groups.items())
    def f(v): return -score(transform(polys,v[0],v[1],v[2],mirror,v[3],v[4],fcx,fcy))
    starts=[[r['s'],r['s'],r['ang'],r['cx'],r['cy']]]
    if b=='10' or r['set']!='A':
        cands=sorted((f([r['s'],r['s'],a,r['cx'],r['cy']]),a) for a in range(0,360,3))
        starts=[[r['s'],r['s'],a,r['cx'],r['cy']] for _,a in cands[:3]]+starts
    best=None
    for s0 in starts:
        res=minimize(f,s0,method='Powell',options={'xtol':1e-3,'ftol':1e-5,'maxiter':4000})
        if best is None or res.fun<best.fun: best=res
    sx,sy,ang,cx,cy=best.x; g=transform(polys,sx,sy,ang,mirror,cx,cy,fcx,fcy)
    refined=[]
    for i,p in enumerate(g):
        pc=p.mean(0); t=types[i]
        def fu(v):
            a=math.radians(v[2]); ca,sa=math.cos(a),math.sin(a); q=p-pc
            q=np.stack([q[:,0]*ca-q[:,1]*sa,q[:,0]*sa+q[:,1]*ca],1)+pc+[v[0],v[1]]
            return -iou([q],tg[t],x0,y0)
        bu=None
        for dx in (-6,0,6):
            for dy in (-6,0,6):
                rr=minimize(fu,[dx,dy,0],method='Powell',options={'xtol':1e-2,'maxiter':400})
                if bu is None or rr.fun<bu.fun: bu=rr
        v=bu.x; v[0]=np.clip(v[0],-10,10); v[1]=np.clip(v[1],-10,10); v[2]=np.clip(v[2],-3,3)
        a=math.radians(v[2]); ca,sa=math.cos(a),math.sin(a); q=p-pc
        refined.append((np.stack([q[:,0]*ca-q[:,1]*sa,q[:,0]*sa+q[:,1]*ca],1)+pc+[v[0],v[1]]).tolist())
    sc_g=-best.fun; sc_r=score([np.array(q) for q in refined])
    print(b,r['set'],'score',round(sc_g,3),'-> refined',round(sc_r,3),'ang',round(ang,1),'s',round(sx,3),round(sy,3),'mirror',mirror)
    out[b]=dict(set=r['set'],names=names,types=types,polys=refined,score=sc_r,mirror=mirror,ang=ang,sx=sx,sy=sy,cx=cx,cy=cy,fcx=fcx,fcy=fcy)
json.dump(out,open('fit3.json','w'))
ov=img.copy()
for b,r in out.items():
    for n,p in zip(r['names'],r['polys']):
        cv2.polylines(ov,[np.round(np.array(p)).astype(np.int32)],True,(255,0,0),3)
        c=np.array(p).mean(0); cv2.putText(ov,n[-1],(int(c[0])-10,int(c[1])+10),cv2.FONT_HERSHEY_SIMPLEX,1.0,(200,0,0),2)
Image.fromarray(ov).resize((1690,1490)).save('fit3-preview.png')
Image.fromarray(ov[100:800,2100:3000]).resize((900,700)).save('fit3-b2.png')
Image.fromarray(ov[1500:2300,0:800]).resize((800,800)).save('fit3-b10.png')
