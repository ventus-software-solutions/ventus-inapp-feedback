import type {
  FeedbackCaptureCore,
  FeedbackCaptureCoreOptions,
  FeedbackTransport,
} from "@ventus/feedback-browser";
import {
  defineVentusFeedbackWidget,
  type VentusFeedbackCloseDetail,
  type VentusFeedbackErrorDetail,
  type VentusFeedbackOpenDetail,
  type VentusFeedbackSubmitDetail,
  type VentusFeedbackSuccessDetail,
  type VentusFeedbackWidget,
  type VentusFeedbackWidgetTheme,
  type VentusFeedbackCaptureMode,
} from "@ventus/feedback-widget";
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

export type FeedbackWidgetProps<TContext = unknown> = {
  endpoint?: string;
  projectKey?: string;
  locale?: string;
  theme?: VentusFeedbackWidgetTheme;
  captureMode?: VentusFeedbackCaptureMode;
  sourceApp?: string;
  release?: string;
  environment?: string;
  triggerLabel?: string;
  includeCredentials?: boolean;
  transport?: FeedbackTransport<TContext>;
  capture?: FeedbackCaptureCore<TContext>;
  captureOptions?: FeedbackCaptureCoreOptions<TContext>;
  context?: TContext | (() => TContext | undefined);
  onOpen?: (detail: VentusFeedbackOpenDetail) => void;
  onClose?: (detail: VentusFeedbackCloseDetail) => void;
  onSubmit?: (detail: VentusFeedbackSubmitDetail<TContext>) => void;
  onSuccess?: (detail: VentusFeedbackSuccessDetail) => void;
  onError?: (detail: VentusFeedbackErrorDetail) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const FeedbackWidgetImplementation = <TContext,>(
  props: FeedbackWidgetProps<TContext>,
  forwardedRef: React.ForwardedRef<VentusFeedbackWidget>,
) => {
  const elementRef = useRef<VentusFeedbackWidget | null>(null);
  useImperativeHandle(forwardedRef, () => elementRef.current!, []);

  useEffect(() => {
    defineVentusFeedbackWidget();
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.transport = props.transport as
      | FeedbackTransport<unknown>
      | undefined;
    element.capture = props.capture as FeedbackCaptureCore<unknown> | undefined;
    element.captureOptions = props.captureOptions as
      | FeedbackCaptureCoreOptions<unknown>
      | undefined;
    element.context = props.context as unknown | (() => unknown) | undefined;
  }, [props.transport, props.capture, props.captureOptions, props.context]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const listeners: Array<[string, EventListener]> = [
      [
        "ventus-feedback-open",
        (event) =>
          props.onOpen?.(
            (event as CustomEvent<VentusFeedbackOpenDetail>).detail,
          ),
      ],
      [
        "ventus-feedback-close",
        (event) =>
          props.onClose?.(
            (event as CustomEvent<VentusFeedbackCloseDetail>).detail,
          ),
      ],
      [
        "ventus-feedback-submit",
        (event) =>
          props.onSubmit?.(
            (event as CustomEvent<VentusFeedbackSubmitDetail<TContext>>).detail,
          ),
      ],
      [
        "ventus-feedback-success",
        (event) =>
          props.onSuccess?.(
            (event as CustomEvent<VentusFeedbackSuccessDetail>).detail,
          ),
      ],
      [
        "ventus-feedback-error",
        (event) =>
          props.onError?.(
            (event as CustomEvent<VentusFeedbackErrorDetail>).detail,
          ),
      ],
    ];
    listeners.forEach(([name, listener]) =>
      element.addEventListener(name, listener),
    );
    return () =>
      listeners.forEach(([name, listener]) =>
        element.removeEventListener(name, listener),
      );
  }, [
    props.onOpen,
    props.onClose,
    props.onSubmit,
    props.onSuccess,
    props.onError,
  ]);

  const attributes = {
    ref: (element: Element | null) => {
      elementRef.current = element as VentusFeedbackWidget | null;
    },
    ...(props.endpoint ? { endpoint: props.endpoint } : {}),
    ...(props.projectKey ? { "project-key": props.projectKey } : {}),
    ...(props.locale ? { locale: props.locale } : {}),
    ...(props.theme ? { theme: props.theme } : {}),
    ...(props.captureMode ? { "capture-mode": props.captureMode } : {}),
    ...(props.sourceApp ? { "source-app": props.sourceApp } : {}),
    ...(props.release ? { release: props.release } : {}),
    ...(props.environment ? { environment: props.environment } : {}),
    ...(props.triggerLabel ? { "trigger-label": props.triggerLabel } : {}),
    ...(props.includeCredentials ? { "include-credentials": "" } : {}),
    ...(props.className ? { className: props.className } : {}),
    ...(props.style ? { style: props.style } : {}),
  };

  return createElement("ventus-feedback", attributes, props.children);
};

export const FeedbackWidget = forwardRef(FeedbackWidgetImplementation) as <
  TContext = unknown,
>(
  props: FeedbackWidgetProps<TContext> & {
    ref?: React.ForwardedRef<VentusFeedbackWidget>;
  },
) => React.ReactElement;
