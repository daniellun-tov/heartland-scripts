import numpy as np, cv2
from PIL import Image
inner=np.array(Image.open('bg-full.png').convert('RGB')).astype(np.float32)      # v2 styled SDP (site interior)
outer=np.array(Image.open('brochure-warped.png').convert('RGB')).astype(np.float32) # brochure with faded surroundings
H,W=inner.shape[:2]
hull=np.load('hull.npy').reshape(-1,1,2).astype(np.int32)
site=np.zeros((H,W),np.uint8); cv2.fillPoly(site,[hull],1)
cv2.fillPoly(site,[np.array([[1180,640],[1400,600],[1410,790],[1210,780]],np.int32)],1)   # gate road stub
site=cv2.dilate(site,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
m=cv2.GaussianBlur(site.astype(np.float32),(0,0),10)[...,None]
paper=np.array([246,244,238],np.float32); sand=np.array([242,239,230],np.float32)
# outside: brochure, washed towards paper and slightly warmed so it reads as context
out_ctx=outer*0.62+paper*0.38
out_ctx=out_ctx*0.96+sand*0.04
# navy boundary line in the brochure -> warm mid tone (kept as the estate edge)
hsv=cv2.cvtColor(np.clip(outer,0,255).astype(np.uint8),cv2.COLOR_RGB2HSV).astype(np.float32)
navy=(hsv[...,0]>100)&(hsv[...,0]<135)&(hsv[...,1]>60)&(hsv[...,2]<140)
out_ctx=np.where(navy[...,None],np.array([176,166,150],np.float32),out_ctx)
comp=inner*m+out_ctx*(1-m)
u8=np.clip(comp,0,255).astype(np.uint8)
Image.fromarray(u8).save('bg3-full.png'); Image.fromarray(u8).save('bg3-3380.webp',quality=80)
Image.fromarray(u8).resize((1690,1490),Image.LANCZOS).save('bg3-preview.png')
print('ok')
