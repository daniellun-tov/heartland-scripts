import easyocr, numpy as np, cv2, json, sys, time
from PIL import Image
r=easyocr.Reader(['en'],gpu=False,verbose=False)
im=np.array(Image.open('parking-raw.png').convert('RGB'))
H,W=im.shape[:2]
hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV)
# variant 2: whiten saturated fills so digits on red/blue read like on white
sat=(hsv[...,1]>60)&(hsv[...,2]>90)
im2=im.copy(); im2[sat]=(255,255,255)
X0,Y0,X1,Y1=650,200,3350,2300
T,OV,S=600,80,3
out=[]
t0=time.time()
for vi,src in enumerate([im,im2]):
    for y in range(Y0,Y1,T-OV):
        for x in range(X0,X1,T-OV):
            tile=src[y:min(y+T,Y1), x:min(x+T,X1)]
            if tile.size==0: continue
            big=cv2.resize(tile,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
            res=r.readtext(big,allowlist='0123456789',text_threshold=0.45,low_text=0.3,mag_ratio=1.0)
            for box,txt,conf in res:
                if not txt: continue
                b=np.array(box)/S
                out.append(dict(v=vi,x=float(b[:,0].mean()+x),y=float(b[:,1].mean()+y),w=float(b[:,0].max()-b[:,0].min()),h=float(b[:,1].max()-b[:,1].min()),text=txt,conf=float(conf)))
            print(vi,x,y,len(res),round(time.time()-t0),flush=True)
    json.dump(out,open('pk_ocr_raw.json','w'))
print('done',len(out))
