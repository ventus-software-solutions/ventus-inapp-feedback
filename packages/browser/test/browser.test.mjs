import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackCaptureCore } from "../dist/index.js";

class FakeXmlHttpRequest extends EventTarget {
  status = 0;
  method = "GET";
  url = "";

  open(method, url) {
    this.method = method;
    this.url = String(url);
  }

  send() {
    this.dispatchEvent(new Event("loadend"));
  }
}

function installBrowserEnvironment() {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const events = new EventTarget();
  const documentEvents = new EventTarget();
  const location = new URL(
    "https://demo.example/checkout?token=raw-secret&safe=visible#private",
  );
  const calls = [];
  const fakeConsole = {
    log: (...args) => calls.push(["log", ...args]),
    info: (...args) => calls.push(["info", ...args]),
    warn: (...args) => calls.push(["warn", ...args]),
    error: (...args) => calls.push(["error", ...args]),
    debug: (...args) => calls.push(["debug", ...args]),
  };
  let performanceNow = 10;
  const fakeWindow = {
    console: fakeConsole,
    location,
    navigator: {
      userAgent: "Ventus Test Browser",
      language: "en-US",
      onLine: true,
      mediaDevices: {},
    },
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 20,
    screen: { width: 1440, height: 900, colorDepth: 24 },
    performance: {
      timeOrigin: 1_000,
      now: () => ++performanceNow,
      getEntriesByType: () => [],
    },
    XMLHttpRequest: FakeXmlHttpRequest,
    fetch: async () => new Response("failed", { status: 503 }),
    history: {
      pushState(_data, _unused, nextUrl) {
        if (nextUrl) location.href = new URL(String(nextUrl), location).href;
      },
      replaceState(_data, _unused, nextUrl) {
        if (nextUrl) location.href = new URL(String(nextUrl), location).href;
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    setTimeout,
    clearTimeout,
  };
  const fakeDocument = {
    title: "Checkout for buyer@example.com",
    referrer: "https://search.example/?token=referrer-secret",
    body: {},
    documentElement: { scrollWidth: 1440, scrollHeight: 1200 },
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener:
      documentEvents.removeEventListener.bind(documentEvents),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });

  return {
    calls,
    fakeConsole,
    fakeWindow,
    restore() {
      if (previousWindow)
        Object.defineProperty(globalThis, "window", previousWindow);
      else delete globalThis.window;
      if (previousDocument)
        Object.defineProperty(globalThis, "document", previousDocument);
      else delete globalThis.document;
    },
  };
}

test("redacts captured diagnostics, URLs, and application context", async () => {
  const browser = installBrowserEnvironment();
  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__redactionTestStore",
      diagnostics: {
        console: true,
        errors: true,
        network: true,
        breadcrumbs: true,
        browser: true,
        performance: true,
      },
      consoleLevels: ["warn"],
      redaction: { allowedQueryParameters: ["safe"] },
    });
    capture.init();

    browser.fakeWindow.console.warn(
      'password = "two word secret"',
      "buyer@example.com",
      {
        password: "super-secret",
        authorization: "Bearer live-token-value",
        card: "4111 1111 1111 1111",
      },
    );
    browser.fakeWindow.console.log("this level is intentionally excluded");

    const errorEvent = new Event("error");
    Object.assign(errorEvent, {
      message: "Failure for buyer@example.com token=error-secret",
      filename: "https://demo.example/app.js?token=source-secret",
      lineno: 7,
      colno: 12,
      error: new Error("Bearer stack-secret"),
    });
    browser.fakeWindow.dispatchEvent(errorEvent);

    await browser.fakeWindow.fetch(
      "https://api.example/orders?token=network-secret&safe=public",
    );
    const xhr = new browser.fakeWindow.XMLHttpRequest();
    xhr.open("POST", "https://api.example/pay?password=x&safe=xhr");
    xhr.status = 500;
    xhr.send();
    capture.recordNetworkFailure({
      method: "PATCH",
      url: "https://api.example/manual?token=manual-secret&safe=manual",
      status: 502,
      durationMs: 12.6,
    });
    browser.fakeWindow.history.pushState(
      {},
      "",
      "/confirmation?token=navigation-secret&safe=route#private",
    );

    const payload = capture.getPayload({
      sourceApp: "demo",
      description: "Contact buyer@example.com with token=description-secret",
      context: {
        email: "buyer@example.com",
        password: "context-secret",
      },
    });
    const serialized = JSON.stringify(payload);

    assert.equal(capture.isInitialized(), true);
    assert.match(serialized, /\[REDACTED_EMAIL\]/);
    assert.match(serialized, /\[REDACTED\]/);
    assert.doesNotMatch(serialized, /buyer@example\.com/);
    assert.doesNotMatch(serialized, /super-secret|live-token|network-secret/);
    assert.doesNotMatch(serialized, /two word secret/);
    assert.doesNotMatch(
      serialized,
      /source-secret|navigation-secret|context-secret/,
    );
    assert.doesNotMatch(serialized, /4111 1111 1111 1111/);
    assert.match(payload.url, /safe=route/);
    assert.equal(payload.url.includes("token="), false);
    assert.equal(payload.consoleLogs.length, 1);
    assert.equal(payload.errors.length, 1);
    assert.equal(payload.networkErrors.length, 3);
    assert.equal(payload.networkErrors[2].transport, "manual");
    assert.equal(payload.networkErrors[2].durationMs, 13);
    assert.equal(payload.breadcrumbs.length, 1);
    assert.equal(payload.browser?.title, "Checkout for [REDACTED_EMAIL]");

    payload.consoleLogs[0].args[0] = "mutated by consumer";
    assert.doesNotMatch(
      JSON.stringify(capture.getPayload({ sourceApp: "demo" })),
      /mutated by consumer/,
    );
  } finally {
    browser.restore();
  }
});

