
document.addEventListener('DOMContentLoaded', function () {
  document.querySelector('.unit-collection-list-wrapper').addEventListener('change', function (e) {
    if (e.target.matches('input[type="radio"][data-class="unit"]')) {
      document.body.classList.add('unit-selected');
      const sliderWrapper = document.querySelector('.dynamic-unit-slider-wrapper');
      if (sliderWrapper) sliderWrapper.style.display = 'block';
      const baseImage = e.target.getAttribute('data-base-image');
      const unitImage = document.querySelector('.dynamic-unit-rendering');
      const floorplanImageEl = document.querySelector('.dynamic-floorplan-image');
      if (unitImage && baseImage) {
        unitImage.src = baseImage;
        unitImage.style.display = 'block';
      }
      if (floorplanImageEl && baseImage) {
        floorplanImageEl.src = baseImage;
        floorplanImageEl.style.display = 'block';
      }
      if (window.Webflow && window.Webflow.require('slider')) window.Webflow.require('slider').redraw();
    }
  });
});

$(document).ready(function () {
  $('#hm-select-placeholder').css({ opacity: '1', display: 'block' });
  $('#home-select-carousel').css({ opacity: '0', display: 'none' });
  $("input[data-total-contribute='true']").on('click', function () {
    $('#hm-select-placeholder').css({ opacity: '0', display: 'none' });
    $('#home-select-carousel').css({ opacity: '1', display: 'block' });
  });
});

function docReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fn, 1);
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

const docReadyEvent = new Event('docreadyEvent');

let totalNumberOfAddons = 3;
let numberOfFloors = 6;

var addonsSelected = [],
  additionalAddonsSelected = [],
  floorOptionSelected = '',
  selectedListAddons = [],
  selectedUnitType = 'a',
  dontListenFloorChanged = false,
  outdoorOptionSelected = '',
  dontListenOutdoorChanged = false;

let totalUnitCostDiv = $('.total_unit_cost'),
  totalCostHiddenInput = $('#totalCostHiddenInput'),
  unitIDInput = $('#unitIDInput');

var allAddonNumbers = [];
var addonListTotals = [];

let isInitializingAddonList = true;
let isBulkApplianceToggle = false;
let isBatchTogglingAddons = false;

var unityGame,
  totalUnitCost = 0,
  unitCostValues = { addOn: 0 },
  totalAddonsCost = 0,
  selectedUnitNo = '',
  selectedUnitID = '',
  unitImage = '',
  gameLoaded = false,
  selectedUnitXraiIframeLink = '',
  oldselectedUnitXraiIframeLink = '',
  formFirstName = '',
  formLlastName = '';

let defaultListAddonButtonColor;
let defaultListAddonButtonTextColor;

var ignoreSolarClick = false;
var distanceFromTopBefore, distanceFromTopAfter, distanceFromTopDifference;
var originalFloorPrice = 0;
var clickedFromFloorPlan = false;

$(document).ready(function () {
  document.dispatchEvent(docReadyEvent);
  for (var i = 1; i < totalNumberOfAddons + 1; i++) allAddonNumbers.push(i);
  allAddonNumbers.forEach(function (n) {
    $('#upgrade-' + n + '-cb').prop('disabled', true);
  });
  $('#incanda-cb, #elk-cb, #bond-price-cb').prop('disabled', true);
  $('#viewGameNowBtn')
    .hide()
    .on('click', function () {
      startGame();
    });
  if (document.getElementById('unit-info-wrapper') !== null) {
    $('#unit-info-wrapper').css('display', 'none');
    $('#unit-info-initial').css('display', 'flex');
  }
  setTimeout(function () {
    isInitializingAddonList = false;
  }, 0);
});

$('.add-on-card').each(function (index, elem) {
  $(elem).on('click', function (e) {
    if (e.target !== this) return;
    $('#' + elem.id.replace('card', 'cb')).click();
  });
});

$('#hero_rent_btn').on('click', function () {
  $('#w-tabs-2-data-w-tab-0').click();
});

$("a[data-upgrade-overlay-button='true']").on('click', function () {
  $('#upgrade-' + $(this).attr('data-upgrade-number') + '-cb').click();
});

$("a[data-unit-floor-plan-button='true']").click(function () {
  clickedFromFloorPlan = true;
  $("input[data-unit-button='unitButton" + $(this).attr('data-unit-number') + "']").click();
});

$("input[data-reservation-ref-input-field='true']").keyup(function () {
  switch ($(this).attr('name')) {
    case 'First-Name':
      formFirstName = $(this).val();
      break;
    case 'Last-Name':
      formLlastName = $(this).val();
      break;
  }
  buildPaymentRef();
});

$('#finance-upgrades-cb').on('click', function () {
  var v = $(this).prop('checked') ? 'Yes' : 'No';
  $('.finance-upgrades-through-bond').each(function (i, o) {
    $(o).val(v);
  });
});

function buildPaymentRef() {
  var ref = 'BW-' + selectedUnitNo + '-' + formFirstName.replaceAll(' ', '').slice(0, 1).toUpperCase() + formLlastName.replaceAll(' ', '').slice(0, 10).toUpperCase();
  $('.referenceNumberHiddenInput').each(function (i, o) {
    $(o).val(ref);
  });
  $('#paymentReferenceDiv').html('Reference: ' + ref);
}

$("a[data-unit-floor-select-button='true']").mouseup(function () {
  if (!$("a[data-configurator-floor-number='" + $(this).attr('data-selection-floor-number') + "']").hasClass('w--current')) {
    $("a[data-configurator-floor-number='" + $(this).attr('data-floor-number') + "']").click();
    event.preventDefault();
  }
  if (!$("a[data-selection-floor-number='" + $(this).attr('data-selection-floor-number') + "']").hasClass('w--current')) {
    $("a[data-selection-floor-number='" + $(this).attr('data-floor-number') + "']").click();
    event.preventDefault();
  }
});

$("a[data-unit-selection-floor-select-button='true']").mouseup(function () {
  if (!$("a[data-configurator-floor-number='" + $(this).attr('data-selection-floor-number') + "']").hasClass('w--current')) {
    $("a[data-configurator-floor-number='" + $(this).attr('data-selection-floor-number') + "']").click();
    event.preventDefault();
  }
});

$("input[data-floor-select-option='true']").change(function () {
  if (!dontListenFloorChanged) floorOptionSelected = $(this).data('floor-select-slug');
  selectionTypeChanged(this, floorConfig, false);
});

$("input[data-outdoor-select-option='true']").change(function () {
  if (!dontListenOutdoorChanged) outdoorOptionSelected = $(this).data('outdoor-select-slug');
  selectionTypeChanged(this, outdoorConfig, false);
});

$("a[data-unit-configurator-floor-select-button='true']").mouseup(function () {
  if (!$("a[data-selection-floor-number='" + $(this).attr('data-configurator-floor-number') + "']").hasClass('w--current')) {
    $("a[data-selection-floor-number='" + $(this).attr('data-configurator-floor-number') + "']").click();
    event.preventDefault();
  }
});

