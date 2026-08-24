/**
 * A shopping cart. Four of these behaviours are wrong.
 *
 * The suite in ../test/cart.test.js says exactly what each should do. Nothing
 * here needs installing: `npm test` runs it on Node's own test runner.
 */

/** Add `qty` of an item. Returns the new cart; the one passed in is untouched. */
export function addItem(cart, item, qty = 1) {
  cart.push({ ...item, qty });
  return cart;
}

/** The cart's total, with each item's discount applied to every unit. */
export function total(cart) {
  return cart.reduce((sum, line) => sum + line.price * line.qty - line.discount, 0);
}

/** Lines whose price is at or above `floor`. */
export function atLeast(cart, floor) {
  return cart.filter((line) => line.price > floor);
}

/** Take a percentage off every line. `percent` of 20 means 20% off. */
export function applyPercentOff(cart, percent) {
  return cart.map((line) => ({ ...line, price: line.price - percent }));
}
