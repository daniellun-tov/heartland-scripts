#!/usr/bin/env python3
# patch-oh5.py - 18 Sep: the view marker card must never sit over a plot.
#
# place() picked the side of the MARKER with the most room in the viewport,
# which for a marker on the map's edge always means "inwards", i.e. straight
# over the plan - so hovering Simonsberg covered 16 plots including one of
# the nine it had just lit up, which is the one thing the hover is for.
#
# The card is now placed by search rather than by side: build a coarse
# occupancy grid of what is on screen (plots hard, floating controls soft),
# prefix-sum it once, then score candidate positions in O(1) each and take
# the nearest one to the marker with no plot under it.
#   python3 patch-oh5.py heartland-oh.js assets/oh/oh-v2.css
import sys
js_path, css_path = sys.argv[1], sys.argv[2]
s = open(js_path).read()
c = open(css_path).read()

def rep(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:100])
    return text.replace(old, new)

OLD_PLACE = """  /* pick the side of the marker with the most room, then clamp to the viewport */
  function place(b) {
    var q = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, pad = 12;
    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    var room = { left: q.left, right: vw - q.right, top: q.top, bottom: vh - q.bottom };
    var side = Object.keys(room).sort(function (a, c) { return room[c] - room[a]; })[0];
    var x = cx - w / 2, y = cy - h / 2;
    if (side === 'left') x = q.left - w - pad;
    else if (side === 'right') x = q.right + pad;
    else if (side === 'top') y = q.top - h - pad;
    else y = q.bottom + pad;
    x = Math.min(Math.max(pad, x), Math.max(pad, vw - w - pad));
    y = Math.min(Math.max(pad, y), Math.max(pad, vh - h - pad));
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
  }"""

