import numpy as np, cv2, json, subprocess, re, sys
from PIL import Image
im=np.array(Image.open('parking-raw.png').convert('RGB'))
H,W=im.shape[:2]
g=im.astype(int)
white=((g.min(2)>195)).astype(np.uint8)
white=cv2.morphologyEx(white,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
n,lab,st,cen=cv2.connectedComponentsWithStats(white,connectivity=4)
boxes=[]
for i in range(1,n):
    x,y,w,h,a=[int(v) for v in st[i]]
    if 7<=w<=34 and 5<=h<=16 and a>=0.5*w*h and 0.9<=w/h<=4:
        inner=g[y:y+h,x:x+w]
        darkpx=int((inner.sum(2)<400).sum())
        if darkpx>=4: boxes.append((x,y,w,h,a,darkpx))
print(len(boxes))
json.dump(boxes,open('pk_boxes.json','w'))
ov=im.copy()
for x,y,w,h,a,d in boxes: cv2.rectangle(ov,(x-1,y-1),(x+w,y+h),(255,0,0),1)
Image.fromarray(ov[600:1100,2000:2700]).resize((1400,1000)).save('pk_boxes_crop.png')
