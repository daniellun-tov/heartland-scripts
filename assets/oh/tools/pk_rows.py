import json, numpy as np, cv2, itertools, collections
from PIL import Image
ROWS=[(1,6),(7,12),(13,13),(14,19),(20,29),(30,48),(49,64),(65,67),
 (68,73),(74,74),(75,80),(81,86),(87,95),(96,101),
 (102,107),(108,108),(109,114),(115,120),(121,126),(127,131),(132,136),(137,142),
 (143,146),(147,152),(153,153),(154,159),(160,165),(166,171),(172,173),(174,187),(188,192),(193,206),
 (207,221),(222,237),(238,252),(253,264),(265,265),(266,282),(283,293),(294,297),(298,311),(312,330),(331,332),
 (333,338),(339,339),(340,345),(346,346),(347,352),(353,363),(364,376),(377,388),(389,391),(392,399),(400,414),
 (415,420),(421,421),(422,427),(428,433),(434,442),(443,446),(447,450),(451,463)]
cover=collections.Counter()
for a,b in ROWS:
    for n in range(a,b+1): cover[n]+=1
print('coverage ok' if all(cover[n]==1 for n in range(1,464)) and len(cover)==463 else ('BAD', [n for n in range(1,464) if cover[n]!=1], [n for n in cover if n>463]))
raw=json.load(open('pk_ocr_all.json'))
cands=collections.defaultdict(list)
for r in raw:
    if r['text'].isdigit() and 1<=int(r['text'])<=463 and r['conf']>=0.4:
        cands[int(r['text'])].append((r['x'],r['y'],r['conf']))
result={}; flags=[]
for a,b in ROWS:
    pts=[(n,x,y,c) for n in range(a,b+1) for (x,y,c) in cands.get(n,[])]
    if a==b:
        if pts:
            best=max(pts,key=lambda t:t[3]); result[a]=dict(x=best[1],y=best[2],v=None,src='single')
        else: flags.append(('single-missing',a))
        continue
    best=None
    for p,q in itertools.combinations(pts,2):
        if p[0]==q[0]: continue
        v=np.array([(q[1]-p[1])/(q[0]-p[0]),(q[2]-p[2])/(q[0]-p[0])])
        step=np.hypot(*v)
        if step<14 or step>40: continue
        P0=np.array([p[1],p[2]])-v*(p[0]-a)
        inl=[t for t in pts if np.hypot(*(P0+v*(t[0]-a)-[t[1],t[2]]))<9]
        nums=len(set(t[0] for t in inl)); score=nums+sum(t[3] for t in inl)*0.1
        if best is None or score>best[0]: best=(score,P0,v,inl)
    if best is None or len(set(t[0] for t in best[3]))<2:
        flags.append(('row-unfit',a,b,len(pts))); continue
    # least squares refine on inliers
    inl=best[3]; A=np.array([[1,t[0]-a] for t in inl],float); X=np.array([[t[1],t[2]] for t in inl],float)
    sol=np.linalg.lstsq(A,X,rcond=None)[0]; P0,v=sol[0],sol[1]
    for n in range(a,b+1):
        pos=P0+v*(n-a); result[n]=dict(x=float(pos[0]),y=float(pos[1]),v=[float(v[0]),float(v[1])],src='row',inliers=len(set(t[0] for t in inl)))
print('placed',len(result),'flags',flags)
json.dump({str(k):v for k,v in result.items()},open('pk_rows.json','w'))
im=np.array(Image.open('parking-raw.png').convert('RGB'))
for n,c in result.items():
    cv2.circle(im,(int(c['x']),int(c['y'])),3,(200,0,0),-1)
    cv2.putText(im,str(n),(int(c['x'])+3,int(c['y'])-3),cv2.FONT_HERSHEY_SIMPLEX,0.4,(200,0,0),1,cv2.LINE_AA)
Image.fromarray(im).save('pk_rows_overlay.png')
for k,(x,y) in enumerate([(650,200),(1550,200),(2450,200),(650,900),(1550,900),(2450,900),(650,1600),(1550,1600)]):
    Image.fromarray(im[y:y+700,x:x+900]).resize((1800,1400)).save(f'r{k}.png')
