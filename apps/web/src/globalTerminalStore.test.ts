import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useGlobalTerminalStore } from "./globalTerminalStore";

const LOCAL_ENVIRONMENT = EnvironmentId.make("local");
const REMOTE_ENVIRONMENT = EnvironmentId.make("remote");

describe("global terminal ownership", () => {
  beforeEach(() => {
    useGlobalTerminalStore.persist.clearStorage();
    useGlobalTerminalStore.setState({
      open: false,
      environmentId: null,
      launchDirectories: {},
      initializedEnvironments: {},
    });
  });

  it("preserves its launch directory when the surrounding project changes", () => {
    const store = useGlobalTerminalStore.getState();
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/home/user");
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/another/project");
    expect(useGlobalTerminalStore.getState().launchDirectories.local).toBe("/home/user");
  });

  it("keeps independent launch locations when switching environments", () => {
    const store = useGlobalTerminalStore.getState();
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/local");
    store.selectEnvironment(REMOTE_ENVIRONMENT, "/remote");
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/another/project");
    expect(useGlobalTerminalStore.getState()).toMatchObject({
      environmentId: LOCAL_ENVIRONMENT,
      launchDirectories: { local: "/local", remote: "/remote" },
    });
  });

  it("hides and reopens without dropping session identity", () => {
    const store = useGlobalTerminalStore.getState();
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/local");
    store.setOpen(true);
    store.setOpen(false);
    store.setOpen(true);
    expect(useGlobalTerminalStore.getState()).toMatchObject({
      open: true,
      environmentId: LOCAL_ENVIRONMENT,
      launchDirectories: { local: "/local" },
    });
  });
});
