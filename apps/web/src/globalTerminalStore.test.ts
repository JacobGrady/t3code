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
      terminalHeights: {},
    });
  });

  it("preserves its launch directory when the surrounding project changes", () => {
    const store = useGlobalTerminalStore.getState();
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/home/user");
    store.selectEnvironment(LOCAL_ENVIRONMENT, "/another/project");
    expect(useGlobalTerminalStore.getState().launchDirectories.local).toBe("/home/user");
  });

  it("persists independent dock sizes without accepting invalid heights", async () => {
    const store = useGlobalTerminalStore.getState();
    store.setTerminalHeight(LOCAL_ENVIRONMENT, 240);
    store.setTerminalHeight(REMOTE_ENVIRONMENT, 100);
    for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      store.setTerminalHeight(LOCAL_ENVIRONMENT, height);
    }
    const { name, storage } = useGlobalTerminalStore.persist.getOptions();
    if (!name || !storage) throw new Error("Global terminal storage is not configured.");
    const persisted = await storage.getItem(name);
    if (!persisted) throw new Error("Global terminal state was not persisted.");
    useGlobalTerminalStore.setState({ terminalHeights: {} });
    await storage.setItem(name, persisted);
    await useGlobalTerminalStore.persist.rehydrate();
    expect(useGlobalTerminalStore.getState().terminalHeights).toEqual({ local: 240, remote: 100 });
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
