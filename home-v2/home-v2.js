/* Stellenbosch Village — home v2 (/home-new). Behaviour only: every element is a native Webflow element.
   data-mod holds modifier/state tokens (theme, size, alignment): they become classes here so the
   animation code can toggle them; the stylesheet matches both forms so nothing shifts before this runs. */
(function(){
  document.documentElement.classList.add('homev2');
  document.querySelectorAll('[data-mod]').forEach(el=>{ el.classList.add(...el.getAttribute('data-mod').split(/\s+/).filter(Boolean)); el.removeAttribute('data-mod'); });
  const ls=document.querySelector('.section_homev2-location'); if(ls&&!ls.id) ls.id='location'; /* Webflow will not store this id */
  document.querySelectorAll('[data-button]').forEach(a=>a.addEventListener('click',e=>e.preventDefault()));
})();
(function(){
  const page=document.querySelector('.homev2_page');
  const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G=!!window.gsap;
  const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
  if(G){ gsap.registerPlugin(ScrollTrigger, CustomEase); ScrollTrigger.config({ignoreMobileResize:true}); CustomEase.create('out','.25,1,.5,1'); CustomEase.create('io','.75,0,.25,1'); CustomEase.create('in','.5,0,.75,0'); }

  /* ===== line splitter: groups words into lines and wraps each line in a mask ===== */
  function splitLines(el){
    if(el._orig==null) el._orig=el.innerHTML;
    el.innerHTML=el._orig;
    const parts=[];
    [...el.childNodes].forEach(n=>{
      if(n.nodeType===3){ n.textContent.split(/(\s+)/).forEach(t=>{ if(!t) return; if(/^\s+$/.test(t)) parts.push(document.createTextNode(t)); else { const w=document.createElement('span'); w.className='w'; w.textContent=t; parts.push(w); } }); }
      else if(n.nodeName==='BR'){ parts.push(n.cloneNode()); }
      else { (n.textContent||'').split(/(\s+)/).forEach(t=>{ if(!t) return; if(/^\s+$/.test(t)) parts.push(document.createTextNode(t)); else { const c=n.cloneNode(false); c.textContent=t; const w=document.createElement('span'); w.className='w'; w.appendChild(c); parts.push(w); } }); }
    });
    el.innerHTML=''; parts.forEach(p=>el.appendChild(p));
    const lines=[]; let cur=null, top=null;
    parts.forEach(p=>{
      if(p.nodeType===1 && p.classList.contains('w')){ const t=Math.round(p.offsetTop); if(top===null||Math.abs(t-top)>4){ cur=[]; lines.push(cur); top=t; } }
      if(!cur){ cur=[]; lines.push(cur); }
      cur.push(p);
    });
    el.innerHTML='';
    return lines.map(ln=>{ const m=document.createElement('span'); m.className='lmask'; const i=document.createElement('span'); i.className='lin'; ln.forEach(p=>i.appendChild(p)); m.appendChild(i); el.appendChild(m); return i; });
  }
  window.__splitLines=splitLines;
  const LINE_SEL='p:is(.homev2_body,.is-body), .feat li > span, .slide > p:not(.homev2_eyebrow), .homev2-reasons_grid .homev2-reasons_small, .homev2-types_component .homev2-types_text, .stature-p, .lead, .homev2-rarity_quote-text, .pm p, .homev2-location_paragraph, .homev2-register_paragraph, .homev2-reasons_grid h4, .slide h4, .pm h3, .plan-card h3, .plan-card p, .homev2-homes_closing, p.homev2-care_caption, .price-line, .homev2-stats_grid .homev2-stats_label, .homev2-rarity_quote cite, p.homev2_eyebrow:not(#amEb):not(.homev2-village_overlay .homev2_eyebrow):not(.homev2-features_slide:not(.is-on) .homev2_eyebrow), .homev2-features_slide.is-on .homev2-features_title, .homev2-features_slide.is-on .homev2-features_body';
  const lineEls=$$(LINE_SEL).filter(el=>!el.closest('.homev2-features_slide:not(.is-on)') && !el.closest('.homev2-menu_sheet,.homev2-loader_component,.homev2-vitality_footer,#peace'));
  lineEls.forEach(el=>{ el.classList.remove('is-rev'); el.style.removeProperty('opacity'); el.style.removeProperty('transform'); });
  function revealLines(el,delay){
    const ls=splitLines(el); el._done=false;
    gsap.fromTo(ls,{yPercent:110},{yPercent:0,duration:1.15,ease:'out',stagger:.09,delay:delay||0,onComplete(){ el.innerHTML=el._orig; el._done=true; }});
  }
  if(G&&!rm){
    (document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{
      lineEls.forEach(el=>{ const ls=splitLines(el); gsap.set(ls,{yPercent:110});
        ScrollTrigger.create({trigger:el,start:'top 88%',once:true,onEnter(){ revealLines(el); }}); });
      let rt; addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ lineEls.forEach(el=>{ if(el._done===undefined){ const ls=splitLines(el); gsap.set(ls,{yPercent:110}); } }); },200); });
      ScrollTrigger.refresh();
    });
  }

  /* ===== FAQ: eased height; the answer rises line by line ===== */
  function faqSet(li,open){
    const a=$('.homev2-faq_answer',li), p=$('p',a), b=$('[data-button]',li);
    li.classList.toggle('is-open',open); b.setAttribute('aria-expanded',open);
    if(!G||rm){ a.style.height=open?'auto':'0px'; return; }
    gsap.killTweensOf(a);
    if(open){
      gsap.fromTo(a,{height:a.offsetHeight},{height:'auto',duration:.9,ease:'io',onComplete(){ ScrollTrigger.refresh(); }});
      const ls=splitLines(p); gsap.fromTo(ls,{yPercent:110},{yPercent:0,duration:1,ease:'out',stagger:.08,delay:.18,onComplete(){ p.innerHTML=p._orig; }});
    } else gsap.to(a,{height:0,duration:.65,ease:'io',onComplete(){ ScrollTrigger.refresh(); }});
  }
  $$('.homev2-faq_list li').forEach(li=>{ const b=$('[data-button]',li); if(!b) return; b.addEventListener('click',()=>{ const o=!li.classList.contains('is-open'); $$('.homev2-faq_list li.is-open').forEach(x=>{ if(x!==li) faqSet(x,false); }); faqSet(li,o); }); });

  /* ===== features slider: slat wipe, callouts pop in, copy rises line by line ===== */
  $$('.homev2-features_component').forEach(fs=>{
    const imgs=$$('.homev2-features_image',fs), cs=$$('.homev2-features_slide',fs), tabs=$$('.fs-tabs [data-button]',fs), n=imgs.length, num=$('.homev2-features_number',fs), bar=$('.homev2-features_bar i',fs);
    let i=0, busy=false;
    function place(){
      imgs.forEach(box=>{ const im=$('img',box); if(!im.naturalWidth) return;
        const W=box.clientWidth,H=box.clientHeight,nw=im.naturalWidth,nh=im.naturalHeight,s=Math.max(W/nw,H/nh),dw=nw*s,dh=nh*s;
        const ox=(W-dw)*(+box.dataset.ox/100), oy=(H-dh)*(+box.dataset.oy/100);
        im.style.objectPosition=(+box.dataset.ox)+'% '+(+box.dataset.oy)+'%'; /* the crop the markers are placed against */
        $$('.homev2-homes_marker',box).forEach(m=>{ const x=ox+dw*m.dataset.x/100, y=oy+dh*m.dataset.y/100; const out=x<0||x>W||y<0||y>H; m.style.left=Math.min(Math.max(x,22),W-22)+'px'; m.style.top=Math.min(Math.max(y,22),H-22)+'px'; m.classList.toggle('is-off', out); });
      });
    }
    imgs.forEach(b=>{ const im=$('img',b); if(im.complete) place(); else im.addEventListener('load',place); });
    addEventListener('resize',place); setTimeout(place,300);
    function pop(box,d){ const m=$$('.homev2-homes_marker',box); if(!G||rm){ m.forEach(x=>x.style.transform='scale(1)'); return; } gsap.fromTo(m,{scale:0},{scale:1,duration:.7,ease:'back.out(2)',stagger:.12,delay:d||0}); }
    function link(c,box){
      const items=$$('.homev2-features_callouts li',c), mks=$$('.homev2-homes_marker',box);
      const hl=k=>{ items.forEach(li=>li.classList.toggle('is-on',li.dataset.n==k)); mks.forEach(m=>m.classList.toggle('is-on',m.dataset.n==k)); };
      items.forEach(li=>{ li.addEventListener('mouseenter',()=>hl(li.dataset.n)); li.addEventListener('mouseleave',()=>hl(0)); li.addEventListener('click',()=>hl(li.dataset.n)); });
      mks.forEach(m=>{ m.style.pointerEvents='auto'; m.style.cursor='pointer'; m.addEventListener('mouseenter',()=>hl(m.dataset.n)); m.addEventListener('mouseleave',()=>hl(0)); m.addEventListener('click',()=>hl(m.dataset.n)); });
    }
    cs.forEach((c,k)=>link(c,imgs[k]));
    function ui(){ num.textContent=String(i+1); bar.style.width=((i+1)/n*100)+'%'; tabs.forEach((t,k)=>t.setAttribute('aria-selected',k===i)); const t=tabs[i]; if(t&&t.scrollIntoView) t.parentElement.scrollTo({left:t.offsetLeft-t.parentElement.offsetLeft-4,behavior:rm?'auto':'smooth'}); }
    ui();
    function go(k){
      if(busy||k===i) return; const from=i; i=(k+n)%n; ui();
      const nb=imgs[i], ob=imgs[from], nc=cs[i], oc=cs[from];
      imgs.forEach((b,j)=>b.setAttribute('aria-hidden',j!==i));
      if(!G||rm){ imgs.forEach((b,j)=>{ b.classList.toggle('is-in',j===i); b.style.zIndex=j===i?2:1; }); cs.forEach((c,j)=>c.classList.toggle('is-on',j===i)); pop(nb); return; }
      busy=true;
      const outEls=$$('.homev2_eyebrow, .homev2-features_title, .homev2-features_body, .homev2-features_callouts li',oc);
      gsap.timeline({onComplete(){ busy=false; }})
        .to(outEls,{opacity:0,y:-14,duration:.4,ease:'io',stagger:.03},0)
        .to($$('.homev2-homes_marker',ob),{scale:0,duration:.3,ease:'io'},0)
        .set(nb,{'--homev2-sh':'0%',zIndex:2},0).set(ob,{zIndex:1},0)
        .to(nb,{'--homev2-sh':'5%',duration:1,ease:'io'},.12)
        .fromTo($('img',nb),{scale:1.12},{scale:1,duration:1.5,ease:'out'},.12)
        .add(()=>{ gsap.set(ob,{'--homev2-sh':'0%'}); },1.15)
        .add(()=>{
          /* the fade-out of the last items can still be running here; kill it so it can't leave the copy at opacity 0 */
          gsap.killTweensOf(outEls); gsap.set(outEls,{clearProps:'opacity,transform'}); oc.classList.remove('is-on'); nc.classList.add('is-on');
          const body=$('.homev2-features_body',nc), t=$('.homev2-features_title',nc);
          gsap.killTweensOf([body,t,$('.homev2_eyebrow',nc)]); gsap.set([body,t],{clearProps:'opacity,transform'});
          const lt=splitLines(t), lb=splitLines(body);
          gsap.fromTo($('.homev2_eyebrow',nc),{opacity:0,y:10},{opacity:.8,y:0,duration:.6,ease:'out'});
          gsap.fromTo(lt,{yPercent:110},{yPercent:0,duration:1,ease:'out',stagger:.08,onComplete(){ t.innerHTML=t._orig; }});
          gsap.fromTo(lb,{yPercent:110},{yPercent:0,duration:1.05,ease:'out',stagger:.08,delay:.15,onComplete(){ body.innerHTML=body._orig; }});
          gsap.fromTo($$('.homev2-features_callouts li',nc),{opacity:0,y:16},{opacity:1,y:0,duration:.8,ease:'out',stagger:.1,delay:.35});
          place(); pop(nb,.25);
          setTimeout(()=>{ [t,body].forEach(el=>{ if(el._orig!=null&&el.querySelector('.w')){ gsap.killTweensOf(el.querySelectorAll('*')); el.innerHTML=el._orig; } }); },2200);
        },.45);
    }
    tabs.forEach(t=>t.addEventListener('click',()=>go(+t.dataset.i)));
    $$('.homev2-features_button',fs).forEach(b=>b.addEventListener('click',()=>go(i+ +b.dataset.d)));
    const st=$('.homev2-features_stage',fs); let sx=null;
    st.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse') sx=e.clientX; });
    let tx=null, ty=null;
    fs.addEventListener('touchstart',e=>{ const t=e.touches[0]; tx=t.clientX; ty=t.clientY; },{passive:true});
    fs.addEventListener('touchend',e=>{ if(tx===null) return; const t=e.changedTouches[0], dx=t.clientX-tx, dy=t.clientY-ty; tx=null; if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.3) go(i+(dx<0?1:-1)); },{passive:true});
    st.addEventListener('pointerup',e=>{ if(sx===null) return; const dx=e.clientX-sx; sx=null; if(Math.abs(dx)>40) go(i+(dx<0?1:-1)); });
    if(G&&!rm) ScrollTrigger.create({trigger:fs,start:'top 75%',once:true,onEnter(){ place(); pop(imgs[0],.2); }});
    else pop(imgs[0]);
  });

  let lenis=window.lenis||null;
  const hookLenis=l=>{ if(!l||l.__homev2) return; l.__homev2=1; lenis=l; if(G) l.on('scroll',ScrollTrigger.update); };
  if(lenis) hookLenis(lenis); else document.addEventListener('sv:lenis-ready',()=>setTimeout(()=>hookLenis(window.lenis),0),{once:true});
  const scrollToY=y=>{ if(lenis) lenis.scrollTo(y,{duration:1.4,easing:t=>1-Math.pow(1-t,4)}); else window.scrollTo({top:y,behavior:rm?'auto':'smooth'}); };
  const topOf=el=>el.getBoundingClientRect().top+window.scrollY;

  if(!rm) $$('.homev2_line > span').forEach(s=>s.style.transform='translateY(110%)');

  /* loader → hero */
  const loader=$('#loader'), num=$('#ldN');
  const heroLines=$$('.is-hero .homev2_line > span');
  function hero(){
    if(!G||rm){ heroLines.forEach(s=>s.style.transform='none'); $('.is-hero .homev2-hero_cta').style.cssText='opacity:1;transform:none'; $$('.is-hero .homev2-hero_split span').forEach(e=>e.style.cssText='opacity:1;transform:none'); return; }
    gsap.timeline()
      .to(heroLines,{y:'0%',duration:1.6,ease:'out',stagger:.12},0)
      .to('.is-hero .homev2-hero_cta',{opacity:1,y:0,duration:1,ease:'out'},.8)
      .to('.is-hero .homev2-hero_split span',{opacity:1,y:0,duration:.9,ease:'out',stagger:.1},.9);
  }
  /* the counter shows real progress: it follows the clock but never passes what the hero video has actually buffered (window.svHero, set by the hero embed);
     at 100 the window opens and the film starts from its first frame */
  const SVH=window.svHero, vidP=()=>SVH?SVH.progress:1, vidReady=SVH&&SVH.ready?SVH.ready:Promise.resolve();
  /* no scrolling while the loader runs (desktop and touch); released when the loader is removed */
  const root=document.documentElement, stopEv=e=>{ if(root.classList.contains('homev2-is-loading')) e.preventDefault(); };
  const stopKeys=e=>{ if(root.classList.contains('homev2-is-loading')&&[' ','PageDown','PageUp','ArrowDown','ArrowUp','Home','End'].includes(e.key)) e.preventDefault(); };
  const lockScroll=()=>{ root.classList.add('homev2-is-loading'); addEventListener('wheel',stopEv,{passive:false}); addEventListener('touchmove',stopEv,{passive:false}); addEventListener('keydown',stopKeys); if(lenis) lenis.stop(); else document.addEventListener('sv:lenis-ready',()=>setTimeout(()=>{ if(root.classList.contains('homev2-is-loading')&&window.lenis) window.lenis.stop(); },0),{once:true}); };
  const unlockScroll=()=>{ root.classList.remove('homev2-is-loading'); removeEventListener('wheel',stopEv); removeEventListener('touchmove',stopEv); removeEventListener('keydown',stopKeys); if(lenis) lenis.start(); };
  /* reload / back: the page starts at the top with the loader and hero, then glides back to where the visitor was */
  try{ history.scrollRestoration='manual'; }catch(e){}
  const posKey='homev2-y:'+location.pathname;
  const navType=((performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{}).type;
  let returnY=0; try{ if(navType==='reload'||navType==='back_forward') returnY=+sessionStorage.getItem(posKey)||0; }catch(e){}
  const savePos=()=>{ if(returnY||root.classList.contains('homev2-is-loading')) return; try{ sessionStorage.setItem(posKey,String(Math.round(scrollY))); }catch(e){} };
  addEventListener('pagehide',savePos); document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') savePos(); });
  const goBack=()=>{ if(!returnY) return; const y=returnY; setTimeout(()=>{ returnY=0; if(G) ScrollTrigger.refresh(); const t=Math.min(y,document.documentElement.scrollHeight-innerHeight);
      if(rm||!G) scrollTo(0,t); else if(lenis) lenis.scrollTo(t,{duration:Math.min(2.8,1.2+t/8000),easing:k=>1-Math.pow(1-k,4)}); else scrollTo({top:t,behavior:'smooth'}); },rm||!G?0:350); };
  if(!G||rm){ loader.remove(); hero(); vidReady.then(()=>SVH&&SVH.play()); goBack(); }
  else{
    lockScroll(); if(scrollY>0) scrollTo(0,0);
    const narrow=matchMedia('(max-width:760px)').matches;
    /* window insets: [top/bottom %, left/right %] */
    const A=narrow?[33,42]:[30,47.2], B=narrow?[20,31]:[17,41.5];
    const sc=$('#heroScene'), veil=$('.is-hero .homev2_veil');
    /* the scene runs one gable height below the hero (it shows behind the next section's gable), so the window is measured on the hero itself, not on the scene */
    const heroBox=$('.is-hero');
    const clipAt=(v,h)=>{ const H=heroBox.offsetHeight, ext=Math.max(0,sc.offsetHeight-H), t=v/100*H; return `inset(${t}px ${h}% ${t+ext}px ${h}%)`; };
    const setWin=(v,h)=>{ sc.style.clipPath=clipAt(v,h); num.style.top=`calc(${100-v}% + 18px)`; };
    const draw=p=>{ setWin(A[0]+(B[0]-A[0])*p, A[1]+(B[1]-A[1])*p); num.textContent=String(Math.round(p*100)).padStart(2,'0'); };
    setWin(A[0],A[1]); gsap.set(['.homev2-nav_component','.is-hero .homev2-hero_split'],{opacity:0}); gsap.set(veil,{opacity:0}); gsap.set(sc,{scale:1.18});
    const clock={p:0}; let shown=0;
    const follow=()=>{ const target=Math.min(clock.p,.99,vidP()); if(target>shown){ shown+=Math.max(.002,(target-shown)*.12); if(shown>target) shown=target; draw(shown); } };
    gsap.ticker.add(follow);
    gsap.to(clock,{p:1,duration:2.4,ease:'io',delay:.15});
    const minTime=new Promise(r=>setTimeout(r,2550)), cap=new Promise(r=>setTimeout(r,20000));  /* a very slow connection still gets the page after 20 s */
    Promise.all([minTime,Promise.race([vidReady,cap])]).then(()=>{
      gsap.ticker.remove(follow);
      const s={p:shown};
      gsap.to(s,{p:1,duration:Math.max(.3,(1-shown)*1.4),ease:'out',onUpdate(){ draw(s.p); },onComplete(){
        if(SVH) SVH.play();
        gsap.timeline({onComplete(){ loader.remove(); sc.style.clipPath=''; unlockScroll(); goBack(); }})
          .to(num,{opacity:0,y:8,duration:.4,ease:'io'},0)
          .add(()=>{ const w={v:B[0],h:B[1]}; gsap.to(w,{v:0,h:0,duration:1.3,ease:'io',onUpdate(){ sc.style.clipPath=clipAt(w.v,w.h); }}); },.1)
          .to(sc,{scale:1.12,duration:2,ease:'out'},.1)
          .to(veil,{opacity:1,duration:1.2,ease:'out'},.55)
          .to(['.homev2-nav_component','.is-hero .homev2-hero_split'],{opacity:1,duration:.8,ease:'out'},.85)
          .add(hero,.75).add(unlockScroll,.9);
      }});
    });
  }

  /* amenities data */
  const AM=[...document.querySelectorAll('#amList li')].map(li=>[li.dataset.key,li.dataset.title,li.dataset.text]);
  const amImgs=$$('.homev2-vitality_image'), amItems=$$('#amList li'), amList=$('#amList'), amEb=$('#amEb'), amSt=$('#amSt'); let amI=0;
  function amMark(i){ const li=amItems[i]; amList.style.setProperty('--homev2-y',li.offsetTop+'px'); amList.style.setProperty('--homev2-h',li.offsetHeight+'px'); amItems.forEach((l,k)=>{ l.classList.toggle('is-on',k===i); l.firstElementChild.setAttribute('aria-selected',k===i); }); }
  amMark(0);
  function amGo(i){
    const from=amI; amI=i; amMark(i);
    const nxt=amImgs[i], prv=amImgs[from];
    if(!G||rm){ amImgs.forEach((im,k)=>im.classList.toggle('is-in',k===i)); amEb.textContent=AM[i][1]; amSt.textContent=AM[i][2]; return; }
    gsap.killTweensOf([nxt,prv,amEb,amSt]);
    gsap.set(nxt,{zIndex:2}); gsap.set(prv,{zIndex:1});
    gsap.fromTo(nxt,{'--homev2-sh':'0%'},{'--homev2-sh':'5.5555%',duration:.9,ease:'io',onComplete(){ amImgs.forEach((im,k)=>{ if(k!==i) gsap.set(im,{'--homev2-sh':'0%'}); }); }});
    gsap.fromTo($('img',nxt),{scale:1.16},{scale:1.08,duration:1.4,ease:'out'});
    gsap.timeline().to([amEb,amSt],{opacity:0,y:-8,duration:.3,ease:'io'}).add(()=>{ amEb.textContent=AM[i][1]; amSt.textContent=AM[i][2]; }).fromTo([amEb,amSt],{opacity:0,y:12},{opacity:1,y:0,duration:.7,ease:'out',stagger:.08});
  }
  amItems.forEach(li=>li.firstElementChild.addEventListener('click',()=>{ const i=+li.dataset.i; if(i!==amI) amGo(i); }));

  if(G&&!rm){
    /* hero parallax: the picture drifts down and zooms gently while the name rises faster */
    gsap.fromTo('#heroScene img',{scale:1},{scale:1.16,ease:'none',scrollTrigger:{trigger:'.is-hero',start:'top top',end:'bottom top',scrub:true}});
    const touch=matchMedia('(hover:none),(pointer:coarse)').matches;
    if(!touch) gsap.to('.is-hero .homev2-hero_title',{yPercent:-70,ease:'none',scrollTrigger:{trigger:'.is-hero',start:'top top',end:'bottom top',scrub:true}});
    gsap.to('.is-hero .homev2-hero_title, .is-hero .homev2-hero_cta, .is-hero .homev2-hero_split',{opacity:0,ease:'none',scrollTrigger:{trigger:'.is-hero',start:'top top',end:'55% top',scrub:true}});
    gsap.to('.is-hero .homev2_veil',{opacity:.55,ease:'none',scrollTrigger:{trigger:'.is-hero',start:'top top',end:'bottom top',scrub:true}});
    if(!touch) gsap.to('.is-hero .homev2_sticky',{yPercent:100,ease:'none',scrollTrigger:{trigger:'.is-hero',start:'top top',end:'bottom top',scrub:true}});
    $$('.homev2_photo:not(.is-hero .homev2_photo):not(.homev2-vitality_component .homev2_photo):not(.homev2-types_component .homev2_photo):not(#planPh):not(#openPh) img').forEach(img=>{
      gsap.fromTo(img,{yPercent:-8},{yPercent:8,ease:'none',scrollTrigger:{trigger:img.parentElement,start:'top bottom',end:'bottom top',scrub:.5}});
      gsap.to(img,{scale:1.02,duration:1.8,ease:'out',scrollTrigger:{trigger:img.parentElement,start:'top 90%',once:true}});
    });
    /* the sky scene fills the width: scale the 1440 stage to the viewport */
    const setS=()=>{ const sc=$('#scene'); if(sc) sc.style.setProperty('--homev2-s',((innerWidth<=760?innerWidth*2.6:innerWidth)/1440).toFixed(4)); }; setS(); addEventListener('resize',setS);
    $$('#scene [data-par]').forEach(el=>{ const d=+el.dataset.par; gsap.fromTo(el,{yPercent:-d},{yPercent:d,ease:'none',scrollTrigger:{trigger:'#scene',start:'top bottom',end:'bottom top',scrub:.4}}); });
    gsap.fromTo('#scene :is(.homev2-setting_copy,.is-copy)',{y:60},{y:-160,ease:'none',scrollTrigger:{trigger:'#scene',start:'top bottom',end:'bottom top',scrub:.4}});
    /* the rarity picture floats slower than the words */
    gsap.fromTo('.rar .inset',{y:80},{y:-120,ease:'none',scrollTrigger:{trigger:'#rarity',start:'top bottom',end:'bottom top',scrub:.5}});
    /* four cards rise in turn */
    gsap.from('.homev2-reasons_grid .homev2-reasons_card',{y:120,opacity:0,duration:1.4,ease:'out',stagger:.12,scrollTrigger:{trigger:'.homev2-reasons_grid',start:'top 85%',once:true}});
    /* the slats open as the picture passes the middle of the screen */
    $$('.is-shape').forEach(el=>{ gsap.fromTo(el,{'--homev2-top':'58%'},{'--homev2-top':'74%',ease:'none',scrollTrigger:{trigger:el,start:'top 95%',end:'center 40%',scrub:.3}}); });
    $$('[data-zoom]').forEach(h=>{
      gsap.to($$('.homev2_line > span',h),{y:'0%',duration:1.4,ease:'out',stagger:.1,scrollTrigger:{trigger:h,start:'top 85%',once:true}});
      gsap.fromTo(h,{scale:.94,opacity:.6},{scale:1,opacity:1,ease:'none',scrollTrigger:{trigger:h,start:'top 95%',end:'top 45%',scrub:.5}});
    });
    $$('.is-rev').forEach(el=>{ gsap.to(el,{opacity:1,y:0,duration:1.1,ease:'out',scrollTrigger:{trigger:el,start:'top 90%',once:true}}); });
    $$('[data-draw]').forEach(el=>{ gsap.from(el,{scaleY:0,duration:1.3,ease:'out',scrollTrigger:{trigger:el,start:'top 85%',once:true}}); });
    $$('.homev2-vitality_image img').forEach(im=>gsap.fromTo(im,{yPercent:-4},{yPercent:4,ease:'none',scrollTrigger:{trigger:'.homev2-vitality_component',start:'top bottom',end:'bottom top',scrub:.4}}));
    gsap.fromTo('#marq span',{xPercent:0},{xPercent:-12,ease:'none',scrollTrigger:{trigger:'#marq',start:'top bottom',end:'bottom top',scrub:.4}});
    gsap.to('#openPh',{clipPath:'inset(0% 0% 0% 0%)',ease:'none',scrollTrigger:{trigger:'.homev2-siteplan_open-wrapper',start:'top 85%',end:'top 20%',scrub:.5}});

    /* care picture opens from the left edge as it scrolls in */
    (()=>{ const st=$('#cg .homev2-care_stage'); if(!st) return; const narrow=matchMedia('(max-width:760px)').matches;
      gsap.timeline({scrollTrigger:{trigger:st,start:'top 88%',end:'top 25%',scrub:.5}})
        .fromTo(st,{clipPath:narrow?'inset(6% 24% 6% 0%)':'inset(8% 42% 8% 0%)'},{clipPath:'inset(0% 0% 0% 0%)',ease:'none'},0)
        .fromTo('#cg .homev2-care_image img',{scale:1.18,transformOrigin:'0% 50%'},{scale:1,ease:'none'},0);
    })();
    /* rarity aerial: slow drift */
    (()=>{ const im=$('.homev2-rarity_photo img'); if(!im) return; gsap.fromTo(im,{yPercent:-3},{yPercent:3,ease:'none',scrollTrigger:{trigger:'.homev2-rarity_picture',start:'top bottom',end:'bottom top',scrub:.5}}); })();
    /* vitality louvres */
    (()=>{ const lv=$('#vitality'); if(!lv) return;
      gsap.set(['#lvCopy','#lvFoot'],{opacity:0,y:50});
      const tl=gsap.timeline({scrollTrigger:{trigger:lv,start:'top top',end:'bottom bottom',scrub:.7}});
      tl.to('#lvSlats i',{scaleY:0,ease:'none',duration:.45,stagger:{each:.012,from:'start'}},.12)
        .to('#lvIntro',{y:-90,opacity:0,ease:'none',duration:.3},.16)
        .to('#lvCopy',{opacity:1,y:0,ease:'none',duration:.22},.42)
        .to('#lvFoot',{opacity:1,y:0,ease:'none',duration:.22},.5)
        .to({},{duration:.25});
    })();
    /* peace of mind: on desktop the scene holds still (sticky) while the words rise out from behind the cut-out render */
    (()=>{ const pk=$('#pk'); if(!pk) return; const narrow=matchMedia('(max-width:760px)').matches;
      if(narrow){
        gsap.fromTo('#pkRender',{yPercent:12},{yPercent:0,ease:'power2.out',scrollTrigger:{trigger:pk,start:'top bottom',end:'top 20%',scrub:.8}});
        gsap.timeline({scrollTrigger:{trigger:pk,start:'top 90%',end:'top 10%',scrub:.6}}).fromTo('#pkTxt',{yPercent:30},{yPercent:0,ease:'none',duration:1},0).fromTo('#pkTxt',{opacity:0},{opacity:1,ease:'none',duration:.45},0);
        return;
      }
      const gh=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gh'))||180;
      gsap.timeline({scrollTrigger:{trigger:'#peace',start:'top 55%',end:()=>'top '+(64-gh()-innerHeight*.5)+'px',scrub:.7,invalidateOnRefresh:true}}).fromTo('#pkTxt',{yPercent:175},{yPercent:0,ease:'none',duration:1},0).fromTo('#pkTxt',{opacity:0},{opacity:1,ease:'none',duration:.5},.1);
      gsap.fromTo('#pkRender',{yPercent:16},{yPercent:0,ease:'power2.out',scrollTrigger:{trigger:'#peace',start:'top bottom',end:()=>'top '+(64-gh())+'px',scrub:.8,invalidateOnRefresh:true}});
    })();
    /* location: drawn route, markers placed on the line, card rail kept in sync */
    (()=>{
      const map=$('#lmap'); if(!map) return;
      const path=$('#lroute'), svg=path.ownerSVGElement, vb=svg.viewBox.baseVal;
      const nar=matchMedia('(max-width:760px)').matches, mx=$('#lmapX'); if(nar) svg.setAttribute('viewBox','0 128 1400 400');
      const marks=$$('.homev2-location_marker',map), home=$('#lmHome'), rail=$('#lrail'), cards=$$('.homev2-location_card',rail), cnt=$('#lcCnt');
      const narrow=()=>matchMedia('(max-width:760px)').matches;
      const place=(el,x,y)=>{ el.style.left=((x-vb.x)/vb.width*100)+'%'; el.style.top=((y-vb.y)/vb.height*100)+'%'; };
      marks.forEach(m=>place(m,+m.dataset.x,+m.dataset.y));
      place(home,+home.dataset.x,+home.dataset.y);
      const L=path.getTotalLength(), brs=$$('#lmap .homev2-location_road-branch');
      gsap.set(brs,{strokeDasharray:1,strokeDashoffset:1});
      /* the line draws itself in; dots follow it */
      path.style.strokeDasharray=L; path.style.strokeDashoffset=L;
      gsap.set(marks,{opacity:0,scale:.5}); gsap.set(home.children,{opacity:0,y:14});
      ScrollTrigger.create({trigger:map,start:'top 78%',once:true,onEnter:()=>{
        gsap.to(path,{strokeDashoffset:0,duration:2.6,ease:'io'});
        gsap.to(brs,{strokeDashoffset:0,duration:1.1,ease:'out',stagger:.12,delay:1.2});
        gsap.from('#lmap .homev2-location_road-row,#lcoast',{opacity:0,duration:1.6,ease:'out',stagger:.12,delay:.4});
        marks.forEach(m=>gsap.to(m,{opacity:1,scale:1,duration:.9,ease:'out',delay:.25+(+m.dataset.x/vb.width)*2.1}));
        gsap.to(home.children,{opacity:1,y:0,duration:1.1,ease:'out',stagger:.1,delay:.25+(+home.dataset.x/vb.width)*2.1});
      }});
      /* sync */
      const gap=()=>parseFloat(getComputedStyle(rail).columnGap)||18;
      const wOff=()=>narrow()?210:290, wOn=()=>narrow()?innerWidth*.84:Math.min(700,innerWidth*.74);
      let cur=-1;
      const go=(i,scroll=true)=>{
        i=(i+cards.length)%cards.length; if(i===cur) return;
        const prev=cards[cur];
        if(prev){ prev.classList.remove('is-on'); prev.setAttribute('aria-pressed','false'); gsap.to($('.homev2-location_card-image',prev),{'--homev2-sh':'0%',duration:.35,ease:'in',overwrite:true}); }
        marks.forEach((m,k)=>{ m.classList.toggle('is-on',k===i); m.setAttribute('aria-pressed',k===i?'true':'false'); });
        const c=cards[i]; c.classList.add('is-on'); c.setAttribute('aria-pressed','true');
        if(nar&&mx){ const mk=marks[i]; gsap.to(mx,{scrollLeft:Math.max(0,mk.offsetLeft-mx.clientWidth/2),duration:scroll?.8:0,ease:'io',overwrite:true}); }
        gsap.fromTo($('.homev2-location_card-image',c),{'--homev2-sh':'0%'},{'--homev2-sh':'5.5555%',duration:1.1,ease:'out',delay:.35,overwrite:true});
        cnt.textContent=String(i+1); const lb=$('#lcBar'); if(lb) lb.style.width=((i+1)/cards.length*100)+'%';
        cur=i;
        if(scroll){
          const pad=parseFloat(getComputedStyle(rail).paddingLeft)||0;
          const left=pad+i*(wOff()+gap());
          const max=pad*2+(cards.length-1)*(wOff()+gap())+wOn()-rail.clientWidth;
          const to=Math.max(0,Math.min(max,left-(rail.clientWidth-wOn())/2));
          gsap.to(rail,{scrollLeft:to,duration:.9,ease:'io',overwrite:true});
        }
      };
      let hv;
      marks.forEach((m,k)=>{
        m.addEventListener('click',()=>go(k));
        m.addEventListener('mouseenter',()=>{ clearTimeout(hv); hv=setTimeout(()=>go(k),110); });
        m.addEventListener('mouseleave',()=>clearTimeout(hv));
        m.addEventListener('focus',()=>go(k));
      });
      cards.forEach((c,k)=>c.addEventListener('click',()=>go(k)));
      $('#lcPrev').addEventListener('click',()=>go(cur-1));
      $('#lcNext').addEventListener('click',()=>go(cur+1));
      go(+rail.dataset.start||0,false);
      requestAnimationFrame(()=>{ const pad=parseFloat(getComputedStyle(rail).paddingLeft)||0; rail.scrollLeft=Math.max(0,pad+cur*(wOff()+gap())-(rail.clientWidth-wOn())/2); });
    })();
    /* cape vernacular: small gable on the cream, opening to a full-width gable as you scroll */
    (()=>{
      const narrow=matchMedia('(max-width:760px)').matches;
      /* start small: the picture's foot sits halfway down the heading's first line, so only that line overlaps it */
      const from=()=>{ const st=$('#arch .homev2-arch_sticky'), h=$('#archH'), l1=$('.homev2_line',h);
        const b=Math.min(80,(h.offsetTop+l1.offsetHeight*.5)/st.clientHeight*100), x0=narrow?22:39, x1=100-x0, wall=narrow?24:28, roof=narrow?15:17;
        return `polygon(${x0}% ${b-wall}%,50% ${b-wall-roof}%,${x1}% ${b-wall}%,${x1}% ${b}%,${x0}% ${b}%)`; };
      const to='polygon(0% 24%,50% 2%,100% 24%,100% 100%,0% 100%)';
      gsap.timeline({scrollTrigger:{trigger:'#arch',start:'top top',end:'bottom bottom',scrub:.6,invalidateOnRefresh:true}})
        .fromTo('#archPic',{clipPath:()=>from()},{clipPath:to,ease:'none',duration:1,immediateRender:true},0)
        .fromTo('#archPic img',{scale:1.22},{scale:1,ease:'none',duration:1},0)
        .to('#archVeil',{opacity:1,ease:'none',duration:.25},.28)
        .to('#archH',{color:'#fff',ease:'none',duration:.2},.3);
      gsap.to('#archH .homev2_line > span',{y:'0%',duration:1.4,ease:'out',stagger:.1,scrollTrigger:{trigger:'#arch',start:'top 55%',once:true}});
    })();
    /* numbers count up */
    $$('.homev2-stats_grid [data-to]').forEach(el=>{ const to=+el.dataset.to, o={v:0}; el.textContent='0';
      ScrollTrigger.create({trigger:'.homev2-stats_grid',start:'top 85%',once:true,onEnter(){ gsap.to(o,{v:to,duration:to>9?2:1.4,ease:'out',onUpdate(){ el.textContent=Math.round(o.v); }}); }}); });
    gsap.from('.homev2-stats_grid>div',{y:40,opacity:0,duration:1.2,ease:'out',stagger:.1,scrollTrigger:{trigger:'.homev2-stats_grid',start:'top 85%',once:true}});
    /* quote mark */
    gsap.from('.homev2-rarity_quote-mark',{scale:.4,opacity:0,duration:1.4,ease:'out',scrollTrigger:{trigger:'.homev2-rarity_quote',start:'top 85%',once:true}});
    /* peace of mind cards drift at different speeds */
    /* site plan opens up */
    gsap.timeline({scrollTrigger:{trigger:'.homev2-siteplan_plan',start:'top 85%',end:'center 50%',scrub:.6}})
      .fromTo('#planPh',{clipPath:'inset(10% 0% 10% 42%)'},{clipPath:'inset(0% 0% 0% 0%)',ease:'none'},0).to('#planPh img',{scale:1,ease:'none',transformOrigin:'100% 50%'},0);
    /* distance bars draw in turn */
    gsap.to('#prog',{width:'100%',ease:'none',scrollTrigger:{trigger:'.homev2_page',start:'top top',end:'bottom bottom',scrub:true}});
    const nav=$('#nav');
    const lit=new Set(); $$('section.is-cream, section.is-sand').forEach(s=>{ ScrollTrigger.create({trigger:s,start:'top 60px',end:'bottom 60px',onToggle(st){ st.isActive?lit.add(s):lit.delete(s); window.__homev2Light=lit.size>0; if(!nav.classList.contains('is-menu-open')) nav.classList.toggle('is-on-light',window.__homev2Light); }}); });
  } else { $$('.is-rev').forEach(e=>{e.style.opacity=1;e.style.transform='none'}); $$('.homev2_line > span').forEach(s=>s.style.transform='none'); $('#openPh').style.clipPath='none'; }

  /* drag gallery: mouse drags the strip (touch keeps native scrolling); snapping is paused while dragging, then the strip settles on the nearest picture in the drag direction */
  const gal=$('#gal'); let dx=0,sx=0,down=false,moved=0;
  gal.addEventListener('dragstart',e=>e.preventDefault());
  gal.style.cursor='grab';
  gal.addEventListener('pointerdown',e=>{ if(e.pointerType!=='mouse'||e.button!==0) return; down=true; moved=0; sx=e.clientX; dx=gal.scrollLeft; gal.style.scrollSnapType='none'; gal.style.scrollBehavior='auto'; gal.style.userSelect='none'; gal.style.cursor='grabbing'; gal.setPointerCapture(e.pointerId); });
  gal.addEventListener('pointermove',e=>{ if(!down) return; moved=e.clientX-sx; gal.scrollLeft=dx-moved; });
  const galEnd=()=>{ if(!down) return; down=false; gal.style.cursor='grab'; gal.style.userSelect='';
    const kids=[...gal.children], pad=parseFloat(getComputedStyle(gal).scrollPaddingLeft)||0, x=gal.scrollLeft;
    let i=kids.reduce((b,k,j)=>Math.abs(k.offsetLeft-pad-x)<Math.abs(kids[b].offsetLeft-pad-x)?j:b,0);
    if(Math.abs(moved)>40){ const cur=kids.findIndex(k=>k.offsetLeft-pad>=dx-2); const base=cur<0?i:cur; i=Math.max(0,Math.min(kids.length-1, moved<0?Math.max(i,base+1):Math.min(i,base-1))); }
    const to=Math.max(0,Math.min(gal.scrollWidth-gal.clientWidth,kids[i].offsetLeft-pad));
    if(G&&!rm) gsap.to(gal,{scrollLeft:to,duration:.7,ease:'out',overwrite:true,onComplete(){ gal.style.scrollSnapType=''; gal.style.scrollBehavior=''; }});
    else { gal.scrollLeft=to; gal.style.scrollSnapType=''; gal.style.scrollBehavior=''; } };
  ['pointerup','pointercancel','lostpointercapture'].forEach(t=>gal.addEventListener(t,galEnd));
  gal.addEventListener('click',e=>{ if(Math.abs(moved)>6){ e.preventDefault(); e.stopPropagation(); moved=0; } },true);

  /* types slider: letters leave upward, the picture comes in through slats, new letters rise */
  let TYPES=[
    {t:'Type A',beds:'3',baths:'2½',size:'268 m²',txt:'The first of seven. Every home is finished to one standard; the types differ in size and where they sit on the plan.'},
    {t:'Type E',beds:'4',baths:'3½',size:'410 m²',txt:'The largest of the seven. Four bedrooms, one on the ground floor with its own en-suite, and the walk-in attic every home has.'}
  ];
  const ttl=$('#tsTitle'), frs=$$('#tsFrame .homev2-types_frame'), tsN=$('#tsN'), tsBar=$('#tsBar'), tsTxt=$('#tsTxt'), tsType=$('#tsBeds'), tsPos=$('#tsBaths'), tsSize=$('#tsSize');
  let ti=0, busy=false, fi=0; const tsTot=$('#tsTot');
  /* the copy is split into lines for its reveal; keep the saved original in step so a reveal never puts back the fallback text */
  const setTsTxt=t=>{ if(window.gsap) gsap.killTweensOf(tsTxt.querySelectorAll('*')); tsTxt._orig=String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); tsTxt.textContent=t; };
  function split(text){ ttl.innerHTML=''; const ws=text.split(' '); ws.forEach((w,i)=>{ const s=document.createElement('span'); s.className='w'; [...w].forEach(c=>{ const k=document.createElement('span'); k.className='ch'; k.textContent=c; s.appendChild(k); }); ttl.appendChild(s); if(i<ws.length-1) ttl.appendChild(document.createTextNode(' ')); }); return $$('.ch',ttl); }
  split(TYPES[0].t);
  function goType(dir){
    if(busy) return; busy=true; ti=(ti+dir+TYPES.length)%TYPES.length; const d=TYPES[ti]; const of=frs[fi], nf=frs[fi^1]; fi^=1; const ni=$('img',nf); if(d.img){ ni.src=d.img; ni.alt=d.alt; }
    tsN.textContent=ti+1; tsRun();
    if(!G||rm){ split(d.t); frs.forEach(f=>f.classList.toggle('is-in',f===nf)); setTsTxt(d.txt); tsType.textContent=d.beds; tsPos.textContent=d.baths; tsSize.textContent=d.size; busy=false; return; }
    const old=$$('.ch',ttl);
    gsap.timeline({onComplete(){busy=false;}})
      .to(old,{yPercent:-110,duration:.6,ease:'io',stagger:.02},0)
      .to(tsTxt,{opacity:0,y:-8,duration:.4,ease:'io'},0)
      .to([tsType,tsPos,tsSize],{opacity:0,y:-8,duration:.4,ease:'io',stagger:.05},0)
      /* the current render closes through the same slats (each slat shrinks from the top) while the next one opens behind it */
      .to(of,{'--homev2-st':'5.5555%',duration:.8,ease:'io'},0)
      .to($('img',of),{scale:1.06,duration:.8,ease:'io'},0)
      .set(nf,{'--homev2-sh':'0%','--homev2-st':'0%',zIndex:2},0)
      .to(nf,{'--homev2-sh':'5.5555%',duration:1,ease:'io'},.45)
      .fromTo(ni,{scale:1.12},{scale:1,duration:1.4,ease:'out'},.45)
      .set(of,{zIndex:1,'--homev2-sh':'0%','--homev2-st':'0%'},1.5)
      .set($('img',of),{scale:1},1.5)
      .add(()=>{ const ch=split(d.t); gsap.set(ch,{yPercent:110}); gsap.to(ch,{yPercent:0,duration:.9,ease:'out',stagger:.025}); setTsTxt(d.txt); tsType.textContent=d.beds; tsPos.textContent=d.baths; tsSize.textContent=d.size; gsap.fromTo([tsType,tsPos,tsSize,tsTxt],{opacity:0,y:10},{opacity:1,y:0,duration:.7,ease:'out',stagger:.06}); },.55);
  }
  $$('[data-ts]').forEach(b=>b.addEventListener('click',()=>goType(+b.dataset.ts)));
  /* autoplay: the line between the numbers fills, then the next type comes in; pauses on hover/focus and off screen */
  const TS_DUR=6; let tsTw=null, tsOn=false, tsHold=false;
  function tsRun(){
    if(!G||rm){ tsBar.style.width='100%'; return; }
    if(tsTw) tsTw.kill(); gsap.set(tsBar,{width:'0%'});
    tsTw=gsap.to(tsBar,{width:'100%',duration:TS_DUR,ease:'none',paused:!(tsOn&&!tsHold),onComplete(){ goType(1); }});
  }
  const tsEl=$('#ts');
  const tsSet=()=>{ if(tsTw){ (tsOn&&!tsHold)?tsTw.play():tsTw.pause(); } };
  ['mouseenter','focusin'].forEach(e=>tsEl.addEventListener(e,()=>{ tsHold=true; tsSet(); }));
  ['mouseleave','focusout'].forEach(e=>tsEl.addEventListener(e,()=>{ tsHold=false; tsSet(); }));
  if(G&&!rm) ScrollTrigger.create({trigger:tsEl,start:'top 75%',end:'bottom 25%',onToggle(st){ tsOn=st.isActive; tsSet(); }});
  tsRun();

  /* unit types: Xano via Wized (getUnitTypes) replaces the two fallback types */
  (()=>{ const half=b=>{ const w=Math.floor(b); return (b-w)>=.5?(w?w+'½':'½'):String(w); };
    const map=list=>list.map(u=>{ const im=(u.media||[]).find(m=>m.kind==='image'); return {t:'Type '+u.type_code,beds:String(u.bedrooms),baths:half(+u.bathrooms),size:u.total_area+' m²',txt:u.description||'',img:(im&&im.url)||u.card_image||'',alt:'Type '+u.type_code+", artist's impression"}; });
    const apply=W=>{ const r=W.data&&W.data.r&&W.data.r.getUnitTypes; if(!r||!Array.isArray(r.data)||!r.data.length) return false;
      TYPES=map(r.data); if(tsTot) tsTot.textContent=TYPES.length; ti=0; const d=TYPES[0], f=frs[fi], im=$('img',f);
      if(d.img){ im.src=d.img; im.alt=d.alt; } split(d.t); setTsTxt(d.txt); tsType.textContent=d.beds; tsPos.textContent=d.baths; tsSize.textContent=d.size; tsN.textContent=1;
      $$('img',$('#tsFrame')).forEach(x=>{ x.loading='eager'; }); TYPES.forEach(t=>{ if(t.img){ const p=new Image(); p.src=t.img; } }); return true; };
    window.Wized=window.Wized||[]; window.Wized.push(W=>{ if(apply(W)) return; W.on('requestend',res=>{ if(res&&res.name==='getUnitTypes') apply(W); }); });
  })();
  /* swipe the picture to change type */
  (()=>{ const zone=$('#tsFrame'); if(!zone) return; let sx=0, sy=0, on=false;
    zone.addEventListener('pointerdown',e=>{ on=true; sx=e.clientX; sy=e.clientY; });
    zone.addEventListener('pointerup',e=>{ if(!on) return; on=false; const dx=e.clientX-sx, dy=e.clientY-sy;
      if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.2) goType(dx<0?1:-1); });
    zone.addEventListener('pointercancel',()=>{ on=false; });
    zone.addEventListener('dragstart',e=>e.preventDefault());
  })();



  /* care: tap a line; the picture changes through slats and the line's text rises */
  const cgImgs=$$('#cg .homev2-care_image'), cgLis=$$('#cg .homev2-care_list li'); let cgI=0;
  function cgGo(k){
    if(k===cgI) return; const from=cgI; cgI=k;
    cgLis.forEach((l,j)=>{ $('[data-button]',l).setAttribute('aria-expanded',j===k); });
    const nb=cgImgs[k], ob=cgImgs[from], newD=$('.homev2-care_detail',cgLis[k]), oldD=$('.homev2-care_detail',cgLis[from]);
    if(!G||rm){ cgLis.forEach((l,j)=>l.classList.toggle('is-on',j===k)); cgImgs.forEach((im,j)=>im.classList.toggle('is-in',j===k)); return; }
    gsap.fromTo(oldD,{height:oldD.offsetHeight},{height:0,duration:.6,ease:'io',onComplete(){ cgLis[from].classList.remove('is-on'); gsap.set(oldD,{clearProps:'height'}); }});
    cgLis[k].classList.add('is-on');
    gsap.fromTo(newD,{height:0},{height:'auto',duration:.8,ease:'io',onComplete(){ gsap.set(newD,{clearProps:'height'}); ScrollTrigger.refresh(); }});
    const p=$('p',newD), ls=splitLines(p);
    gsap.fromTo(ls,{yPercent:110},{yPercent:0,duration:1,ease:'out',stagger:.08,delay:.2,onComplete(){ p.innerHTML=p._orig; }});
    gsap.set(nb,{'--homev2-sh':'0%',zIndex:2}); gsap.set(ob,{zIndex:1});
    gsap.to(nb,{'--homev2-sh':'5%',duration:1,ease:'io',onComplete(){ cgImgs.forEach((im,j)=>{ if(j!==k) gsap.set(im,{'--homev2-sh':'0%'}); }); }});
    gsap.fromTo($('img',nb),{scale:1.12},{scale:1,duration:1.5,ease:'out'});
  }
  cgLis.forEach((li,k)=>$('[data-button]',li).addEventListener('click',()=>cgGo(k)));
  if(G&&!rm){
    gsap.from('#cg .homev2-care_list li',{y:24,opacity:0,duration:1,ease:'out',stagger:.08,scrollTrigger:{trigger:'#cg',start:'top 80%',once:true}});
  }
  /* register */
  const regForm=$('#regForm');
  const viewing=$('#viewing'); if(viewing) viewing.addEventListener('click',e=>{ e.preventDefault(); const m=$('textarea[name=message]',regForm); m.value="I'd like to arrange a private viewing"; scrollToY(topOf(regForm)-140); setTimeout(()=>$('input[name="First Name"]',regForm).focus({preventScroll:true}),900); });
  
  /* menu through slats; the Menu button rolls to Close and its dots fold into an x (CSS on .is-open) */
  const sheet=$('#sheet'), menuBtn=$('#menuBtn'), navEl=$('#nav');
  const sheetLinks=$$('.homev2-menu_sheet nav a > .homev2_roll'), sheetFoot=$('.homev2-menu_sheet .homev2-menu_footer');
  let menuTl=null, menuOpen=false;
  const open=v=>{
    if(v===menuOpen) return; menuOpen=v;
    sheet.setAttribute('aria-hidden',!v);
    if(menuBtn){ menuBtn.classList.toggle('is-open',v); menuBtn.setAttribute('aria-expanded',v); }
    /* the nav sits over the plum sheet while it is open, so it drops its on-light colours and gets them back on close */
    if(navEl){ navEl.classList.toggle('is-menu-open',v); if(v) navEl.classList.remove('is-on-light'); else navEl.classList.toggle('is-on-light',!!window.__homev2Light); }
    if(!G||rm){ sheet.classList.toggle('is-open',v); sheet.style.setProperty('--homev2-sh',v?'5.5555%':'0%'); return; }
    if(menuTl) menuTl.kill();
    if(v){ sheet.classList.add('is-open'); if(lenis) lenis.stop();
      menuTl=gsap.timeline().fromTo(sheet,{'--homev2-sh':'0%'},{'--homev2-sh':'5.5555%',duration:.9,ease:'io'},0).fromTo(sheetLinks,{yPercent:110},{yPercent:0,duration:.9,ease:'out',stagger:.06},.45).fromTo(sheetFoot,{opacity:0},{opacity:1,duration:.6},.7);
    } else { if(lenis) lenis.start();
      menuTl=gsap.timeline({onComplete(){ sheet.classList.remove('is-open'); }}).to(sheetLinks,{yPercent:-110,duration:.5,ease:'io',stagger:.03},0).to(sheetFoot,{opacity:0,duration:.3},0).to(sheet,{'--homev2-sh':'0%',duration:.8,ease:'io'},.2);
    }
  };
  if(menuBtn) menuBtn.addEventListener('click',e=>{ e.preventDefault(); open(!menuOpen); });
  addEventListener('keydown',e=>{ if(e.key==='Escape'&&menuOpen) open(false); });
  const goLinks=new Set($$('[data-go], #nav a[href^="#"], #sheet a[href^="#"], footer a[href^="#"]'));
  goLinks.forEach(a=>a.addEventListener('click',e=>{ const h=a.getAttribute('href'); if(!h||h.length<2) return; e.preventDefault(); const was=menuOpen; open(false); const t=h==='#top'?null:$(h); setTimeout(()=>scrollToY(t?topOf(t):0),was?500:0); }));
})();