window.addEventListener('message', function (e) {
  switch (e.data) {
    case 'loaded':
      setTimeout(function () {
        if ($("input[data-xrai-iframe-call='floor:On']").prop('checked')) document.getElementById('xrai-iframe').contentWindow.postMessage('floor:On', '*');
        else if ($("input[data-xrai-iframe-call='floor:Off']").prop('checked')) document.getElementById('xrai-iframe').contentWindow.postMessage('floor:Off', '*');
      }, 1000);
      break;
  }
});

// XR/VR tour fullscreen toggle (moved out of the embed)
window.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'xrai-tour-fullscreen') return;
  document.querySelectorAll('.xrai-tour iframe').forEach(function (f) {
    if (f.contentWindow === e.source) f.parentNode.classList.toggle('xrai-tour-full', !!e.data.value);
  });
  document.documentElement.style.overflow = e.data.value ? 'hidden' : '';
});

$(document).ready(function () {
  var cart = document.querySelector('.cart-wrap');
  var selectUnitWrap = document.querySelector('.select-unit-wrap');
  if (cart) cart.style.display = 'flex';
  if (selectUnitWrap) {
    selectUnitWrap.style.display = 'block';
    selectUnitWrap.style.opacity = '1';
  }
  $("input[data-addon-list-select-button='true']").each(function (i, e) {
    $(e).prop('checked', false).prop('disabled', true);
  });
  defaultListAddonButtonColor = $("div[data-addon-list-select-button-wrapper='true']").css('background-color');
  defaultListAddonButtonTextColor = $("div[data-addon-list-select-button-text='true']").css('color');
  $("div[data-addon-list-select-button-wrapper='true']").each(function (i, e) {
    $(e).css('background-color', '#999');
  });
  $("div[data-addon-list-select-button-text='true'], span[data-addon-list-select-button-text='true']").each(function (i, e) {
    $(e).css('color', '#CCC');
  });
});

function rebuildSectionHiddenInputs(sectionAddonSlug, section) {
  var slugs = [],
    names = [];
  $("input[data-addon-list-check='true'][data-section='" + section + "']:checked").each(function () {
    var slug = this.getAttribute('data-addon-list-slug') || '';
    var name = this.getAttribute('data-display-name') || this.getAttribute('data-name') || slug;
    if (slug) slugs.push(slug);
    if (name) names.push(name);
  });
  $('.' + sectionAddonSlug + '-hiddenInput').each(function (i, o) {
    $(o).val(names.length ? names.join(', ') : 'None');
  });
  $('.' + sectionAddonSlug + '-slugshiddenInput').each(function (i, o) {
    $(o).val(slugs.length ? slugs.join(', ') : 'None');
  });
}

$("input[data-addon-list-check='true']").on('change', function () {
  if (isInitializingAddonList) return;
  var sel = $(this);
  var sec = sel.data('section');
  if (addonListTotals[sec] === undefined) addonListTotals[sec] = 0;
  if (selectedListAddons[sec] === undefined) selectedListAddons[sec] = [];
  if (sel.is(':checked')) {
    selectedListAddons[sec].push(this.getAttribute('data-addon-list-slug') || '');
    addonListTotals[sec] += parseFloat(sel.data('price')) || 0;
    if (sel.data('addon-list-dependancy') !== '') {
      var dep = $("input[data-addon-list-slug='" + sel.data('addon-list-dependancy') + "']");
      if (!dep.is(':checked')) dep.click();
    }
  } else {
    var idx = selectedListAddons[sec].indexOf(this.getAttribute('data-addon-list-slug') || '');
    if (idx > -1) selectedListAddons[sec].splice(idx, 1);
    $("input[data-addon-list-dependancy='" + sel.data('addon-list-slug') + "']:checked").each(function (i, e) {
      $(e).click();
    });
    addonListTotals[sec] -= parseFloat(sel.data('price')) || 0;
  }
  if (selectedListAddons[sec].length > 0) $('#cart-' + sel.data('section-addon-slug') + '-wrap').css('display', 'flex');
  var slug = sel.data('section-addon-slug');
  $("div[data-addon-list-section='" + slug + "']")
    .attr('data-section-price', addonListTotals[sec])
    .html(priceOrDash(addonListTotals[sec]));
  $('#cart-' + slug + '-price, #cart-' + slug + '-display-price').html(priceOrDash(addonListTotals[sec]));
  rebuildSectionHiddenInputs(slug, sec);
  if (!ignoreSolarClick && sel.data('addon-list-group') != '') {
    $("input[data-addon-list-group='" + sel.data('addon-list-group') + "']").each(function (i, e) {
      if (e !== sel[0] && $(e).is(':checked')) {
        ignoreSolarClick = true;
        e.click();
        ignoreSolarClick = false;
      }
    });
  }
  unitCostValues['addon-list-' + slug] = parseFloat(addonListTotals[sec]) || 0;
  updateTotalPrice();
});

$('#kitchen-upgrade-input').on('change', function () {
  var price = parseFloat($(this).attr('data-price')) || 0;
  var ur = $("input[data-total-contribute='true'][data-class='unit']:checked");
  if ($(this).is(':checked')) {
    setImg('kitchen-upgrade-image', ur.data('kitchen-upgrade-image-url'));
    $('#kitchen-upgrade-display-section-price, #pergola-addon-display-price').html('R ' + numberWithSpaces(price));
    $('#cart-kitchen-price').html('R ' + numberWithSpaces(price));
    $('.kitchen-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('Yes');
    });
    $('.kitchen-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('R ' + numberWithSpaces(price));
    });
    unitCostValues['kitchen-upgrade-price'] = price;
  } else {
    setImg('kitchen-upgrade-image', ur.data('kitchen-base-image-url'));
    $('#kitchen-upgrade-display-section-price, #pergola-addon-display-price').html('-');
    $('#cart-kitchen-price').html('-');
    $('.kitchen-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('No');
    });
    $('.kitchen-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('');
    });
    unitCostValues['kitchen-upgrade-price'] = 0;
  }
  $(this)
    .next('span')
    .text($(this).is(':checked') ? 'Remove' : 'Add');
  updateTotalPrice();
});

$('#kitchen2-upgrade-input').on('change', function () {
  var price = parseFloat($(this).attr('data-price')) || 0;
  var ur = $("input[data-total-contribute='true'][data-class='unit']:checked");
  if ($(this).is(':checked')) {
    setImg('kitchen2-upgrade-image', ur.data('kitchen2-upgrade-image-url'));
    $('#kitchen2-upgrade-display-section-price, #kitchen2-addon-display-price').html('R ' + numberWithSpaces(price));
    $('#cart-kitchen2-price').html('R ' + numberWithSpaces(price));
    $('.kitchen2-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('Yes');
    });
    $('.kitchen2-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('R ' + numberWithSpaces(price));
    });
    unitCostValues['kitchen2-upgrade-price'] = price;
  } else {
    setImg('kitchen2-upgrade-image', ur.data('kitchen2-base-image-url'));
    $('#kitchen2-upgrade-display-section-price, #kitchen2-addon-display-price').html('-');
    $('#cart-kitchen2-price').html('-');
    $('.kitchen2-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('No');
    });
    $('.kitchen2-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('');
    });
    unitCostValues['kitchen2-upgrade-price'] = 0;
  }
  $(this)
    .next('span')
    .text($(this).is(':checked') ? 'Remove' : 'Add');
  updateTotalPrice();
});

