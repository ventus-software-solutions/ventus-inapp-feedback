export const widgetStyles = `
:host {
  --ventus-accent: #256b57;
  --ventus-accent-contrast: #ffffff;
  --ventus-bg: #ffffff;
  --ventus-surface: #f3f6f4;
  --ventus-text: #17211e;
  --ventus-muted: #596762;
  --ventus-border: #cbd5d1;
  --ventus-danger: #a13939;
  color: var(--ventus-text);
  color-scheme: light;
  font: 400 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
:host([theme="dark"]) {
  --ventus-bg: #17201d;
  --ventus-surface: #212c28;
  --ventus-text: #f4f8f6;
  --ventus-muted: #b4c1bc;
  --ventus-border: #47554f;
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :host([theme="auto"]) {
    --ventus-bg: #17201d;
    --ventus-surface: #212c28;
    --ventus-text: #f4f8f6;
    --ventus-muted: #b4c1bc;
    --ventus-border: #47554f;
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
.trigger {
  position: fixed;
  z-index: 2147483000;
  right: 0;
  top: 48%;
  border: 0;
  border-radius: 10px 0 0 10px;
  padding: 12px 9px;
  background: var(--ventus-accent);
  color: var(--ventus-accent-contrast);
  cursor: pointer;
  writing-mode: vertical-rl;
  font: inherit;
  font-weight: 700;
  letter-spacing: .03em;
}
.trigger:focus-visible, button:focus-visible, .file-label:focus-within, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ventus-accent) 55%, white);
  outline-offset: 2px;
}
:host([capture-mode="none"]) [data-action="capture"] { display: none; }
dialog {
  width: min(560px, calc(100vw - 24px));
  max-height: min(760px, calc(100vh - 24px));
  border: 1px solid var(--ventus-border);
  border-radius: 16px;
  padding: 0;
  background: var(--ventus-bg);
  color: var(--ventus-text);
  box-shadow: 0 24px 80px rgb(0 0 0 / .28);
}
dialog::backdrop { background: rgb(8 18 14 / .48); backdrop-filter: blur(2px); }
.panel { display: grid; gap: 18px; padding: 22px; }
.heading { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
h2 { margin: 0; font-size: 20px; line-height: 1.2; }
.intro, .hint, .status { margin: 4px 0 0; color: var(--ventus-muted); }
.close { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 24px; line-height: 1; }
label, fieldset { display: grid; gap: 6px; }
label > span, legend { font-weight: 650; }
input, textarea, select {
  width: 100%;
  border: 1px solid var(--ventus-border);
  border-radius: 9px;
  padding: 10px 11px;
  background: var(--ventus-bg);
  color: var(--ventus-text);
  font: inherit;
}
textarea { min-height: 112px; resize: vertical; }
fieldset { border: 0; margin: 0; padding: 0; }
.diagnostics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 14px; }
.diagnostics label { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 400; }
.diagnostics input { width: auto; }
.attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
button, .file-label {
  border: 1px solid var(--ventus-border);
  border-radius: 9px;
  padding: 9px 12px;
  background: var(--ventus-surface);
  color: var(--ventus-text);
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}
.file-label input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.preview { display: none; gap: 8px; }
.preview[data-visible="true"] { display: grid; }
.preview img { max-width: 100%; max-height: 180px; border: 1px solid var(--ventus-border); border-radius: 9px; object-fit: contain; }
.actions { display: flex; justify-content: flex-end; gap: 9px; }
.primary { background: var(--ventus-accent); border-color: var(--ventus-accent); color: var(--ventus-accent-contrast); }
button:disabled { cursor: wait; opacity: .62; }
.status[data-tone="error"] { color: var(--ventus-danger); }
.status[hidden] { display: none; }
@media (max-width: 480px) {
  .panel { padding: 17px; }
  .diagnostics { grid-template-columns: 1fr; }
  .actions { flex-direction: column-reverse; }
  .actions button { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
:host([dir="rtl"]) .trigger { left: 0; right: auto; border-radius: 0 10px 10px 0; }
:host([dir="rtl"]) .heading, :host([dir="rtl"]) .actions { direction: rtl; }
`;
