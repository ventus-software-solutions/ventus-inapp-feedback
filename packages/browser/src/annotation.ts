export type FeedbackAnnotationPoint = { x: number; y: number };

export type FeedbackAnnotationTool =
  | "freehand"
  | "line"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "text";

export type FeedbackAnnotationShape = {
  tool: FeedbackAnnotationTool;
  points: FeedbackAnnotationPoint[];
  color: string;
  text?: string;
};

const LINE_WIDTH = 3;
const ARROW_HEAD_LENGTH = 14;
const TEXT_FONT_SIZE = 18;
const TEXT_LINE_HEIGHT = 22;
const TEXT_PADDING = 8;

const minMax = (a: number, b: number): [number, number] =>
  a <= b ? [a, b] : [b, a];

export const measureFeedbackAnnotationText = (
  context: CanvasRenderingContext2D,
  shape: FeedbackAnnotationShape,
): { x: number; y: number; width: number; height: number } | null => {
  if (shape.tool !== "text" || !shape.text || !shape.points[0]) return null;
  const lines = shape.text.split("\n");
  context.font = `${TEXT_FONT_SIZE}px sans-serif`;
  const maxWidth = Math.max(
    ...lines.map((line) => context.measureText(line).width),
  );
  return {
    x: shape.points[0].x,
    y: shape.points[0].y,
    width: maxWidth + 2 * TEXT_PADDING,
    height: lines.length * TEXT_LINE_HEIGHT + 2 * TEXT_PADDING,
  };
};

export const drawFeedbackAnnotationShape = (
  context: CanvasRenderingContext2D,
  shape: FeedbackAnnotationShape,
  lineWidth = LINE_WIDTH,
): void => {
  const { points, tool } = shape;
  const start = points[0];
  const end = points[1];
  if (!start) return;
  if (tool !== "freehand" && tool !== "text" && !end) return;

  const color = shape.color || "#dc2626";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (tool === "freehand") {
    if (!points[1]) return;
    context.beginPath();
    context.moveTo(start.x, start.y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    return;
  }

  if (tool === "line") {
    if (!end) return;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    return;
  }

  if (tool === "rectangle") {
    if (!end) return;
    const [x0, x1] = minMax(start.x, end.x);
    const [y0, y1] = minMax(start.y, end.y);
    context.beginPath();
    context.rect(x0, y0, x1 - x0, y1 - y0);
    context.stroke();
    return;
  }

  if (tool === "ellipse") {
    if (!end) return;
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    if (radiusX < 1 && radiusY < 1) return;
    context.beginPath();
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      radiusX,
      radiusY,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    return;
  }

  if (tool === "arrow") {
    if (!end) return;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    if (start.x === end.x && start.y === end.y) return;
    const headLength = Math.max(ARROW_HEAD_LENGTH, lineWidth * 4);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    context.moveTo(end.x, end.y);
    context.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    context.stroke();
    return;
  }

  if (tool === "text" && shape.text) {
    const lines = shape.text.split("\n");
    const position = start;
    context.font = `${TEXT_FONT_SIZE}px sans-serif`;
    context.textBaseline = "top";
    const maxWidth = Math.max(
      ...lines.map((line) => context.measureText(line).width),
    );
    const width = maxWidth + 2 * TEXT_PADDING;
    const height = lines.length * TEXT_LINE_HEIGHT + 2 * TEXT_PADDING;
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.fillRect(position.x, position.y, width, height);
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, lineWidth - 1);
    context.strokeRect(position.x, position.y, width, height);
    context.fillStyle = color;
    lines.forEach((line, index) => {
      context.fillText(
        line,
        position.x + TEXT_PADDING,
        position.y + TEXT_PADDING + index * TEXT_LINE_HEIGHT,
      );
    });
  }
};

const loadImage = async (blob: Blob): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Screenshot could not be loaded"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const compositeFeedbackAnnotations = async (
  blob: Blob,
  shapes: readonly FeedbackAnnotationShape[],
): Promise<Blob> => {
  if (shapes.length === 0 || typeof document === "undefined") return blob;
  const image = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return blob;
  context.drawImage(image, 0, 0);
  for (const shape of shapes) drawFeedbackAnnotationShape(context, shape);
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((result) => resolve(result ?? blob), "image/png", 0.92);
  });
};
