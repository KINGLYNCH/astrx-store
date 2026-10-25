const CART_STORAGE_KEY = "astrx-cart";
const ORDER_EMAIL = "edemufanabasi5@gmail.com";
const ORDER_EMAIL_ENDPOINT = "https://formsubmit.co/ajax/" + ORDER_EMAIL;
const PAYSTACK_PAYMENT_PAGE = "https://paystack.shop/pay/astrx";
const SHIPPING_CONFIG = window.SHIPPING_CONFIG;
const cartItemsElement = document.getElementById("cartItems");
const deliveryCountryElement = document.getElementById("deliveryCountry");
const deliveryStateElement = document.getElementById("deliveryState");
const abujaAreaElement = document.getElementById("abujaArea");
const internationalCountryElement = document.getElementById(
  "internationalCountry",
);
const internationalZoneElement = document.getElementById("internationalZone");
const displayCurrencyElement = document.getElementById("displayCurrency");
const currencyEstimateRow = document.getElementById("currencyEstimateRow");
const currencyEstimateLabel = document.getElementById("currencyEstimateLabel");
const currencyEstimateAmount = document.getElementById("currencyEstimateAmount");
const currencyRateStatus = document.getElementById("currencyRateStatus");
let cart = loadCart();
const exchangeRatesCache = new Map();
let pendingRateCurrency = "";
let rateRequestId = 0;

function money(amount) {
  return "₦" + amount.toLocaleString("en-NG");
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getCurrencyEstimate(amount, currency) {
  const cached = exchangeRatesCache.get(currency);
  if (!cached || Date.now() - cached.fetchedAt > 30 * 60 * 1000) return null;
  return {
    amount: amount * cached.rate,
    rate: cached.rate,
    fetchedAt: cached.fetchedAt,
  };
}

function loadCart() {
  try {
    const storedCart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(storedCart)) return [];
    return storedCart.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number.isSafeInteger(item.price) &&
        item.price >= 0 &&
        Number.isInteger(item.qty) &&
        item.qty > 0 &&
        item.qty <= 99 &&
        typeof item.color === "string" &&
        typeof item.size === "string" &&
        typeof item.img === "string" &&
        item.img.startsWith("images/") &&
        !item.img.includes(".."),
    );
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function getCartSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function calculateCheckoutTotal(subtotal, destination) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new Error("The cart subtotal is invalid.");
  }

  let zone;
  let country;
  let area = "";
  if (destination.country === "NG") {
    const zoneKey = SHIPPING_CONFIG.stateToZone[destination.state];
    if (!zoneKey) throw new Error("Select a valid Nigerian state or FCT.");
    if (destination.state === "FCT") {
      zone = SHIPPING_CONFIG.abujaAreas[destination.abujaArea];
      if (!zone) throw new Error("Select your Abuja delivery area.");
      area = zone.label;
    } else {
      zone = SHIPPING_CONFIG.domesticZones[zoneKey];
      const stateFee = SHIPPING_CONFIG.domesticStateFees[destination.state];
      if (!zone || !Number.isSafeInteger(stateFee)) {
        throw new Error("A delivery estimate is not configured for that state.");
      }
      zone = {
        ...zone,
        label: `${destination.state} — terminal pickup`,
        feeNgn: stateFee,
      };
    }
    country = "Nigeria";
  } else if (destination.country === "INTL") {
    if (!destination.internationalCountry.trim()) {
      throw new Error("Enter your international delivery country.");
    }
    zone = SHIPPING_CONFIG.internationalZones[destination.internationalZone];
    if (!zone) throw new Error("Select a valid international shipping zone.");
    country = destination.internationalCountry.trim();
  } else {
    throw new Error("Select a valid delivery country.");
  }

  return {
    subtotal,
    deliveryFee: zone.feeNgn,
    total: subtotal + zone.feeNgn,
    country,
    state: destination.country === "NG" ? destination.state : "",
    area,
    zone: area ? `Abuja — ${area}` : zone.label,
  };
}

function getCheckoutDestination() {
  return {
    country: deliveryCountryElement.value,
    state: deliveryStateElement.value,
    abujaArea: abujaAreaElement.value,
    internationalCountry: internationalCountryElement.value.trim(),
    internationalZone: internationalZoneElement.value,
  };
}