$('#kitchen3-upgrade-input').on('change', function () {
  var price = parseFloat($(this).attr('data-price')) || 0;
  var ur = $("input[data-total-contribute='true'][data-class='unit']:checked");
  if ($(this).is(':checked')) {
    setImg('kitchen3-upgrade-image', ur.data('kitchen3-upgrade-image-url'));
    $('#kitchen3-upgrade-display-section-price, #kitchen3-addon-display-price').html('R ' + numberWithSpaces(price));
    $('#cart-kitchen3-price').html('R ' + numberWithSpaces(price));
    $('.kitchen3-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('Yes');
    });
    $('.kitchen3-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('R ' + numberWithSpaces(price));
    });
    unitCostValues['kitchen3-upgrade-price'] = price;
  } else {
    setImg('kitchen3-upgrade-image', ur.data('kitchen3-base-image-url'));
    $('#kitchen3-upgrade-display-section-price, #kitchen3-addon-display-price').html('-');
    $('#cart-kitchen3-price').html('-');
    $('.kitchen3-upgrade-hiddenInput').each(function (i, o) {
      $(o).val('No');
    });
    $('.kitchen3-upgrade-price-hiddenInput').each(function (i, o) {
      $(o).val('');
    });
    unitCostValues['kitchen3-upgrade-price'] = 0;
  }
  $(this)
    .next('span')
    .text($(this).is(':checked') ? 'Remove' : 'Add');
  updateTotalPrice();
});

$('#bond-price-cb').on('change', function () {
  var price = parseFloat($(this).attr('data-price')) || 0;
  if ($(this).is(':checked')) {
    unitCostValues.bondPrice = price;
    $('#cart-bond-cost-wrap').css('display', 'flex');
    $('#cart-bond-cost-price').html('R ' + numberWithSpaces(price));
    $('.bond-costUpgradeHiddenInput').each(function (i, o) {
      $(o).val('Yes');
    });
  } else {
    unitCostValues.bondPrice = 0;
    $('#cart-bond-cost-wrap').css('display', 'none');
    $('#cart-bond-cost-price').html('-');
    $('.bond-costUpgradeHiddenInput').each(function (i, o) {
      $(o).val('No');
    });
  }
  updateTotalPrice();
});

$('#addon-list-hillside-fireplace').on('change', function () {
  if ($(this).is(':checked')) {
    $('#addon-list-section-1-price-aggregate').html('R ' + numberWithSpaces($(this).attr('data-price')));
    $('#cart-addon-list-section-3-price, #power-addon-display-price').html('R ' + numberWithSpaces($(this).attr('data-price')));
    $('#cart-addon-list-section-3-price-wrap, #cart-addon-list-section-3-price').css('display', 'flex');
    $('.addon-list-section-3-hiddenInput').each(function (i, o) {
      $(o).val('Yes');
    });
  } else {
    $('#addon-list-section-1-price-aggregate, #cart-addon-list-section-3-price').html('-');
    $('.addon-list-section-3-hiddenInput').each(function (i, o) {
      $(o).val('No');
    });
  }
  updateTotalPrice();
});

