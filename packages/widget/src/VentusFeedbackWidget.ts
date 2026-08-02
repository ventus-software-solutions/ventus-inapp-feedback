import {
  compositeFeedbackAnnotations,
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
  drawFeedbackAnnotationShape,
  measureFeedbackAnnotationText,
  type FeedbackAnnotationPoint,
  type FeedbackAnnotationShape,
  type FeedbackAnnotationTool,
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
const ANNOTATION_COLOR = "#dc2626";
const ANNOTATION_TOOLS: readonly FeedbackAnnotationTool[] = [
  "freehand",
  "line",
  "rectangle",
  "ellipse",
  "arrow",
  "text",
];
const ANNOTATION_TOOL_ICONS: Record<FeedbackAnnotationTool, string> = {
  freehand: "✎",
  line: "╱",
  rectangle: "▭",
  ellipse: "◯",
  arrow: "↗",
  text: "T",
};
const ANNOTATION_ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
] as const;

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
    editImage: "Draw on image",
    remove: "Remove attachment",
    editorTitle: "Draw on screenshot",
    freehand: "Freehand",
    line: "Line",
    rectangle: "Rectangle",
    ellipse: "Ellipse",
    arrow: "Arrow",
    text: "Text",
    undo: "Undo",
    clear: "Clear all",
    zoomOut: "Zoom out",
    zoomReset: "Reset zoom",
    zoomIn: "Zoom in",
    apply: "Apply",
    textPlaceholder: "Enter text… (Ctrl/Cmd+Enter to save)",
    editorHint:
      "Draw directly on the image. Text labels can be moved after placement.",
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
    editImage: "Bild markieren",
    remove: "Anhang entfernen",
    editorTitle: "Screenshot markieren",
    freehand: "Freihand",
    line: "Linie",
    rectangle: "Rechteck",
    ellipse: "Ellipse",
    arrow: "Pfeil",
    text: "Text",
    undo: "Rückgängig",
    clear: "Alle löschen",
    zoomOut: "Verkleinern",
    zoomReset: "Zoom zurücksetzen",
    zoomIn: "Vergrößern",
    apply: "Übernehmen",
    textPlaceholder: "Text eingeben… (Strg/Cmd+Enter zum Speichern)",
    editorHint:
      "Zeichne direkt auf das Bild. Textfelder lassen sich nach dem Platzieren verschieben.",
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
  #editorImageUrl: string | null = null;
  #annotationShapes: FeedbackAnnotationShape[] = [];
  #editorInitialShapes: FeedbackAnnotationShape[] = [];
  #currentShape: FeedbackAnnotationShape | null = null;
  #annotationTool: FeedbackAnnotationTool = "freehand";
  #annotationZoom = 1;
  #draggingText: { index: number; offsetX: number; offsetY: number } | null =
    null;
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
    this.shadowRoot.addEventListener("pointerdown", this.handlePointerDown);
    this.shadowRoot.addEventListener("pointermove", this.handlePointerMove);
    this.shadowRoot.addEventListener("pointerup", this.handlePointerUp);
    this.shadowRoot.addEventListener("pointercancel", this.handlePointerUp);
    this.shadowRoot.addEventListener("keydown", this.handleKeyDown);
    this.shadowRoot.addEventListener("focusout", this.handleFocusOut);
    this.dialog?.addEventListener("cancel", this.handleDialogCancel);
    this.editorDialog?.addEventListener("cancel", this.handleEditorCancel);
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    if (!this.#externalCapture) this.#capture?.destroy();
    this.releaseAttachment();
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot?.removeEventListener("change", this.handleChange);
    this.shadowRoot?.removeEventListener("pointerdown", this.handlePointerDown);
    this.shadowRoot?.removeEventListener("pointermove", this.handlePointerMove);
    this.shadowRoot?.removeEventListener("pointerup", this.handlePointerUp);
    this.shadowRoot?.removeEventListener("pointercancel", this.handlePointerUp);
    this.shadowRoot?.removeEventListener("keydown", this.handleKeyDown);
    this.shadowRoot?.removeEventListener("focusout", this.handleFocusOut);
    this.dialog?.removeEventListener("cancel", this.handleDialogCancel);
    this.editorDialog?.removeEventListener("cancel", this.handleEditorCancel);
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

  private get editorDialog(): HTMLDialogElement | null {
    return this.shadowRoot?.querySelector("dialog.annotation-editor") ?? null;
  }

  private get annotationCanvas(): HTMLCanvasElement | null {
    return this.shadowRoot?.querySelector("canvas.annotation-canvas") ?? null;
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
    if (action === "edit-attachment") this.openAnnotationEditor();
    if (action === "remove-attachment") this.releaseAttachment();
    if (action === "annotation-cancel") this.closeAnnotationEditor(false);
    if (action === "annotation-apply") void this.applyAnnotations();
    if (action === "annotation-undo") {
      this.#annotationShapes.pop();
      this.drawAnnotations();
      this.updateAnnotationControls();
    }
    if (action === "annotation-clear") {
      this.#annotationShapes = [];
      this.#currentShape = null;
      this.drawAnnotations();
      this.updateAnnotationControls();
    }
    if (action === "annotation-tool") {
      const nextTool = element?.closest<HTMLElement>("[data-tool]")?.dataset
        .tool as FeedbackAnnotationTool | undefined;
      if (nextTool && ANNOTATION_TOOLS.includes(nextTool)) {
        this.commitAnnotationText();
        this.#annotationTool = nextTool;
        this.updateAnnotationControls();
      }
    }
    if (action === "annotation-zoom-out") this.changeAnnotationZoom(-1);
    if (action === "annotation-zoom-reset") this.setAnnotationZoom(1);
    if (action === "annotation-zoom-in") this.changeAnnotationZoom(1);
  };

  private handleDialogCancel = (event: Event): void => {
    event.preventDefault();
    this.close("cancel");
  };

  private handleEditorCancel = (event: Event): void => {
    event.preventDefault();
    this.closeAnnotationEditor(false);
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

  private annotationPoint(event: PointerEvent): FeedbackAnnotationPoint | null {
    const canvas = this.annotationCanvas;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  private hitTestAnnotationText(point: FeedbackAnnotationPoint): number {
    const context = this.annotationCanvas?.getContext("2d");
    if (!context) return -1;
    for (
      let index = this.#annotationShapes.length - 1;
      index >= 0;
      index -= 1
    ) {
      const shape = this.#annotationShapes[index];
      if (!shape || shape.tool !== "text") continue;
      const bounds = measureFeedbackAnnotationText(context, shape);
      if (
        bounds &&
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      )
        return index;
    }
    return -1;
  }

  private handlePointerDown = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    const canvas = event.target;
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !canvas.classList.contains("annotation-canvas")
    )
      return;
    const point = this.annotationPoint(event);
    if (!point) return;
    event.preventDefault();

    if (this.#annotationTool === "text") {
      const index = this.hitTestAnnotationText(point);
      if (index >= 0) {
        this.commitAnnotationText();
        const anchor = this.#annotationShapes[index]?.points[0];
        if (!anchor) return;
        this.#draggingText = {
          index,
          offsetX: point.x - anchor.x,
          offsetY: point.y - anchor.y,
        };
        canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      this.openAnnotationTextInput(point);
      return;
    }

    this.#currentShape = {
      tool: this.#annotationTool,
      points:
        this.#annotationTool === "freehand" ? [point] : [point, { ...point }],
      color: ANNOTATION_COLOR,
    };
    canvas.setPointerCapture?.(event.pointerId);
  };

  private handlePointerMove = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    const canvas = event.target;
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !canvas.classList.contains("annotation-canvas")
    )
      return;
    const point = this.annotationPoint(event);
    if (!point) return;

    if (this.#draggingText) {
      const shape = this.#annotationShapes[this.#draggingText.index];
      if (!shape) return;
      shape.points = [
        {
          x: point.x - this.#draggingText.offsetX,
          y: point.y - this.#draggingText.offsetY,
        },
      ];
      this.drawAnnotations();
      return;
    }
    if (!this.#currentShape) return;
    if (this.#currentShape.tool === "freehand") {
      this.#currentShape.points.push(point);
    } else {
      this.#currentShape.points[1] = point;
    }
    this.drawAnnotations();
  };

  private handlePointerUp = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    const canvas = event.target;
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !canvas.classList.contains("annotation-canvas")
    )
      return;
    if (this.#draggingText) {
      this.#draggingText = null;
      return;
    }
    const shape = this.#currentShape;
    if (!shape) return;
    const start = shape.points[0];
    const end = shape.points[1];
    const meaningful =
      shape.tool === "freehand"
        ? shape.points.length >= 2
        : Boolean(
            start && end && (end.x - start.x) ** 2 + (end.y - start.y) ** 2 > 9,
          );
    if (meaningful) this.#annotationShapes.push(shape);
    this.#currentShape = null;
    this.drawAnnotations();
    this.updateAnnotationControls();
  };

  private handleKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !this.editorDialog?.open) return;
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (
      event.target === input &&
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      this.commitAnnotationText();
      return;
    }
    if (event.key !== "Escape") return;
    if (input && !input.hidden) {
      input.hidden = true;
      input.value = "";
      event.preventDefault();
      event.stopPropagation();
    } else if (this.#currentShape) {
      this.#currentShape = null;
      this.drawAnnotations();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private handleFocusOut = (event: Event): void => {
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (input && event.target === input && !input.hidden)
      this.commitAnnotationText();
  };

  private openAnnotationTextInput(point: FeedbackAnnotationPoint): void {
    this.commitAnnotationText();
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (!input) return;
    input.dataset.x = String(point.x);
    input.dataset.y = String(point.y);
    input.style.left = `${point.x * this.#annotationZoom}px`;
    input.style.top = `${point.y * this.#annotationZoom}px`;
    input.value = "";
    input.hidden = false;
    queueMicrotask(() => input.focus());
  }

  private commitAnnotationText(): void {
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (!input || input.hidden) return;
    const text = input.value.trim();
    const x = Number(input.dataset.x);
    const y = Number(input.dataset.y);
    if (text && Number.isFinite(x) && Number.isFinite(y)) {
      this.#annotationShapes.push({
        tool: "text",
        points: [{ x, y }],
        color: ANNOTATION_COLOR,
        text,
      });
    }
    input.hidden = true;
    input.value = "";
    this.drawAnnotations();
    this.updateAnnotationControls();
  }

  private openAnnotationEditor(): void {
    if (!this.#attachment?.mediaType.startsWith("image/")) return;
    const editor = this.editorDialog;
    const image =
      this.shadowRoot?.querySelector<HTMLImageElement>(".annotation-image");
    if (!editor || !image) return;
    this.#editorInitialShapes = structuredClone(this.#annotationShapes);
    this.#annotationTool = "freehand";
    this.#annotationZoom = 1;
    if (this.#editorImageUrl) URL.revokeObjectURL(this.#editorImageUrl);
    this.#editorImageUrl = URL.createObjectURL(this.#attachment.data);
    image.onload = () => this.initializeAnnotationCanvas(image);
    image.src = this.#editorImageUrl;
    if (typeof editor.showModal === "function") editor.showModal();
    else editor.setAttribute("open", "");
    this.updateAnnotationControls();
  }

  private initializeAnnotationCanvas(image: HTMLImageElement): void {
    const canvas = this.annotationCanvas;
    if (!canvas || !image.naturalWidth || !image.naturalHeight) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    this.setAnnotationZoom(this.#annotationZoom);
    this.drawAnnotations();
  }

  private drawAnnotations(): void {
    const canvas = this.annotationCanvas;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const shape of this.#annotationShapes)
      drawFeedbackAnnotationShape(context, shape);
    if (this.#currentShape)
      drawFeedbackAnnotationShape(context, this.#currentShape);
  }

  private updateAnnotationControls(): void {
    this.shadowRoot
      ?.querySelectorAll<HTMLButtonElement>("[data-action='annotation-tool']")
      .forEach((button) => {
        const active = button.dataset.tool === this.#annotationTool;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      });
    const undo = this.shadowRoot?.querySelector<HTMLButtonElement>(
      "[data-action='annotation-undo']",
    );
    const clear = this.shadowRoot?.querySelector<HTMLButtonElement>(
      "[data-action='annotation-clear']",
    );
    if (undo) undo.disabled = this.#annotationShapes.length === 0;
    if (clear)
      clear.disabled =
        this.#annotationShapes.length === 0 && !this.#currentShape;
    const zoom = this.shadowRoot?.querySelector<HTMLElement>(
      "[data-annotation-zoom]",
    );
    if (zoom) zoom.textContent = `${Math.round(this.#annotationZoom * 100)}%`;
  }

  private setAnnotationZoom(zoom: number): void {
    this.#annotationZoom = zoom;
    const canvas = this.annotationCanvas;
    const image =
      this.shadowRoot?.querySelector<HTMLImageElement>(".annotation-image");
    const stage =
      this.shadowRoot?.querySelector<HTMLElement>(".annotation-stage");
    if (canvas && image && stage && canvas.width && canvas.height) {
      const width = canvas.width * zoom;
      const height = canvas.height * zoom;
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.updateAnnotationControls();
  }

  private changeAnnotationZoom(direction: -1 | 1): void {
    const currentIndex = ANNOTATION_ZOOM_STEPS.indexOf(
      this.#annotationZoom as (typeof ANNOTATION_ZOOM_STEPS)[number],
    );
    const index = currentIndex < 0 ? 5 : currentIndex;
    const next = ANNOTATION_ZOOM_STEPS[index + direction];
    if (next) this.setAnnotationZoom(next);
  }

  private closeAnnotationEditor(applied: boolean): void {
    if (!applied)
      this.#annotationShapes = structuredClone(this.#editorInitialShapes);
    const editor = this.editorDialog;
    if (editor?.open) {
      if (typeof editor.close === "function") editor.close();
      else editor.removeAttribute("open");
    }
    if (this.#editorImageUrl) URL.revokeObjectURL(this.#editorImageUrl);
    this.#editorImageUrl = null;
    this.#currentShape = null;
    this.#draggingText = null;
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (input) {
      input.hidden = true;
      input.value = "";
    }
  }

  private async applyAnnotations(): Promise<void> {
    this.commitAnnotationText();
    this.closeAnnotationEditor(true);
    await this.refreshAttachmentPreview();
  }

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
      const attachment = await this.prepareAttachmentForSubmission();
      const submission = createFeedbackSubmission({
        payload,
        attachments: attachment ? [attachment] : [],
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
    this.#annotationShapes = [];
    this.setAttachmentPreview(attachment.data);
    const preview = this.shadowRoot?.querySelector<HTMLElement>(".preview");
    const image = preview?.querySelector("img");
    const name = preview?.querySelector<HTMLElement>("[data-attachment-name]");
    const edit = preview?.querySelector<HTMLButtonElement>(
      "[data-action='edit-attachment']",
    );
    if (preview) preview.dataset.visible = "true";
    if (image) {
      if (attachment.mediaType.startsWith("image/")) {
        image.src = this.#attachmentUrl ?? "";
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
      }
    }
    if (edit) edit.hidden = !attachment.mediaType.startsWith("image/");
    if (name)
      name.textContent = `${attachment.fileName} · ${attachment.size.toLocaleString()} bytes`;
  }

  private setAttachmentPreview(blob: Blob): void {
    if (this.#attachmentUrl) URL.revokeObjectURL(this.#attachmentUrl);
    this.#attachmentUrl = URL.createObjectURL(blob);
  }

  private async refreshAttachmentPreview(): Promise<void> {
    if (!this.#attachment || !this.#attachment.mediaType.startsWith("image/"))
      return;
    const previewBlob = await compositeFeedbackAnnotations(
      this.#attachment.data,
      this.#annotationShapes,
    );
    this.setAttachmentPreview(previewBlob);
    const image =
      this.shadowRoot?.querySelector<HTMLImageElement>(".preview img");
    if (image) image.src = this.#attachmentUrl ?? "";
  }

  private async prepareAttachmentForSubmission(): Promise<FeedbackAttachment | null> {
    if (!this.#attachment) return null;
    if (
      !this.#attachment.mediaType.startsWith("image/") ||
      this.#annotationShapes.length === 0
    )
      return this.#attachment;
    const data = await compositeFeedbackAnnotations(
      this.#attachment.data,
      this.#annotationShapes,
    );
    return {
      ...this.#attachment,
      fileName: this.#attachment.fileName.replace(/\.[^.]+$/, "") + ".png",
      mediaType: "image/png",
      size: data.size,
      data,
    };
  }

  private releaseAttachment(): void {
    this.closeAnnotationEditor(false);
    if (this.#attachmentUrl) URL.revokeObjectURL(this.#attachmentUrl);
    this.#attachment = null;
    this.#attachmentUrl = null;
    this.#annotationShapes = [];
    this.#editorInitialShapes = [];
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
      editImage: translation.editImage,
      remove: translation.remove,
      editorTitle: translation.editorTitle,
      editorHint: translation.editorHint,
      freehand: translation.freehand,
      line: translation.line,
      rectangle: translation.rectangle,
      ellipse: translation.ellipse,
      arrow: translation.arrow,
      text: translation.text,
      undo: translation.undo,
      clear: translation.clear,
      apply: translation.apply,
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
    if (this.editorDialog) this.editorDialog.lang = this.locale();
    this.shadowRoot
      ?.querySelectorAll<HTMLElement>(
        "[data-action='close'][aria-label], [data-action='annotation-cancel'][aria-label]",
      )
      .forEach((element) =>
        element.setAttribute("aria-label", translation.cancel),
      );
    const textInput = this.shadowRoot?.querySelector<HTMLTextAreaElement>(
      ".annotation-text-input",
    );
    if (textInput) textInput.placeholder = translation.textPlaceholder;
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
          <div class="preview" data-visible="false"><img alt="Attachment preview"><span data-attachment-name></span><div class="preview-actions"><button type="button" data-action="edit-attachment" data-label="editImage" hidden>${t.editImage}</button><button type="button" data-action="remove-attachment" data-label="remove">${t.remove}</button></div></div>
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
      </dialog>
      <dialog class="annotation-editor ventus-feedback-ignore" lang="${this.locale()}" aria-labelledby="ventus-annotation-title">
        <section class="annotation-panel">
          <header class="annotation-heading"><div><h2 id="ventus-annotation-title" data-label="editorTitle">${t.editorTitle}</h2><p class="hint" data-label="editorHint">${t.editorHint}</p></div><button class="close" type="button" data-action="annotation-cancel" aria-label="${t.cancel}">×</button></header>
          <div class="annotation-toolbar" role="toolbar" aria-label="${t.editorTitle}">
            <div class="annotation-tools">${ANNOTATION_TOOLS.map((tool) => `<button type="button" data-action="annotation-tool" data-tool="${tool}" data-active="${tool === "freehand"}" aria-pressed="${tool === "freehand"}" title="${t[tool]}"><span aria-hidden="true">${ANNOTATION_TOOL_ICONS[tool]}</span><span data-label="${tool}">${t[tool]}</span></button>`).join("")}</div>
            <span class="annotation-separator" aria-hidden="true"></span>
            <button type="button" data-action="annotation-undo" data-label="undo" disabled>${t.undo}</button>
            <button type="button" data-action="annotation-clear" data-label="clear" disabled>${t.clear}</button>
            <span class="annotation-separator" aria-hidden="true"></span>
            <button type="button" data-action="annotation-zoom-out" aria-label="${t.zoomOut}" title="${t.zoomOut}">−</button>
            <button type="button" data-action="annotation-zoom-reset" data-annotation-zoom title="${t.zoomReset}">100%</button>
            <button type="button" data-action="annotation-zoom-in" aria-label="${t.zoomIn}" title="${t.zoomIn}">+</button>
          </div>
          <div class="annotation-scroll">
            <div class="annotation-stage">
              <img class="annotation-image" alt="${t.editorTitle}" draggable="false">
              <canvas class="annotation-canvas" aria-label="${t.editorTitle}"></canvas>
              <textarea class="annotation-text-input" rows="2" maxlength="500" placeholder="${t.textPlaceholder}" hidden></textarea>
            </div>
          </div>
          <footer class="annotation-actions"><button type="button" data-action="annotation-cancel" data-label="cancel">${t.cancel}</button><button class="primary" type="button" data-action="annotation-apply" data-label="apply">${t.apply}</button></footer>
        </section>
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
