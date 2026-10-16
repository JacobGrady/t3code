import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import { createTerminalUiStateStore } from "./terminalUiStateStore";

export const GLOBAL_TERMINAL_OWNER_ID = ThreadId.make("t3code:global-terminal:v1");
export const GLOBAL_TERMINAL_ID = "global-1";
export const DEFAULT_GLOBAL_TERMINAL_HEIGHT = 100;
export const useGlobalTerminalLayoutStore: ReturnType<typeof createTerminalUiStateStore> =
  createTerminalUiStateStore("t3code:global-terminal-layout:v1");

interface GlobalTerminalState {
  open: boolean;
  environmentId: EnvironmentId | null;
  launchDirectories: Record<string, string>;
  initializedEnvironments: Record<string, boolean>;
  terminalHeights: Record<string, number>;
  setTerminalHeight: (environmentId: EnvironmentId, height: number) => void;
  markInitialized: (environmentId: EnvironmentId) => void;
  setOpen: (open: boolean) => void;
  selectEnvironment: (environmentId: EnvironmentId, cwd: string) => void;
}

export const useGlobalTerminalStore = create<GlobalTerminalState>()(
  persist(
    (set) => ({
      open: false,
      environmentId: null,
      launchDirectories: {},
      initializedEnvironments: {},
      terminalHeights: {},
      setTerminalHeight: (environmentId, height) => {
        if (!Number.isFinite(height) || height <= 0) return;
        set((state) => ({
          terminalHeights: { ...state.terminalHeights, [environmentId]: height },
        }));
      },
      markInitialized: (environmentId) =>
        set((state) => ({
          initializedEnvironments: { ...state.initializedEnvironments, [environmentId]: true },
        })),
      setOpen: (open) => set({ open }),
      selectEnvironment: (environmentId, cwd) =>
        set((state) => ({
          environmentId,
          launchDirectories: {
            ...state.launchDirectories,
            [environmentId]: state.launchDirectories[environmentId] ?? cwd,
          },
        })),
    }),
    {
      name: "t3code:global-terminal:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({
        open,
        environmentId,
        launchDirectories,
        initializedEnvironments,
        terminalHeights,
      }) => ({
        open,
        environmentId,
        launchDirectories,
        initializedEnvironments,
        terminalHeights,
      }),
    },
  ),
);
