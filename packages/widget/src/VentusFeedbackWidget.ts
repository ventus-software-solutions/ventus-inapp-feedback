import {
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
  type FeedbackAttachment,
  type FeedbackCaptureCore,
  type FeedbackCaptureCoreOptions,
  type FeedbackCapturePayload,
  type FeedbackCategory,
  type FeedbackReceipt,
  type FeedbackTransport,
} from "@ventus-software-solutions/feedback-browser";
import { widgetStyles } from "./styles.js";
import type {
  VentusFeedbackCaptureMode,
  VentusFeedbackCloseDetail,
  VentusFeedbackErrorDetail,
  VentusFeedbackOpenDetail,
  VentusFeedbackSubmitDetail,
  VentusFeedbackSuccessDetail,
} from "./types.js";

const DEFAULT_TAG_NAME = "ventus-feedback";
const VENTUS_BADGE_LOGO = [
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgNTAiIHdpZHRoPSI4MDAiIGhlaWdodD0iMjAwIj4KICA8IS0tIFZlbnR1cyBwcmltYXJ5IGxvZ28g4oCUIG5lb24gY3lhbiwgZm9yIERBUksgYmFja2dyb3VuZHMgKHdlYnNpdGUsIGRhcmsgVUkpIC0tPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDUsIDkpIj4KICAgIDxyZWN0IHg9IjEiIHk9IjEiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzBhMGEwYSIgc3Ryb2tlPSIjMDBmM2ZmIiBzdHJva2Utd2lkdGg9IjIiLz4KICAgIDxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjMDBmM2ZmIi8+CiAgPC9nPgogIDx0ZXh0IHg9IjUwIiB5PSIzMyIKICAgICAgICBmb250LWZhbWlseT0iJ09yYml0cm9uJywgJ1NlZ29lIFVJJywgQXJpYWwsIHNhbnMtc2VyaWYiCiAgICAgICAgZm9udC13ZWlnaHQ9IjcwMCIKICAgICAgICBmb250LXNpemU9IjI0IgogICAgICAgIGZpbGw9IiMwMGYzZmYiCiAgICAgICAgbGV0dGVyLXNwYWNpbmc9IjQiPlZFTlRVUzwvdGV4dD4KPC9zdmc+Cg==",
].join("");
const VENTUS_BADGE_SUBTITLE = "a software company from Cologne";

const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined"
    ? (class {} as unknown as typeof HTMLElement)
    : HTMLElement;

const copyWithoutExcludedDiagnostics = <TContext>(
  payload: FeedbackCapturePayload<TContext>,
  form: HTMLFormElement,
): FeedbackCapturePayload<TContext> => {
  const included = (name: string): boolean =>
    Boolean(
      (form.elements.namedItem(name) as HTMLInputElement | null)?.checked,
    );
  return {
    ...payload,
    consoleLogs: included("diagnostic-console") ? payload.consoleLogs : [],
    errors: included("diagnostic-errors") ? payload.errors : [],
    networkErrors: included("diagnostic-network") ? payload.networkErrors : [],
    breadcrumbs: included("diagnostic-breadcrumbs") ? payload.breadcrumbs : [],
    browser: included("diagnostic-browser") ? payload.browser : null,
    performance: included("diagnostic-performance")
      ? payload.performance
      : null,
  };
};

