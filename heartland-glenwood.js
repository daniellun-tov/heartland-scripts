window.fsAttributes = window.fsAttributes || [];

function updateBedTotals() {
  const beds = document.querySelectorAll("[data-bed]");
  const uniqueBeds = new Map(); // key -> isReserved
  let fallbackIndex = 0;

  beds.forEach((bed) => {
    // Fall back to a unique key if the binding is missing, so nothing silently drops to 0
    let key = bed.getAttribute("data-bed-key");
    if (!key || key.trim() === "" || key.includes("{{")) {
      key = "no-key-" + fallbackIndex++;
    }

    const isReserved = bed.getAttribute("data-reserved") === "true";

    // First time we see this bed, or OR-in reserved if a duplicate says reserved
    uniqueBeds.set(key, (uniqueBeds.get(key) || false) || isReserved);
  });

  const total = uniqueBeds.size;
  let reservedCount = 0;
  uniqueBeds.forEach((reserved) => { if (reserved) reservedCount++; });
  const available = total - reservedCount;

  const elTotal = document.getElementById("totals_TotalBedsWrapper");
  const elReserved = document.getElementById("totals_TotalBedsReservedWrapper");
  const elAvail = document.getElementById("totals_TotalBedsAvailableWrapper");
  if (elTotal) elTotal.textContent = total;
  if (elReserved) elReserved.textContent = reservedCount;
  if (elAvail) elAvail.textContent = available;
}

window.fsAttributes.push([
  "cmsload",
  (listInstances) => {
    updateBedTotals();
    listInstances.forEach((instance) => {
      instance.on("renderitems", updateBedTotals);
    });
  },
]);

  
$("#wf-form-Glenwood-Rental-Enquiry").submit(function(e){
  e.preventDefault();
  var action = $(this).attr("action");
  var data = {};
  $(this).serializeArray().map(function(x){data[x.name] = x.value;}); 
  $.ajax({
    type: "POST",
    url: action,
    data: JSON.stringify(data),
    contentType: "application/json",
    headers: {
      "Accept": "application/json"
    }
  }).done(function() {
     $("#wf-form-Glenwood-Rental-Enquiry").css('display','none');
     $("#glenwood-rental-form-success").css('display','block');
  }).fail(function() {
     $("#glenwood-rental-form-fail").css('display','block');
  });
});


function docReady(fn) {
	// see if DOM is already available
	if (document.readyState === "complete" || document.readyState === "interactive") {
		// call on next available tick
		setTimeout(fn, 1);
	} else {
		document.addEventListener("DOMContentLoaded", fn);
	}
}

const docReadyEvent = new Event('docreadyEvent');

let totalNumberOfAddons = 3;
/*let totalNumberOfMyPlaceAddons = 4;*/
let numberOfFloors = 4;

var addonsSelected = [],
	additionalAddonsSelected = [],
	floorOptionSelected = "",
	selectedListAddons = [];

var dontListenFloorChanged = false;

let totalUnitCostDiv = $(".total_unit_cost"),
	totalCostHiddenInput = $("#totalCostHiddenInput"),
	unitIDInput = $("#unitIDInput");

var allAddonNumbers = [];
/*var allMyPlaceAddonNumbers = [];*/
var addonListTotals = [];

var unityGame,
	totalUnitCost = 0,
	unitCostValues = {addOn: 0},
	selectedUnitNo = "",
	selectedUnitID = "",
	unitImage = "",
	gameLoaded = false,
	selectedUnitXraiIframeLink = "",
	oldselectedUnitXraiIframeLink = "",
	formFirstName = "",
	formLlastName = "";

let defaultListAddonButtonColor;
let defaultListAddonButtonTextColor;

var ignoreSolarClick = false;

var selectedUnitDisplayName = "";

var distanceFromTopBefore;
var distanceFromTopAfter;
var distanceFromTopDifference;
var originalFloorPrice = 0;

var clickedFromFloorPlan = false;

$(document).ready(function () {
	document.dispatchEvent(docReadyEvent);
	for ( i = 1; i < totalNumberOfAddons + 1; i++ ) {
		allAddonNumbers.push(i);
	}
	
  // initially hide Unit Display Name
  $(".unit-header.is-absolute").hide();
  
	//Disable all upgrade toggles
	allAddonNumbers.forEach(function ( addonNumber ) {
		$("#upgrade-" + addonNumber + "-cb").prop("disabled", true);
	});
	
	$("#incanda-cb").prop("disabled", true);
	$("#elk-cb").prop("disabled", true);
	/*$("#myPlace-cb").prop("disabled", true);*/
	/*$("#meridian-cb").prop("disabled", true);*/
	$("#bond-price-cb").prop("disabled", true);
	$("#viewGameNowBtn").hide();
	$("#viewGameNowBtn").on("click", function () {
		startGame();
	});

	
});

$(".add-on-card").each( function ( index, elem ) {
	$(elem).on("click", function ( e ) {
		if ( e.target !== this ) {
			return;
		}
		var cbID = elem.id.replace("card", "cb");
		$("#" + cbID).click();
	});
});

$("#hero_rent_btn").on("click", function () {
	$("#w-tabs-2-data-w-tab-1").click()
});

$("a[data-upgrade-overlay-button='true']").on("click", function () {
	$("#upgrade-" + $(this).attr("data-upgrade-number") + "-cb").click();
});

// Schedules bed filtering after unit click + Webflow/Finsweet DOM updates settle
function scheduleBedFilterAfterUnitChange() {
  if (!window.applyNestedBedFilter) return;

  // Cancel previous queued run (prevents stacking if user clicks fast)
  if (scheduleBedFilterAfterUnitChange._t) clearTimeout(scheduleBedFilterAfterUnitChange._t);

  // Wait for paint/DOM updates (Webflow + Finsweet are often async-ish)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleBedFilterAfterUnitChange._t = setTimeout(() => {
        window.applyNestedBedFilter();
      }, 60);
    });
  });
}


$("a[data-unit-floor-plan-button='true']").click(function () {
  clickedFromFloorPlan = true;

  const unitNumber = $(this).attr("data-unit-number");
  const $unitRadio = $("input[data-unit-button='unitButton" + unitNumber + "']").first();

  if ($unitRadio.length) {
    $unitRadio.click();                 // ✅ triggers your unit selection + finsweet filtering
    scheduleBedFilterAfterUnitChange(); // ✅ bed filter AFTER
  }
});

$("input[data-reservation-ref-input-field='true']").keyup(function () {
	
	switch ( $(this).attr("name") ) {
		case "First-Name":
			formFirstName = $(this).val();
			break;
		case "Last-Name":
			formLlastName = $(this).val();
			break;
	}
	
	buildPaymentRef($(this));
});

