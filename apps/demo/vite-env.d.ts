/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VENTUS_FEEDBACK_ENDPOINT?: string;
  readonly VITE_VENTUS_FEEDBACK_PROJECT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