$("input[data-total-contribute='true']").click(function () {
  switch ($(this).data('class')) {
    case 'unit':
      if (document.getElementById('unit-info-wrapper') !== null) {
        $('#unit-info-wrapper').css('display', 'flex');
        $('#unit-info-initial').css('display', 'none');
      }

      selectedUnitType = ($(this).data('unit-type-name') || 'a').toString().trim().slice(-1).toLowerCase();

      // Pool section + kitchen3 cart row are Type B only
      (function () {
        var show = selectedUnitType === 'b' ? '' : 'none';
        ['pool-section', 'cart-kitchen3-wrap'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = show;
        });
      })();

      oldselectedUnitXraiIframeLink = selectedUnitXraiIframeLink;
      selectedUnitXraiIframeLink = $(this).attr('data-xrai-iframe-link');

      console.log('link      :', JSON.stringify(selectedUnitXraiIframeLink));
      console.log('radio attr:', $("input[data-total-contribute='true'][data-class='unit']:checked").attr('data-xrai-iframe-link'));
      console.log('# iframes :', document.querySelectorAll('#xrai-iframe').length);

      dontListenFloorChanged = true;
      for (var i = 1; i < numberOfFloors + 1; i++) {
        if (floorOptionSelected != 'floor-' + i) $('#flooring-floor-' + i + '-' + selectedUnitType).click();
      }
      dontListenFloorChanged = false;

      // Kitchen upgrade prices & images
      var k1Checked = $('#kitchen-upgrade-input').is(':checked');
      var k1Base = $(this).data('kitchen-base-image-url');
      var k1Upgrade = $(this).data('kitchen-upgrade-image-url');
      var k2Checked = $('#kitchen2-upgrade-input').is(':checked');
      var k2Base = $(this).data('kitchen2-base-image-url');
      var k2Upgrade = $(this).data('kitchen2-upgrade-image-url');
      $('#kitchen-upgrade-input').attr('data-price', $(this).data('kitchen-upgrade-price'));
      $('#kitchen-upgrade-display-price, #pergola-addon-display-price').html('R ' + numberWithSpaces($(this).data('kitchen-upgrade-price')));

      // Kitchen 2
      $('#kitchen2-upgrade-input').attr('data-price', $(this).data('kitchen2-upgrade-price'));
      $('#kitchen2-upgrade-display-price').html('R ' + numberWithSpaces($(this).data('kitchen2-upgrade-price')));

      // Kitchen 3
      var k3Checked = $('#kitchen3-upgrade-input').is(':checked');
      var k3Base = $(this).data('kitchen3-base-image-url');
      var k3Upgrade = $(this).data('kitchen3-upgrade-image-url');
      $('#kitchen3-upgrade-input').attr('data-price', $(this).data('kitchen3-upgrade-price'));
      $('#kitchen3-upgrade-display-price').html('R ' + numberWithSpaces($(this).data('kitchen3-upgrade-price')));

      if (k1Base || k1Upgrade)
        $('#kitchen-upgrade-image')
          .attr('src', k1Checked ? k1Upgrade : k1Base)
          .attr('srcset', k1Checked ? k1Upgrade : k1Base);
      if (k2Base || k2Upgrade)
        $('#kitchen2-upgrade-image')
          .attr('src', k2Checked ? k2Upgrade : k2Base)
          .attr('srcset', k2Checked ? k2Upgrade : k2Base);
      if (k3Base || k3Upgrade)
        $('#kitchen3-upgrade-image')
          .attr('src', k3Checked ? k3Upgrade : k3Base)
          .attr('srcset', k3Checked ? k3Upgrade : k3Base);
      if (k1Checked) $('#kitchen-upgrade-input').click();
      if ($('#kitchen2-upgrade-input').is(':checked')) $('#kitchen2-upgrade-input').click();
      if ($('#kitchen3-upgrade-input').is(':checked')) $('#kitchen3-upgrade-input').click();

      $('#kitchenUpgradePdfDownloadLink').attr('target', '_blank').attr('href', $(this).attr('data-kitchen-upgrade-pdf-href'));
      $('#kitchenUpgradePdfDownloadWrapper').css('display', 'block');

      $("input[data-addon-list-select-button='true']").each(function (i, e) {
        $(e).removeAttr('disabled');
      });
      $("div[data-addon-list-select-button-wrapper='true']").each(function (i, e) {
        $(e).attr('style', '');
      });
      $("div[data-addon-list-select-button-text='true'], span[data-addon-list-select-button-text='true']").each(function (i, e) {
        $(e).css('color', defaultListAddonButtonTextColor);
      });

      $('.select-unit-wrap').each(function (i, e) {
        $(e).css('display', 'none');
      });
      $('.add-button-wrap').each(function (i, e) {
        $(e).css('display', 'block');
      });

      $('#cart-unit-label, #cart-unit-main-label').html($(this).data('unit-display-name'));

      for (let i = 1; i <= numberOfFloors; i++) {
        var fp = Number($(this).data('unit-floor-' + i + '-price')) || 0;
        $('#flooring-floor-' + i + '-' + selectedUnitType).attr('data-floor-select-price', fp);
        $('#floor-' + i + '-price-label-' + selectedUnitType).html('R ' + numberWithSpaces(fp));
      }

      $("input[data-outdoor-select-option='true']").each(function () {
        var id = $(this).attr('data-outdoor-select-slug');
        var rid = $(this).attr('id') || '';
        var type = rid.slice(-1).toLowerCase();
        var $lbl = $('#' + id + '-price-label-' + type);
        if (!$lbl.length) $lbl = $('#' + id + '-price-label');
        $lbl.html(priceOrZero($(this).attr('data-outdoor-select-price')));
      });

      $('#addon-1-display-price').html('R ' + numberWithSpaces($(this).data('upgrade-1-price')));
      $('#addon-2-display-price').html('R ' + numberWithSpaces($(this).data('upgrade-2-price')));
      $('#addon-2-display-price-alt').html('-');
      $('#addon-3-display-price, #addon-3-display-price-alt').html($(this).data('unit-upgrade-3-display-price'));
      $('#floor-display-price').html('R ' + numberWithSpaces($(this).data('unit-floor-2-price')));
      $('#kitchen-display-price').html('R ' + numberWithSpaces($(this).data('kitchen-upgrade-price')));
      $('#kitchen2-display-price').html('R ' + numberWithSpaces($(this).data('kitchen2-upgrade-price')));
      $('#kitchen3-display-price').html('R ' + numberWithSpaces($(this).data('kitchen3-upgrade-price')));
      $('#power-display-price').html('R ' + numberWithSpaces($(this).data('meridian-upgrade-price')));
      $('#security-display-price').html('R ' + numberWithSpaces($(this).data('myplace-price')));
      $('#addon-subtotal-display-price').html('R ' + numberWithSpaces($(this).data('all-upgrades-price')));

      if (floorOptionSelected == '') $('#flooring-floor-1-' + selectedUnitType).click();
      else $('#flooring-' + floorOptionSelected + '-' + selectedUnitType).click();

      // Default the outdoor selection to the FIRST option on the correct (A/B) card,
      // on every unit change — re-fire even if already selected so the wrapper, image,
      // price label and cart refresh against the newly selected unit type.
      (function () {
        var t = selectedUnitType;
        requestAnimationFrame(function () {
          setTimeout(function () {
            var $first = $("input[data-outdoor-select-option='true'][id$='-" + t + "']").first();
            if (!$first.length) return;
            $first.prop('checked', false); // force a state change so the click always fires
            $first.click();                // fires the outdoor change handler → selectionTypeChanged
          }, 30);
        });
      })();

      // Flythrough video
      var ftBase = 'https://cdn.prod.website-files.com/61110f294933f9d0faf6d77f' + $(this).attr('data-unit-flythrough-url');
      $('#flythrough_poster_wrapper').attr({ 'data-poster-url': ftBase + '_poster.0000000.jpg', 'data-video-urls': ftBase + '_mp4.mp4, https://assets-global.website-files.com/61110f294933f9d0faf6d77f/' + $(this).attr('data-unit-flythrough-url') + '-_webm.webm' });
      $('#flythrough_video').css('background-image', "url('" + ftBase + "_poster.0000000.jpg')");
      if (document.getElementById('flythrough_poster_wrapper_fallback') !== null) document.getElementById('flythrough_poster_wrapper_fallback').src = ftBase + '_poster.0000000.jpg';
      if (document.getElementById('flythrough_video') !== null) {
        var mp4s = document.createElement('source');
        mp4s.src = ftBase + '_mp4.mp4';
        mp4s.type = 'video/mp4';
        var webms = document.createElement('source');
        webms.src = ftBase + '_webm.webm';
        webms.type = 'video/webm';
        var fv = document.getElementById('flythrough_video');
        $('#flythrough_video').html('');
        fv.pause();
        fv.appendChild(mp4s);
        fv.appendChild(webms);
        fv.load();
        fv.play();
      }

      $('.furniture-info').css('display', 'none');
      $('#appliance-info-wrapper').fadeIn(250);
      $("input[data-filter-unit-type-name='" + $(this).attr('data-unit-type-name') + "']").click();

      if (selectedUnitXraiIframeLink != oldselectedUnitXraiIframeLink) {
        document.getElementById('xrai-iframe').src = '';
        $('#3d-walkthrough-curtain').css({ display: 'flex', opacity: '1' });
      }

      var unitRadio = $(this);
      $('#unit-image').fadeOut(0, function () {
        $(this).attr('src', unitRadio.data('base-image')).attr('srcset', unitRadio.data('base-image')).fadeIn(0);
      });

      $('#bond-price-cb').prop('disabled', false);
      $('#viewGameNowBtn').prop('disabled', false).html('View Now').show();
      $('#game-disabled-text').hide();
      $('#cart-container').fadeIn(500);
      $('#cart-unit-price').html('R ' + numberWithSpaces($(this).data('price')));
      $('.unitCostHiddenInput').each(function (i, o) {
        $(o).val('R ' + numberWithSpaces(unitRadio.data('price')));
      });

      var isForRent = $(this).data('for-rent');
      var totalCostLabel = document.querySelector('#total_unit_cost');
      var unitPriceLabel = document.querySelector('#cart-unit-price');
      var linkWrap = document.querySelector('.link-wrap');
      var upgradeEls = ['cart-upgrade-2-wrap', 'cart-floor-wrap', 'cart-addon-list-section-3-wrap', 'cart-addon-list-section-2-wrap', 'cart-bond-cost-wrap'].map(function (id) {
        return document.getElementById(id);
      });
      if (isForRent === true || isForRent === 'true') {
        if (totalCostLabel) totalCostLabel.textContent = 'R ' + numberWithSpaces($(this).data('price')) + ' PM';
        if (unitPriceLabel) unitPriceLabel.textContent = 'R ' + numberWithSpaces($(this).data('price')) + ' PM';
        upgradeEls.forEach(function (el) {
          if (el) el.style.display = 'none';
        });
        if (linkWrap) linkWrap.innerHTML = '<a href="#enquire-now" class="text-color-polaris-blue" onclick="openEnquireTab()">Enquire Now</a>';
      } else {
        if (totalCostLabel) totalCostLabel.textContent = 'R ' + numberWithSpaces($(this).data('price'));
        if (unitPriceLabel) unitPriceLabel.textContent = 'R ' + numberWithSpaces($(this).data('price'));
        upgradeEls.forEach(function (el) {
          if (el) el.style.display = 'flex';
        });
        // if (linkWrap) linkWrap.innerHTML = '<a href="#unit-selector" class="text-color-polaris-blue">Change Unit</a><div class="text-block-16">|</div><a href="#reserve-home" class="text-color-polaris-blue">Enquire Now</a>';
      }

      unitIDInput.val($(this).data('unit-id'));
      unitCostValues.unit = $(this).data('price');
      $('#bond-price-cb').attr('data-price', $(this).data('bond-price'));
      $('#bond-price-label').html('R ' + numberWithSpaces($(this).data('bond-price')));
      $('#register-savings-label, #register-savings-label2').html('R ' + numberWithSpaces($(this).data('registration-savings')));

      var addonCombos = allAddonNumbers.flatMap(function (v, i) {
        return allAddonNumbers.slice(i + 1).map(function (w) {
          return v + '-' + w;
        });
      });
      allAddonNumbers.forEach(function (n) {
        var cb = $('#upgrade-' + n + '-cb');
        cb.attr('data-upgrade-image', unitRadio.attr('data-upgrade-' + n + '-image'))
          .attr('data-upgrade-all-image', unitRadio.attr('data-upgrade-all-image'))
          .attr('data-base-unit-image', unitRadio.attr('data-base-image'))
          .attr('data-price', unitRadio.data('upgrade-' + n + '-price'))
          .prop('disabled', false);
        addonCombos.forEach(function (c) {
          cb.attr('data-upgrade-' + c + '-image', unitRadio.attr('data-upgrade-' + c + '-image'));
        });
        $('#upgrade-' + n + '-price-label').html('R ' + numberWithSpaces(unitRadio.data('upgrade-' + n + '-price')));
      });

      for (let i = 1; i < 100; i++) {
        if ($('.unit-' + i).length <= 0) break;
        $('.unit-' + i).css('display', 'none');
      }
      $('.unit-' + $(this).data('unit-number')).fadeIn(500);

      setTimeout(function () {
        if (typeof setupTooltips === 'function') setupTooltips();
      }, 600);

      unitCostValues.addOn = 0;
      addonsSelected.forEach(function (item) {
        addOnSelected($("input[data-image-class-name='" + item + "']"));
      });
      additionalAddonsSelected.forEach(function (item) {
        addOnSelected($("input[data-image-class-name='" + item + "']"));
      });

      selectedUnitNo = $(this).data('unit-number');
      selectedUnitID = $(this).data('unit-id');
      selectedreservationNumber = $(this).data('reservation-number');
      buildPaymentRef();
      $('.unitIDInput').each(function (i, o) {
        $(o).val(selectedUnitID);
      });
      $('.unitNameNumberHiddenInput').each(function (i, o) {
        $(o).val(selectedUnitNo);
      });
      $('.reservationNumberHiddenInput').each(function (i, o) {
        $(o).val(selectedreservationNumber);
      });

      if (clickedFromFloorPlan) clickedFromFloorPlan = false;
      break;

    case 'add-on':
      addOnSelected($(this));
      break;
  }
  
  updateTotalPrice();
  
});

