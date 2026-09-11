/* Generator for sv-map-wetland.svg — the wetland corridor strip appended below sv-map-base.svg.
   Deterministic (own LCG, seed 11), so running it again reproduces the uploaded asset byte for byte.
   Coordinates are plan units; y continues from the plan's bottom edge (474). Real geometry (river,
   golf boundary, cart path) is OpenStreetMap, registered with the map-reveal affine; canopy and
   reeds are illustrative marks placed inside the thicket traced from Google z19 imagery. */
function svWetlandStrip() {
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; const ru = (a, b) => a + (b - a) * rnd();
  const INK = '#C5BFB3', Y0 = 474, H = 200, W = 664;
  const river = [[-58.7,623.7],[51.3,591],[85.2,661.7],[82.6,720.6],[134.6,734.8],[321.3,739],[354.4,726.4],[383.9,714.9],[414.9,713.7],[460.8,719.7],[567.4,732.6],[592.4,740.8],[616.2,753]];
  const cart = [[21.1,429.2],[46.1,435.3],[53.4,469.7],[73,568.3],[87.4,589.5],[122.4,610],[124.2,641.4],[135.4,685.9],[146.8,719.5]];
  const golf = [[63.5,399],[153.4,588.4],[160.1,602.6],[327.7,757.7]];
  const ttop = [[-31,482],[59,489],[158,512],[238,531],[307,543],[377,551],[447,566],[505,589],[544,612],[600,640]];
  const sand = [[9,592],[80,588],[127,626],[131,687],[87,725],[36,732],[0,687]];
  const VERGE = 518, K = -0.30; const vergeX = y => VERGE + K * (y - Y0);
  const road = x => [[x, Y0], [x + K * H, Y0 + H]];
  const f1 = n => n.toFixed(1);
  const pts = p => p.map(q => f1(q[0]) + ',' + f1(q[1])).join(' ');
  const smooth = (p, close) => { let P = close ? [p[p.length-1], ...p, p[0], p[1]] : [p[0], ...p, p[p.length-1]]; let d = `M${f1(P[1][0])},${f1(P[1][1])}`; for (let i = 1; i < P.length - 2; i++) { const [p0,p1,p2,p3] = [P[i-1],P[i],P[i+1],P[i+2]]; const c1 = [p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6], c2 = [p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6]; d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`; } return d + (close ? ' Z' : ''); };
  const offset = (p, d) => p.map((q, i) => { const a = p[Math.max(i-1,0)], b = p[Math.min(i+1,p.length-1)]; const tx = b[0]-a[0], ty = b[1]-a[1], L = Math.hypot(tx,ty) || 1; return [q[0]-ty/L*d, q[1]+tx/L*d]; });
  const interp = (poly, x) => { for (let i = 0; i < poly.length-1; i++) { const [x1,y1] = poly[i], [x2,y2] = poly[i+1]; if ((x1<=x&&x<=x2)||(x2<=x&&x<=x1)) { const t = (x-x1)/((x2-x1)||1e-9); return y1+t*(y2-y1); } } return x > poly[poly.length-1][0] ? poly[poly.length-1][1] : poly[0][1]; };
  const ge = golf.map(([x,y]) => [y,x]);
  const gx = y => { for (let i = 0; i < ge.length-1; i++) { const [y1,x1] = ge[i], [y2,x2] = ge[i+1]; if (y1<=y&&y<=y2) { const t = (y-y1)/(y2-y1); return x1+t*(x2-x1); } } return y > ge[ge.length-1][0] ? ge[ge.length-1][1] : ge[0][1]; };
  const dist = (poly, x, y) => { let best = 1e9; for (let i = 0; i < poly.length-1; i++) { const [x1,y1] = poly[i], [x2,y2] = poly[i+1]; const dx = x2-x1, dy = y2-y1, L2 = dx*dx+dy*dy || 1; const t = Math.max(0, Math.min(1, ((x-x1)*dx+(y-y1)*dy)/L2)); best = Math.min(best, Math.hypot(x-(x1+t*dx), y-(y1+t*dy))); } return best; };
  const inSand = (x, y) => { let c = false; for (let i = 0, j = sand.length-1; i < sand.length; j = i++) { const [xi,yi] = sand[i], [xj,yj] = sand[j]; if ((yi>y)!==(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) c = !c; } return c; };
  const inside = (x, y) => !(y < interp(ttop, x)+3 || x < gx(y)+5 || x > vergeX(y)-5 || inSand(x,y) || dist(river,x,y) < 4);
  const blobs = []; let tries = 0;
  while (blobs.length < 420 && tries++ < 60000) { const x = ru(-20, W+10), y = ru(Y0+2, Y0+H-2); if (!inside(x,y)) continue; const r = ru(3.5, 7.5); if (blobs.some(b => Math.hypot(x-b[0], y-b[1]) < (r+b[2])*0.62)) continue; blobs.push([x,y,r]); }
  const blob = (cx, cy, r) => { const n = 7 + Math.floor(rnd()*5), p = []; for (let k = 0; k < n; k++) { const a = 2*Math.PI*k/n, rr = r*ru(0.72, 1.15); p.push([cx+rr*Math.cos(a), cy+rr*Math.sin(a)]); } return smooth(p, true); };
  const reeds = [];
  for (let i = 0; i < 1400; i++) { const x = ru(-10, 300), y = ru(Y0+2, Y0+H-2); const dr = dist(river,x,y); if (dr > 3 && dr < 38 && !inSand(x,y) && !blobs.some(b => Math.hypot(x-b[0], y-b[1]) < b[2]+1)) reeds.push([x,y]); }
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${Y0} ${W} ${H}" width="${W}" height="${H}">\n`;
  s += '<!-- Stellenbosch Village: wetland corridor strip appended below sv-map-base.svg (664x474, viewBox 0 0 664 474).\n' +
       '     Same coordinate space: plan units, y continues from 474. Registered to the ground with the same affine as the map reveal\n' +
       '     (plan -> z19 satellite frame: A=[[1.3824,0.1352],[-0.0037,1.8432]], c=(581.73,534.36)); river, golf boundary and cart path\n' +
       '     are OpenStreetMap geometry; canopy and reed marks are illustrative, placed inside the tree band traced from Google z19 imagery.\n' +
       '     Single ink colour #C5BFB3 on the section cream, hairline strokes - the base plan style. No trails: none exist yet.\n' +
       '     Generated by wetland-strip-gen.js in daniellun-tov/heartland-scripts (deterministic). -->\n';
  s += `<g fill="none" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round">\n`;
  s += `<g id="r44"><polyline points="${pts(road(VERGE))}"/>`;
  for (const [a, b] of [[564,600],[628,658]]) { const ra = road(a), rb = road(b); s += `<polygon fill="${INK}" stroke="none" points="${pts([ra[0], rb[0], rb[1], ra[1]])}"/>`; }
  s += '</g>\n';
  s += `<polyline id="erf-boundary" points="390.0,474.0 ${f1(vergeX(507))},507.0"/>\n`;
  s += `<path id="de-zalze-boundary" d="${smooth(golf.filter(p => p[1] >= Y0-40))}" stroke-dasharray="3 2"/>\n`;
  s += `<g id="river"><path d="${smooth(offset(river,-2.2))}" stroke-width="0.7"/><path d="${smooth(offset(river,2.2))}" stroke-width="0.7"/><path d="${smooth(river)}" stroke-width="0.35" stroke-dasharray="1.5 2.5" opacity=".7"/></g>\n`;
  s += `<path id="sand-bank" d="${smooth(sand, true)}" stroke-dasharray="0.6 1.6" stroke-width="0.9"/>\n`;
  s += `<path id="golf-cart-path" d="${smooth(cart.filter(p => p[1] >= Y0-20))}" stroke-dasharray="4 2.5" stroke-width="0.8"/>\n`;
  s += '<g id="trails"><!-- wetland walk / boardwalk: to be traced from the landscape plan when it exists --></g>\n';
  s += '<g id="canopy" stroke-width="0.5">' + blobs.map(b => `<path d="${blob(b[0],b[1],b[2])}"/>`).join('') + '</g>\n';
  s += '<g id="reeds" stroke-width="0.45">' + reeds.map(([x,y]) => { const h = ru(2.2,3.6), dx = ru(-0.6,0.6); return `<path d="M${f1(x)},${f1(y)} l${f1(dx)},${f1(-h)} M${f1(x-1.1)},${f1(y)} l${f1(dx-0.3)},${f1(-h*0.7)} M${f1(x+1.1)},${f1(y)} l${f1(dx+0.3)},${f1(-h*0.8)}"/>`; }).join('') + '</g>\n';
  s += '</g></svg>\n';
  return { svg: s, blobs: blobs.length, reeds: reeds.length };
}
if (typeof module !== 'undefined') module.exports = svWetlandStrip;
