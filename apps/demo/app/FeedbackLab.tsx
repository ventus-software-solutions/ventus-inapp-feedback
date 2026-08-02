"use client";

import {
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
  type FeedbackCapturePayload,
  type FeedbackReceipt,
  type FeedbackTransport,
} from "@ventus-software-solutions/feedback-browser";
import { FeedbackWidget } from "@ventus-software-solutions/feedback-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { mockFeedbackTransport } from "./mockTransport";

const feedbackEndpoint = import.meta.env.VITE_VENTUS_FEEDBACK_ENDPOINT?.trim();
const feedbackProjectKey =
  import.meta.env.VITE_VENTUS_FEEDBACK_PROJECT_KEY?.trim();
const isLiveApiMode = Boolean(feedbackEndpoint && feedbackProjectKey);
const isPublicShowcaseMode =
  import.meta.env.VITE_VENTUS_SHOWCASE === "true" && !isLiveApiMode;

const demoFeedbackTransport: FeedbackTransport<DemoContext> = isLiveApiMode
  ? createHttpFeedbackTransport<DemoContext>({
      endpoint: feedbackEndpoint!,
      headers: { "x-feedback-project-key": feedbackProjectKey! },
      retry: { maxAttempts: 2, baseDelayMs: 300 },
    })
  : mockFeedbackTransport;

const loadHtml2Canvas = () => import("html2canvas-pro");

type RunState = {
  tone: "idle" | "success" | "warning";
  message: string;
};

type DemoContext = {
  scenario: string;
  testerEmail: string;
  password: string;
};

const simulationStages = [
  {
    label: "Saved in your backend",
    operation: "POST /v1/feedback",
    detail: "The structured report and approved diagnostics are persisted.",
    status: "new",
  },
  {
    label: "Discovered through MCP",
    operation: "search_feedback",
    detail:
      "An agent searches for new bugs and receives the stable feedback ID.",
    status: "new",
  },
  {
    label: "Claimed by an agent",
    operation: "claim_feedback",
    detail:
      "An expiring lease prevents two agents from implementing the same task.",
    status: "in_progress",
  },
  {
    label: "Progress recorded",
    operation: "comment_feedback · add_feedback_evidence",
    detail:
      "The agent links its commit and attaches test evidence to the report.",
    status: "in_progress",
  },
  {
    label: "Marked resolved",
    operation: "resolve_feedback",
    detail: "Implementation is complete and awaits independent verification.",
    status: "resolved",
  },
  {
    label: "Verified and closed",
    operation: "close_feedback",
    detail:
      "A human or verification agent confirms the fix before final closure.",
    status: "closed",
  },
] as const;

const formatPayload = (value: unknown) => JSON.stringify(value, null, 2);
const INITIAL_TITLE = "Checkout stalled after payment";
const INITIAL_DESCRIPTION =
  "The confirmation step stayed disabled after the payment request completed.";

