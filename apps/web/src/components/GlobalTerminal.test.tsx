import { act, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  restart: vi.fn(),
  close: vi.fn(),
  confirmClose: vi.fn(),
  command: null as string | null,
  canOperate: true,
  configs: new Map([
    ["local", { cwd: "/original", keybindings: [] }],
    ["remote", { cwd: "/remote", keybindings: [] }],
  ]),
}));

vi.mock("../state/entities", () => ({ useServerConfigs: () => testState.configs }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => testState.canOperate }));
vi.mock("../keybindings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../keybindings")>()),
  resolveShortcutCommand: () => testState.command,
}));
vi.mock("../hooks/useLocalStorage", () => ({ useLocalStorage: () => [false, vi.fn()] }));
vi.mock("./ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipPopup: () => null,
}));
vi.mock("../state/environments", () => ({
  usePrimaryEnvironmentId: () => "local",
  useEnvironments: () => ({
    environments: [
      { environmentId: "local", label: "Local" },
      { environmentId: "remote", label: "Remote" },
    ],
  }),
}));
vi.mock("../state/terminal", () => ({
  terminalEnvironment: { open: { permissionAtom: () => null }, restart: "restart", close: "close" },
}));
vi.mock("../state/terminalSessions", () => ({ useKnownTerminalSessions: () => null }));
vi.mock("../lib/terminalCloseConfirm", () => ({
  confirmTerminalClose: (...args: unknown[]) => testState.confirmClose(...args),
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "close" ? testState.close : testState.restart),
}));
vi.mock("./ThreadTerminalDrawer", async () => {
  const { useEffect } = await import("react");
  return {
    default: () => {
      useEffect(() => {
        testState.mounts += 1;
        return () => {
          testState.unmounts += 1;
        };
      }, []);
      return <div data-testid="global-viewport" />;
    },
  };
});

import {
  GLOBAL_TERMINAL_OWNER_ID,
  useGlobalTerminalStore,
  useGlobalTerminalLayoutStore,
} from "../globalTerminalStore";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { GlobalTerminal } from "./GlobalTerminal";
import { Button } from "./ui/button";
import { useTerminalUiStateStore } from "../terminalUiStateStore";

let renderer: ReactTestRenderer | undefined;