$("#finance-upgrades-cb").on("click", function () {
	if ( $(this).prop("checked") ) {
		$('.finance-upgrades-through-bond').each(function(i, obj) {
			$(obj).val("Yes");
		});
	} else {
		$('.finance-upgrades-through-bond').each(function(i, obj) {
			$(obj).val("No");
		});
	}
});

function buildPaymentRef ( field ) {
	//Build the payment reference number
	var refPrefix = "BW";
	var paymentReference = "";
	var firstName = formFirstName.replaceAll(" ", "").slice(0,1).toUpperCase();
	var lastName = formLlastName.replaceAll(" ", "").slice(0,10).toUpperCase();
	
	paymentReference = refPrefix + "-" + selectedUnitNo + "-" + firstName + lastName;
	
	$(".referenceNumberHiddenInput").each(function (i, obj) {
		$(obj).val(paymentReference);
	});
	$("#paymentReferenceDiv").html("Reference: " + paymentReference);
}

function isMobile () {
	
	var hasTouchScreen = false;
	
	if ("maxTouchPoints" in navigator) {
		hasTouchScreen = navigator.maxTouchPoints > 0;
	} else if ("msMaxTouchPoints" in navigator) {
		hasTouchScreen = navigator.msMaxTouchPoints > 0;
	} else {
		var mQ = window.matchMedia && matchMedia("(pointer:coarse)");
		if (mQ && mQ.media === "(pointer:coarse)") {
			hasTouchScreen = !!mQ.matches;
		} else if ('orientation' in window) {
			hasTouchScreen = true; // deprecated, but good fallback
		} else {
			// Only as a last resort, fall back to user agent sniffing
			var UA = navigator.userAgent;
			hasTouchScreen = (
				/\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) ||
				/\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA)
			);
		}
	}
	
	return hasTouchScreen;
}

