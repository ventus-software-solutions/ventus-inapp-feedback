import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FeedbackLab } from "../../app/FeedbackLab";
import "../../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Showcase root element is missing.");

createRoot(root).render(
  <StrictMode>
    <FeedbackLab />
  </StrictMode>,
);