function drawerProps() {
  return renderer!.root.findByType(ThreadTerminalDrawer).props as ComponentProps<
    typeof ThreadTerminalDrawer
  >;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  testState.mounts = 0;
  testState.unmounts = 0;
  testState.command = null;
  testState.canOperate = true;
  testState.restart.mockReset().mockResolvedValue({ _tag: "Success" });
  testState.close.mockReset().mockResolvedValue({ _tag: "Success" });
  testState.confirmClose.mockReset().mockResolvedValue(true);
  useGlobalTerminalLayoutStore.setState({
    terminalUiStateByThreadKey: {},
    suppressedTerminalIdsByThreadKey: {},
  });
  useGlobalTerminalStore.setState({
    open: false,
    environmentId: null,
    launchDirectories: {},
    initializedEnvironments: {},
    terminalHeights: {},
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("GlobalTerminal", () => {
  it("starts compact with existing splits and remembers resized heights per environment", async () => {
    const local = EnvironmentId.make("local");
    const remote = EnvironmentId.make("remote");
    useGlobalTerminalStore.getState().selectEnvironment(local, "/original");
    useGlobalTerminalStore.getState().markInitialized(local);
    useGlobalTerminalStore.getState().setOpen(true);
    const threadRef = scopeThreadRef(local, GLOBAL_TERMINAL_OWNER_ID);
    useGlobalTerminalLayoutStore.getState().ensureTerminal(threadRef, "global-1");
    useGlobalTerminalLayoutStore.getState().splitTerminal(threadRef, "term-1");
    useGlobalTerminalLayoutStore.getState().setTerminalHeight(threadRef, 560);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    expect(drawerProps().height).toBe(100);
    expect(drawerProps().terminalIds).toEqual(["global-1", "term-1"]);
    await act(async () => drawerProps().onHeightChange(240));
    await act(async () => useGlobalTerminalStore.getState().setOpen(false));
    await act(async () => useGlobalTerminalStore.getState().setOpen(true));
    expect(drawerProps().height).toBe(240);
    await act(async () => useGlobalTerminalStore.getState().selectEnvironment(remote, "/remote"));
    expect(drawerProps().height).toBe(100);
    await act(async () => drawerProps().onHeightChange(160));
    await act(async () => useGlobalTerminalStore.getState().selectEnvironment(local, "/original"));
    expect(drawerProps().height).toBe(240);
    expect(drawerProps().terminalIds).toEqual(["global-1", "term-1"]);
    await act(async () => renderer?.unmount());
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    expect(drawerProps().height).toBe(240);
  });

  it("routes terminal shortcuts to the global layout, not the active chat", async () => {
    const chatLayout = useTerminalUiStateStore.getState().terminalUiStateByThreadKey;
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    const event = {
      nativeEvent: {},
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      repeat: false,
    } as unknown as KeyboardEvent<HTMLElement>;
    for (const command of ["terminal.split", "terminal.splitVertical", "terminal.new"]) {
      testState.command = command;
      await act(async () => renderer!.root.findByType("section").props.onKeyDown(event));
    }
    expect(drawerProps().terminalIds).toEqual(["global-1", "term-1", "term-2", "term-3"]);
    expect(drawerProps().terminalGroups).toHaveLength(2);
    expect(useTerminalUiStateStore.getState().terminalUiStateByThreadKey).toBe(chatLayout);
    useTerminalUiStateStore.getState().removeOrphanedTerminalUiStates(new Set());
    expect(drawerProps().terminalIds).toHaveLength(4);
    testState.command = "terminal.close";
    await act(async () => renderer!.root.findByType("section").props.onKeyDown(event));
    expect(drawerProps().terminalIds).not.toContain("term-3");
    testState.command = "terminal.toggle";
    await act(async () => renderer!.root.findByType("section").props.onKeyDown(event));
    expect(useGlobalTerminalStore.getState().open).toBe(false);
    expect(event.stopPropagation).toHaveBeenCalledTimes(5);
  });

  it("keeps a terminal on close failure and restarts only the selected split", async () => {
    vi.stubGlobal("window", { confirm: () => true });
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    await act(async () => drawerProps().onSplitTerminal());
    testState.close.mockResolvedValueOnce({ _tag: "Failure" });
    await act(async () => drawerProps().onCloseTerminal("term-1"));
    expect(drawerProps().terminalIds).toEqual(["global-1", "term-1"]);
    const restartButton = renderer!.root
      .findAllByType(Button)
      .find((button) => button.props["aria-label"] === "Restart terminal")!;
    await act(async () => {
      await restartButton.props.onClick?.({} as never);
    });
    expect(testState.restart).toHaveBeenCalledWith({
      environmentId: "local",
      input: {
        threadId: "t3code:global-terminal:v1",
        terminalId: "term-1",
        cwd: "/original",
        worktreePath: null,
        cols: 100,
        rows: 24,
      },
    });
    expect(drawerProps().terminalIds).toEqual(["global-1", "term-1"]);
  });

  it("uses the chat drawer for horizontal and vertical splits, new groups and activation", async () => {
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    expect(drawerProps()).toMatchObject({
      terminalIds: ["global-1"],
      focusOwner: "global",
      linksInBrowser: true,
    });
    expect(drawerProps().onAddTerminalContext).toBeUndefined();
    await act(async () => drawerProps().onSplitTerminal());
    expect(drawerProps().terminalGroups[0]?.terminalIds).toEqual(["global-1", "term-1"]);
    await act(async () => drawerProps().onSplitTerminalVertical());
    expect(drawerProps().terminalGroups[0]).toMatchObject({
      terminalIds: ["global-1", "term-1", "term-2"],
      splitDirection: "vertical",
    });
    await act(async () => drawerProps().onNewTerminal());
    expect(drawerProps().terminalGroups).toHaveLength(2);
    expect(drawerProps().activeTerminalId).toBe("term-3");
    await act(async () => drawerProps().onActiveTerminalChange("global-1"));
    expect(drawerProps().activeTerminalId).toBe("global-1");
    await act(async () => drawerProps().onHeightChange(420));
    expect(drawerProps().height).toBe(420);
  });

  it("confirms keyboard close without repeating the drawer's confirmation", async () => {
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    await act(async () => drawerProps().onSplitTerminal());
    const event = {
      nativeEvent: {},
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      repeat: false,
    } as unknown as KeyboardEvent<HTMLElement>;
    testState.command = "terminal.close";
    testState.confirmClose.mockResolvedValueOnce(false);
    await act(async () => renderer!.root.findByType("section").props.onKeyDown(event));
    expect(testState.close).not.toHaveBeenCalled();
    expect(drawerProps().terminalIds).toContain("term-1");
    expect(testState.confirmClose).toHaveBeenCalledTimes(1);
    await act(async () => drawerProps().onCloseTerminal("term-1"));
    expect(testState.close).toHaveBeenCalledWith({
      environmentId: "local",
      input: { threadId: "t3code:global-terminal:v1", terminalId: "term-1", deleteHistory: true },
    });
    expect(drawerProps().terminalIds).toEqual(["global-1"]);
    await act(async () => drawerProps().onCloseTerminal("global-1"));
    expect(testState.confirmClose).toHaveBeenCalledTimes(1);
    expect(drawerProps().terminalIds).toEqual([]);
    await act(async () => renderer?.update(<GlobalTerminal />));
    expect(drawerProps().terminalIds).toEqual([]);
    await act(async () => drawerProps().onNewTerminal());
    expect(drawerProps().terminalIds).toEqual(["term-1"]);
  });

  it("keeps each environment's split layout independent", async () => {
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    await act(async () => drawerProps().onSplitTerminalVertical());
    await act(async () =>
      useGlobalTerminalStore.getState().selectEnvironment(EnvironmentId.make("remote"), "/remote"),
    );
    expect(drawerProps().terminalIds).toEqual(["global-1"]);
    await act(async () =>
      useGlobalTerminalStore
        .getState()
        .selectEnvironment(EnvironmentId.make("local"), "/different"),
    );
    expect(drawerProps().terminalGroups[0]).toMatchObject({
      terminalIds: ["global-1", "term-1"],
      splitDirection: "vertical",
    });
    expect(drawerProps().cwd).toBe("/original");
  });

  it("does not create or restart terminals without the environment's operate grant", async () => {
    testState.canOperate = false;
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    expect(drawerProps().terminalIds).toEqual([]);
    await act(async () => drawerProps().onNewTerminal());
    expect(drawerProps().terminalIds).toEqual([]);
    testState.canOperate = true;
    await act(async () => renderer?.update(<GlobalTerminal />));
    expect(drawerProps().terminalIds).toEqual(["global-1"]);
    testState.canOperate = false;
    await act(async () => renderer?.update(<GlobalTerminal />));
    const restartButton = renderer!.root
      .findAllByType(Button)
      .find((button) => button.props["aria-label"] === "Restart terminal")!;
    expect(restartButton.props.disabled).toBe(true);
    await act(async () => {
      await restartButton.props.onClick?.({} as never);
      drawerProps().onCloseTerminal("global-1");
      drawerProps().onSplitTerminal();
    });
    expect(testState.restart).not.toHaveBeenCalled();
    expect(testState.close).not.toHaveBeenCalled();
    expect(drawerProps().terminalIds).toEqual(["global-1"]);
  });
  it("starts only when requested and keeps its viewport mounted when hidden", async () => {
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    expect(testState.mounts).toBe(0);
    await act(async () => useGlobalTerminalStore.getState().setOpen(true));
    expect(testState.mounts).toBe(1);
    await act(async () => useGlobalTerminalStore.getState().setOpen(false));
    await act(async () => useGlobalTerminalStore.getState().setOpen(true));
    await act(async () => renderer?.update(<GlobalTerminal />));
    expect(testState.mounts).toBe(1);
    expect(testState.unmounts).toBe(0);
    expect(useGlobalTerminalStore.getState().launchDirectories.local).toBe("/original");
  });

  it("changes only the attached environment when explicitly selected", async () => {
    useGlobalTerminalStore.getState().setOpen(true);
    await act(async () => {
      renderer = create(<GlobalTerminal />);
    });
    await act(async () => {
      useGlobalTerminalStore.getState().selectEnvironment(EnvironmentId.make("remote"), "/remote");
    });
    expect(testState.mounts).toBe(2);
    expect(testState.unmounts).toBe(1);
    expect(useGlobalTerminalStore.getState().launchDirectories).toEqual({
      local: "/original",
      remote: "/remote",
    });
  });
});
