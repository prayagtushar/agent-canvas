import { test } from "node:test";
import assert from "node:assert/strict";
import { addItem, atLeast, applyPercentOff, total } from "../src/cart.js";

const apple = { sku: "apple", price: 100, discount: 0 };
const cake = { sku: "cake", price: 500, discount: 50 };

test("addItem leaves the cart it was given alone", () => {
  const before = [];
  const after = addItem(before, apple, 2);
  assert.equal(before.length, 0, "the cart passed in was modified");
  assert.equal(after.length, 1);
  assert.equal(after[0].qty, 2);
});

test("addItem defaults to one", () => {
  assert.equal(addItem([], apple)[0].qty, 1);
});

test("total applies the discount to every unit, not once per line", () => {
  const cart = [{ ...cake, qty: 4 }];
  // (500 - 50) * 4, not 500 * 4 - 50
  assert.equal(total(cart), 1800);
});

test("total adds the lines together", () => {
  const cart = [
    { ...apple, qty: 3 },
    { ...cake, qty: 2 },
  ];
  assert.equal(total(cart), 300 + 900);
});

test("total of an empty cart is zero", () => {
  assert.equal(total([]), 0);
});

test("atLeast includes a price exactly on the floor", () => {
  const cart = [
    { ...apple, qty: 1 },
    { ...cake, qty: 1 },
  ];
  assert.deepEqual(
    atLeast(cart, 100).map((l) => l.sku),
    ["apple", "cake"],
    "100 is at least 100"
  );
});

test("atLeast drops what is under the floor", () => {
  const cart = [{ ...apple, qty: 1 }];
  assert.deepEqual(atLeast(cart, 101), []);
});

test("applyPercentOff takes a percentage, not a flat amount", () => {
  const [line] = applyPercentOff([{ ...cake, qty: 1 }], 20);
  assert.equal(line.price, 400, "20% off 500 is 400, not 480");
});

test("applyPercentOff leaves the cart it was given alone", () => {
  const cart = [{ ...cake, qty: 1 }];
  applyPercentOff(cart, 20);
  assert.equal(cart[0].price, 500);
});
