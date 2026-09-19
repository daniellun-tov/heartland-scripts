# Wized config backup - Oak Hills [New] (project MHh0NuKcGUFaHV6ZcZxa)

wized-config-2026-09-19.js    the live config exactly as Wized serves it to the browser
wized-config-2026-09-19.json  the same thing parsed and pretty-printed, for diffing

Taken 19 Sep 2026, right after the v1 -> v2 cutover and BEFORE any element pruning.
It is the complete project: every element, request, variable, event and app
definition. If elements are deleted from Wized to stay under the plan's element
cap, this file is what they are restored from - by hand in the Wized UI, or with
the Wized MCP's manage_elements create action driven off the JSON.

Counts at the time of the snapshot: 139 elements, 13 requests, 43 variables,
3 events, 3 apps.

## Element audit

Each element name was matched against the published HTML of every live page, plus
a saved copy of the old v1 unit-selection page taken before it was drafted (that
page no longer publishes, so it cannot be re-fetched - the copy in this repo's
history is the only record of which elements it used).

Still bound on a live page (home / unit-selection / privacy / 404): 65 - KEEP
Only on the retired v1 page: 57 - reclaimable
On no page at all: 17 - already dead

### v1-only (57)

 - building_highlight_img
 - building_pin_item
 - building_pin_name
 - building_pin_wrapper
 - building_select_btn
 - building_selected_tag
 - floor_pin_area
 - floor_pin_item
 - floor_pin_number
 - floor_pin_wrapper
 - floor_select_btn
 - floor_selected_tag
 - get_selected_bay_number
 - get_selected_bay_type
 - get_selected_block_letter
 - get_selected_floor_name
 - get_selected_unit_number
 - get_selected_unit_price
 - get_selected_unit_type_letter
 - level_unavailable_tag
 - onfloor_pin_item
 - onfloor_pin_name
 - onfloor_pin_wrapper
 - onfloor_unit_highlight_img
 - reserve_error_text
 - reserve_unit_btn
 - reserve_unit_form
 - reserve_unit_id
 - reserve_unit_number
 - reserve_unit_price
 - select_building_warning
 - select_floor_warning
 - select_unit_warning
 - select_unit_warning_btn
 - selected_block_letter
 - selected_floor_name
 - selected_unit_details
 - selected_unit_type_flythrough
 - selected_unit_type_letter
 - selected_unit_type_media_img
 - selected_unit_type_media_item
 - total_units
 - total_units_available
 - total_units_reserved
 - total_units_sold
 - unit-type-floorplan-img
 - unit_block_name
 - unit_floor_display_name
 - unit_name
 - unit_reserve_btn
 - unit_reserved_tag
 - unit_select_block_btn
 - unit_select_btn
 - unit_select_floor_btn
 - unit_selected_tag
 - unit_sold_tag
 - unit_type_vr_url

### bound to nothing on any page (17)

 - details_unit_type_floorplan_btn
 - details_unit_type_vr_btn
 - floor_pin_name
 - selected_unit_name
 - selected_unit_number
 - selected_unit_price
 - unit_accordion_view_btn
 - unit_highlight_img
 - unit_interest_count
 - unit_interest_count_trigger
 - unit_item
 - unit_pin_item
 - unit_pin_name
 - unit_status_tag
 - unit_status_tag_text
 - v2_udFloorplanImg
 - v2_udFlythrough

### Requests

Referenced only by the reclaimable elements above:
  add_user_reservation, change_unit_status_reserved, get_building_floors,
  get_onfloor_numbers, get_selected_unit, get_unit_by_filters

Still referenced by live elements or page events - do not remove:
  add_user_interest, get_unit_totals, get_unit_type_details, get_unit_types_list,
  v2_getUnitTypes, v2_getUnits