const strings = {
  en: {
    trigger: "Feedback",
    title: "Share feedback",
    intro:
      "Describe what happened. You can review optional diagnostics before sending.",
    category: "Type",
    reportTitle: "Short title (optional)",
    description: "What happened?",
    descriptionHint: "Include what you expected and what happened instead.",
    diagnostics: "Include diagnostics",
    errors: "Errors",
    console: "Console",
    network: "Failed requests",
    breadcrumbs: "Recent actions",
    browser: "Browser details",
    performance: "Performance",
    bug: "Bug",
    feedback: "Feedback",
    idea: "Idea",
    screenshot: "Capture screenshot",
    attach: "Attach file",
    remove: "Remove attachment",
    cancel: "Cancel",
    send: "Send feedback",
    capturing: "Capturing screenshot…",
    screenshotReady: "Screenshot ready.",
    screenshotUnavailable: "Screenshot capture is unavailable.",
    screenshotFailed: "Screenshot capture failed.",
    preparing: "Preparing feedback…",
    sending: "Sending feedback…",
    sent: "Feedback sent.",
    submitFailed: "Feedback could not be sent.",
  },
  de: {
    trigger: "Feedback",
    title: "Feedback senden",
    intro:
      "Beschreibe, was passiert ist. Optionale Diagnosedaten können vor dem Senden geprüft werden.",
    category: "Typ",
    reportTitle: "Kurzer Titel (optional)",
    description: "Was ist passiert?",
    descriptionHint: "Beschreibe das erwartete und das tatsächliche Verhalten.",
    diagnostics: "Diagnosedaten mitsenden",
    errors: "Fehler",
    console: "Konsole",
    network: "Fehlgeschlagene Anfragen",
    breadcrumbs: "Letzte Aktionen",
    browser: "Browserdetails",
    performance: "Performance",
    bug: "Fehler",
    feedback: "Feedback",
    idea: "Idee",
    screenshot: "Screenshot aufnehmen",
    attach: "Datei anhängen",
    remove: "Anhang entfernen",
    cancel: "Abbrechen",
    send: "Feedback senden",
    capturing: "Screenshot wird aufgenommen…",
    screenshotReady: "Screenshot ist bereit.",
    screenshotUnavailable: "Die Screenshot-Aufnahme ist nicht verfügbar.",
    screenshotFailed: "Der Screenshot konnte nicht aufgenommen werden.",
    preparing: "Feedback wird vorbereitet…",
    sending: "Feedback wird gesendet…",
    sent: "Feedback wurde gesendet.",
    submitFailed: "Feedback konnte nicht gesendet werden.",
  },
} as const;

export class VentusFeedbackWidget extends HTMLElementBase {
  static readonly observedAttributes = ["locale", "trigger-label"];

  transport: FeedbackTransport<unknown> | undefined;
  captureOptions: FeedbackCaptureCoreOptions<unknown> | undefined;
  context: unknown | (() => unknown) | undefined;

  #capture: FeedbackCaptureCore<unknown> | null = null;
  #externalCapture: FeedbackCaptureCore<unknown> | null = null;
  #abortController: AbortController | null = null;
  #attachment: FeedbackAttachment | null = null;
  #attachmentUrl: string | null = null;
  #isSubmitting = false;
  #mounted = false;
  #lastFocused: HTMLElement | null = null;

  constructor() {
    super();
    if (typeof document !== "undefined") this.attachShadow({ mode: "open" });
  }

