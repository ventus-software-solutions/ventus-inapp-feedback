import { createRef } from "react";
import { FeedbackWidget, type VentusFeedbackWidget } from "../dist/index.js";
import type { FeedbackTransport } from "@ventus-software-solutions/feedback-browser";

type AppContext = { route: string };
const ref = createRef<VentusFeedbackWidget>();
const transport = {} as FeedbackTransport<AppContext>;

const widget = (
  <FeedbackWidget<AppContext>
    ref={ref}
    endpoint="/v1/feedback"
    transport={transport}
    context={() => ({ route: "checkout" })}
    onSubmit={({ submission }) => {
      submission.payload.context?.application.route satisfies
        | string
        | undefined;
    }}
  />
);

widget satisfies React.ReactElement;
