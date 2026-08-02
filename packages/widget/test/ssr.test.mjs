import assert from "node:assert/strict";
import test from "node:test";
import {
  defineVentusFeedbackWidget,
  VentusFeedbackWidget,
} from "../dist/index.js";

test("imports safely without browser globals", () => {
  assert.equal(typeof HTMLElement, "undefined");
  assert.equal(typeof customElements, "undefined");
  assert.equal(defineVentusFeedbackWidget(), VentusFeedbackWidget);
  assert.equal(defineVentusFeedbackWidget("x-feedback"), VentusFeedbackWidget);
});
