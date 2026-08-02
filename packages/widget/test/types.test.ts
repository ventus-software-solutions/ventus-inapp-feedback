import {
  defineVentusFeedbackWidget,
  VentusFeedbackWidget,
  type VentusFeedbackSuccessDetail,
} from "../dist/index.js";
import type { FeedbackTransport } from "@ventus-software-solutions/feedback-browser";

defineVentusFeedbackWidget();
const widget = document.createElement("ventus-feedback");
widget.endpoint = "/v1/feedback";
widget.context = () => ({ route: "checkout" });
widget.transport = {} as FeedbackTransport;
widget.open();
widget.close();
widget.addEventListener("ventus-feedback-success", (event) => {
  event.detail satisfies VentusFeedbackSuccessDetail;
});
widget satisfies VentusFeedbackWidget;