function updateTotalPrice() {
  if (isBatchTogglingAddons) return;
  totalUnitCost = 0;
  totalAddonsCost = 0;
  for (var key in unitCostValues) totalUnitCost += parseFloat(unitCostValues[key]) || 0;
  totalAddonsCost = Object.keys(unitCostValues)
    .filter(function (k) {
      return !['bondPrice', 'addOn', 'unit'].includes(k);
    })
    .reduce(function (s, k) {
      return s + (parseFloat(unitCostValues[k]) || 0);
    }, 0);
  $('#total_addons_cost').html('R ' + numberWithSpaces(totalAddonsCost));
  $('.totalUpgradesTypeHiddenInput').each(function (i, o) {
    $(o).val('R ' + numberWithSpaces(totalAddonsCost));
  });
  totalUnitCostDiv.each(function (i, o) {
    $(o).html('R ' + numberWithSpaces(totalUnitCost));
  });
  totalCostHiddenInput.val('R ' + numberWithSpaces(totalUnitCost));
  $('.totalCostHiddenInput').each(function (i, o) {
    $(o).val('R ' + numberWithSpaces(totalUnitCost));
  });

  // updateBondDisplay();
}

function selectionTypeChanged(elem, config, onLoad) {
  var price = $(elem).attr(config.priceAttr);
  var name = $(elem).attr(config.nameAttr);
  var slug = $(elem).attr(config.actualSlugAttr) || $(elem).attr(config.slugAttr) || '';
  var itemId = $(elem).attr(config.slugAttr);
  var $priceLabel;
  if (config.splitByUnitType) {
    $priceLabel = $('#' + itemId + '-price-label-' + selectedUnitType);
    if ($priceLabel.length === 0) $priceLabel = $('#' + itemId + '-price-label');
  } else {
    $priceLabel = $('#' + itemId + '-price-label');
  }
  $priceLabel.html(priceOrZero(price));
  $(config.hiddenInput).val(name);
  $(config.hiddenSlugInput).val(slug);
  $('#' + config.cartWrap).css('display', 'flex');
  $('#' + config.cartLabel).html(config.labelPrefix + name);
  $('#' + config.cartPrice).html(config.priceOrFn(price));
  var iframeCall = $(elem).attr('data-xrai-iframe-call');
  if (iframeCall) document.getElementById('xrai-iframe').contentWindow.postMessage(iframeCall, '*');
  var bgSrc = $(elem).attr(config.bgImageAttr);
  if (config.splitByUnitType) {
    var activeType = selectedUnitType === 'b' ? 'b' : 'a';
    var inactiveType = activeType === 'a' ? 'b' : 'a';
    var $active = $('#' + config.bgImageId + '-' + activeType);
    // Always show the correct card and hide the other
    $active.css('display', config.splitShowValue != null ? config.splitShowValue : 'block');
    $('#' + config.bgImageId + '-' + inactiveType).css('display', 'none');
    // Only paint a background image for configs that use the card as an image surface (outdoor)
    if (config.setSplitBg) $active.css('background-image', bgSrc ? "url('" + bgSrc + "')" : '');
  } else if (bgSrc) {
    $('#' + config.bgImageId).css('background-image', "url('" + bgSrc + "')");
  }

  // ---- TYPE-SPECIFIC OUTDOOR: display price + included blocks + pool ----
  if (config.key === 'outdoor') {
    var aType = selectedUnitType === 'b' ? 'b' : 'a';
    var itemId = $(elem).attr(config.slugAttr); // {{wf:Item ID|Dynamo}}

    // mirror the selected option's price-label into the type display price
    $('#outdoor-' + aType + '-display-price').text($('#' + itemId + '-price-label-' + aType).text());

    if (aType === 'a') {
      $('#outdoor-included-type-a').show();
      $('#outdoor-included-type-b').hide();
      $('#type-b-pool').hide();
    } else {
      $('#outdoor-included-type-b').show();
      $('#type-b-pool').show();
      $('#outdoor-included-type-a').hide();
    }
  }

  var renderSrc = $(elem).attr('data-' + config.key + '-render-type-' + selectedUnitType);
  if (config.splitRenderByType) {
    var rActive = selectedUnitType === 'b' ? 'b' : 'a';
    var rInactive = rActive === 'a' ? 'b' : 'a';
    $('#' + config.renderId + '-' + rInactive).hide();
    var $rActive = $('#' + config.renderId + '-' + rActive);
    if (renderSrc) $rActive.attr('src', renderSrc).attr('srcset', renderSrc);
    $rActive.show();
  } else if (renderSrc) {
    $('#' + config.renderId).attr('src', renderSrc).attr('srcset', renderSrc).show();
  }
  unitCostValues[config.costKey] = parseFloat((price || '').replace(/[^\d.-]/g, '')) || 0;
  if (!onLoad) updateTotalPrice();
}