test("masks configured elements in the screenshot clone", async () => {
  const browser = installBrowserEnvironment();
  const previousHTMLElement = Object.getOwnPropertyDescriptor(
    globalThis,
    "HTMLElement",
  );
  const previousHTMLInputElement = Object.getOwnPropertyDescriptor(
    globalThis,
    "HTMLInputElement",
  );
  const previousHTMLTextAreaElement = Object.getOwnPropertyDescriptor(
    globalThis,
    "HTMLTextAreaElement",
  );

  class FakeHtmlElement {
    tagName = "DIV";
    textContent = "private account number";
    style = {};
  }
  class FakeInputElement extends FakeHtmlElement {
    tagName = "INPUT";
    value = "raw-password";
    attributes = new Map();
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  }
  class FakeTextAreaElement extends FakeHtmlElement {
    tagName = "TEXTAREA";
    value = "raw-notes";
  }

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHtmlElement,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: FakeInputElement,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: FakeTextAreaElement,
  });

  const password = new FakeInputElement();
  const privateBlock = new FakeHtmlElement();
  let renderedType = null;
  let renderedQuality = null;
  let renderedScale = null;
  let hostCloneHookCalled = false;

  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__screenshotMaskStore",
      screenshot: {
        maskSelectors: ["input[type='password']", "[data-feedback-mask]"],
        imageType: "image/webp",
        imageQuality: 0.8,
        maxWidth: 320,
        onClone: () => {
          hostCloneHookCalled = true;
        },
      },
      loadHtml2Canvas: async () => ({
        default: async (_target, options) => {
          options.onclone({
            querySelectorAll(selector) {
              return selector.startsWith("input") ? [password] : [privateBlock];
            },
          });
          renderedScale = options.scale;
          return {
            toBlob(callback, type, quality) {
              renderedType = type;
              renderedQuality = quality;
              callback(new Blob(["synthetic-image"], { type }));
            },
          };
        },
      }),
    });

    const blob = await capture.captureViewportScreenshotBlob();
    assert.equal(password.value, "[REDACTED]");
    assert.equal(password.attributes.get("value"), "[REDACTED]");
    assert.equal(privateBlock.textContent, "[REDACTED]");
    assert.equal(privateBlock.style.background, "#202624");
    assert.equal(blob?.type, "image/webp");
    assert.equal(renderedType, "image/webp");
    assert.equal(renderedQuality, 0.8);
    assert.equal(renderedScale, 0.25);
    assert.equal(hostCloneHookCalled, true);
  } finally {
    if (previousHTMLElement) {
      Object.defineProperty(globalThis, "HTMLElement", previousHTMLElement);
    } else delete globalThis.HTMLElement;
    if (previousHTMLInputElement) {
      Object.defineProperty(
        globalThis,
        "HTMLInputElement",
        previousHTMLInputElement,
      );
    } else delete globalThis.HTMLInputElement;
    if (previousHTMLTextAreaElement) {
      Object.defineProperty(
        globalThis,
        "HTMLTextAreaElement",
        previousHTMLTextAreaElement,
      );
    } else delete globalThis.HTMLTextAreaElement;
    browser.restore();
  }
});

