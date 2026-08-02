import { validateFeedbackCapturePayload } from "./schema.js";
import type {
  FeedbackAttachment,
  FeedbackCapturePayload,
  FeedbackHttpTransportOptions,
  FeedbackReceipt,
  FeedbackSubmission,
  FeedbackSubmitOptions,
  FeedbackTransport,
  FeedbackTransportErrorCode,
} from "./types.js";

const DEFAULT_MAX_PAYLOAD_BYTES = 512 * 1024;
const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export class FeedbackTransportError extends Error {
  readonly code: FeedbackTransportErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: FeedbackTransportErrorCode;
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "FeedbackTransportError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

const createIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

export const createFeedbackSubmission = <TContext>(input: {
  payload: FeedbackCapturePayload<TContext>;
  attachments?: FeedbackAttachment[];
  idempotencyKey?: string;
}): FeedbackSubmission<TContext> => ({
  schemaVersion: "1.0",
  idempotencyKey: input.idempotencyKey?.trim() || createIdempotencyKey(),
  payload: input.payload,
  attachments: [...(input.attachments ?? [])],
});

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const validateSubmission = (
  submission: FeedbackSubmission<unknown>,
  limits: {
    maxPayloadBytes: number;
    maxAttachmentBytes: number;
    maxTotalAttachmentBytes: number;
  },
): string => {
  if (submission.schemaVersion !== "1.0")
    return "submission.schemaVersion must equal 1.0";
  if (!submission.idempotencyKey.trim())
    return "submission.idempotencyKey is required";

  const payloadResult = validateFeedbackCapturePayload(submission.payload);
  if (!payloadResult.success) {
    const first = payloadResult.issues[0];
    return `submission.payload is invalid${first ? ` (${first.path}: ${first.message})` : ""}`;
  }
  if (byteLength(JSON.stringify(submission.payload)) > limits.maxPayloadBytes) {
    return `submission.payload exceeds ${limits.maxPayloadBytes} bytes`;
  }

  let totalSize = 0;
  for (const [index, attachment] of submission.attachments.entries()) {
    if (!attachment.fileName.trim())
      return `submission.attachments[${index}].fileName is required`;
    if (!attachment.mediaType.trim())
      return `submission.attachments[${index}].mediaType is required`;
    if (!Number.isFinite(attachment.size) || attachment.size < 0) {
      return `submission.attachments[${index}].size must be a non-negative number`;
    }
    if (typeof Blob === "undefined" || !(attachment.data instanceof Blob)) {
      return `submission.attachments[${index}].data must be a Blob`;
    }
    if (attachment.size !== attachment.data.size) {
      return `submission.attachments[${index}].size does not match its Blob`;
    }
    if (attachment.size > limits.maxAttachmentBytes) {
      return `submission.attachments[${index}] exceeds ${limits.maxAttachmentBytes} bytes`;
    }
    totalSize += attachment.size;
  }
  if (totalSize > limits.maxTotalAttachmentBytes) {
    return `submission attachments exceed ${limits.maxTotalAttachmentBytes} bytes in total`;
  }
  return "";
};

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const abortError = (): FeedbackTransportError =>
  new FeedbackTransportError("Feedback submission was cancelled.", {
    code: "aborted",
  });

const delay = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const handleAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

const resolveHeaders = async (
  configured: FeedbackHttpTransportOptions["headers"],
): Promise<Headers> => {
  const value =
    typeof configured === "function" ? await configured() : configured;
  return new Headers(value);
};

const createBody = (
  submission: FeedbackSubmission<unknown>,
  headers: Headers,
): BodyInit => {
  headers.set("content-type", "application/json");
  return JSON.stringify({ ...submission, attachments: [] });
};

const parseReceipt = async (response: Response): Promise<FeedbackReceipt> => {
  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    throw new FeedbackTransportError(
      "The feedback server returned invalid JSON.",
      {
        code: "invalid_response",
        status: response.status,
        cause,
      },
    );
  }
  const record = value as Record<string, unknown>;
  const nestedFeedback =
    typeof record?.feedback === "object" && record.feedback !== null
      ? (record.feedback as Record<string, unknown>)
      : null;
  const receiptRecord = nestedFeedback ?? record;
  const receiptStatus = nestedFeedback ? "received" : receiptRecord.status;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof receiptRecord.id !== "string" ||
    receiptStatus !== "received" ||
    typeof receiptRecord.createdAt !== "string" ||
    !Number.isFinite(Date.parse(receiptRecord.createdAt))
  ) {
    throw new FeedbackTransportError(
      "The feedback server returned an invalid receipt.",
      {
        code: "invalid_response",
        status: response.status,
      },
    );
  }
  return {
    id: receiptRecord.id,
    status: "received",
    createdAt: receiptRecord.createdAt,
    ...(typeof receiptRecord.version === "number"
      ? { version: receiptRecord.version }
      : {}),
  };
};

