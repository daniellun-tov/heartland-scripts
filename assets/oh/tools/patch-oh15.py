#!/usr/bin/env python3
# patch-oh15.py - the panel's Share button gets the WhatsApp mark (Daniel, 19 Sep).
#
# The home page's "Share on Whatsapp" is the filled component with an
# icon-button before the label. Here the button must stay the OUTLINE variant
# at its current size, and the label must stay "Share" - so rather than change
# the component, the icon is drawn on the label's ::before.
#
# Why a pseudo-element: on this component the outline, radius and padding live
# on .label-button, so a sibling .icon-button would sit outside the pill. Drawn
# on .button-text::before the mark is inside the outline, and because it is
# painted with currentColor through a mask it takes the label's exact colour -
# including whatever the Designer's hover state does - with no JS and nothing
# for Wized's re-render to wipe out.
#   python3 patch-oh15.py assets/oh/oh-v2.css
import sys
p = sys.argv[1]
c = open(p).read()
ICON = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6979e6af9f16002b40f6d7a2_icon-whatsapp.svg'
CSS = '''
/* ---- Share button: the WhatsApp mark, inside the outline ----------------- */
.unit-details_actionbar-share .label-button{display:flex;align-items:center}
.unit-details_actionbar-share .button-text{display:inline-flex;align-items:center;white-space:nowrap}
.unit-details_actionbar-share .button-text::before{
  content:"";flex:none;width:1.05em;height:1.05em;margin-right:.45em;
  background-color:currentColor;
  -webkit-mask:url("%s") no-repeat center/contain;
          mask:url("%s") no-repeat center/contain}
''' % (ICON, ICON)
assert '.unit-details_actionbar-share .button-text::before' not in c
open(p, 'w').write(c.rstrip() + '\n' + CSS)
print('ok')