var floorConfig = {
  key: 'floor',
  priceAttr: 'data-floor-select-price',
  nameAttr: 'data-floor-select-name',
  slugAttr: 'data-floor-select-slug',
  actualSlugAttr: 'data-floor-select-actual-slug',
  hiddenInput: '.floorTypeHiddenInput',
  hiddenSlugInput: '.floorTypeSlugsHiddenInput',
  cartWrap: 'cart-floor-wrap',
  cartLabel: 'cart-floor-label',
  cartPrice: 'cart-floor-price',
  labelPrefix: 'Flooring: ',
  renderId: 'flooring-unit-render',
  costKey: 'floorPrice',
  priceOrFn: priceOrDash,
  bgImageId: 'flooring-image',
  bgImageAttr: 'data-floor-select-image-source',
  splitByUnitType: true,
  setSplitBg: true,
  splitShowValue: '',
  splitRenderByType: true,
};
var outdoorConfig = {
  key: 'outdoor',
  priceAttr: 'data-outdoor-select-price',
  nameAttr: 'data-outdoor-select-name',
  slugAttr: 'data-outdoor-select-slug',
  actualSlugAttr: 'data-outdoor-select-actual-slug',
  hiddenInput: '.outdoorTypeHiddenInput',
  hiddenSlugInput: '.outdoorTypeSlugsHiddenInput',
  cartWrap: 'cart-outdoor-wrap',
  cartLabel: 'cart-outdoor-label',
  cartPrice: 'cart-outdoor-price',
  labelPrefix: 'Outdoor: ',
  renderId: 'outdoor-unit-render',
  costKey: 'outdoorPrice',
  priceOrFn: priceOrDash,
  bgImageId: 'outdoor-image',
  bgImageAttr: 'data-outdoor-select-image-source',
  splitByUnitType: true,
  setSplitBg: true,
};

