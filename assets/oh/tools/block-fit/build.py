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
js=js.replace(c,"var SITE_RENDER = 'https://cdn.prod.website-files.com/6970cf094bb784f13005382e/6ad07dd846fd3fd8d358d1ff_img-3d-estate-render-v2.avif';")
a2="      var mq = window.matchMedia('(min-width: 992px)');\n      var place = function () {"
assert js.count(a2)==1
# 16 Oct (Daniel): desktop keeps the price + Reserve bar sticky at the bottom like mobile, the tabs stay in the body
js=js.replace(a2,"      var mq = window.matchMedia('(min-width: 99999px)');   /* 16 Oct: never - the bar stays at the bottom on desktop too */\n      var place = function () {")
# 16 Oct: lightbox arrows readable on any picture - chevron icons instead of the thin text glyphs
for g,d in (('&lsaquo;','M15 18l-6-6 6-6'),('&rsaquo;','M9 6l6 6-6 6')):
    old='aria-label="%s">%s</button>' % ('Previous' if g=='&lsaquo;' else 'Next', g)
    assert js.count(old)==1, old
    js=js.replace(old,'aria-label="%s"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="%s"/></svg></button>' % ('Previous' if g=='&lsaquo;' else 'Next', d))
# 16 Oct (Daniel: the loader vanished while the plots were still loading): the fallback may play the reveal, but the
# loader stays until the plan and the unit data are actually in (30s hard cap)
V0="""      if (veil) {
        veil.classList.add('is-out');
        setTimeout(function () { if (veil && veil.parentNode) veil.parentNode.removeChild(veil); }, 520);
      }"""
assert js.count(V0)==1
js=js.replace(V0,"      hideVeil();")
V1="    function play() {\n      if (played) return;"
assert js.count(V1)==1
js=js.replace(V1,"""    function hideVeil(force) {
      if (!veil || (!force && !(marks.plan && marks.data))) return;
      var v = veil; veil = null;
      v.classList.add('is-out');
      setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 520);
    }
    setTimeout(function () { hideVeil(true); }, 30000);
"""+V1)
M0="        if (marks.plan && marks.data && marks.image) play();"
assert js.count(M0)==1
js=js.replace(M0,M0+"\n        if (played) hideVeil();")
# 16 Oct (page speed): the prep also sizes and centres the plan the way the viewport module will, and sets the
# phone 3D landing class, so nothing moves when the deferred bundle takes over (keeps CLS at its old level)
END="  document.documentElement.classList.remove('oh-app-pending');\n})();"
assert js.count(END)==1
PREFIT=open('prefit.js').read()
js=js.replace(END, PREFIT.rstrip('\n')+'\n'+END)
# 16 Oct (page speed): the page-prep module also ships inline in the page footer (build/oh-prep.js), so the
# app shell shows when the HTML is parsed instead of after every deferred script; whichever copy runs first wins
P0="(function () {\n  var box = document.querySelector('.unit-filter_map-container');"
assert js.count(P0)==1
G="(function () {\n  /* inline copy already ran: start the reveal's 9s fallback now, from when the bundle runs, as it always did */\n  if (window.ohPrepDone) { if (window.ohMapLoader && window.ohMapLoader.arm) window.ohMapLoader.arm(9000); return; }\n  window.ohPrepDone = true;\n  var box = document.querySelector('.unit-filter_map-container');"
# 16 Oct: the fallback that plays the reveal regardless used to start when the bundle ran. Run inline, it started at
# HTML parse, seconds earlier, and on slow loads cleared the loader before the plots arrived. The inline copy now arms
# only a 20s safety net (the bundle never arriving); the bundle re-arms the usual 9s when it runs.
T0="    setTimeout(play, 9000);\n  })();"
assert js.count(T0)==1
js=js.replace(T0,"""    var fallback = 0;
    window.ohMapLoader.arm = function (ms) { clearTimeout(fallback); fallback = setTimeout(play, ms); };
    var cs = document.currentScript;
    window.ohMapLoader.arm(cs && cs.src ? 9000 : 20000);
  })();""")
js=js.replace(P0,G)
i=js.index('/* ============================================================\n   Page prep'); k=js.index(G); e=js.index("  document.documentElement.classList.remove('oh-app-pending');\n})();",k)+len("  document.documentElement.classList.remove('oh-app-pending');\n})();")
open('build/oh-prep.js','w').write(js[i:e]+'\n')
unit=open('unit.js').read()
enq=open('enquire.js').read()
open('build/heartland-oh.js','w').write(js.rstrip('\n')+'\n'+mod+'\n'+unit+'\n'+enq)
css=open('/mnt/user-data/uploads/heartland-oh/assets/oh/oh-v2.css').read(); open('build/oh-v2.css','w').write(css.rstrip('\n')+'\n'+open('module.css').read())
