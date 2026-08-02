import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const browser = new Window({ url: "https://demo.example.test/" });

for (const name of [
  "AbortController",
  "Blob",
  "CustomEvent",
  "Event",
  "FormData",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSlotElement",
  "Node",
  "URL",
  "customElements",
  "document",
  "navigator",
  "window",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: browser[name],
    writable: true,
  });
}

const { VentusFeedbackWidget } = await import("../dist/index.js");

let tagSequence = 0;
const defineTestWidget = (Widget = VentusFeedbackWidget) => {
  const tagName = `test-ventus-feedback-${(tagSequence += 1)}`;
  customElements.define(tagName, class extends Widget {});
  return tagName;
};

test.after(() => browser.close());
test.afterEach(() => document.body.replaceChildren());

test("renders an accessible dialog and restores focus after closing", async () => {
  const opener = document.createElement("button");
  opener.textContent = "Open feedback";
  document.body.append(opener);
  opener.focus();

  const widget = document.createElement(defineTestWidget());
  document.body.append(widget);
  widget.open();
  await Promise.resolve();

  const dialog = widget.shadowRoot.querySelector("dialog");
  const description = widget.shadowRoot.querySelector(
    "textarea[name='description']",
  );
  assert.equal(dialog.open, true);
  assert.equal(dialog.getAttribute("aria-labelledby"), "ventus-feedback-title");
  assert.equal(
    dialog.getAttribute("aria-describedby"),
    "ventus-feedback-intro",
  );
  assert.equal(widget.shadowRoot.activeElement, description);

  widget.close();
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, opener);
});

test("does not stack delegated event listeners after reconnecting", () => {
  let opens = 0;
  class CountingWidget extends VentusFeedbackWidget {
    open(source) {
      opens += 1;
      super.open(source);
    }
  }

  const widget = document.createElement(defineTestWidget(CountingWidget));
  document.body.append(widget);
  widget.remove();
  document.body.append(widget);

  widget.shadowRoot.querySelector("[data-action='open']").click();
  assert.equal(opens, 1);
});

test("renders the official SEO-aware Ventus badge with a safe external link", () => {
  const widget = document.createElement(defineTestWidget());
  document.body.append(widget);

  const attribution = widget.shadowRoot.querySelector(".ventus-badge");
  assert.equal(
    attribution.getAttribute("aria-label"),
    "Made by Ventus, AI feedback software from Cologne",
  );
  assert.equal(attribution.getAttribute("target"), "_blank");
  assert.equal(attribution.getAttribute("rel"), "noopener");
  assert.equal(
    attribution.href,
    "https://ventus.works/?utm_source=ventus-inapp-feedback&utm_medium=referral&utm_campaign=badge",
  );
  assert.equal(attribution.querySelector("img").getAttribute("alt"), "Ventus");
  assert.match(attribution.textContent, /Made by/);
  assert.match(attribution.textContent, /AI feedback software from Cologne/);
});

test("updates the trigger label when locale and override attributes change", () => {
  const widget = document.createElement(defineTestWidget());
  document.body.append(widget);
  const trigger = () =>
    widget.shadowRoot.querySelector("[data-label='trigger']").textContent;
  const description = widget.shadowRoot.querySelector(
    "textarea[name='description']",
  );

  assert.equal(trigger(), "Feedback");
  widget.setAttribute("trigger-label", "Tell us");
  assert.equal(trigger(), "Tell us");
  widget.removeAttribute("trigger-label");
  description.value = "Keep this draft while translating";
  widget.setAttribute("locale", "de-DE");
  assert.equal(trigger(), "Feedback");
  assert.equal(
    widget.shadowRoot.querySelector("[data-label='title']").textContent,
    "Feedback senden",
  );
  assert.equal(
    widget.shadowRoot.querySelector("[data-label='category']").textContent,
    "Typ",
  );
  assert.equal(
    widget.shadowRoot.querySelector("option[value='bug']").textContent,
    "Fehler",
  );
  assert.equal(widget.shadowRoot.querySelector("dialog").lang, "de");
  assert.equal(description.value, "Keep this draft while translating");
});