test("rejects screenshots above the configured byte limit", async () => {
  const browser = installBrowserEnvironment();
  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__screenshotByteLimitStore",
      screenshot: { maxBytes: 4 },
      loadHtml2Canvas: async () => async () => ({
        toBlob(callback, type) {
          callback(new Blob(["too-large"], { type }));
        },
      }),
    });

    await assert.rejects(
      capture.captureViewportScreenshotBlob(),
      /4-byte limit/,
    );
  } finally {
    browser.restore();
  }
});

test("shares instrumentation safely and restores host functions after final destroy", () => {
  const browser = installBrowserEnvironment();
  try {
    const originalWarn = browser.fakeWindow.console.warn;
    const originalFetch = browser.fakeWindow.fetch;
    const originalPushState = browser.fakeWindow.history.pushState;
    const options = {
      storeKey: "__lifecycleTestStore",
      diagnostics: { console: true, network: true, breadcrumbs: true },
    };
    const first = createFeedbackCaptureCore(options);
    const second = createFeedbackCaptureCore(options);

    first.init();
    const patchedWarn = browser.fakeWindow.console.warn;
    second.init();
    assert.equal(browser.fakeWindow.console.warn, patchedWarn);

    first.destroy();
    assert.equal(browser.fakeWindow.console.warn, patchedWarn);
    assert.equal(second.isInitialized(), true);

    second.destroy();
    assert.equal(browser.fakeWindow.console.warn, originalWarn);
    assert.equal(browser.fakeWindow.fetch, originalFetch);
    assert.equal(browser.fakeWindow.history.pushState, originalPushState);
    assert.equal(second.isInitialized(), false);
  } finally {
    browser.restore();
  }
});

test("clear removes all buffered diagnostic entries", () => {
  const browser = installBrowserEnvironment();
  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__clearTestStore",
      diagnostics: { console: true },
    });
    capture.init();
    browser.fakeWindow.console.error("synthetic error");
    assert.equal(capture.getPayload().consoleLogs.length, 1);
    capture.clear();
    assert.equal(capture.getPayload().consoleLogs.length, 0);
    capture.destroy();
  } finally {
    browser.restore();
  }
});

test("enforces bounded ring buffers", () => {
  const browser = installBrowserEnvironment();
  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__ringLimitStore",
      diagnostics: { console: true },
      maxConsoleEntries: 2,
    });
    capture.init();
    browser.fakeWindow.console.log("first");
    browser.fakeWindow.console.log("second");
    browser.fakeWindow.console.log("third");

    const logs = capture.getPayload().consoleLogs;
    assert.equal(logs.length, 2);
    assert.equal(logs[0].args[0], "second");
    assert.equal(logs[1].args[0], "third");
  } finally {
    browser.restore();
  }
});

test("serializes hostile console values without exceeding entry limits", () => {
  const browser = installBrowserEnvironment();
  try {
    const capture = createFeedbackCaptureCore({
      storeKey: "__hostileSerializationStore",
      diagnostics: { console: true },
      maxSerializedLength: 48,
    });
    capture.init();
    const circular = { name: "circle" };
    circular.self = circular;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("blocked reflection");
        },
        get(_target, key) {
          if (key === Symbol.toPrimitive) {
            return () => {
              throw new Error("blocked conversion");
            };
          }
          return undefined;
        },
      },
    );

    browser.fakeWindow.console.log(
      circular,
      new Error("synthetic failure"),
      () => "function value",
      42n,
      hostile,
      "x".repeat(500),
    );

    const args = capture.getPayload().consoleLogs[0].args;
    assert.equal(args.length, 6);
    assert.ok(args.every((value) => value.length <= 48));
    assert.match(args[0], /Circular/);
    assert.match(args[2], /Function/);
    assert.equal(args[3], '"42"');
    assert.equal(args[4], "[Unserializable]");
    assert.match(args[5], /truncated/);
  } finally {
    browser.restore();
  }
});
