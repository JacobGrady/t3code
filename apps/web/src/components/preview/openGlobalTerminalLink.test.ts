import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { OpenPreviewMutation } from "~/browser/openFileInPreview";

const state = vi.hoisted(() => ({
  local: false,
  connected: true,
  allowed: true,
  serverBrowser: true,
  openBrowser: vi.fn(),
  recordVisit: vi.fn(),
  applySnapshot: vi.fn(),
}));

vi.mock("~/browser/browserTargetResolver", () => ({
  reachesEnvironmentLoopback: () => state.local,
}));
vi.mock("~/globalTerminalStore", () => ({ GLOBAL_TERMINAL_OWNER_ID: "t3code:global-terminal:v1" }));
vi.mock("~/browser/browserDefaults", () => ({
  resolveBrowserDefaults: async () => ({}),
  browserDefaultOpenViewport: () => ({ _tag: "fixed", width: 1280, height: 720 }),
  browserDefaultOpenProfileId: () => "work",
}));
vi.mock("~/browser/previewRuntime", () => ({ previewRuntimeFor: () => undefined }));
vi.mock("~/browser/openFileInPreview", () => ({
  BrowserSettingsReadError: class extends Error {
    constructor({ cause }: { cause: unknown }) {
      super("Saved browser settings could not be loaded.", { cause });
    }
  },
}));
vi.mock("~/state/entities", () => ({
  readEnvironmentSupportsServerBrowser: () => state.serverBrowser,
}));
vi.mock("~/state/session", () => ({
  readEnvironmentScope: () => state.allowed,
  readPreparedConnection: () => (state.connected ? { target: {} } : null),
}));
vi.mock("~/browserHistoryStore", () => ({ recordVisitForThread: state.recordVisit }));
vi.mock("~/previewStateStore", () => ({
  applyPreviewServerSnapshot: state.applySnapshot,
  rememberPreviewUrl: vi.fn(),
}));
vi.mock("~/rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ openBrowser: state.openBrowser }) },
}));

import { GLOBAL_TERMINAL_OWNER_ID } from "~/globalTerminalStore";
import { openGlobalTerminalLink } from "./openGlobalTerminalLink";

const environmentId = EnvironmentId.make("remote");
const threadRef = { environmentId, threadId: ThreadId.make("chat-1") };
const snapshot = {
  threadId: threadRef.threadId,
  tabId: "tab-1",
  navStatus: { _tag: "Idle" } as const,
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-10-16T00:00:00Z",
};

function inputs(url = "http://localhost:5173/docs?mode=test#results") {
  return {
    environmentId,
    url,
    previewThreadRef: threadRef as ScopedThreadRef | null,
    openPreview: vi.fn(async () => AsyncResult.success(snapshot)),
    openExternal: vi.fn(async (_url: string) => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.local = false;
  state.connected = true;
  state.allowed = true;
  state.serverBrowser = true;
});

describe("global terminal links", () => {
  it.each([
    "http://localhost:5173/docs?mode=test#results",
    "http://127.0.0.2:3000/",
    "http://[::1]:3000/",
    "http://0.0.0.0:3000/",
    "http://[::]:3000/",
    "http://app.localhost:3000/",
    "http://[::ffff:127.0.0.1]:3000/",
  ])("opens remote host-local URL %s only in the environment's server browser", async (url) => {
    const input = inputs(url);
    await openGlobalTerminalLink(input);
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(input.openPreview).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        threadId: threadRef.threadId,
        url,
        runtime: "server",
        profileId: "work",
        viewport: { _tag: "fixed", width: 1280, height: 720 },
      },
    });
    expect(state.openBrowser).toHaveBeenCalledWith(threadRef, "tab-1");
    expect(state.recordVisit).toHaveBeenCalledWith(threadRef, url);
    expect(state.applySnapshot).toHaveBeenCalledWith(threadRef, snapshot);
  });

  it.each(["https://example.com/docs", "https://localhost.example.com/docs"])(
    "keeps public URL %s in the external browser without requiring a chat or preview grant",
    async (url) => {
      const input = inputs(url);
      input.previewThreadRef = null;
      state.allowed = false;
      await openGlobalTerminalLink(input);
      expect(input.openExternal).toHaveBeenCalledExactlyOnceWith(url);
      expect(input.openPreview).not.toHaveBeenCalled();
    },
  );

  it("allows native-local localhost links in the external browser from Settings", async () => {
    state.local = true;
    const input = inputs();
    input.previewThreadRef = null;
    await openGlobalTerminalLink(input);
    expect(input.openExternal).toHaveBeenCalledExactlyOnceWith(input.url);
    expect(input.openPreview).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { environmentId: EnvironmentId.make("other"), threadId: threadRef.threadId },
    {
      environmentId,
      threadId: GLOBAL_TERMINAL_OWNER_ID,
    },
  ])("does not attach a remote preview to an absent, unrelated, or synthetic chat", async (ref) => {
    const input = inputs();
    input.previewThreadRef = ref;
    await expect(openGlobalTerminalLink(input)).rejects.toThrow("Open a chat in this environment");
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(input.openPreview).not.toHaveBeenCalled();
  });

  it("rechecks the preview grant before opening a remote server", async () => {
    state.allowed = false;
    const input = inputs();
    await expect(openGlobalTerminalLink(input)).rejects.toThrow("does not allow opening previews");
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(input.openPreview).not.toHaveBeenCalled();
  });

  it("does not treat the desktop browser as a server browser for a remote environment", async () => {
    state.serverBrowser = false;
    const input = inputs();
    await expect(openGlobalTerminalLink(input)).rejects.toThrow(
      "server-side browser or port forwarding",
    );
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(input.openPreview).not.toHaveBeenCalled();
  });

  it("does not consider an unknown connection local", async () => {
    state.local = true;
    state.connected = false;
    const input = inputs();
    input.previewThreadRef = null;
    await expect(openGlobalTerminalLink(input)).rejects.toThrow("Open a chat in this environment");
    expect(input.openExternal).not.toHaveBeenCalled();
  });

  it("does not fall back to the client browser if the remote preview fails", async () => {
    const input = {
      ...inputs(),
      openPreview: vi.fn<OpenPreviewMutation<Error>>(async () =>
        AsyncResult.failure(Cause.fail(new Error("Offline"))),
      ),
    };
    await expect(openGlobalTerminalLink(input)).rejects.toThrow("Could not open");
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(state.openBrowser).not.toHaveBeenCalled();
  });

  it("does not open either browser after interruption", async () => {
    const input = {
      ...inputs(),
      openPreview: vi.fn<OpenPreviewMutation<never>>(async () =>
        AsyncResult.failure(Cause.interrupt()),
      ),
    };
    await openGlobalTerminalLink(input);
    expect(input.openExternal).not.toHaveBeenCalled();
    expect(state.openBrowser).not.toHaveBeenCalled();
  });

  it.each(["not a URL", "javascript:alert(1)", "file:///tmp/index.html"])(
    "rejects unsupported URL %s without opening a browser",
    async (url) => {
      const input = inputs(url);
      await expect(openGlobalTerminalLink(input)).rejects.toThrow();
      expect(input.openPreview).not.toHaveBeenCalled();
      expect(input.openExternal).not.toHaveBeenCalled();
    },
  );
});