  set capture(value: FeedbackCaptureCore<unknown> | undefined) {
    if (this.#capture && !this.#externalCapture) this.#capture.destroy();
    this.#externalCapture = value ?? null;
    this.#capture = value ?? null;
  }

  get capture(): FeedbackCaptureCore<unknown> | undefined {
    return this.#externalCapture ?? undefined;
  }

  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  set endpoint(value: string) {
    if (value) this.setAttribute("endpoint", value);
    else this.removeAttribute("endpoint");
  }

  connectedCallback(): void {
    if (!this.shadowRoot || this.#mounted) return;
    this.#mounted = true;
    this.render();
    this.shadowRoot.addEventListener("click", this.handleClick);
    this.shadowRoot.addEventListener("submit", this.handleSubmit);
    this.shadowRoot.addEventListener("change", this.handleChange);
    this.dialog?.addEventListener("cancel", this.handleDialogCancel);
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    if (!this.#externalCapture) this.#capture?.destroy();
    this.releaseAttachment();
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot?.removeEventListener("change", this.handleChange);
    this.dialog?.removeEventListener("cancel", this.handleDialogCancel);
    this.#mounted = false;
  }

  attributeChangedCallback(): void {
    if (this.#mounted) this.renderLabels();
  }

  open(source: VentusFeedbackOpenDetail["source"] = "programmatic"): void {
    const dialog = this.dialog;
    if (!dialog || dialog.open) return;
    this.#lastFocused = document.activeElement as HTMLElement | null;
    this.ensureCapture().init();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    this.emit<VentusFeedbackOpenDetail>("ventus-feedback-open", { source });
    queueMicrotask(() => this.descriptionInput?.focus());
  }

  close(reason: VentusFeedbackCloseDetail["reason"] = "programmatic"): void {
    const dialog = this.dialog;
    if (!dialog?.open) return;
    this.#abortController?.abort();
    this.#abortController = null;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    this.resetTemporaryState();
    if (!this.#externalCapture) this.#capture?.destroy();
    this.emit<VentusFeedbackCloseDetail>("ventus-feedback-close", { reason });
    this.#lastFocused?.focus();
    this.#lastFocused = null;
  }

  private get dialog(): HTMLDialogElement | null {
    return this.shadowRoot?.querySelector("dialog") ?? null;
  }

  private get form(): HTMLFormElement | null {
    return this.shadowRoot?.querySelector("form") ?? null;
  }

  private get descriptionInput(): HTMLTextAreaElement | null {
    return (
      this.shadowRoot?.querySelector<HTMLTextAreaElement>(
        "textarea[name='description']",
      ) ?? null
    );
  }

  private ensureCapture(): FeedbackCaptureCore<unknown> {
    if (!this.#capture) {
      this.#capture = createFeedbackCaptureCore(this.captureOptions ?? {});
    }
    return this.#capture;
  }

  private resolveContext(): unknown {
    return typeof this.context === "function" ? this.context() : this.context;
  }

  private resolveTransport(): FeedbackTransport<unknown> {
    if (this.transport) return this.transport;
    if (!this.endpoint) {
      throw new Error(
        "Configure the widget endpoint or provide a custom transport.",
      );
    }
    const projectKey = this.getAttribute("project-key");
    return createHttpFeedbackTransport({
      endpoint: this.endpoint,
      credentials: this.hasAttribute("include-credentials")
        ? "include"
        : "same-origin",
      ...(projectKey
        ? { headers: { "x-feedback-project-key": projectKey } }
        : {}),
    });
  }

  private captureMode(): VentusFeedbackCaptureMode {
    const value = this.getAttribute("capture-mode");
    return value === "display" || value === "none" ? value : "viewport";
  }

  private handleClick = (event: Event): void => {
    const path = event.composedPath();
    const element = path.find(
      (item): item is HTMLElement => item instanceof HTMLElement,
    );
    const action =
      element?.closest<HTMLElement>("[data-action]")?.dataset.action;
    const triggerSlot = path.some(
      (item) => item instanceof HTMLSlotElement && item.name === "trigger",
    );
    if (action === "open" || triggerSlot) this.open("trigger");
    if (action === "close") this.close("cancel");
    if (action === "capture") void this.captureScreenshot();
    if (action === "remove-attachment") this.releaseAttachment();
  };

  private handleDialogCancel = (event: Event): void => {
    event.preventDefault();
    this.close("cancel");
  };

  private handleChange = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const file = input.files?.[0];
    if (!file) return;
    this.setAttachment({
      kind: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("text/")
          ? "text"
          : "other",
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
      data: file,
    });
  };

  private handleSubmit = (event: Event): void => {
    event.preventDefault();
    if (event.target === this.form) void this.submit();
  };

  private async captureScreenshot(): Promise<void> {
    if (this.captureMode() === "none") return;
    const t = strings[this.locale()];
    this.setStatus(t.capturing);
    try {
      const capture = this.ensureCapture();
      const blob =
        this.captureMode() === "display"
          ? await capture.captureDisplayMediaScreenshotBlob()
          : await capture.captureViewportScreenshotBlob();
      if (!blob) throw new Error(t.screenshotUnavailable);
      const extension =
        blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/webp"
            ? "webp"
            : "png";
      this.setAttachment({
        kind: "screenshot",
        fileName: `feedback-screenshot.${extension}`,
        mediaType: blob.type || "image/png",
        size: blob.size,
        data: blob,
      });
      this.setStatus(t.screenshotReady);
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : t.screenshotFailed,
        true,
      );
      this.emit<VentusFeedbackErrorDetail>("ventus-feedback-error", { error });
    }
  }

  private async submit(): Promise<void> {
    const form = this.form;
    if (!form || this.#isSubmitting || !form.reportValidity()) return;
    this.#isSubmitting = true;
    this.#abortController = new AbortController();
    this.updateSubmittingState();

    try {
      const t = strings[this.locale()];
      const data = new FormData(form);
      const description = String(data.get("description") ?? "").trim();
      const explicitTitle = String(data.get("title") ?? "").trim();
      const category = String(
        data.get("category") ?? "feedback",
      ) as FeedbackCategory;
      const title =
        explicitTitle ||
        (description.split(/\r?\n/, 1)[0] ?? description).slice(0, 100);
      const sourceApp = this.getAttribute("source-app");
      const release = this.getAttribute("release");
      const environment = this.getAttribute("environment");
      const rawPayload = this.ensureCapture().getPayload({
        ...(sourceApp ? { sourceApp } : {}),
        ...(release ? { release } : {}),
        ...(environment ? { environment } : {}),
        category,
        title,
        description,
        context: this.resolveContext(),
      });
      const payload = copyWithoutExcludedDiagnostics(rawPayload, form);
      const submission = createFeedbackSubmission({
        payload,
        attachments: this.#attachment ? [this.#attachment] : [],
      });
      this.emit<VentusFeedbackSubmitDetail>("ventus-feedback-submit", {
        submission,
      });
      const receipt = await this.resolveTransport().submit(submission, {
        signal: this.#abortController.signal,
        onProgress: ({ phase }) =>
          this.setStatus(
            phase === "preparing"
              ? t.preparing
              : phase === "uploading"
                ? t.sending
                : t.sent,
          ),
      });
      this.emit<VentusFeedbackSuccessDetail<FeedbackReceipt>>(
        "ventus-feedback-success",
        { receipt },
      );
      this.close("success");
    } catch (error) {
      if (this.#abortController?.signal.aborted) return;
      this.setStatus(
        error instanceof Error
          ? error.message
          : strings[this.locale()].submitFailed,
        true,
      );
      this.emit<VentusFeedbackErrorDetail>("ventus-feedback-error", { error });
    } finally {
      this.#isSubmitting = false;
      this.#abortController = null;
      this.updateSubmittingState();
    }
  }

  private setAttachment(attachment: FeedbackAttachment): void {
    this.releaseAttachment();
    this.#attachment = attachment;
    this.#attachmentUrl = URL.createObjectURL(attachment.data);
    const preview = this.shadowRoot?.querySelector<HTMLElement>(".preview");
    const image = preview?.querySelector("img");
    const name = preview?.querySelector<HTMLElement>("[data-attachment-name]");
    if (preview) preview.dataset.visible = "true";
    if (image) {
      if (attachment.mediaType.startsWith("image/")) {
        image.src = this.#attachmentUrl;
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
      }
    }
    if (name)
      name.textContent = `${attachment.fileName} · ${attachment.size.toLocaleString()} bytes`;
  }

  private releaseAttachment(): void {
    if (this.#attachmentUrl) URL.revokeObjectURL(this.#attachmentUrl);
    this.#attachment = null;
    this.#attachmentUrl = null;
    const preview = this.shadowRoot?.querySelector<HTMLElement>(".preview");
    if (preview) preview.dataset.visible = "false";
    const file =
      this.shadowRoot?.querySelector<HTMLInputElement>("input[type='file']");
    if (file) file.value = "";
  }

  private resetTemporaryState(): void {
    this.form?.reset();
    this.releaseAttachment();
    this.#capture?.clear();
    this.setStatus("");
  }

  private updateSubmittingState(): void {
    this.shadowRoot
      ?.querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => {
        if (button.dataset.action !== "open")
          button.disabled = this.#isSubmitting;
      });
  }

  private setStatus(message: string, error = false): void {
    const status = this.shadowRoot?.querySelector<HTMLElement>(".status");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.dataset.tone = error ? "error" : "info";
    status.setAttribute("role", error ? "alert" : "status");
  }

  private emit<T>(name: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent<T>(name, { detail, bubbles: true, composed: true }),
    );
  }

  private locale(): keyof typeof strings {
    return this.getAttribute("locale")?.toLowerCase().startsWith("de")
      ? "de"
      : "en";
  }

  private renderLabels(): void {
    const translation = strings[this.locale()];
    const labels: Record<string, string> = {
      trigger: this.getAttribute("trigger-label") || translation.trigger,
      title: translation.title,
      intro: translation.intro,
      category: translation.category,
      reportTitle: translation.reportTitle,
      description: translation.description,
      descriptionHint: translation.descriptionHint,
      diagnostics: translation.diagnostics,
      errors: translation.errors,
      console: translation.console,
      network: translation.network,
      breadcrumbs: translation.breadcrumbs,
      browser: translation.browser,
      performance: translation.performance,
      bug: translation.bug,
      feedback: translation.feedback,
      idea: translation.idea,
      screenshot: translation.screenshot,
      attach: translation.attach,
      remove: translation.remove,
      cancel: translation.cancel,
      send: translation.send,
    };
    for (const [name, value] of Object.entries(labels)) {
      this.shadowRoot
        ?.querySelectorAll<HTMLElement>(`[data-label='${name}']`)
        .forEach((element) => {
          element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.textContent = value;
          });
        });
    }
    const dialog = this.dialog;
    if (dialog) dialog.lang = this.locale();
    this.shadowRoot
      ?.querySelector<HTMLElement>("[data-action='close'][aria-label]")
      ?.setAttribute("aria-label", translation.cancel);
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const t = strings[this.locale()];
    this.shadowRoot.innerHTML = `
      <style>${widgetStyles}</style>
      <slot name="trigger"><button class="trigger ventus-feedback-ignore" type="button" data-action="open" data-label="trigger">${this.getAttribute("trigger-label") || t.trigger}</button></slot>
      <dialog class="ventus-feedback-ignore" lang="${this.locale()}" aria-labelledby="ventus-feedback-title" aria-describedby="ventus-feedback-intro">
        <form class="panel" method="dialog">
          <header class="heading">
            <div><h2 id="ventus-feedback-title" data-label="title">${t.title}</h2><p class="intro" id="ventus-feedback-intro" data-label="intro">${t.intro}</p></div>
            <button class="close" type="button" data-action="close" aria-label="${t.cancel}">×</button>
          </header>
          <label><span data-label="category">${t.category}</span><select name="category"><option value="bug" data-label="bug">${t.bug}</option><option value="feedback" data-label="feedback" selected>${t.feedback}</option><option value="idea" data-label="idea">${t.idea}</option></select></label>
          <label><span data-label="reportTitle">${t.reportTitle}</span><input name="title" maxlength="140" autocomplete="off"></label>
          <label><span data-label="description">${t.description}</span><textarea name="description" required minlength="10" maxlength="5000"></textarea><small class="hint" data-label="descriptionHint">${t.descriptionHint}</small></label>
          <fieldset><legend data-label="diagnostics">${t.diagnostics}</legend><div class="diagnostics">
            <label data-label="errors"><input type="checkbox" name="diagnostic-errors" checked> ${t.errors}</label>
            <label data-label="console"><input type="checkbox" name="diagnostic-console" checked> ${t.console}</label>
            <label data-label="network"><input type="checkbox" name="diagnostic-network" checked> ${t.network}</label>
            <label data-label="breadcrumbs"><input type="checkbox" name="diagnostic-breadcrumbs" checked> ${t.breadcrumbs}</label>
            <label data-label="browser"><input type="checkbox" name="diagnostic-browser" checked> ${t.browser}</label>
            <label data-label="performance"><input type="checkbox" name="diagnostic-performance" checked> ${t.performance}</label>
          </div></fieldset>
          <div class="attachments">
            <button type="button" data-action="capture" data-label="screenshot">${t.screenshot}</button>
            <label class="file-label" data-label="attach">${t.attach}<input type="file" name="attachment" accept="image/*,text/plain,application/pdf"></label>
          </div>
          <div class="preview" data-visible="false"><img alt="Attachment preview"><span data-attachment-name></span><button type="button" data-action="remove-attachment" data-label="remove">${t.remove}</button></div>
          <p class="status" role="status" aria-live="polite" hidden></p>
          <footer class="form-footer">
            <a class="ventus-badge ventus-feedback-ignore" href="https://ventus.works?utm_source=ventus-inapp-feedback&amp;utm_medium=referral&amp;utm_campaign=badge" target="_blank" rel="noopener" title="Made by Ventus" aria-label="Made by Ventus, ${VENTUS_BADGE_SUBTITLE}">
              <span class="ventus-badge-row">
                <span class="ventus-badge-text">Made by </span>
                <img src="${VENTUS_BADGE_LOGO}" alt="Ventus" class="ventus-badge-icon">
              </span>
              <span class="ventus-badge-sub">${VENTUS_BADGE_SUBTITLE}</span>
            </a>
            <div class="actions"><button type="button" data-action="close" data-label="cancel">${t.cancel}</button><button class="primary" type="submit" data-label="send">${t.send}</button></div>
          </footer>
        </form>
      </dialog>`;
  }
}

export const defineVentusFeedbackWidget = (
  tagName = DEFAULT_TAG_NAME,
): typeof VentusFeedbackWidget => {
  if (typeof customElements !== "undefined" && !customElements.get(tagName)) {
    customElements.define(tagName, VentusFeedbackWidget);
  }
  return VentusFeedbackWidget;
};
