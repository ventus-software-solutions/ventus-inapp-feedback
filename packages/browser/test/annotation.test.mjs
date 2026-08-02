import assert from "node:assert/strict";
import test from "node:test";
import {
  drawFeedbackAnnotationShape,
  measureFeedbackAnnotationText,
} from "../dist/index.js";

const createContext = () => {
  const calls = [];
  const context = {
    calls,
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    rect: (x, y, width, height) => calls.push(["rect", x, y, width, height]),
    ellipse: (...args) => calls.push(["ellipse", ...args]),
    stroke: () => calls.push(["stroke"]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    strokeRect: (...args) => calls.push(["strokeRect", ...args]),
    fillText: (...args) => calls.push(["fillText", ...args]),
    measureText: (text) => ({ width: text.length * 10 }),
  };
  return context;
};

test("draws every supported annotation primitive", () => {
  const context = createContext();
  const shapes = [
    {
      tool: "freehand",
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    },
    {
      tool: "line",
      points: [
        { x: 2, y: 3 },
        { x: 8, y: 9 },
      ],
    },
    {
      tool: "rectangle",
      points: [
        { x: 8, y: 9 },
        { x: 2, y: 3 },
      ],
    },
    {
      tool: "ellipse",
      points: [
        { x: 2, y: 3 },
        { x: 8, y: 9 },
      ],
    },
    {
      tool: "arrow",
      points: [
        { x: 2, y: 3 },
        { x: 8, y: 9 },
      ],
    },
    {
      tool: "text",
      points: [{ x: 2, y: 3 }],
      text: "Expected\nresult",
    },
  ];

  for (const shape of shapes)
    drawFeedbackAnnotationShape(context, { ...shape, color: "#dc2626" });

  assert.ok(context.calls.some(([name]) => name === "rect"));
  assert.ok(context.calls.some(([name]) => name === "ellipse"));
  assert.equal(context.calls.filter(([name]) => name === "fillText").length, 2);
  assert.ok(context.calls.filter(([name]) => name === "lineTo").length >= 5);
});

test("measures text bubbles with the same multiline geometry used for drawing", () => {
  const context = createContext();
  assert.deepEqual(
    measureFeedbackAnnotationText(context, {
      tool: "text",
      points: [{ x: 12, y: 16 }],
      color: "#dc2626",
      text: "short\nlonger",
    }),
    { x: 12, y: 16, width: 76, height: 60 },
  );
});
