/**
 * Header "Quote (n)" count. Reads the same localStorage cart as js/cart.js
 * (key amt-quote-cart, total of line.qty after the same normalisation).
 * Does not write the cart.
 */
const CART_KEY = "amt-quote-cart";

function totalQty() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "null");
    const lines = Array.isArray(value?.lines) ? value.lines : [];
    return lines
      .filter((line) => line && line.id && line.pack)
      .reduce((sum, line) => sum + Math.max(1, Math.round(Number(line.qty) || 1)), 0);
  } catch {
    return 0;
  }
}

function paint() {
  const count = totalQty();
  for (const link of document.querySelectorAll("[data-quote-count]")) {
    link.textContent = `Quote (${count})`;
  }
}

paint();
window.addEventListener("amt:quote-changed", paint);
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === CART_KEY) paint();
});
