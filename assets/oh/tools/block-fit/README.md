# Block view geometry (14 Oct 2026)

Fits the architect's floor-plan frame (1104x1093, v1's per-position unit highlights from
`oh_onfloor_numbers`) onto each block render's floor-highlight bands (860x640 on the 1356x1026
render), so the block view can draw the floor plans as slices that sit on the building.

Pipeline (run from a folder holding the downloaded assets: `pos-<A1..B27>.svg`,
`fh-<block>-<floor>-<render>.svg`, `render-<block>-*.webp`, `fp-*.avif`):

1. `pos_geo.json` - unit polygons per drawing type (`a`, `b1`, `b2`) and position, parsed from the
   v1 highlight SVGs. B26 is missing in Xano (404) and is derived as B16 shifted by (B27 - B17).
2. `fit_render.py` - shared helpers: path parsing, the building outline per drawing type (unit
   boxes + the stair core between the wings; the courtyard is open), band lower envelopes.
3. `fit_corr.py` / `fit_aff.py` - earlier attempts (vertex correspondence, free affine) kept for
   reference; the free affine shears the far side of the building because only the near facades
   are observed.
4. `fit_iso.py` - the fit that ships: camera fixed to the renders' isometric (tilt 54.74 deg,
   azimuth in one of four quadrants +-8 deg), scale and translation free, scored by the distance
   between the band bottoms and the outline's lower envelope. Block K (a3) is split-level, so its
   left wing is left out of the fit and sits half a floor off by design.
5. `block_geo.json` - what `heartland-oh.js` embeds (OH_BLOCK_GEO): per render type the outline,
   psi, k, tx, per-floor ty (regularised to equal spacing), the band paths; per drawing type the
   unit polygons; the estate render's block outlines (1110x706, aligned 6 Oct).

CSS mapping (plate px -> stage px): translate(tx*s + left, ty*s + top) rotateX(54.74deg)
rotateZ(psi) scale(k * s * 1104 / plateWidth), transform-origin 0 0, s = renderWidth / 1356.