function renderCartItems() {
  cartItemsElement.replaceChildren();

  if (cart.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-cart";
    emptyMessage.textContent = "Your cart is empty. Go leave a mark.";
    cartItemsElement.appendChild(emptyMessage);
  }

  cart.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "cart-item";

    const image = document.createElement("img");
    image.src = item.img;
    image.alt = item.name;

    const info = document.createElement("div");
    info.className = "item-info";
    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.name;
    const details = document.createElement("div");
    details.className = "item-meta";
    details.textContent = `${item.size} · ${item.color} · ${money(item.price)}`;

    const bottom = document.createElement("div");
    bottom.className = "item-bottom";
    const quantity = document.createElement("div");
    quantity.className = "quantity";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Decrease quantity of ${item.name}`);
    decrease.addEventListener("click", () => changeQuantity(index, -1));
    const quantityValue = document.createElement("span");
    quantityValue.textContent = item.qty;
    const increase = document.createElement("button");
    increase.type = "button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Increase quantity of ${item.name}`);
    increase.addEventListener("click", () => changeQuantity(index, 1));
    quantity.append(decrease, quantityValue, increase);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-btn";
    remove.textContent = "REMOVE";
    remove.addEventListener("click", () => {
      cart.splice(index, 1);
      saveCart();
      renderCart();
    });

    bottom.append(quantity, remove);
    info.append(name, details, bottom);
    row.append(image, info);
    cartItemsElement.appendChild(row);
  });
}

function changeQuantity(index, amount) {
  cart[index].qty += amount;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  saveCart();
  renderCart();
}

function renderTotals() {
  const subtotal = getCartSubtotal();
  document.getElementById("subtotalAmount").textContent = money(subtotal);
  const destination = getCheckoutDestination();
  const hasDestination =
    destination.country === "NG"
      ? Boolean(
          destination.state &&
            (destination.state !== "FCT" || destination.abujaArea),
        )
      : Boolean(destination.internationalCountry && destination.internationalZone);

  if (!hasDestination) {
    document.getElementById("deliveryFeeAmount").textContent =
      "Choose destination";
    document.getElementById("checkoutTotalAmount").textContent = "—";
    currencyEstimateRow.hidden = true;
    currencyRateStatus.hidden = true;
    return;
  }

  const checkout = calculateCheckoutTotal(subtotal, destination);
  document.getElementById("deliveryFeeAmount").textContent = money(
    checkout.deliveryFee,
  );
  document.getElementById("checkoutTotalAmount").textContent = money(
    checkout.total,
  );
  updateCurrencyEstimate(checkout.total);
}

async function updateCurrencyEstimate(ngnTotal) {
  const isInternational = deliveryCountryElement.value === "INTL";
  if (!isInternational) {
    currencyEstimateRow.hidden = true;
    currencyRateStatus.hidden = true;
    return;
  }

  const currency = displayCurrencyElement.value;
  currencyEstimateRow.hidden = false;
  currencyEstimateLabel.textContent = `Approximate total (${currency})`;
  currencyRateStatus.hidden = false;

  if (currency === "NGN") {
    currencyEstimateAmount.textContent = formatCurrency(ngnTotal, "NGN");
    currencyRateStatus.textContent =
      "Displayed in NGN. Payment is collected in NGN.";
    return;
  }

  const cachedEstimate = getCurrencyEstimate(ngnTotal, currency);
  if (cachedEstimate) {
    currencyEstimateAmount.textContent = formatCurrency(
      cachedEstimate.amount,
      currency,
    );
    const updatedAt = new Date(cachedEstimate.fetchedAt).toLocaleString();
    currencyRateStatus.textContent = `Indicative exchange rate updated ${updatedAt}. Payment remains in NGN.`;
    return;
  }

  currencyEstimateAmount.textContent = "Loading exchange rate…";
  currencyRateStatus.textContent =
    "Fetching an indicative exchange rate. Checkout payment remains in NGN.";
  if (pendingRateCurrency === currency) return;

  pendingRateCurrency = currency;
  const requestId = ++rateRequestId;
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/NGN");
    if (!response.ok) throw new Error("Exchange-rate service is unavailable.");
    const data = await response.json();
    const rate = data?.result === "success" ? data.rates?.[currency] : null;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`A conversion rate for ${currency} is unavailable.`);
    }
    exchangeRatesCache.set(currency, { rate, fetchedAt: Date.now() });
    if (requestId === rateRequestId) renderTotals();
  } catch (error) {
    if (requestId === rateRequestId) {
      currencyEstimateAmount.textContent = "Unavailable";
      currencyRateStatus.textContent = `${error.message} The NGN total is still available for payment.`;
    }
  } finally {
    if (requestId === rateRequestId) pendingRateCurrency = "";
  }
}

function renderCart() {
  document.getElementById("cartCount").textContent = cart.reduce(
    (sum, item) => sum + item.qty,
    0,
  );
  renderCartItems();
  renderTotals();
  document.getElementById("checkoutBtn").disabled = cart.length === 0;
}