// 2 way sync with radio groups
(function () {
  let isSyncing = false;

  const SYNC_SELECTOR = '[data-sync-group][data-sync-value]';
  const GROUP_ATTR = 'data-sync-group';
  const VALUE_ATTR = 'data-sync-value';

  // CSS.escape fallback (older browsers)
  const esc = (v) => {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(v);
    return String(v).replace(/["\\]/g, '\\$&');
  };

  function updateWebflowRadioUI(input) {
    const label = input.closest('label.w-radio') || input.closest('label');
    if (!label) return;

    const custom = label.querySelector('.w-radio-input');
    if (!custom) return;

    if (input.checked) {
      custom.classList.add('w--redirected-checked');
      label.classList.add('w--checked');
    } else {
      custom.classList.remove('w--redirected-checked');
      label.classList.remove('w--checked');
    }
  }

  function setCheckedNoScroll(input, checked, fireEvents) {
    if (!input) return;

    // Save scroll position
    const x = window.scrollX || window.pageXOffset || 0;
    const y = window.scrollY || window.pageYOffset || 0;

    // Disable smooth scroll temporarily (so restore doesn't animate)
    const prevScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';

    // Hard lock scroll during the operation (mobile focus jumps, etc.)
    let locked = true;
    const lockScroll = () => {
      if (locked) window.scrollTo(x, y);
    };
    window.addEventListener('scroll', lockScroll, { passive: true });

    // Focus without scrolling (where supported)
    try {
      input.focus({ preventScroll: true });
    } catch (e) {}

    const wasChecked = input.checked;

    // Apply state + Webflow UI classes
    input.checked = checked;
    updateWebflowRadioUI(input);

    if (fireEvents && wasChecked !== checked) {
      // These are what most filter libs listen to
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Some setups listen to click specifically
      input.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    }

    // Restore scroll (double rAF is most reliable)
    requestAnimationFrame(() => {
      window.scrollTo(x, y);
      requestAnimationFrame(() => {
        window.scrollTo(x, y);
        locked = false;
        window.removeEventListener('scroll', lockScroll);
        document.documentElement.style.scrollBehavior = prevScrollBehavior;
      });
    });
  }

  function syncGroup(groupName, selectedValue, source) {
    const radios = document.querySelectorAll(
      `${SYNC_SELECTOR}[${GROUP_ATTR}="${esc(groupName)}"]`
    );

    radios.forEach(radio => {
      const v = radio.getAttribute(VALUE_ATTR);

      if (v === selectedValue) {

        const shouldFire = (radio !== source); // source already fired naturally
        setCheckedNoScroll(radio, true, shouldFire);
      } else {
        setCheckedNoScroll(radio, false, false);
      }
    });
  }

  // Listen to any radio in any sync group
  document.querySelectorAll(SYNC_SELECTOR).forEach(radio => {
    radio.addEventListener('change', function () {
      if (isSyncing) return;
      if (!this.checked) return;

      const groupName = this.getAttribute(GROUP_ATTR);
      const value = this.getAttribute(VALUE_ATTR);
      if (!groupName || !value) return;

      isSyncing = true;
      try {
        syncGroup(groupName, value, this);
      } finally {
        isSyncing = false;
      }
    });
  });
})();

//1 way sync with radio groups
(function () {
  let isSyncing2 = false;

  const MASTER_SEL =
    '[data-sync-master2="true"][data-sync-group2][data-sync-value2]';

  const FOLLOW_SEL =
    '[data-sync-follow2="true"][data-sync-group2][data-sync-value2]';

  const GROUP_ATTR = 'data-sync-group2';
  const VALUE_ATTR = 'data-sync-value2';

  function clickRadio(radio) {
    const label = radio.closest('label.w-radio') || radio.closest('label');
    if (label) {
      label.click();   // Most reliable for Webflow
    } else {
      radio.click();
    }
  }

  function syncFollowers(group, value, sourceRadio) {
    const selector =
      `${FOLLOW_SEL}[${GROUP_ATTR}="${CSS.escape(group)}"][${VALUE_ATTR}="${CSS.escape(value)}"]`;

    document.querySelectorAll(selector).forEach(r => {
      if (r === sourceRadio) return;
      if (r.checked) return;
      clickRadio(r);
    });
  }

  document.querySelectorAll(MASTER_SEL).forEach(masterRadio => {
    masterRadio.addEventListener('change', function () {
      if (isSyncing2) return;
      if (!this.checked) return;

      const group = this.getAttribute(GROUP_ATTR);
      const value = this.getAttribute(VALUE_ATTR);
      if (!group || !value) return;

      isSyncing2 = true;
      try {
        syncFollowers(group, value, this);
      } finally {
        isSyncing2 = false;
      }
    });
  });
})();


// sync floor number selection
function floorIsActive(attrName, floorNumber) {
  // Link-based active state (Webflow tabs/links)
  var $a = $("a[" + attrName + "='" + floorNumber + "']");
  var linkActive = $a.length && $a.hasClass("w--current");

  // Radio-based active state (Webflow redirected radios)
  var radioActive = false;
  var $radios = $("input[type='radio'][" + attrName + "='" + floorNumber + "']");

  if ($radios.length) {
    $radios.each(function () {
      var $input = $(this);

      // Native state
      if ($input.is(":checked")) {
        radioActive = true;
        return false;
      }

      // Webflow custom radio state
      var $custom = $input.siblings(".w-radio-input");
      if ($custom.hasClass("w--redirected-checked")) {
        radioActive = true;
        return false;
      }
    });
  }

  return linkActive || radioActive;
}

function triggerFloorSelect(attrName, floorNumber) {
  // Prefer clicking the link if it exists
  var $a = $("a[" + attrName + "='" + floorNumber + "']");
  if ($a.length) {
    $a.click();
    return;
  }

  // Otherwise click the radio input
  var $radio = $("input[type='radio'][" + attrName + "='" + floorNumber + "']").first();
  if ($radio.length) {
    $radio.click();
  }
}

$("a[data-unit-floor-select-button='true']").on("click", function (e) {
  var selectionFloorNumber = $(this).attr("data-selection-floor-number");
  var floorNumber = $(this).attr("data-floor-number");

  if (floorIsActive("data-configurator-floor-number", selectionFloorNumber) == false) {
    triggerFloorSelect("data-configurator-floor-number", floorNumber);
    e.preventDefault();
  }

  if (floorIsActive("data-selection-floor-number", selectionFloorNumber) == false) {
    triggerFloorSelect("data-selection-floor-number", floorNumber);
    e.preventDefault();
  }
});

$("a[data-unit-selection-floor-select-button='true']").on("click", function (e) {
  var selectionFloorNumber = $(this).attr("data-selection-floor-number");

  if (floorIsActive("data-configurator-floor-number", selectionFloorNumber) == false) {
    triggerFloorSelect("data-configurator-floor-number", selectionFloorNumber);
    e.preventDefault();
  }
});

// --- CLEAR UNIT + BEDS WHEN FLOOR CHANGES ---
function clearUnitSelectionOnFloorChange() {
  
  function resetWebflowRadioUI($inputs) {
  $inputs.each(function () {
    const input = this;
    input.checked = false;

    const label = input.closest("label.w-radio") || input.closest("label");
    if (!label) return;

    const custom = label.querySelector(".w-radio-input");
    if (custom) custom.classList.remove("w--redirected-checked");

    label.classList.remove("w--checked");
  });
}

const $unitRadios = $(
  "input[type='radio'][data-total-contribute='true'][data-class='unit'], " +
  "input[type='radio'][data-unit-button]"
);

resetWebflowRadioUI($unitRadios);

  selectedUnitNo = "";
  selectedUnitID = "";
  selectedUnitDisplayName = "";
  clickedFromFloorPlan = false;

  $(".unit-header.is-absolute").hide();

  if (document.getElementById("unit-info-wrapper") !== null) {
    $("#unit-info-wrapper").css("display", "none");
  }

  if (typeof clearBedSelection === "function") {
    clearBedSelection();
  }

  if (window.applyNestedBedFilter) {
    window.applyNestedBedFilter();
  }
}

// Canonical floor-change trigger: synced "floor" radios
(function () {
  const FLOOR_SEL = 'input[type="radio"][data-sync-group="floor"][data-sync-value]';

  function onFloorChange(e) {
    const el = e.target;
    if (!el || !el.matches || !el.matches(FLOOR_SEL)) return;
    if (!el.checked) return;

    // DEBUG (leave this in until it's working)
    console.log('[floor] changed to:', el.getAttribute('data-sync-value'));

    // Show ONLY on floor change
    showFloorEmpty();

    // Clear unit + beds
    if (typeof clearUnitSelectionOnFloorChange === "function") {
      clearUnitSelectionOnFloorChange();
    }
  }

  // Capture phase helps if other scripts stop propagation
  document.addEventListener('change', onFloorChange, true);

  // Fallback: some flows dispatch click more reliably than change
  document.addEventListener('click', onFloorChange, true);
})();

// Floor option changed
$("input[data-floor-select-option='true']").on("change", function () {
  // 🔥 Clear unit selection whenever the floor changes
  clearUnitSelectionOnFloorChange();

  if (!dontListenFloorChanged) {
    floorOptionSelected = $(this).data("floor-select-slug");
  }
  floorTypeChanged($(this), false);
  
});

$(document).on("change", "input[data-unit-configurator-floor-select-button='true']", function (e) {
  console.log("radio floor selector changed");

  var cfgFloor = $(this).attr("data-configurator-floor-number");

  var $tab = $("a.w-tab-link[data-selection-floor-number='" + cfgFloor + "']");
  if ($tab.length && $tab.hasClass("w--current") === false) {
    $tab[0].click(); // native click for Webflow tabs
  }
});
// end of sync floor selection


$(document).ready(function () {
	
	$("input[data-addon-list-select-button='true']").each(function ( index, elem ) {
		$(elem).prop( "checked", false );
		$(elem).prop( "disabled", true );
	});
	//While we're here. Get the default background color for the addon list buttons. Then set them all to grey.
	defaultListAddonButtonColor = $("div[data-addon-list-select-button-wrapper='true']").css("background-color");
	defaultListAddonButtonTextColor = $("div[data-addon-list-select-button-text='true']").css("color");
	
	$("div[data-addon-list-select-button-wrapper='true']").each(function ( index, elem ) {
		$(elem).css("background-color", "#999");
	});
	
	$("div[data-addon-list-select-button-text='true'], span[data-addon-list-select-button-text='true']").each(function ( index, elem ) {
		$(elem).css("color", "#CCC");
	});
	
});

$("input[data-addon-list-check='true']").on("change", function () {
	
	var selectedListAddon = $(this);
	
	if ( $(this).is(":checked") ) {
		//Selected
		if ( addonListTotals[$(this).data("section")] === undefined ) {
			//Array key does not exist. Create it.
			addonListTotals[$(this).data("section")] = 0;
		}
		if ( selectedListAddons[$(this).data("section")] === undefined ) {
			selectedListAddons[$(this).data("section")] = [];
		}
		
		selectedListAddons[$(this).data('section')].push($(this).data('name'));
		
		addonListTotals[$(this).data("section")] += $(this).data("price");
		
		if ( $(this).data("addon-list-dependancy") !== "" ) {
			//This addon needs a parent to be selected first. If it hasn't been selected. Manually check it.
			if ( $("input[data-addon-list-slug='" + $(this).data('addon-list-dependancy') + "']").is(":checked") == false ) {
				$("input[data-addon-list-slug='" + $(this).data('addon-list-dependancy') + "']").click();
			}
		}
	} else {
		//De-selected
		if ( addonListTotals[$(this).data("section")] === undefined ) {
			//Array key does not exist. Create it.
			addonListTotals[$(this).data("section")] = 0;
		}
		if ( selectedListAddons[$(this).data("section")] === undefined ) {
			selectedListAddons[$(this).data("section")] = [];
		}
		
		let e = selectedListAddons[$(this).data('section')].indexOf($(this).data('name'));
		if ( e > -1 ) {
			selectedListAddons[$(this).data('section')].splice(e, 1);
		}
		
		$("input[data-addon-list-dependancy='" + $(this).data('addon-list-slug') + "']").each(function ( index, elem ) {
			if ( $(elem).is(":checked") ) {
				$(elem).click();
			}
		});
		addonListTotals[$(this).data("section")] -= $(this).data("price");
	}
	
	if ( selectedListAddons[selectedListAddon.data("section")].length > 0 ) {
		$("#cart-" + $(this).data('section-addon-slug') + "-wrap").css("display", "flex");
	} else {
		$("#cart-" + $(this).data('section-addon-slug') + "-wrap").css("display", "none");
	}
	
	$("div[data-addon-list-section='" + $(this).data("section-addon-slug") + "']").attr("data-section-price", addonListTotals[$(this).data("section")]);
	$("div[data-addon-list-section='" + $(this).data("section-addon-slug") + "']").html("R " + numberWithSpaces(addonListTotals[$(this).data("section")]));
	$("#cart-" + $(this).data("section-addon-slug") + "-price").html("R " + numberWithSpaces(addonListTotals[$(this).data("section")]));
	
	$("." + $(this).data("section-addon-slug") + "-hiddenInput").each(function (i, obj) {
		var selectedAddonsForSection = "";
		var seperator = "";
		if ( selectedListAddons[selectedListAddon.data("section")].length > 0 ) {
			selectedListAddons[selectedListAddon.data("section")].forEach(function (item, index, arr) {
				selectedAddonsForSection += seperator + item;
				seperator = ", ";
			});
		} else {
			selectedAddonsForSection = "None";
		}
		
		$(this).val(selectedAddonsForSection);
		
	});
	
	if ( ignoreSolarClick == false ) {
		if ( $(this).data("addon-list-group") != "" ) {
			$("input[data-addon-list-group='" + $(this).data("addon-list-group") + "']").each(function ( index, elem ) {
				if ( elem != selectedListAddon[0] ) {
					if ( $(elem).is(":checked") ) {
						ignoreSolarClick = true;
						elem.click();
						ignoreSolarClick = false;
					}
				}
			});
		}
	}
	
	unitCostValues["addon-list-" + $(this).data("section-addon-slug")] = addonListTotals[$(this).data("section")];
	updateTotalPrice();
});

$("#kitchen-upgrade-input").on("change", function () {
	
	if ( $(this).is(":checked") ) {
		//Selected
		$("#kitchen-upgrade-display-section-price").html("R " + numberWithSpaces($(this).attr("data-price")));
		$("#cart-kitchen-price").html("R " + numberWithSpaces($(this).attr("data-price")));
		$("#cart-kitchen-wrap").css("display", "flex");
		
		$(".kitchen-upgrade-hiddenInput").each(function (i, obj) {
			$(this).val("Yes");
		});
		
		unitCostValues["kitchen-upgrade-price"] = parseFloat($(this).attr("data-price"));
	} else {
		//De-selected
		$("#kitchen-upgrade-display-section-price").html("R " + numberWithSpaces(0.00));
		$("#cart-kitchen-price").html("R " + numberWithSpaces(0.00));
		$("#cart-kitchen-wrap").css("display", "none");
		
		$(".kitchen-upgrade-hiddenInput").each(function (i, obj) {
			$(this).val("No");
		});
		
		unitCostValues["kitchen-upgrade-price"] = 0;
	}
	
	updateTotalPrice();
});


// Floor empty-state helpers (force override even if CSS is fighting you)
function showFloorEmpty() {
  const els = document.querySelectorAll('[floor-empty="true"]');
  els.forEach(el => el.style.setProperty('display', 'block', 'important'));
}

function hideFloorEmpty() {
  const els = document.querySelectorAll('[floor-empty="true"]');
  els.forEach(el => el.style.setProperty('display', 'none', 'important'));
}

// Optional: ensure it starts hidden on load
document.addEventListener('DOMContentLoaded', hideFloorEmpty);


// Unit click handler
$("input[data-total-contribute='true']").click(function () {
	switch ($(this).data("class")) {
		case "unit":
			hideFloorEmpty();
      
      $(".unit-header.is-absolute").fadeIn(150);
      
			if ( document.getElementById("unit-info-wrapper") !== null ) {
				$("#unit-info-wrapper").css("display", "flex");
			}
			
			if ( !clickedFromFloorPlan && isMobile() ) {
				//Jump to config-image
				if ( document.getElementById('config-image') !== null ) {
					$('html, body').animate({
						scrollTop: $("#config-image").offset().top
					}, 1000);
				}
			}
			
			oldselectedUnitXraiIframeLink = selectedUnitXraiIframeLink;
			selectedUnitXraiIframeLink = $(this).attr('data-xrai-iframe-link');
			
			//Select Floor 1 by default when unit changes
			
			dontListenFloorChanged = true;
			for ( var i = 1; i < numberOfFloors + 1; i++ ) {
				if ( floorOptionSelected != "floor-" + i ) {
					$("input[data-floor-select-slug='floor-" + i + "']").click();
				}
			}
			dontListenFloorChanged = false;
			
			$("#kitchen-upgrade-input").attr("data-price", $(this).data("kitchen-upgrade-price"));
			$("#kitchen-upgrade-display-price").html("R " + numberWithSpaces($(this).data("kitchen-upgrade-price")));
			$("#kitchen-upgrade-image").attr("src", $(this).data("kitchen-upgrade-image-url")).attr("srcset", $(this).data("kitchen-upgrade-image-url")).fadeIn(0);
			if ( $("#kitchen-upgrade-input").is(":checked") ) {
				$("#kitchen-upgrade-input").click();
				$("#kitchen-upgrade-input").click();
			}
			
			//#kitchenUpgradePdfDownloadWrapper
			$("#kitchenUpgradePdfDownloadLink").attr("target", "_blank");
			$("#kitchenUpgradePdfDownloadWrapper").css("display", "block");
			$("#kitchenUpgradePdfDownloadLink").attr("href", $(this).attr('data-kitchen-upgrade-pdf-href'));
			
			$("input[data-addon-list-select-button='true']").each(function ( index, elem ) {
				$(elem).removeAttr("disabled");
			});
			
			$("div[data-addon-list-select-button-wrapper='true']").each(function ( index, elem ) {
				$(elem).attr("style", "");
			});
			
			$("div[data-addon-list-select-button-text='true'], span[data-addon-list-select-button-text='true']").each(function ( index, elem ) {
				$(elem).css("color", defaultListAddonButtonTextColor);
			});
			
			$(".select-unit-wrap").each(function ( index, elem ) {
				$(elem).css("display", "none");
			});
			
			$(".add-button-wrap").each(function ( index, elem ) {
				$(elem).css("display", "block");
			});
			
			//addon-more-info
			$("#addon-more-info").css("display", "block");
			
      //modify name for bed selection
			selectedUnitDisplayName = $(this).data("unit-display-name") || "";
      
      // append gender suffix from data-unit-gender
      const unitGenderRaw = ($(this).attr("data-unit-gender") || "").trim().toLowerCase();
      if (unitGenderRaw === "male") selectedUnitDisplayName += "(M)";
      if (unitGenderRaw === "female") selectedUnitDisplayName += "(F)";
      
      // clear bed radios + reset price
			clearBedSelection();

			$(".unit-bed-name").html(selectedUnitDisplayName);
      // $(".unit-name-label").html($(this).data("unit-display-name"));
			$(".unit-name-label").html(selectedUnitDisplayName);
      
			//Floor price update
			for ( var i = 1; i < numberOfFloors + 1; i++ ) {
				$("input[data-floor-select-slug='floor-" + i + "']").attr("data-floor-select-price", $(this).data('unit-floor-' + i + '-price'));
				$("#floor-" + i + "-price-label").html(numberWithSpaces("R " + $(this).data('unit-floor-' + i + '-price')));
			}
			
			$("#addon-1-display-price").html($(this).data("unit-upgrade-1-display-price"));
			$("#addon-2-display-price").html($(this).data("unit-upgrade-2-display-price"));
			$("#addon-3-display-price").html($(this).data("unit-upgrade-3-display-price"));
			
			$("#addon-1-display-price-alt").html($(this).data("unit-upgrade-1-display-price"));
			$("#addon-2-display-price-alt").html($(this).data("unit-upgrade-2-display-price"));
			$("#addon-3-display-price-alt").html($(this).data("unit-upgrade-3-display-price"));
			
			
			if ( floorOptionSelected == "" ) {
				$("input[data-floor-select-slug='floor-1']").click();
			} else {
				$("input[data-floor-select-slug='" + floorOptionSelected + "']").click();
			}
			
			let flythroughVideoUrlmp4 = "https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-transcode.mp4";
			let flythroughVideoUrlwebm = "https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-transcode.webm";
			
			$("#flythrough_poster_wrapper").attr("data-poster-url", "https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-poster-00001.jpg");
			$("#flythrough_poster_wrapper").attr("data-video-urls", "https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-transcode.mp4, https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-transcode.webm");
			
			var mp4source = document.createElement('source');
			mp4source.src = flythroughVideoUrlmp4;
			mp4source.type = "video/mp4";
			
			var webmsource = document.createElement('source');
			webmsource.src = flythroughVideoUrlwebm;
			webmsource.type = "video/webm";
			
			$("#flythrough_video").css("background-image", "url('https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-poster-00001.jpg");
			if ( document.getElementById("flythrough_poster_wrapper_fallback") !== null ) {
				document.getElementById("flythrough_poster_wrapper_fallback").src("https://assets-global.website-files.com/61110f294933f9d0faf6d77f/" + $(this).attr("data-unit-flythrough-url") + "-poster-00001.jpg");
			}
			
			if ( document.getElementById("flythrough_video") !== null ) {
				$("#flythrough_video").html("");
				document.getElementById("flythrough_video").pause();
				document.getElementById("flythrough_video").appendChild(mp4source);
				document.getElementById("flythrough_video").appendChild(webmsource);
				document.getElementById("flythrough_video").load();
				document.getElementById("flythrough_video").play();
			}
			
			
			$(".furniture-info").css("display", "none");
			
			$("#appliance-info-wrapper").fadeIn(250);
			
			$("input[data-filter-unit-type-name='" + $(this).attr('data-unit-type-name') + "']").click();
			
			if ( selectedUnitXraiIframeLink != oldselectedUnitXraiIframeLink ) {
				$("#xrai-iframe").src = "";
				$("#3d-walkthrough-curtain").css("display", "flex");
				$("#3d-walkthrough-curtain").css("opacity", "1");
			}
			
			var unitRadio = $(this);
			$("#unit-image").fadeOut(0, function () {
				$(this).attr("src", unitRadio.data('base-image')).attr("srcset", unitRadio.data('base-image')).fadeIn(0);
			});
			
			$("#bond-price-cb").prop("disabled", false);
			$("#viewGameNowBtn").prop("disabled", false);
			/*$("#myPlace-cb").prop("disabled", false);*/
			/*$("#meridian-cb").prop("disabled", false);*/
			$("#viewGameNowBtn").html("View Now");
			$("#game-disabled-text").hide();
			$("#viewGameNowBtn").show();
			
			//$("#cart-container").css("display", "block");
			$("#cart-container").fadeIn(500);

			
			unitIDInput.val($(this).data("unit-id"));

      setPriceFromBedSelection();
			
			$("#bond-price-cb").attr("data-price", $(this).data("bond-price"));

			
			//Build array containing all addon numbers
			var addonCombinations = allAddonNumbers.flatMap((v, i) => allAddonNumbers.slice( i + 1 ).map( w => v + '-' + w ));
			allAddonNumbers.forEach(function ( addonNumber ) {
				//Images
				$("#upgrade-" + addonNumber + "-cb").attr("data-upgrade-image", unitRadio.attr("data-upgrade-" + addonNumber + "-image"));
				$("#upgrade-" + addonNumber + "-cb").attr("data-upgrade-all-image", unitRadio.attr("data-upgrade-all-image"));
				$("#upgrade-" + addonNumber + "-cb").attr("data-base-unit-image", unitRadio.attr("data-upgrade-all-image"));
				addonCombinations.forEach(function ( addonCombo ) {
					$("#upgrade-" + addonNumber + "-cb").attr("data-upgrade-" + addonCombo + "-image", unitRadio.attr("data-upgrade-" + addonCombo + "-image"));
				});
				
				//Prices
				$("#upgrade-" + addonNumber + "-cb").attr("data-price", unitRadio.data("upgrade-" + addonNumber + "-price"));
				$("#upgrade-" + addonNumber + "-price-label").html("R " + numberWithSpaces(unitRadio.data("upgrade-" + addonNumber + "-price")));
				
				//Enable addon checkboxes
				$("#upgrade-" + addonNumber + "-cb").prop("disabled", false);
			});
			

			
			for (let i = 1; i < 100; i++) {
				if ($(".unit-" + i).length <= 0) {
					break;
				}
				$(".unit-" + i).css("display", "none");
			}
			
			$(".unit-" + $(this).data("unit-number")).fadeIn(500);
			
			unitCostValues.addOn = 0;
			addonsSelected.forEach(function (item, index, arr) {
				addOnSelected($("input[data-image-class-name='" + item + "']"));
			});
			
			additionalAddonsSelected.forEach(function (item, index, arr) {
				addOnSelected($("input[data-image-class-name='" + item + "']"));
			});
			
			selectedUnitNo = $(this).data("unit-number");
			selectedUnitID = $(this).data("unit-id");
			selectedreservationNumber = $(this).data("reservation-number");
			selectedUnitPrice = $(this).data('price');
			
			buildPaymentRef();
			
			$(".unitIDInput").each(function (i, obj) {
				$(obj).val(selectedUnitID);
			});
			
			$(".unitNameNumberHiddenInput").each(function (i, obj) {
				$(obj).val(selectedUnitNo);
			});
			
			$(".unitCostHiddenInput").each(function (i, obj) {
				$(obj).val("R " + numberWithSpaces(selectedUnitPrice));
			});
			
			$(".reservationNumberHiddenInput").each(function (i, obj) {
				$(obj).val(selectedreservationNumber)
			});
			
			if ( clickedFromFloorPlan ) {
				clickedFromFloorPlan = false;
			}
			
			break;
		case "add-on":
			addOnSelected($(this));
			break;
	}
	updateTotalPrice();
  
  setTimeout(function () {
  	setPriceFromBedSelection();
	}, 0);
  
  
});

$(document).on("change", "input[data-bed-select='true']", function () {
  setPriceFromBedSelection();
});

function updateTotalPrice () {
	totalUnitCost = 0;
	for (const key in unitCostValues) {
		var price = unitCostValues[key];
		var type = key;
		totalUnitCost += price;
	}
	
	totalUnitCostDiv.each(function (i, obj) {
		$(obj).html("R " + numberWithSpaces(totalUnitCost));
	});
	totalCostHiddenInput.val("R " + numberWithSpaces(totalUnitCost));
	
	$(".totalCostHiddenInput").each(function (i, obj) {
		$(obj).val("R " + numberWithSpaces(totalUnitCost));
	});
}

// Bed selection - set price and label
function setPriceFromBedSelection() {
  const $selectedBed = $("input[data-bed-select='true']:checked");

  if (!$selectedBed.length) return;

  const bedPrice = parseFloat($selectedBed.attr("data-price")) || 0;
  const bedType = $selectedBed.attr("data-bed-type") || "";
  const bedName = $selectedBed.attr("data-bed-name") || "";
  const bedItemId = $selectedBed.attr("data-bed-item-id") || "";
  const bedNum = $selectedBed.attr("data-bed-number") || "";

  // Base unit name (remove existing gender if present)
  let baseUnitName = selectedUnitDisplayName || "";

  let gender = "";

  // Extract gender from "Unit 18 (F)"
  const genderMatch = baseUnitName.match(/\((M|F)\)/);
  if (genderMatch) {
    gender = genderMatch[1];
    baseUnitName = baseUnitName.replace(/\s*\((M|F)\)/, "");
  }

  // Build final label: Unit 18 (Sharing, F)
  const combinedLabel = gender
    ? `${baseUnitName} (${bedType}, ${gender})`
    : `${baseUnitName} (${bedType})`;

  // Update UI
  $(".unit-bed-name").html(combinedLabel);

  unitCostValues.unit = bedPrice;

  $("#cart-unit-price").html("R " + numberWithSpaces(bedPrice));
  $(".rent-price").html("R " + numberWithSpaces(bedPrice) + "/m");

  $(".unitCostHiddenInput").each(function () {
    $(this).val("R " + numberWithSpaces(bedPrice));
  });

  $(".bedNameHiddenInput").each(function () {
    $(this).val(bedName);
  });
  
  $(".bedIDInput").each(function () {
    $(this).val(bedItemId);
  });

  $(".bedNumInput").each(function () {
    $(this).val(bedNum);
  });

  updateTotalPrice();

  document
    .querySelector(".unit_selector_confirm-wrapper")
    ?.classList.remove("hide");
}

function clearBedSelection() {
  const $beds = $("input[data-bed-select='true']");

  // uncheck without triggering change handler
  $beds.prop("checked", false);

  // reset base price until a bed is selected
  unitCostValues.unit = 0;

  // label shows only unit name for now
  if (selectedUnitDisplayName) {
    $(".unit-bed-name").html(selectedUnitDisplayName);
  }

  // reset cart price display
  $("#cart-unit-price").html("R " + numberWithSpaces(0));

  updateTotalPrice();
  
  // hide NEXT button
  document.querySelector(".unit_selector_confirm-wrapper")?.classList.add("hide");

  $(".bedNameHiddenInput").each(function () {
    $(this).val("");
  });

  $(".bedIDInput").each(function () {
    $(this).val("");
  });

  $(".bedNumInput").each(function () {
    $(this).val("");
  });
}


function floorTypeChanged ( floorTypeElem, onLoad ) {
	$("#flooring-image").css({"background-image":"url('" + $(floorTypeElem).attr("data-floor-select-image-source") + "')"});
	//Update the cart if the floor option plan price is higher than 0.00
	var floorOptionPrice = $(floorTypeElem).attr('data-floor-select-price');
	var floorOptionName = $(floorTypeElem).attr('data-floor-select-name') + " Floor";
	
	$(".floorTypeHiddenInput").val(floorOptionName);
	
	if ( floorOptionPrice > 0 ) {
		$("#cart-floor-wrap").css("display", "flex");
		$("#cart-floor-label").html(floorOptionName);
		$("#cart-floor-price").html("R " + numberWithSpaces(floorOptionPrice));
	} else {
		$("#cart-floor-wrap").css("display", "none");
		$("#cart-floor-label").html("");
		$("#cart-floor-price").html("R " + numberWithSpaces(0));
	}
	
	if ( $(floorTypeElem).attr("data-xrai-iframe-call") !== "" ) {
		document.getElementById("xrai-iframe").contentWindow.postMessage($(floorTypeElem).attr("data-xrai-iframe-call"), "*");
	}
	
	//Add this to the total unit cost
	unitCostValues.floorPrice = parseFloat(floorOptionPrice);
	if ( !onLoad ) {
		updateTotalPrice();
	}
}

function numberWithSpaces(n) {
	var r = n.toString().split(".");
	return (r[0] = r[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ")), r.join(".");
}

function addOnSelected ( addonCheck ) {
	if ( addonCheck.prop("checked") ) {
		
		if ( addonCheck.attr("id") == "upgrade-2-cb" ) {
			//Set furn-list opacity to 1
			$("#furn-list").css("opacity", 1);
			$("#furn-list-text").css("display", "none");
		}
		
		unitCostValues.addOn += parseInt(addonCheck.attr("data-price"));
		$("." + addonCheck.data("image-class-name") + "UpgradeHiddenInput").each(function (a, e) {
			$(e).val("Yes");
		});
		
		console.log("#cart-" + addonCheck.data("image-class-name") + "-wrap");
		
		$("#cart-" + addonCheck.data("image-class-name") + "-wrap").css("display", "flex");
		$("#cart-" + addonCheck.data("image-class-name") + "-price").html("R " + numberWithSpaces(addonCheck.attr("data-price")));
		
		if ( addonCheck.data("addon-counter") ) {
			if ( addonsSelected.indexOf(addonCheck.data("image-class-name")) < 0 ) {
				addonsSelected.push(addonCheck.data("image-class-name"));
			}
			
			addonsSelected.sort();
			
			//Update unit image
			
			//let addonImageSelector = addonCheck.data("image-class-name");
			if ( addonsSelected.length == totalNumberOfAddons ) {
				//Both addons selected
				$("#unit-image").attr("src", addonCheck.attr('data-upgrade-all-image'));
				$("#unit-image").attr("srcset", addonCheck.attr('data-upgrade-all-image'));
			} else {
				if ( addonsSelected.length == 1 ) {
					$("#unit-image").attr("src", addonCheck.attr('data-upgrade-image'));
					$("#unit-image").attr("srcset", addonCheck.attr('data-upgrade-image'));
				} else {
					//Build the attribute identifier for the selected combination of addons
					var addonImageName = 'data-upgrade-'; //data-upgrade-2-3-image
					addonsSelected.forEach( function ( addon ) {
						var addonNo = addon.replace('upgrade-', '');
						addonImageName += addonNo + '-';
					});
					addonImageName += 'image';
					$("#unit-image").attr("src", addonCheck.attr(addonImageName));
					$("#unit-image").attr("srcset", addonCheck.attr(addonImageName));
				}
			}
			
			$("."+ addonCheck.attr("data-image-class-name") +"HiddenInput").each(function (i, obj) {
				$(obj).val("Yes");
			});
			
			switch ( addonCheck.attr("data-image-class-name") ) {
				case "upgrade-2":
					//Appliance upgrade selected - De-select Appliance basic
					if ( $("#appliance-basic-cb").prop("checked") == true ) {
						$("#appliance-basic-cb").click();
					}
					document.getElementById("xrai-iframe").contentWindow.postMessage("LuxOn", "*");
					break;
			}
			if ( gameLoaded ) {
				//Add addon switch here
			}
		} else {
			if ( additionalAddonsSelected.indexOf(addonCheck.data("image-class-name")) < 0 ) {
				additionalAddonsSelected.push(addonCheck.data("image-class-name"));
			}
		}
	} else {
		
		if ( addonCheck.attr("id") == "upgrade-2-cb" ) {
			//Set furn-list opacity to 1
			$("#furn-list").css("opacity", .5);
			$("#furn-list-text").css("display", "flex");
		}
		
		unitCostValues.addOn -= parseInt(addonCheck.attr("data-price"));
		$("." + addonCheck.data("image-class-name") + "UpgradeHiddenInput").each(function (a, e) {
			$(e).val("No");
		});
		console.log("#cart-" + addonCheck.data("image-class-name") + "-wrap");
		$("#cart-" + addonCheck.data("image-class-name") + "-wrap").css("display", "none");
		$("#cart-" + addonCheck.data("image-class-name") + "-price").html("R " + numberWithSpaces(0));
		if ( addonCheck.data("addon-counter") ) {
			let e = addonsSelected.indexOf(addonCheck.data("image-class-name"));
			if ( e > -1 ) {
				addonsSelected.splice(e, 1);
			}
			
			addonsSelected.sort();
			
			//Update unit image
			if ( addonsSelected.length > 0 ) {
				if ( addonsSelected.length == totalNumberOfAddons ) {
					//addonImageSelector = "both";
					//Both addons selected
					$("#unit-image").attr("src", addonCheck.attr('data-upgrade-all-image'));
					$("#unit-image").attr("srcset", addonCheck.attr('data-upgrade-all-image'));
				} else {
					if ( addonsSelected.length == 1 ) {
						$("#unit-image").attr("src", $("#" + addonsSelected[0] + "-cb").attr('data-upgrade-image'));
						$("#unit-image").attr("srcset", $("#" + addonsSelected[0] + "-cb").attr('data-upgrade-image'));
					} else {
						//Build the attribute identifier for the selected combination of addons
						var addonImageName = 'data-upgrade-'; //data-upgrade-2-3-image
						addonsSelected.forEach(function ( addon ) {
							var addonNo = addon.replace('upgrade-', '');
							addonImageName += addonNo + '-';
						});
						addonImageName += 'image';
						$("#unit-image").attr("src", addonCheck.attr(addonImageName));
						$("#unit-image").attr("srcset", addonCheck.attr(addonImageName));
					}
				}
			} else {
				//Show bare unit image
				$("#unit-image").attr("src", addonCheck.attr('data-base-unit-image'));
				$("#unit-image").attr("srcset", addonCheck.attr('data-base-unit-image'));
			}
			
			$("."+ addonCheck.attr("data-image-class-name") +"HiddenInput").each(function (i, obj) {
				$(obj).val("No");
			});
			
			switch ( addonCheck.attr("data-image-class-name") ) {
				case "upgrade-2":
					if ( $("#appliance-basic-cb").prop("checked") == false ) {
						$("#appliance-basic-cb").click();
					}
					document.getElementById("xrai-iframe").contentWindow.postMessage("LuxOff", "*");
					break;
			}
			
			if ( gameLoaded ) {
				//Add addon switch here
			}
		} else {
			let e = additionalAddonsSelected.indexOf(addonCheck.data("image-class-name"));
			if ( e > -1 ) {
				additionalAddonsSelected.splice(e, 1);
			}
		}
	}
}


function startGame () {
	document.getElementById("xrai-iframe").src = selectedUnitXraiIframeLink;
}


document.addEventListener("DOMContentLoaded", () => {

  // helper: treat empty, dash, or 0 as "missing"
  const isEmptyValue = (val) => {
    if (val == null) return true;

    const str = String(val).trim();

    if (str === "") return true;
    if (str === "-") return true;

    // If it’s a number, hide when 0
    const num = Number(str);
    if (!isNaN(num) && num === 0) return true;

    return false;
  };

  document.querySelectorAll(".selection-counter-list").forEach((list) => {
    const sharingTotalEl = list.querySelector(".count-sharing-total");
    const singleTotalEl = list.querySelector(".count-single-total");

    const sharingTotal = sharingTotalEl ? sharingTotalEl.textContent : "";
    const singleTotal = singleTotalEl ? singleTotalEl.textContent : "";

    const sharingBlock = list.querySelector(".selection-counter.is-sharing");
    const singleBlock = list.querySelector(".selection-counter.is-single");

    const hideSharing = isEmptyValue(sharingTotal);
    const hideSingle = isEmptyValue(singleTotal);

    if (sharingBlock && hideSharing) sharingBlock.style.display = "none";
    if (singleBlock && hideSingle) singleBlock.style.display = "none";

    // If both hidden, hide the whole list wrapper
    if (hideSharing && hideSingle) {
      list.style.display = "none";
    }
  });
  
});

// tags for radio selections
document.addEventListener("DOMContentLoaded", function () {
  const radios = document.querySelectorAll('input[type="radio"][data-sync-value]');
  if (!radios.length) return;

  const SHOW_CLASS = "is-visible"; // add this class in your CSS

  function updateTags() {
    // unique values present on radios
    const values = [...new Set(Array.from(radios).map(r => r.getAttribute("data-sync-value")).filter(Boolean))];

    values.forEach(value => {
      const relatedRadios = document.querySelectorAll(
        `input[type="radio"][data-sync-value="${CSS.escape(value)}"]`
      );

      const isChecked = Array.from(relatedRadios).some(r => r.checked);

      // IMPORTANT: multiple instances supported (querySelectorAll)
      const tags = document.querySelectorAll(`.filter_tag-template.is-${CSS.escape(value)}`);
      tags.forEach(tag => {
        tag.classList.toggle(SHOW_CLASS, isChecked);
      });
    });
  }

  // Run on load (covers pre-selected radios)
  updateTags();

  // Listen for changes (any radio change updates all tags)
  radios.forEach(radio => radio.addEventListener("change", updateTags));
});


// Filter beds on visual
(function () {
  const RADIO_SELECTOR =
    'input[type="radio"][data-sync-group="bedtype"][data-sync-value]';

  const UNIT_SELECTOR = '[data-unit-item="true"]';
  const BED_SELECTOR = '[data-bedtype]';

  function getSelectedBedtype() {
    const checked = document.querySelector(`${RADIO_SELECTOR}:checked`);
    return checked
      ? (checked.getAttribute('data-sync-value') || '').trim().toLowerCase()
      : null;
  }

  // 👇 make it global
  window.applyNestedBedFilter = function () {
    const selected = getSelectedBedtype();

    document.querySelectorAll(UNIT_SELECTOR).forEach(unit => {
      unit.querySelectorAll(BED_SELECTOR).forEach(bed => {
        const bedtype = (bed.getAttribute('data-bedtype') || '')
          .trim()
          .toLowerCase();

        const show = !selected || bedtype === selected;
        bed.style.display = show ? '' : 'none';
      });
    });
  };
  
  // ------------------------------
// Reliable bed-filter scheduler
// ------------------------------
(function () {
  // Debounced scheduler: runs once after UI + Finsweet DOM changes settle
  window.scheduleBedFilterAfterUnitChange = function scheduleBedFilterAfterUnitChange() {
    if (!window.applyNestedBedFilter) return;

    // Cancel any pending run
    if (scheduleBedFilterAfterUnitChange._t) {
      clearTimeout(scheduleBedFilterAfterUnitChange._t);
      scheduleBedFilterAfterUnitChange._t = null;
    }

    // Wait for DOM paint + any filter reflow
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduleBedFilterAfterUnitChange._t = setTimeout(() => {
          window.applyNestedBedFilter();
        }, 60);
      });
    });
  };

  // 1) Fire whenever a UNIT radio changes (covers mouse, keyboard, sync script, programmatic dispatch)
  // Use delegated listener so it works for CMS Load / re-rendered items too.
  document.addEventListener(
    "change",
    function (e) {
      const el = e.target;
      if (!el || el.tagName !== "INPUT") return;

      // Only your unit radios
      if (el.getAttribute("data-total-contribute") !== "true") return;
      if ((el.getAttribute("data-class") || "").toLowerCase() !== "unit") return;
      if (el.type !== "radio") return;

      // Only when it becomes checked
      if (!el.checked) return;

      window.scheduleBedFilterAfterUnitChange();
    },
    true // capture helps when other code stops propagation
  );

  // 2) Also run after Finsweet updates (this is the “after filters are done” signal)
  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push(["cmsfilter", window.scheduleBedFilterAfterUnitChange]);
  window.fsAttributes.push(["cmsload", window.scheduleBedFilterAfterUnitChange]);
})();

  // Trigger on radio change
  document.addEventListener('change', (e) => {
    if (e.target && e.target.matches(RADIO_SELECTOR)) {
      window.applyNestedBedFilter();
    }
  });

  // Run on load
  window.addEventListener('load', window.applyNestedBedFilter);

  // Re-run after Finsweet updates
  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push(['cmsfilter', window.applyNestedBedFilter]);
  window.fsAttributes.push(['cmsload', window.applyNestedBedFilter]);
})();

// run manual bed filtering after Finsweet's Attributes
window.fsAttributes = window.fsAttributes || [];
window.fsAttributes.push([
  "cmsfilter",
  () => scheduleBedFilterAfterUnitChange()
]);
window.fsAttributes.push([
  "cmsload",
  () => scheduleBedFilterAfterUnitChange()
]);
