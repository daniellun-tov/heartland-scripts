# bg4: bg3 with the outer edges faded to sand-50 (#f2efe6) so the plan has no visible border
import numpy as np
from PIL import Image
im=np.asarray(Image.open('bg3-full.png').convert('RGB')).astype(np.float32)
h,w=im.shape[:2]
sand=np.array([242,239,230],np.float32)
# distance to the nearest edge, normalised; fade over the outer 11% of each axis with a smoothstep
y=np.arange(h)[:,None]; x=np.arange(w)[None,:]
dx=np.minimum(x,w-1-x)/(0.11*w); dy=np.minimum(y,h-1-y)/(0.11*h)
d=np.minimum(np.minimum(dx,dy),1.0)
t=d*d*(3-2*d)             # 0 at the edge -> 1 inside
a=t[...,None]
out=im*a+sand*(1-a)
u8=np.clip(out+0.5,0,255).astype(np.uint8)
Image.fromarray(u8).save('bg4-full.png'); Image.fromarray(u8).save('bg4-3380.webp',quality=80)
Image.fromarray(u8).resize((845,745),Image.LANCZOS).save('bg4-preview.png')
print(u8.shape)