function populateDestinationOptions() {
  Object.keys(SHIPPING_CONFIG.stateToZone)
    .sort((a, b) => a.localeCompare(b))
    .forEach((state) => {
      const option = document.createElement("option");
      option.value = state;
      option.textContent =
        state === "FCT"
          ? "FCT (Abuja) — select area"
          : `${state} — ${money(SHIPPING_CONFIG.domesticStateFees[state])} terminal pickup estimate`;
      deliveryStateElement.appendChild(option);
    });

  Object.entries(SHIPPING_CONFIG.internationalZones).forEach(
    ([zoneId, zone]) => {
      const option = document.createElement("option");
      option.value = zoneId;
      option.textContent = `${zone.label} — ${money(zone.feeNgn)} (e.g. ${zone.examples})`;
      internationalZoneElement.appendChild(option);
    },
  );
  Object.entries(SHIPPING_CONFIG.abujaAreas).forEach(([areaId, area]) => {
    const option = document.createElement("option");
    option.value = areaId;
    option.textContent = `${area.label} — ${money(area.feeNgn)}`;
    abujaAreaElement.appendChild(option);
  });
}

function updateDestinationFields() {
  const isNigeria = deliveryCountryElement.value === "NG";
  document.getElementById("nigeriaDestinationFields").hidden = !isNigeria;
  document.getElementById("internationalDestinationFields").hidden = isNigeria;
  deliveryStateElement.required = isNigeria;
  const isAbuja = isNigeria && deliveryStateElement.value === "FCT";
  document.getElementById("abujaAreaField").hidden = !isAbuja;
  abujaAreaElement.required = isAbuja;
  if (!isAbuja) abujaAreaElement.value = "";
  internationalCountryElement.required = !isNigeria;
  internationalZoneElement.required = !isNigeria;
  renderTotals();
}

function formatOrder(checkout) {
  const lines = cart.map(
    (item) =>
      `${item.name} | Size: ${item.size} | Color: ${item.color} | Qty: ${item.qty} | Unit price: ${money(item.price)} | Line total: ${money(item.price * item.qty)}`,
  );
  const destination = checkout.area
    ? `${checkout.area}, ${checkout.state}, ${checkout.country}`
    : checkout.state
      ? `${checkout.state}, ${checkout.country}`
    : checkout.country;
  const currency = displayCurrencyElement.value;
  const estimate =
    checkout.country !== "Nigeria" && currency !== "NGN"
      ? getCurrencyEstimate(checkout.total, currency)
      : null;
  const convertedLine = estimate
    ? `\nApproximate display total: ${formatCurrency(estimate.amount, currency)} (indicative only; payable total remains ${money(checkout.total)})`
    : "";
  return `${lines.join("\n")}\n\nDelivery destination: ${destination}\nShipping zone: ${checkout.zone}\nSubtotal: ${money(checkout.subtotal)}\nDelivery: ${money(checkout.deliveryFee)}\nTotal: ${money(checkout.total)}${convertedLine}`;
}

async function submitOrder(event) {
  event.preventDefault();
  if (cart.length === 0) return;

  const status = document.getElementById("checkoutStatus");
  const checkoutButton = document.getElementById("checkoutBtn");
  const destination = getCheckoutDestination();
  let checkout;
  try {
    checkout = calculateCheckoutTotal(getCartSubtotal(), destination);
  } catch (error) {
    status.textContent = error.message;
    return;
  }

  const customerName = document.getElementById("customerName").value.trim();
  const customerPhone = document.getElementById("customerPhone").value.trim();
  const customerEmail = document.getElementById("customerEmail").value.trim();
  const deliveryAddress = document
    .getElementById("deliveryAddress")
    .value.trim();

  checkoutButton.disabled = true;
  checkoutButton.textContent = "SENDING ORDER...";
  status.textContent = "";
  document.getElementById("paystackLink").hidden = true;
  try {
    const response = await fetch(ORDER_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: "New ASTRX order - payment pending",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_address: `${deliveryAddress}, ${checkout.area ? `${checkout.area}, ` : ""}${checkout.state ? `${checkout.state}, ` : ""}${checkout.country}`,
        order: formatOrder(checkout),
      }),
    });
    if (!response.ok) throw new Error("The order could not be emailed.");
    status.textContent = `Order details sent. Enter ${money(checkout.total)} (including delivery) on Paystack.`;
    document.getElementById("paystackLink").hidden = false;
  } catch (error) {
    status.textContent =
      error.message || "Checkout could not continue. Please try again.";
  } finally {
    checkoutButton.disabled = cart.length === 0;
    checkoutButton.textContent = "CHECKOUT";
  }
}

if (!SHIPPING_CONFIG.ratesAreIllustrative) {
  document.getElementById("shippingRatesNotice").hidden = true;
}
document.getElementById("paystackLink").href = PAYSTACK_PAYMENT_PAGE;
populateDestinationOptions();
deliveryCountryElement.addEventListener("change", updateDestinationFields);
deliveryStateElement.addEventListener("change", updateDestinationFields);
abujaAreaElement.addEventListener("change", renderTotals);
internationalCountryElement.addEventListener("input", renderTotals);
internationalZoneElement.addEventListener("change", renderTotals);
displayCurrencyElement.addEventListener("change", renderTotals);
document
  .getElementById("checkoutForm")
  .addEventListener("submit", submitOrder);
renderCart();