export function FeedbackLab() {
  const capture = useMemo(
    () =>
      createFeedbackCaptureCore<DemoContext>({
        diagnostics: {
          console: true,
          errors: true,
          network: true,
          breadcrumbs: true,
          browser: true,
          performance: true,
        },
        redaction: {
          allowedQueryParameters: ["scenario"],
        },
        screenshot: {
          maskSelectors: ["input[type='password']", "[data-feedback-mask]"],
        },
        loadHtml2Canvas,
      }),
    [],
  );
  const [title, setTitle] = useState(INITIAL_TITLE);
  const [description, setDescription] = useState(INITIAL_DESCRIPTION);
  const [payload, setPayload] =
    useState<FeedbackCapturePayload<DemoContext> | null>(null);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCaptureActive, setIsCaptureActive] = useState(true);
  const [simulationStep, setSimulationStep] = useState(-1);
  const [simulationIsPlaying, setSimulationIsPlaying] = useState(true);
  const [runState, setRunState] = useState<RunState>({
    tone: "idle",
    message: "Capture is initialized and waiting for a scenario.",
  });

  useEffect(() => {
    capture.init();
    const timer = window.setTimeout(() => {
      setPayload(
        capture.getPayload({
          sourceApp: "demo",
          title: INITIAL_TITLE,
          description: INITIAL_DESCRIPTION,
          release: "demo-local",
          environment: "development",
          context: {
            scenario: "initial",
            testerEmail: "demo.user@example.com",
            password: "synthetic-password",
          },
        }),
      );
    }, 0);

    return () => {
      window.clearTimeout(timer);
      capture.destroy();
    };
  }, [capture]);

  useEffect(() => {
    if (
      isLiveApiMode ||
      !receipt ||
      !simulationIsPlaying ||
      simulationStep < 0 ||
      simulationStep >= simulationStages.length - 1
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setSimulationStep((current) => current + 1),
      1150,
    );
    return () => window.clearTimeout(timer);
  }, [receipt, simulationIsPlaying, simulationStep]);

  const refreshPayload = () => {
    const nextPayload = capture.getPayload({
      sourceApp: "demo",
      title,
      description,
      release: "demo-local",
      environment: "development",
      context: {
        scenario: "interactive",
        testerEmail: "demo.user@example.com",
        password: "synthetic-password",
      },
    });
    setPayload(nextPayload);
    return nextPayload;
  };

  const runConsoleScenario = () => {
    console.warn("[Ventus demo] Synthetic payment warning", {
      requestId: "req_demo_42",
      status: 409,
    });
    setRunState({
      tone: "success",
      message: "A synthetic console warning was captured.",
    });
    window.setTimeout(refreshPayload, 0);
  };

  const runCircularScenario = () => {
    const circular: { name: string; self?: unknown } = {
      name: "synthetic circular object",
    };
    circular.self = circular;
    console.log("[Ventus demo] Circular serialization", circular);
    setRunState({
      tone: "success",
      message: "A circular object was serialized without breaking capture.",
    });
    window.setTimeout(refreshPayload, 0);
  };

  const runErrorScenario = () => {
    const error = new Error("Synthetic checkout failure");
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: error.message,
        filename: "feedback-demo.tsx",
        lineno: 42,
        colno: 7,
        error,
      }),
    );
    setRunState({
      tone: "success",
      message: "A synthetic browser error was captured.",
    });
    window.setTimeout(refreshPayload, 0);
  };

  const runUnhandledRejectionScenario = () => {
    const rejectionEvent = new Event("unhandledrejection");
    Object.assign(rejectionEvent, {
      reason: new Error(
        "Synthetic rejection for demo.user@example.com token=rejection-secret",
      ),
    });
    window.dispatchEvent(rejectionEvent);
    setRunState({
      tone: "success",
      message: "A synthetic unhandled rejection was captured and redacted.",
    });
    window.setTimeout(refreshPayload, 0);
  };

  const runPrivacyScenario = () => {
    console.warn("[Ventus demo] Synthetic private values", {
      email: "demo.user@example.com",
      password: "do-not-ship-this",
      authorization: "Bearer synthetic-live-token",
      card: "4111 1111 1111 1111",
    });
    setRunState({
      tone: "success",
      message:
        "Synthetic email, password, token, and card values were redacted.",
    });
    window.setTimeout(refreshPayload, 0);
  };

  const runNetworkScenario = async () => {
    if (isPublicShowcaseMode) {
      capture.recordNetworkFailure({
        method: "POST",
        url: "https://api.example.test/checkout?token=network-secret&scenario=checkout",
        status: 503,
        durationMs: 184,
      });
    } else {
      await fetch(
        "/api/synthetic-failure?token=network-secret&scenario=checkout",
      );
    }
    setRunState({
      tone: "success",
      message: "A failed request was captured without its secret query value.",
    });
    refreshPayload();
  };

  const toggleCapture = () => {
    if (capture.isInitialized()) {
      capture.destroy();
      setIsCaptureActive(false);
      setRunState({
        tone: "warning",
        message: "Capture is stopped and host functions have been restored.",
      });
    } else {
      capture.init();
      setIsCaptureActive(true);
      setRunState({
        tone: "success",
        message:
          "Capture restarted without stacking duplicate instrumentation.",
      });
    }
  };

  const clearCapture = () => {
    capture.clear();
    refreshPayload();
    setRunState({
      tone: "idle",
      message: "Buffered diagnostics were cleared.",
    });
  };

  const testScreenshotCapture = async () => {
    try {
      await capture.captureViewportScreenshotBlob();
      setRunState({
        tone: "success",
        message: "Screenshot capture completed.",
      });
    } catch (error) {
      setRunState({
        tone: "warning",
        message:
          error instanceof Error
            ? error.message
            : "Screenshot capture failed as expected.",
      });
    }
  };

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setReceipt(null);

    try {
      const nextPayload = refreshPayload();
      const nextReceipt = await demoFeedbackTransport.submit(
        createFeedbackSubmission({ payload: nextPayload }),
      );
      setReceipt(nextReceipt);
      if (!isLiveApiMode) {
        setSimulationStep(0);
        setSimulationIsPlaying(true);
      }
      setRunState({
        tone: "success",
        message: isLiveApiMode
          ? `Saved ${nextReceipt.id} to the local API. It is ready for an agent to claim.`
          : "Simulation started. Nothing was uploaded or saved.",
      });
    } catch (error) {
      setRunState({
        tone: "warning",
        message:
          error instanceof Error
            ? error.message
            : "The feedback submission failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetSimulation = () => {
    setReceipt(null);
    setSimulationStep(-1);
    setSimulationIsPlaying(true);
    setRunState({
      tone: "idle",
      message: "Simulation reset. Nothing from the previous run was retained.",
    });
  };

  const reopenSimulation = () => {
    setSimulationStep(2);
    setSimulationIsPlaying(true);
    setRunState({
      tone: "success",
      message: "The synthetic report was reopened with new evidence.",
    });
  };

  return (
    <main className="lab-shell">
      {!isLiveApiMode ? (
        <aside className="simulation-notice" role="note">
          <strong>Interactive simulation</strong>
          <span>
            Nothing is uploaded or saved. In a real installation, this report is
            stored in your self-hosted backend and becomes available to your
            coding agent through MCP.
          </span>
        </aside>
      ) : null}
      <header className="lab-header">
        <div className="brand-mark" aria-hidden="true">
          VF
        </div>
        <div>
          <p className="eyebrow">Ventus In-App Feedback</p>
          <h1>Capture Lab</h1>
        </div>
        <span className={`phase-badge ${isLiveApiMode ? "live" : "mock"}`}>
          {isLiveApiMode ? "Live API · 0.1" : "Simulation · 0.1"}
        </span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div>
          <p className="eyebrow">
            {isLiveApiMode
              ? "In-repo dogfood environment"
              : "Reporter-to-agent showcase"}
          </p>
          <h2 id="hero-title">
            {isLiveApiMode
              ? "Break things here before customers do."
              : "Turn customer feedback into agent-ready work."}
          </h2>
          <p className="hero-copy">
            This playground consumes the browser SDK through its public package
            export. Run a synthetic failure, inspect the captured payload, and{" "}
            {isLiveApiMode
              ? "send it through the real self-hosted API."
              : "see how your self-hosted backend and coding agent would carry it from submission to verified closure."}
          </p>
        </div>
        <div className="signal-card" aria-label="Current package boundary">
          <span>Consumer</span>
          <strong>@ventus-software-solutions/feedback-demo</strong>
          <i aria-hidden="true">↓</i>
          <span>Public package</span>
          <strong>@ventus-software-solutions/feedback-browser</strong>
          <i aria-hidden="true">↓</i>
          <span>{isLiveApiMode ? "Connected API" : "Transport"}</span>
          <strong>
            {isLiveApiMode ? feedbackEndpoint : "In-memory simulation"}
          </strong>
        </div>
      </section>

      <div className="lab-grid">
        <section
          className="panel scenario-panel"
          aria-labelledby="scenario-title"
        >
          <div className="panel-heading">
            <div>
              <p className="step">01 · Generate evidence</p>
              <h3 id="scenario-title">Synthetic scenarios</h3>
            </div>
            <span className={`run-state ${runState.tone}`}>
              {runState.message}
            </span>
          </div>

          <div className="scenario-grid">
            <button type="button" onClick={runConsoleScenario}>
              <span className="scenario-index">A</span>
              <span>
                <strong>Console warning</strong>
                <small>Structured 409 response</small>
              </span>
            </button>
            <button type="button" onClick={runCircularScenario}>
              <span className="scenario-index">B</span>
              <span>
                <strong>Circular value</strong>
                <small>Safe serialization guard</small>
              </span>
            </button>
            <button type="button" onClick={runErrorScenario}>
              <span className="scenario-index">C</span>
              <span>
                <strong>Browser error</strong>
                <small>Window error listener</small>
              </span>
            </button>
            <button type="button" onClick={runUnhandledRejectionScenario}>
              <span className="scenario-index">D</span>
              <span>
                <strong>Promise rejection</strong>
                <small>Unhandled rejection listener</small>
              </span>
            </button>
            <button type="button" onClick={runPrivacyScenario}>
              <span className="scenario-index">E</span>
              <span>
                <strong>Private values</strong>
                <small>Default redaction rules</small>
              </span>
            </button>
            <button type="button" onClick={runNetworkScenario}>
              <span className="scenario-index">F</span>
              <span>
                <strong>Failed request</strong>
                <small>Sanitized URL and status</small>
              </span>
            </button>
            <button type="button" onClick={testScreenshotCapture}>
              <span className="scenario-index">G</span>
              <span>
                <strong>Viewport screenshot</strong>
                <small>Masked browser capture</small>
              </span>
            </button>
          </div>

          <form className="feedback-form" onSubmit={submitFeedback}>
            <label>
              Report title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              What happened?
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
              />
            </label>
            <label>
              Synthetic sensitive field
              <input
                type="password"
                data-feedback-mask
                value="screenshot-mask-test"
                readOnly
                aria-describedby="sensitive-field-note"
              />
              <small id="sensitive-field-note">
                This field is marked for masking in cloned screenshot content.
              </small>
            </label>
            <div className="form-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={toggleCapture}
              >
                {isCaptureActive ? "Stop capture" : "Restart capture"}
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={clearCapture}
              >
                Clear buffers
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={refreshPayload}
              >
                Refresh payload
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={isSubmitting || !description.trim()}
              >
                {isSubmitting
                  ? "Sending…"
                  : isLiveApiMode
                    ? "Send to local API"
                    : "Simulate submission"}
              </button>
            </div>
          </form>

          {receipt ? (
            <div className="receipt" role="status">
              <span>{isLiveApiMode ? "Saved to API" : "Synthetic report"}</span>
              <code>{receipt.id}</code>
              <time dateTime={receipt.createdAt}>
                {new Date(receipt.createdAt).toLocaleTimeString()}
              </time>
            </div>
          ) : null}
        </section>

        <section
          className="panel payload-panel"
          aria-labelledby="payload-title"
        >
          <div className="panel-heading payload-heading">
            <div>
              <p className="step">02 · Inspect contract</p>
              <h3 id="payload-title">Captured payload</h3>
            </div>
            <span className="live-dot">Live snapshot</span>
          </div>
          <div className="privacy-note">
            <strong>Privacy guard active</strong>
            <span>
              Emails, sensitive keys, bearer tokens, card-like numbers, URL
              secrets, and marked screenshot fields are redacted. Keep using
              synthetic data while coverage expands.
            </span>
          </div>
          <pre tabIndex={0}>
            {payload ? formatPayload(payload) : "Initializing capture…"}
          </pre>
        </section>
      </div>

      {!isLiveApiMode ? (
        <section
          className="panel workflow-panel"
          aria-labelledby="workflow-title"
        >
          <div className="panel-heading">
            <div>
              <p className="step">03 · Follow the work</p>
              <h3 id="workflow-title">From backend record to verified fix</h3>
            </div>
            <span className="simulation-pill">Simulation · no upload</span>
          </div>
          <div className="workflow-grid">
            <div className="backend-record">
              <span className="record-label">
                Your self-hosted backend would store
              </span>
              <pre tabIndex={0}>
                {receipt
                  ? formatPayload({
                      id: receipt.id,
                      status:
                        simulationStages[Math.max(0, simulationStep)]?.status ??
                        "new",
                      category: "bug",
                      title,
                      description,
                      sourceApp: payload?.sourceApp ?? "demo",
                      diagnostics: {
                        errors: payload?.errors.length ?? 0,
                        networkFailures: payload?.networkErrors.length ?? 0,
                        breadcrumbs: payload?.breadcrumbs.length ?? 0,
                      },
                      persisted: false,
                      simulation: true,
                    })
                  : "Submit through the form or widget to create a synthetic record."}
              </pre>
            </div>
            <ol className="agent-timeline" aria-live="polite">
              {simulationStages.map((stage, index) => (
                <li
                  className={
                    index < simulationStep
                      ? "complete"
                      : index === simulationStep
                        ? "active"
                        : "pending"
                  }
                  key={stage.operation}
                >
                  <span className="timeline-index">{index + 1}</span>
                  <div>
                    <strong>{stage.label}</strong>
                    <code>{stage.operation}</code>
                    <p>{stage.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="workflow-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={
                !receipt || simulationStep >= simulationStages.length - 1
              }
              onClick={() => setSimulationIsPlaying((current) => !current)}
            >
              {simulationIsPlaying ? "Pause" : "Continue"}
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={
                !receipt || simulationStep >= simulationStages.length - 1
              }
              onClick={() => {
                setSimulationIsPlaying(false);
                setSimulationStep((current) =>
                  Math.min(current + 1, simulationStages.length - 1),
                );
              }}
            >
              Next step
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={simulationStep !== simulationStages.length - 1}
              onClick={reopenSimulation}
            >
              Reopen report
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={resetSimulation}
            >
              Reset
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="widget-dogfood-title">
        <div className="panel-heading">
          <div>
            <p className="step">
              {isLiveApiMode ? "03" : "04"} · Try the public UI
            </p>
            <h3 id="widget-dogfood-title">Framework-neutral widget</h3>
          </div>
          <span className="live-dot">Web Component</span>
        </div>
        <p>
          Use the fixed feedback trigger on the right edge to exercise the
          published widget package. In live mode, the resulting stable feedback
          ID is stored in PostgreSQL and is immediately available to agents.
        </p>
        <FeedbackWidget<DemoContext>
          sourceApp="demo-widget"
          release="demo-local"
          environment="development"
          theme="auto"
          transport={demoFeedbackTransport}
          captureOptions={{
            storeKey: "__ventusWidgetDemoCapture",
            diagnostics: {
              console: true,
              errors: true,
              network: true,
              breadcrumbs: true,
              browser: true,
              performance: true,
            },
            redaction: { allowedQueryParameters: ["scenario"] },
            screenshot: {
              maskSelectors: ["input[type='password']", "[data-feedback-mask]"],
            },
            loadHtml2Canvas,
          }}
          context={() => ({
            scenario: "widget-dogfood",
            testerEmail: "demo.user@example.com",
            password: "synthetic-password",
          })}
          onSuccess={({ receipt: widgetReceipt }) => {
            setReceipt(widgetReceipt);
            setRunState({
              tone: "success",
              message: isLiveApiMode
                ? `Saved ${widgetReceipt.id} to the local API. It is ready for an agent to claim.`
                : "Simulation started from the widget. Nothing was uploaded or saved.",
            });
            if (!isLiveApiMode) {
              setSimulationStep(0);
              setSimulationIsPlaying(true);
            }
          }}
          onError={({ error }) =>
            setRunState({
              tone: "warning",
              message:
                error instanceof Error
                  ? error.message
                  : "The widget submission failed.",
            })
          }
        />
      </section>

      {!isLiveApiMode ? (
        <section className="install-panel" aria-labelledby="install-title">
          <div>
            <p className="step">Ready for the real workflow?</p>
            <h3 id="install-title">Start locally with one command.</h3>
            <p>
              Run the self-hosted API, PostgreSQL, object storage, and this demo
              together. Your reports stay in infrastructure you control.
            </p>
          </div>
          <code>docker compose up</code>
          <nav aria-label="Project resources">
            <a href="https://github.com/ventus-software-solutions/ventus-inapp-feedback#local-development">
              Installation
            </a>
            <a href="https://github.com/ventus-software-solutions/ventus-inapp-feedback/tree/main/apps/mcp-server#readme">
              Agent and MCP guide
            </a>
            <a href="https://github.com/ventus-software-solutions/ventus-inapp-feedback#licensing">
              Licensing
            </a>
            <a href="https://www.npmjs.com/org/ventus-software-solutions">
              npm packages
            </a>
          </nav>
        </section>
      ) : null}

      <footer>
        <span>
          {isLiveApiMode ? "Local dogfood surface" : "Browser-only simulation"}
        </span>
        <span>
          {isLiveApiMode
            ? "Capture core + self-hosted API + agent queue"
            : "No account · no backend · no uploaded data"}
        </span>
        <a href="https://github.com/ventus-software-solutions/ventus-inapp-feedback#local-development">
          Run the real stack locally
        </a>
      </footer>
    </main>
  );
}
