#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createConfiguredFeedbackMcpServer } from "./index.js";

void serveStdio(() => createConfiguredFeedbackMcpServer());
