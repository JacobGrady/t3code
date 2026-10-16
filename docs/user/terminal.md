# Terminals

## Global terminal

Choose **Open global terminal** in the command palette, or use the **Global
terminal** launcher, to keep a shell available while switching threads, projects,
or settings. Each environment has its own global shell; switching environments
does not stop the shell on the previous one. Hide the panel to keep working without
ending its sessions. The global panel supports the same new terminals, horizontal
and vertical splits, terminal switching, resizing, shortcuts, and copy/paste menus
as chat terminals. Its layout is saved separately for each environment. Closing a
terminal stops that shell; hiding the panel does not. Use the restart control to
restart only the selected shell.

The global shell starts in the environment server's working directory and does
not follow the active project's directory. Use `cd` to change directories. It
survives navigation and client reconnects while the environment server remains
running, but does not survive that server restarting or the machine rebooting.

Servers started by global terminals appear in the dock. Select a server to open
it. For remote localhost links, open a chat in the same environment first: the
link opens in that environment's server-side browser. If the environment has no
server-side browser or you do not have preview permission, T3 Code explains what
is needed instead of opening your computer's localhost. Public links and
desktop-local server links open in your system browser. You can also set up port
forwarding and open the forwarded address yourself.

## Terminal history

Each terminal keeps up to 5,000 lines and 8 MiB of scrollback on its environment
server. T3 Code removes the oldest output when either limit is reached. A long
line can be shortened at the start. New terminal output is not truncated.

These limits apply when you reconnect and when T3 Code restores saved terminal
history. A client can show less scrollback than the server keeps.

On web and desktop, use Shift+PageUp and Shift+PageDown to read scrollback
without leaving terminal input. Ctrl+Shift+Home and Ctrl+Shift+End jump to the
start and latest output; use Cmd instead of Ctrl on macOS. Full-screen terminal
programs keep these navigation keys.

To copy all retained output, choose Select all in the terminal's context menu,
then copy. Cmd+A on macOS and Ctrl+Shift+A elsewhere select the same output.
Ctrl+A still moves to the beginning of shell input on Windows and Linux.
Jump to latest in the context menu returns to the current output.
