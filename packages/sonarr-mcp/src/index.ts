#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { ServerLive } from "./server.js"

Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