function priceOrDash(n) {
  var v = Math.floor(Number(n) || 0);
  return v > 0 ? 'R ' + numberWithSpaces(v) : '-';
}
function priceOrZero(n) {
  return 'R ' + numberWithSpaces(Math.floor(Number(n) || 0));
}
function numberWithSpaces(n) {
  return Math.floor(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function setImg(id, src) {
  if (src)
    $('#' + id)
      .attr('src', src)
      .attr('srcset', src);
}

function addOnSelected(addonCheck) {
  if (addonCheck.prop('checked')) {
    if (addonCheck.attr('id') == 'upgrade-2-cb') {
      $('#furn-list').css('opacity', 1);
      $('#furn-list-text').css('display', 'none');
    }
    unitCostValues.addOn += parseInt(addonCheck.attr('data-price'));
    $('.' + addonCheck.data('image-class-name') + 'UpgradeHiddenInput').each(function (a, e) {
      $(e).val('Yes');
    });
    $('#cart-' + addonCheck.data('image-class-name') + '-wrap').css('display', 'flex');
    $('#cart-' + addonCheck.data('image-class-name') + '-price').html('R ' + numberWithSpaces(addonCheck.attr('data-price')));
    if (addonCheck.data('image-class-name') === 'upgrade-2') $('#addon-2-display-price-alt').html(priceOrDash(addonCheck.attr('data-price')));
    if (addonCheck.data('addon-counter')) {
      if (addonsSelected.indexOf(addonCheck.data('image-class-name')) < 0) addonsSelected.push(addonCheck.data('image-class-name'));
      addonsSelected.sort();
      var allImg = addonCheck.attr('data-upgrade-all-image');
      if (addonsSelected.length == totalNumberOfAddons) {
        setImg('unit-image', allImg);
      } else if (addonsSelected.length == 1) {
        setImg('unit-image', addonCheck.attr('data-upgrade-image'));
      } else {
        var n = 'data-upgrade-';
        addonsSelected.forEach(function (a) {
          n += a.replace('upgrade-', '') + '-';
        });
        n += 'image';
        setImg('unit-image', addonCheck.attr(n));
      }
      $('.' + addonCheck.attr('data-image-class-name') + 'HiddenInput, .' + addonCheck.attr('data-image-class-name') + 'UpgradeHiddenInput').each(function (i, o) {
        $(o).val('Yes');
      });
      if (addonCheck.attr('data-image-class-name') === 'upgrade-2') {
        if ($('#appliance-basic-cb').prop('checked')) $('#appliance-basic-cb').click();
      }
    } else {
      if (additionalAddonsSelected.indexOf(addonCheck.data('image-class-name')) < 0) additionalAddonsSelected.push(addonCheck.data('image-class-name'));
    }
  } else {
    if (addonCheck.attr('id') == 'upgrade-2-cb') {
      $('#furn-list').css('opacity', 0.5);
      $('#furn-list-text').css('display', 'flex');
    }
    unitCostValues.addOn -= parseInt(addonCheck.attr('data-price'));
    $('.' + addonCheck.data('image-class-name') + 'UpgradeHiddenInput').each(function (a, e) {
      $(e).val('No');
    });
    $('#cart-' + addonCheck.data('image-class-name') + '-wrap').css('display', 'none');
    $('#cart-' + addonCheck.data('image-class-name') + '-price').html('-');
    if (addonCheck.data('image-class-name') === 'upgrade-2') $('#addon-2-display-price-alt').html('-');
    if (addonCheck.data('addon-counter')) {
      var ei = addonsSelected.indexOf(addonCheck.data('image-class-name'));
      if (ei > -1) addonsSelected.splice(ei, 1);
      addonsSelected.sort();
      if (addonsSelected.length > 0) {
        if (addonsSelected.length == totalNumberOfAddons) {
          setImg('unit-image', addonCheck.attr('data-upgrade-all-image'));
        } else if (addonsSelected.length == 1) {
          setImg('unit-image', $('#' + addonsSelected[0] + '-cb').attr('data-upgrade-image'));
        } else {
          var n = 'data-upgrade-';
          addonsSelected.forEach(function (a) {
            n += a.replace('upgrade-', '') + '-';
          });
          n += 'image';
          setImg('unit-image', addonCheck.attr(n));
        }
      } else {
        setImg('unit-image', addonCheck.attr('data-base-unit-image'));
      }
      $('.' + addonCheck.attr('data-image-class-name') + 'HiddenInput, .' + addonCheck.attr('data-image-class-name') + 'UpgradeHiddenInput').each(function (i, o) {
        $(o).val('No');
      });
      if (addonCheck.attr('data-image-class-name') === 'upgrade-2') {
        if (!$('#appliance-basic-cb').prop('checked')) $('#appliance-basic-cb').click();
      }
    } else {
      var ej = additionalAddonsSelected.indexOf(addonCheck.data('image-class-name'));
      if (ej > -1) additionalAddonsSelected.splice(ej, 1);
    }
  }
}

function startGame() {
  document.getElementById('xrai-iframe').src = selectedUnitXraiIframeLink;
  $('#3d-walkthrough-curtain').stop(true, true).fadeOut(200);
}

document.addEventListener('DOMContentLoaded', function () {
  function switchToTab(tabName) {
    var retries = 0;
    var interval = setInterval(function () {
      var tabLink = document.querySelector('.w-tab-link[data-w-tab="' + tabName + '"]');
      if (tabLink) {
        tabLink.click();
        clearInterval(interval);
      }
      if (++retries > 10) clearInterval(interval);
    }, 200);
  }
  function toggleSections(isRentable) {
    var show = isRentable.toLowerCase() === 'true' ? 'none' : '';
    var sh = document.getElementById('smart-home'),
      b = document.getElementById('bond');
    if (sh) sh.style.display = show;
    if (b) b.style.display = show;
    updatePoiPadding(isRentable);
  }
  document.body.addEventListener('click', function (e) {
    if (e.target.matches('#enquire-now-link'))
      setTimeout(function () {
        switchToTab('Enquire');
      }, 800);
     if (e.target.matches('#reserve-now-link')) setTimeout(function() { switchToTab('Reserve'); }, 800);
  });
  document.querySelectorAll('.fp-dot-wrap').forEach(function (unit) {
    unit.addEventListener('click', function () {
      setTimeout(function () {
        switchToTab('Reserve');
      }, 100);
      var input = unit.parentElement.querySelector('input[data-class="unit"]');
      if (input) toggleSections(input.getAttribute('data-for-rent') || 'false');
    });
  });
});

$('.fp-dot-wrap').click(function () {
  $('.select-unit-wrap').each(function (i, e) {
    $(e).css('display', 'none');
  });
  var isForRent = $(this).attr('data-for-rent');
  var price = $(this).attr('data-price');
  var totalCostLabel = document.querySelector('#total_unit_cost');
  var unitPriceLabel = document.querySelector('#cart-unit-price');
  var linkWrap = document.querySelector('.link-wrap');
  var upgradeEls = ['cart-upgrade-2-wrap', 'cart-floor-wrap', 'cart-addon-list-section-3-wrap', 'cart-addon-list-section-2-wrap', 'cart-bond-cost-wrap'].map(function (id) {
    return document.getElementById(id);
  });
  if (isForRent === 'true') {
    if (totalCostLabel) totalCostLabel.textContent = 'R ' + numberWithSpaces(price) + '/PM';
    if (unitPriceLabel) unitPriceLabel.textContent = 'R ' + numberWithSpaces(price) + '/PM';
    upgradeEls.forEach(function (el) {
      if (el) el.style.display = 'none';
    });
    // if (linkWrap) linkWrap.innerHTML = '<a href="#unit-selector" class="text-color-polaris-blue">Change Unit</a><div class="text-block-16">|</div><a id="enquire-now-link" href="#reservation" class="text-color-polaris-blue">Rent Now</a>';
  } else {
    if (totalCostLabel) totalCostLabel.textContent = 'R ' + numberWithSpaces(price);
    if (unitPriceLabel) unitPriceLabel.textContent = 'R ' + numberWithSpaces(price);
    upgradeEls.forEach(function (el) {
      if (el) el.style.display = 'flex';
    });
    // if (linkWrap) linkWrap.innerHTML = '<a href="#unit-selector" class="text-color-polaris-blue">Change Unit</a><div class="text-block-16">|</div><a id="reserve-now-link" href="#reservation" class="text-color-polaris-blue">Reserve Now</a>';
  }
});

document.addEventListener('DOMContentLoaded', function () {
  var tooltipReadyCheck = setInterval(function () {
    if (typeof setupTooltips === 'function') {
      setupTooltips();
      clearInterval(tooltipReadyCheck);
    }
  }, 100);
});

document.addEventListener('DOMContentLoaded', function () {
  var masterToggle = document.getElementById('toggle-all-addons');
  if (!masterToggle) return;

  // Robust "is this toggle currently on?" — handles native checkboxes/radios
  // AND Webflow custom toggles (link/div with a hidden input or .w--redirected-checked).
  function isToggleOn(el) {
    if (!el) return false;
    if (typeof el.checked === 'boolean') return el.checked;
    var input = el.querySelector ? el.querySelector('input[type="checkbox"], input[type="radio"]') : null;
    if (input) return input.checked;
    if (el.classList && el.classList.contains('w--redirected-checked')) return true;
    return el.getAttribute && el.getAttribute('aria-checked') === 'true';
  }

  var masterToggleBusy = false;
  masterToggle.addEventListener('change', function () {
    if (masterToggleBusy) return;
    masterToggleBusy = true;
    masterToggle.style.opacity = '0.6';
    masterToggle.style.pointerEvents = 'none';
    isBatchTogglingAddons = true;

    var shouldCheck = masterToggle.checked;

    // Always-runs cleanup so a thrown click can never freeze the control.
    function finish() {
      isBatchTogglingAddons = false;
      try { updateTotalPrice(); } catch (err) { console.error('[ADD-ALL] updateTotalPrice failed', err); }
      try { handleDefaultFloor(); } catch (err) { console.error('[ADD-ALL] handleDefaultFloor failed', err); }
      try { handleDefaultOutdoor(); } catch (err) { console.error('[ADD-ALL] handleDefaultOutdoor failed', err); }
      setTimeout(function () {
        masterToggle.style.opacity = '1';
        masterToggle.style.pointerEvents = 'auto';
        masterToggleBusy = false;
      }, 150);
    }

    var addonCheckboxes = Array.from(document.querySelectorAll('#appliance-addon, #furniture-addon, #kitchen-upgrade-input, #kitchen2-upgrade-input, #kitchen3-upgrade-input, [data-add-all-toggle="true"]'));

    // Type A has no pool/kitchen3 upgrade — keep it out of the add-all batch
    if (selectedUnitType === 'a') {
      addonCheckboxes = addonCheckboxes.filter(function (cb) {
        return cb.id !== 'kitchen3-upgrade-input';
      });
    }

    console.log('[ADD-ALL] selectedUnitType =', selectedUnitType, '| shouldCheck =', shouldCheck, '| matched =', addonCheckboxes.length); // [DEBUG]
    console.table(addonCheckboxes.map(function (cb) { return { id: cb.id || '(no id)', tag: cb.tagName, type: cb.type || '', on: isToggleOn(cb), disabled: cb.disabled }; })); // [DEBUG]

    var unitImage = document.getElementById('unit-image');
    var unitImageAllUpgrades = document.getElementById('unit-image-all-upgrades');
    if (shouldCheck) {
      if (unitImage) unitImage.style.display = 'none';
      if (unitImageAllUpgrades) unitImageAllUpgrades.style.display = 'block';
    } else {
      if (unitImage) unitImage.style.display = 'block';
      if (unitImageAllUpgrades) unitImageAllUpgrades.style.display = 'none';
    }

    var queue = addonCheckboxes.filter(function (cb) {
      return shouldCheck ? !isToggleOn(cb) : isToggleOn(cb);
    });

    function handleDefaultFloor() {
      var tf = document.getElementById('flooring-floor-' + (shouldCheck ? '2' : '1') + '-' + selectedUnitType);
      if (tf && !tf.checked) tf.click();
    }

    // Default outdoor to the 2nd option on add-all (mirrors the floor → option 2 behaviour),
    // and back to the 1st option when add-all is turned off.
    function handleDefaultOutdoor() {
      var t = selectedUnitType === 'b' ? 'b' : 'a';
      var $opts = $("input[data-outdoor-select-option='true'][id$='-" + t + "']");
      var $target = shouldCheck ? $opts.eq(1) : $opts.eq(0);
      if (!$target.length) $target = $opts.eq(0);
      if (!$target.length) return;
      $target.prop('checked', false); // force a state change so the change handler always fires
      $target[0].click();
    }

    var index = 0;
    function processNext() {
      if (index >= queue.length) {
        finish();
        return;
      }
      var cb = queue[index++];
      try {
        cb.click();
      } catch (err) {
        console.error('[ADD-ALL] click failed for', cb && cb.id, err);
      }
      requestAnimationFrame(function () {
        setTimeout(processNext, 30);
      });
    }
    processNext();
  });
});

var applianceSlugsSelected = [],
  applianceNamesSelected = [],
  furnitureSlugsSelected = [],
  furnitureNamesSelected = [];

function trackSlug(checkbox, slugs, names, slugClass, nameClass) {
  var slug = checkbox.getAttribute('data-addon-list-slug') || checkbox.name || checkbox.id;
  var name = checkbox.getAttribute('data-name') || checkbox.closest('.collection-item, .w-dyn-item')?.querySelector('.product-name, h3, h4, [data-product-name]')?.textContent?.trim() || slug;
  if (checkbox.checked) {
    if (slugs.indexOf(slug) < 0) slugs.push(slug);
    if (names.indexOf(name) < 0) names.push(name);
  } else {
    var i = slugs.indexOf(slug);
    if (i > -1) slugs.splice(i, 1);
    var j = names.indexOf(name);
    if (j > -1) names.splice(j, 1);
  }
  document.querySelectorAll('.' + nameClass).forEach(function (el) {
    el.value = names.length ? names.join(', ') : 'None';
  });
  document.querySelectorAll('.' + slugClass).forEach(function (el) {
    el.value = slugs.length ? slugs.join(', ') : 'None';
  });
}
function trackApplianceSlug(cb) {
  trackSlug(cb, applianceSlugsSelected, applianceNamesSelected, 'applianceUpgradesSlugsHiddenInput', 'applianceUpgradesHiddenInput');
}
function trackFurnitureSlug(cb) {
  trackSlug(cb, furnitureSlugsSelected, furnitureNamesSelected, 'furnitureUpgradesSlugsHiddenInput', 'furnitureUpgradesHiddenInput');
}

function updateUnitTotals() {
  var units = document.querySelectorAll('[data-unit]');
  var res = document.querySelectorAll('[data-unit][data-reserved="true"]').length;
  var sold = document.querySelectorAll('[data-unit][data-sold="true"]').length;
  var t = units.length;
  var ids = { totals_TotalUnitsWrapper: t, totals_TotalUnitsReservedWrapper: res, totals_TotalUnitsSoldWrapper: sold, totals_TotalUnitsAvailableWrapper: t - res - sold };
  for (var id in ids) {
    var el = document.getElementById(id);
    if (el) el.textContent = ids[id];
  }
}
updateUnitTotals();

document.getElementById('reservation-form').addEventListener(
  'submit',
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var params = new URLSearchParams(new FormData(e.target)).toString().replace(/\+/g, '%20');
    var fullUrl = 'https://www.heartland.co.za/reserve/1?' + params;
    console.log('[RESERVATION FORM] Submitting to URL:', fullUrl);
    window.location.href = fullUrl;
  },
  true,
);d

(function () {
  function preloadOutdoorBackgrounds() {
    var seen = {};
    window._outdoorBgPreload = window._outdoorBgPreload || []; // keep refs so fetches aren't GC'd
    document.querySelectorAll("input[data-outdoor-select-option='true']").forEach(function (el) {
      var src = el.getAttribute('data-outdoor-select-image-source');
      if (!src || seen[src]) return;
      seen[src] = true;
      var img = new Image();
      if ('fetchPriority' in img) img.fetchPriority = 'low'; // don't compete with critical assets
      img.decoding = 'async';
      img.src = src; // warms the cache; the CSS background swap then loads instantly
      window._outdoorBgPreload.push(img);
    });
  }
  function start() {
    if ('requestIdleCallback' in window) requestIdleCallback(preloadOutdoorBackgrounds, { timeout: 2000 });
    else setTimeout(preloadOutdoorBackgrounds, 600);
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();


// ─── BOND CALCULATOR — Polaris Heart ───────────────────────────────────────
// CMS-driven variables. In Webflow, swap the hardcoded values below with
// your CMS field embed tags, e.g. {{wf {"path":"interest-rate"} }}
// ──────────────────────────────────────────────────────────────────────────

var BOND_INTEREST_RATE  = 0.105;   // Annual interest rate  → CMS field: interest-rate
var BOND_LOAN_YEARS     = 20;      // Loan term in years     → CMS field: loan-years
var BOND_DEPOSIT_PERCENT = 0.10;   // Deposit %  (10% = 0.10) → CMS field: deposit-percent

// ──────────────────────────────────────────────────────────────────────────
// PMT formula:  =PMT( rate/12, years*12, -(price * (1 - deposit%)) )
// ──────────────────────────────────────────────────────────────────────────

function calcBondPMT(salePrice) {
  var monthlyRate  = BOND_INTEREST_RATE / 12;
  var nPayments    = BOND_LOAN_YEARS * 12;
  var loanAmount   = salePrice * (1 - BOND_DEPOSIT_PERCENT);

  if (monthlyRate === 0) return loanAmount / nPayments;

  // Standard PMT: rate * PV / (1 - (1+rate)^-n)
  return (monthlyRate * loanAmount) / (1 - Math.pow(1 + monthlyRate, -nPayments));
}

function updateBondDisplay() {
  var priceNum    = parseNum('purchase-price');
  var upgradesNum = parseNum('upgrades-price');

  if (!priceNum || priceNum === 0) return;

  var includeUpgrades = $("#finance-upgrades-cb").prop("checked");
  var salePrice       = includeUpgrades ? priceNum + upgradesNum : priceNum;

  var monthlyPayment  = calcBondPMT(salePrice);
  var loanAmount      = salePrice * (1 - BOND_DEPOSIT_PERCENT);
  var depositAmount   = salePrice * BOND_DEPOSIT_PERCENT;

  // Update display elements
  $("#bond-monthly-repayment").text("R " + numberWithSpaces(Math.round(monthlyPayment)));
  $("#bond-loan-amount").text("R " + numberWithSpaces(Math.round(loanAmount)));
  $("#bond-deposit-amount").text("R " + numberWithSpaces(Math.round(depositAmount)));
  $("#bond-sale-price").text("R " + numberWithSpaces(Math.round(salePrice)));
  $("#bond-interest-rate").text((BOND_INTEREST_RATE * 100).toFixed(1) + "%");
  $("#bond-loan-years").text(BOND_LOAN_YEARS + " years");
}

// Re-calculate whenever the upgrades toggle changes
$("#finance-upgrades-cb").on("change", function () {
  updateBondDisplay();
});