NEW_PLACE = """  /* ---------- where the card goes ----------
     Never over a plot. The markers live on the map's edge, so "the side with
     the most room" always pointed inwards, across the plan - and the card
     then covered the very apartments the hover had just lit up.

     Instead: a coarse occupancy grid of what is on screen (CELL px cells),
     summed into an integral image so any candidate rectangle costs O(1) to
     score, then the nearest position to the marker that sits on nothing.
     Plots are a hard cost, the floating controls a soft one (better to
     overlap the zoom pill than an apartment), and the search is confined to
     the map box so the card cannot stray over the filters or the list. */
  var CELL = 14, PAD = 12, occ = null;

  function mapBox() {
    var el = document.querySelector('.unit-filter_map') || document.querySelector('.site-plan_map-canvas');
    return el ? el.getBoundingClientRect() : null;
  }

  /* one string that changes whenever the pixels under the card could have:
     which level, the pan/zoom of the map box, and the box itself */
  function signature(box) {
    var canvas = document.querySelector('.site-plan_map-canvas');
    var scroller = document.querySelector('.unit-filter_map-container');
    return [
      Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height),
      canvas ? canvas.style.width : '', canvas ? (canvas.className || '') : '',
      scroller ? Math.round(scroller.scrollLeft) : 0, scroller ? Math.round(scroller.scrollTop) : 0,
      document.querySelectorAll('.site-plan_plot').length,
    ].join('|');
  }

  function buildOcc() {
    var box = mapBox();
    if (!box || box.width < 40 || box.height < 40) return null;
    var sig = signature(box);
    if (occ && occ.sig === sig) return occ;

    var cols = Math.ceil(box.width / CELL) + 1, rows = Math.ceil(box.height / CELL) + 1;
    var grid = new Float32Array(cols * rows);

    function stamp(r, weight) {
      var x0 = Math.floor((Math.max(r.left, box.left) - box.left) / CELL);
      var x1 = Math.ceil((Math.min(r.right, box.right) - box.left) / CELL);
      var y0 = Math.floor((Math.max(r.top, box.top) - box.top) / CELL);
      var y1 = Math.ceil((Math.min(r.bottom, box.bottom) - box.top) / CELL);
      if (x1 <= x0 || y1 <= y0) return;
      for (var y = Math.max(0, y0); y < Math.min(rows, y1); y++) {
        for (var x = Math.max(0, x0); x < Math.min(cols, x1); x++) {
          var i = y * cols + x;
          if (grid[i] < weight) grid[i] = weight;
        }
      }
    }

    /* the plots on the level that is showing, plus their labels */
    var shapes = document.querySelectorAll('.site-plan_map-svg .site-plan_plot, .site-plan_map-svg .site-plan_unit-label');
    for (var i = 0; i < shapes.length; i++) {
      var el = shapes[i];
      if (!el.getClientRects().length) continue;          /* hidden level */
      stamp(el.getBoundingClientRect(), 1000);
    }
    /* the floating controls: worth avoiding, worth overlapping before a plot */
    var ui = document.querySelectorAll('.unit-filter_map .site-plan_toolbar, .unit-filter_map .site-plan_floor-switch, .unit-filter_map .site-plan_zoom, .unit-filter_map .site-plan_sheet, .site-plan_viewmark');
    for (var j = 0; j < ui.length; j++) {
      if (!ui[j].getClientRects().length) continue;
      stamp(ui[j].getBoundingClientRect(), 1);
    }

    /* integral image: sum of any cell rect in four lookups */
    var sat = new Float64Array((cols + 1) * (rows + 1));
    for (var y2 = 0; y2 < rows; y2++) {
      var run = 0;
      for (var x2 = 0; x2 < cols; x2++) {
        run += grid[y2 * cols + x2];
        sat[(y2 + 1) * (cols + 1) + (x2 + 1)] = sat[y2 * (cols + 1) + (x2 + 1)] + run;
      }
    }
    occ = { sig: sig, box: box, cols: cols, rows: rows, sat: sat };
    return occ;
  }

  function cost(o, x, y, w, h) {
    var x0 = Math.max(0, Math.floor((x - o.box.left) / CELL));
    var x1 = Math.min(o.cols, Math.ceil((x + w - o.box.left) / CELL));
    var y0 = Math.max(0, Math.floor((y - o.box.top) / CELL));
    var y1 = Math.min(o.rows, Math.ceil((y + h - o.box.top) / CELL));
    if (x1 <= x0 || y1 <= y0) return 0;
    var W = o.cols + 1;
    return o.sat[y1 * W + x1] - o.sat[y0 * W + x1] - o.sat[y1 * W + x0] + o.sat[y0 * W + x0];
  }

  function place(b) {
    var q = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    var o = buildOcc();

    /* no grid (no map yet): the old behaviour, clamped to the viewport */
    if (!o) {
      var x = Math.min(Math.max(PAD, cx - w / 2), Math.max(PAD, window.innerWidth - w - PAD));
      var y = Math.min(Math.max(PAD, cy - h / 2), Math.max(PAD, window.innerHeight - h - PAD));
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
      return;
    }

    var minX = o.box.left + PAD, maxX = o.box.right - w - PAD;
    var minY = o.box.top + PAD, maxY = o.box.bottom - h - PAD;
    /* a card wider or taller than the box still has to land somewhere */
    if (maxX < minX) maxX = minX;
    if (maxY < minY) maxY = minY;

    var best = null;
    for (var y3 = minY; y3 <= maxY + 0.5; y3 += CELL) {
      for (var x3 = minX; x3 <= maxX + 0.5; x3 += CELL) {
        var px = Math.min(x3, maxX), py = Math.min(y3, maxY);
        var over = cost(o, px, py, w, h);
        /* distance from the marker keeps the card attached to what it explains */
        var dx = px + w / 2 - cx, dy = py + h / 2 - cy;
        var score = over * 1e6 + Math.sqrt(dx * dx + dy * dy);
        if (!best || score < best.score) best = { x: px, y: py, score: score, over: over };
      }
    }
    tip.style.left = Math.round(best.x) + 'px';
    tip.style.top = Math.round(best.y) + 'px';
  }
  /* the grid is only valid for the frame it was measured in */
  function dropOcc() { occ = null; }
  window.addEventListener('resize', dropOcc);
  document.addEventListener('oh:floor-change', dropOcc);
  document.addEventListener('oh:map-revealed', dropOcc);"""

s = rep(s, OLD_PLACE, NEW_PLACE)

# the card is a floating panel over the map: keep it narrow enough to find a gap
c = rep(c, '.site-plan_viewmark-tip{position:fixed;z-index:2147483040;max-width:17rem;',
           '.site-plan_viewmark-tip{position:fixed;z-index:2147483040;max-width:15.5rem;')

open(js_path, 'w').write(s)
open(css_path, 'w').write(c)
print('ok')