export const createHttpFeedbackTransport = <TContext = unknown>(
  options: FeedbackHttpTransportOptions,
): FeedbackTransport<TContext> => {
  if (!options.endpoint.trim())
    throw new TypeError("Feedback endpoint is required.");
  const maxAttempts = Math.max(1, Math.floor(options.retry?.maxAttempts ?? 1));
  const baseDelayMs = Math.max(0, options.retry?.baseDelayMs ?? 250);
  const limits = {
    maxPayloadBytes: Math.max(
      1,
      options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES,
    ),
    maxAttachmentBytes: Math.max(
      1,
      options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
    ),
    maxTotalAttachmentBytes: Math.max(
      1,
      options.maxTotalAttachmentBytes ?? DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES,
    ),
  };

  return {
    async submit(submission, submitOptions: FeedbackSubmitOptions = {}) {
      const validationMessage = validateSubmission(
        submission as FeedbackSubmission<unknown>,
        limits,
      );
      if (validationMessage) {
        throw new FeedbackTransportError(validationMessage, {
          code: "invalid_submission",
        });
      }
      if (submitOptions.signal?.aborted) throw abortError();

      const fetchImplementation =
        options.fetch ?? globalThis.fetch?.bind(globalThis);
      if (!fetchImplementation) {
        throw new FeedbackTransportError(
          "No fetch implementation is available for feedback submission.",
          { code: "unsupported_environment" },
        );
      }

      const total =
        byteLength(JSON.stringify(submission.payload)) +
        submission.attachments.reduce(
          (sum, attachment) => sum + attachment.size,
          0,
        );
      submitOptions.onProgress?.({ phase: "preparing", loaded: 0, total });

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const headers = await resolveHeaders(options.headers);
        headers.set("idempotency-key", submission.idempotencyKey);
        const body = createBody(
          submission as FeedbackSubmission<unknown>,
          headers,
        );
        submitOptions.onProgress?.({ phase: "uploading", loaded: 0, total });

        let response: Response;
        try {
          response = await fetchImplementation(options.endpoint, {
            method: "POST",
            headers,
            body,
            ...(submitOptions.signal === undefined
              ? {}
              : { signal: submitOptions.signal }),
            ...(options.credentials === undefined
              ? {}
              : { credentials: options.credentials }),
          });
        } catch (cause) {
          if (
            submitOptions.signal?.aborted ||
            (typeof DOMException !== "undefined" &&
              cause instanceof DOMException &&
              cause.name === "AbortError")
          ) {
            throw abortError();
          }
          if (attempt < maxAttempts) {
            await delay(baseDelayMs * 2 ** (attempt - 1), submitOptions.signal);
            continue;
          }
          throw new FeedbackTransportError(
            "The feedback request could not reach the server.",
            {
              code: "network_error",
              retryable: true,
              cause,
            },
          );
        }

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);
          if (retryable && attempt < maxAttempts) {
            await response.body?.cancel().catch(() => undefined);
            await delay(baseDelayMs * 2 ** (attempt - 1), submitOptions.signal);
            continue;
          }
          throw new FeedbackTransportError(
            `The feedback server rejected the request with status ${response.status}.`,
            { code: "http_error", status: response.status, retryable },
          );
        }

        const receipt = await parseReceipt(response);
        let currentVersion = receipt.version;
        let uploadedBytes = 0;
        try {
          for (const [index, attachment] of submission.attachments.entries()) {
            if (typeof FormData === "undefined") {
              throw new FeedbackTransportError(
                "Attachments require FormData support in the current environment.",
                { code: "unsupported_environment" },
              );
            }
            if (currentVersion === undefined) {
              throw new FeedbackTransportError(
                "The feedback server did not return a version for attachment upload.",
                { code: "invalid_response" },
              );
            }
            const attachmentHeaders = await resolveHeaders(options.headers);
            attachmentHeaders.delete("content-type");
            attachmentHeaders.set(
              "idempotency-key",
              `${submission.idempotencyKey}:attachment:${index}`,
            );
            attachmentHeaders.set("if-match", `"${currentVersion}"`);
            const form = new FormData();
            form.append("kind", attachment.kind);
            form.append("file", attachment.data, attachment.fileName);
            let uploadResponse: Response;
            try {
              uploadResponse = await fetchImplementation(
                `${options.endpoint.replace(/\/$/, "")}/${encodeURIComponent(receipt.id)}/attachments`,
                {
                  method: "POST",
                  headers: attachmentHeaders,
                  body: form,
                  ...(submitOptions.signal === undefined
                    ? {}
                    : { signal: submitOptions.signal }),
                  ...(options.credentials === undefined
                    ? {}
                    : { credentials: options.credentials }),
                },
              );
            } catch (cause) {
              if (submitOptions.signal?.aborted) throw abortError();
              throw new FeedbackTransportError(
                "The attachment request could not reach the server.",
                { code: "network_error", retryable: true, cause },
              );
            }
            if (!uploadResponse.ok) {
              throw new FeedbackTransportError(
                `The feedback server rejected an attachment with status ${uploadResponse.status}.`,
                {
                  code: "http_error",
                  status: uploadResponse.status,
                  retryable: isRetryableStatus(uploadResponse.status),
                },
              );
            }
            const uploadValue = (await uploadResponse.json()) as {
              feedback?: { version?: unknown };
            };
            if (!Number.isInteger(uploadValue.feedback?.version)) {
              throw new FeedbackTransportError(
                "The feedback server returned an invalid attachment receipt.",
                { code: "invalid_response", status: uploadResponse.status },
              );
            }
            currentVersion = uploadValue.feedback!.version as number;
            uploadedBytes += attachment.size;
            submitOptions.onProgress?.({
              phase: "uploading",
              loaded: uploadedBytes,
              total,
            });
          }
        } catch (error) {
          if (
            error instanceof FeedbackTransportError &&
            error.retryable &&
            attempt < maxAttempts
          ) {
            await delay(baseDelayMs * 2 ** (attempt - 1), submitOptions.signal);
            continue;
          }
          throw error;
        }
        if (currentVersion !== undefined) receipt.version = currentVersion;
        submitOptions.onProgress?.({ phase: "complete", loaded: total, total });
        return receipt;
      }

      throw new FeedbackTransportError("The feedback request failed.", {
        code: "network_error",
        retryable: true,
      });
    },
  };
};
