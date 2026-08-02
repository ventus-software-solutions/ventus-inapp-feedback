import { fileTypeFromBuffer } from "file-type";

export type AttachmentScanResult =
  | { safe: true }
  | { safe: false; reason: string };

export type AttachmentScanner = (input: {
  data: Uint8Array;
  mediaType: string;
  fileName: string;
}) => Promise<AttachmentScanResult>;

export type ProcessedAttachment = {
  data: Uint8Array;
  mediaType: string;
  fileName: string;
};

const safeFileName = (value: string): string => {
  const leaf =
    value.replaceAll("\\", "/").split("/").at(-1)?.trim() || "attachment";
  return (
    leaf.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "attachment"
  );
};

const isPlainText = (data: Uint8Array): boolean => {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return !data.includes(0);
  } catch {
    return false;
  }
};

export const processAttachment = async (input: {
  data: Uint8Array;
  claimedMediaType: string;
  fileName: string;
  allowedMediaTypes: readonly string[];
  allowUnscanned: boolean;
  scanner?: AttachmentScanner;
}): Promise<ProcessedAttachment> => {
  const detected = await fileTypeFromBuffer(input.data);
  const mediaType =
    detected?.mime ??
    (isPlainText(input.data) ? "text/plain" : "application/octet-stream");
  if (!input.allowedMediaTypes.includes(mediaType)) {
    throw new Error(`Attachment media type ${mediaType} is not allowed.`);
  }
  if (
    input.claimedMediaType &&
    input.claimedMediaType !== "application/octet-stream" &&
    input.claimedMediaType.toLowerCase() !== mediaType
  ) {
    throw new Error(
      `Attachment content is ${mediaType}, not the claimed ${input.claimedMediaType}.`,
    );
  }
  if (!input.scanner && !input.allowUnscanned) {
    throw new Error(
      "Attachment scanning is required but no scanner is configured.",
    );
  }
  if (input.scanner) {
    const scan = await input.scanner({
      data: input.data,
      mediaType,
      fileName: safeFileName(input.fileName),
    });
    if (!scan.safe)
      throw new Error(`Attachment was rejected by the scanner: ${scan.reason}`);
  }
  return {
    data: input.data,
    mediaType,
    fileName: safeFileName(input.fileName),
  };
};
