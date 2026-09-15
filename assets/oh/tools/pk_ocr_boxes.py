import easyocr, numpy as np, cv2, json
from PIL import Image
r=easyocr.Reader(['en'],gpu=False,verbose=False)
im=np.array(Image.open('parking-raw.png').convert('RGB'))
boxes=json.load(open('pk_boxes.json'))
out=[]
for (x,y,w,h,a,d) in boxes:
    pad=6
    crop=im[max(0,y-pad):y+h+pad, max(0,x-pad):x+w+pad]
    big=cv2.resize(crop,None,fx=6,fy=6,interpolation=cv2.INTER_CUBIC)
    big=cv2.copyMakeBorder(big,30,30,30,30,cv2.BORDER_CONSTANT,value=(255,255,255))
    res=r.readtext(big,allowlist='0123456789',text_threshold=0.4,low_text=0.3,mag_ratio=1.0,detail=1)
    if not res: continue
    best=max(res,key=lambda t:t[2])
    out.append(dict(v=2,x=x+w/2,y=y+h/2,w=w,h=h,text=best[1],conf=float(best[2])))
json.dump(out,open('pk_ocr_boxes.json','w'))
import collections
print(len(out), collections.Counter(int(o['text']) for o in out if o['text'].isdigit()).most_common(5))
print(sorted(int(o['text']) for o in out if o['text'].isdigit() and o['conf']>0.5))
