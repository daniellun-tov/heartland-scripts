geo=open('block_geo.json').read(); mod=open('module.js').read().replace('__OH_BLOCK_GEO__',geo)
js=open('/mnt/user-data/uploads/heartland-oh/heartland-oh.js').read()
assert js.count("function deepLinked() { return /[?&](unit|unitType|type)=/.test(location.search); }")==1
js=js.replace("function deepLinked() { return /[?&](unit|unitType|type)=/.test(location.search); }","function deepLinked() { return /[?&](unit|unitType|type|block)=/.test(location.search); }"); a="var cb = document.querySelector('.site-plan_colourby');"
assert js.count(a)==1
js=js.replace(a,"var cb = document.querySelector('.site-plan_toolbar .site-plan_colourby:not(.oh-viewswitch)');")
c2="el.textContent = n ? n + (n === '1' ? ' unit' : ' units') : '';"
assert js.count(c2)==1
js=js.replace(c2,"el.textContent = n ? n + ' available' : '';")
b="stage.innerHTML = '';\n      if (!it) return;"
assert js.count(b)==1
js=js.replace(b,"Array.prototype.slice.call(stage.children).forEach(function (c) { if (!c.hasAttribute('data-oh-ud') && !c.hasAttribute('data-oh-fpbtn')) stage.removeChild(c); });\n      if (!it) return;")
c="var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/698dc3b31548f3fe0dc66daa_img-3d-buildings-render.webp';"
assert js.count(c)==1
js=js.replace(c,"var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6ad07dd846fd3fd8d358d1ff_img-3d-estate-render-v2.webp';")
unit=open('unit.js').read()
open('build/heartland-oh.js','w').write(js.rstrip('\n')+'\n'+mod+'\n'+unit)
css=open('/mnt/user-data/uploads/heartland-oh/assets/oh/oh-v2.css').read(); open('build/oh-v2.css','w').write(css.rstrip('\n')+'\n'+open('module.css').read())
