import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { AuthPreviewOperateScope } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { isLocalLoopbackHost, normalizeHostname } from "@t3tools/shared/hostClassification";

import { reachesEnvironmentLoopback } from "~/browser/browserTargetResolver";
import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import { recordVisitForThread } from "~/browserHistoryStore";
import { GLOBAL_TERMINAL_OWNER_ID } from "~/globalTerminalStore";
import { readEnvironmentSupportsServerBrowser } from "~/state/entities";
import { readEnvironmentScope, readPreparedConnection } from "~/state/session";
import { useRightPanelStore } from "~/rightPanelStore";
import { openPreviewSession } from "./openPreviewSession";

export async function openGlobalTerminalLink<E>(input: {
  readonly environmentId: EnvironmentId;
  readonly url: string;
  readonly previewThreadRef: ScopedThreadRef | null;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly openExternal: (url: string) => Promise<void>;
}): Promise<void> {
  const url = new URL(input.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS terminal links can be opened.");
  }
  const host = normalizeHostname(url.hostname);
  const loopback =
    isLocalLoopbackHost(host) ||
    host === "0.0.0.0" ||
    host === "::" ||
    host.endsWith(".localhost") ||
    /^::ffff:7f[\da-f]{2}:[\da-f]{1,4}$/u.test(host);
  const target = readPreparedConnection(input.environmentId)?.target;
  if (!loopback || (target && reachesEnvironmentLoopback(target))) {
    await input.openExternal(input.url);
    return;
  }
  const threadRef = input.previewThreadRef;
  if (
    !threadRef ||
    threadRef.environmentId !== input.environmentId ||
    threadRef.threadId === GLOBAL_TERMINAL_OWNER_ID
  ) {
    throw new Error("Open a chat in this environment to preview its local server.");
  }
  if (!readEnvironmentScope(input.environmentId, AuthPreviewOperateScope)) {
    throw new Error("This environment does not allow opening previews.");
  }
  if (!readEnvironmentSupportsServerBrowser(input.environmentId)) {
    throw new Error(
      "This environment needs a server-side browser or port forwarding to open its localhost links.",
    );
  }
  const result = await openPreviewSession({
    threadRef,
    url: input.url,
    openPreview: input.openPreview,
    runtime: "server",
  });
  if (result._tag === "Failure") {
    if (isAtomCommandInterrupted(result)) return;
    const failure = squashAtomCommandFailure(result);
    throw new Error("Could not open this environment's local server preview.", { cause: failure });
  }
  recordVisitForThread(threadRef, input.url);
  useRightPanelStore.getState().openBrowser(threadRef, result.value.tabId);
}
