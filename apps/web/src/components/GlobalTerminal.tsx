import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId } from "@t3tools/contracts";
import { mergeWithDefaultKeybindings } from "@t3tools/shared/keybindings";
import { nextTerminalId, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import {
  DEFAULT_GLOBAL_TERMINAL_HEIGHT,
  GLOBAL_TERMINAL_ID,
  GLOBAL_TERMINAL_OWNER_ID,
  useGlobalTerminalLayoutStore,
  useGlobalTerminalStore,
} from "../globalTerminalStore";
import { confirmTerminalClose } from "../lib/terminalCloseConfirm";
import { cn } from "../lib/utils";
import { useServerConfigs } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { terminalEnvironment } from "../state/terminal";
import { useKnownTerminalSessions } from "../state/terminalSessions";
import { useAtomCommand } from "../state/use-atom-command";
import { selectThreadTerminalUiState } from "../terminalUiStateStore";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { Button } from "./ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";

export function GlobalTerminal() {
  const {
    open,
    environmentId,
    launchDirectories,
    initializedEnvironments,
    terminalHeights,
    setTerminalHeight,
    markInitialized,
    setOpen,
    selectEnvironment,
  } = useGlobalTerminalStore();
  const layoutStore = useGlobalTerminalLayoutStore();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const configs = useServerConfigs();
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closing = useRef(new Set<string>());
  const restart = useAtomCommand(terminalEnvironment.restart);
  const close = useAtomCommand(terminalEnvironment.close);
  const canOperateTerminal = useAtomValue(terminalEnvironment.open.permissionAtom(environmentId));
  const config = environmentId === null ? undefined : configs.get(environmentId);
  const cwd = environmentId === null ? undefined : launchDirectories[environmentId];
  const threadRef = useMemo(
    () => (environmentId === null ? null : scopeThreadRef(environmentId, GLOBAL_TERMINAL_OWNER_ID)),
    [environmentId],
  );
  const layout = selectThreadTerminalUiState(layoutStore.terminalUiStateByThreadKey, threadRef);
  const hasLayout =
    threadRef !== null &&
    Object.hasOwn(layoutStore.terminalUiStateByThreadKey, scopedThreadKey(threadRef));
  const initialized =
    hasLayout || (environmentId !== null && initializedEnvironments[environmentId] === true);
  const sessions = useKnownTerminalSessions({ environmentId, threadId: GLOBAL_TERMINAL_OWNER_ID });
  const labels = useMemo(
    () =>
      new Map(
        (sessions ?? []).map((session) => [
          session.target.terminalId,
          resolveTerminalSessionLabel(session.target.terminalId, session.state.summary),
        ]),
      ),
    [sessions],
  );
  const keybindings = useMemo(
    () => mergeWithDefaultKeybindings(config?.keybindings ?? []),
    [config?.keybindings],
  );
  const shortcutOptions = { context: { terminalFocus: true, terminalOpen: true } };

  useEffect(() => {
    if (!open || environmentId !== null || primaryEnvironmentId === null) return;
    const primaryConfig = configs.get(primaryEnvironmentId);
    if (primaryConfig) selectEnvironment(primaryEnvironmentId, primaryConfig.cwd);
  }, [open, environmentId, primaryEnvironmentId, configs, selectEnvironment]);

  useEffect(() => {
    if (
      !threadRef ||
      !cwd ||
      !canOperateTerminal ||
      initializedEnvironments[threadRef.environmentId]
    )
      return;
    if (!hasLayout)
      useGlobalTerminalLayoutStore
        .getState()
        .ensureTerminal(threadRef, GLOBAL_TERMINAL_ID, { open: true, active: true });
    markInitialized(threadRef.environmentId);
  }, [threadRef, cwd, canOperateTerminal, hasLayout, initializedEnvironments, markInitialized]);

  const toggle = () => {
    setOpen(!open);
    setFocusRequestId((current) => current + 1);
  };

  const addTerminal = (mode: "new" | "horizontal" | "vertical") => {
    if (!threadRef || !canOperateTerminal) return;
    const terminalId = nextTerminalId([
      ...layout.terminalIds,
      ...(sessions ?? []).map((session) => session.target.terminalId),
    ]);
    if (mode === "new") layoutStore.newTerminal(threadRef, terminalId);
    else if (mode === "vertical") layoutStore.splitTerminalVertical(threadRef, terminalId);
    else layoutStore.splitTerminal(threadRef, terminalId);
    setFocusRequestId((current) => current + 1);
  };

  const closeTerminal = async (terminalId: string, confirm = true) => {
    if (!threadRef || !canOperateTerminal) return;
    const closingKey = `${scopedThreadKey(threadRef)}:${terminalId}`;
    if (closing.current.has(closingKey)) return;
    closing.current.add(closingKey);
    try {
      if (confirm && !(await confirmTerminalClose([labels.get(terminalId) ?? terminalId]))) return;
      const result = await close({
        environmentId: threadRef.environmentId,
        input: { threadId: GLOBAL_TERMINAL_OWNER_ID, terminalId, deleteHistory: true },
      });
      if (result._tag === "Success") {
        layoutStore.closeTerminal(threadRef, terminalId);
        setError(null);
      } else setError("Could not close the global terminal. Check the environment connection.");
    } finally {
      closing.current.delete(closingKey);
    }
  };

  const restartShell = async () => {
    if (
      environmentId === null ||
      !cwd ||
      !layout.activeTerminalId ||
      restarting ||
      !canOperateTerminal
    )
      return;
    if (!window.confirm("Restart the selected global terminal? Its running commands will stop."))
      return;
    setRestarting(true);
    setError(null);
    try {
      const result = await restart({
        environmentId,
        input: {
          threadId: GLOBAL_TERMINAL_OWNER_ID,
          terminalId: layout.activeTerminalId,
          cwd,
          worktreePath: null,
          cols: 100,
          rows: 24,
        },
      });
      if (result._tag === "Success") setFocusRequestId((current) => current + 1);
      else setError("Could not restart the global terminal. Check the environment connection.");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <>
      {!open ? (
        <div className="flex shrink-0 justify-end border-t border-border bg-background px-3 py-1">
          <Button variant="secondary" size="sm" onClick={toggle}>
            Global terminal
          </Button>
        </div>
      ) : null}
      <section
        hidden={!open}
        aria-label="Global terminal"
        data-terminal-owner="global"
        onKeyDown={(event) => {
          if (!config) return;
          const command = resolveShortcutCommand(event.nativeEvent, keybindings, shortcutOptions);
          if (!command?.startsWith("terminal.")) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          if (command === "terminal.toggle") setOpen(false);
          else if (command === "terminal.close") {
            if (layout.activeTerminalId) void closeTerminal(layout.activeTerminalId);
          } else if (command === "terminal.new") addTerminal("new");
          else if (command === "terminal.split") addTerminal("horizontal");
          else if (command === "terminal.splitVertical") addTerminal("vertical");
        }}
        className={cn(
          "min-h-0 shrink-0 flex-col border-t border-border bg-background",
          open ? "flex" : "hidden",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1">
          <span className="text-sm font-medium">Global terminal</span>
          <Select
            value={environmentId}
            items={environments.map((environment) => ({
              value: environment.environmentId,
              label: environment.label,
            }))}
            onValueChange={(value) => {
              if (value === null) return;
              const selected = EnvironmentId.make(value);
              const selectedConfig = configs.get(selected);
              if (selectedConfig) {
                selectEnvironment(selected, selectedConfig.cwd);
                setError(null);
              }
            }}
          >
            <div className="min-w-0 max-w-56">
              <SelectTrigger size="sm" aria-label="Global terminal environment">
                <SelectValue placeholder="Choose environment" />
              </SelectTrigger>
            </div>
            <SelectPopup>
              {environments.map((environment) => (
                <SelectItem
                  key={environment.environmentId}
                  value={environment.environmentId}
                  disabled={!configs.has(environment.environmentId)}
                >
                  {environment.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            disabled={!config || !layout.activeTerminalId || restarting || !canOperateTerminal}
            onClick={restartShell}
          >
            {restarting ? "Restarting…" : "Restart shell"}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggle}>
            Hide
          </Button>
        </div>
        {error ? (
          <p role="alert" className="px-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {threadRef && config && cwd && (initialized || !canOperateTerminal) ? (
          <ThreadTerminalDrawer
            key={environmentId}
            focusOwner="global"
            linksInBrowser
            threadRef={threadRef}
            threadId={GLOBAL_TERMINAL_OWNER_ID}
            cwd={cwd}
            worktreePath={null}
            visible={open}
            height={terminalHeights[threadRef.environmentId] ?? DEFAULT_GLOBAL_TERMINAL_HEIGHT}
            minHeight={DEFAULT_GLOBAL_TERMINAL_HEIGHT}
            terminalIds={layout.terminalIds}
            activeTerminalId={layout.activeTerminalId}
            terminalGroups={layout.terminalGroups}
            activeTerminalGroupId={layout.activeTerminalGroupId}
            focusRequestId={focusRequestId}
            onSplitTerminal={() => addTerminal("horizontal")}
            onSplitTerminalVertical={() => addTerminal("vertical")}
            onNewTerminal={() => addTerminal("new")}
            splitShortcutLabel={
              shortcutLabelForCommand(keybindings, "terminal.split", shortcutOptions) ?? undefined
            }
            splitVerticalShortcutLabel={
              shortcutLabelForCommand(keybindings, "terminal.splitVertical", shortcutOptions) ??
              undefined
            }
            newShortcutLabel={
              shortcutLabelForCommand(keybindings, "terminal.new", shortcutOptions) ?? undefined
            }
            closeShortcutLabel={
              shortcutLabelForCommand(keybindings, "terminal.close", shortcutOptions) ?? undefined
            }
            onActiveTerminalChange={(terminalId) =>
              layoutStore.setActiveTerminal(threadRef, terminalId)
            }
            onCloseTerminal={(terminalId) => {
              void closeTerminal(terminalId, false);
            }}
            onHeightChange={(height) => setTerminalHeight(threadRef.environmentId, height)}
            keybindings={keybindings}
            terminalLabelsById={labels}
          />
        ) : (
          <p className="p-3 text-sm text-muted-foreground">
            Connect an environment to open its global terminal.
          </p>
        )}
      </section>
    </>
  );
}
