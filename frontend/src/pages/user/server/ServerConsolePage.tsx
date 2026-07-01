import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Terminal, ArrowUp, Spinner } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

export function ServerConsolePage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!id || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/console/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      xtermRef.current?.focus();
    };

    ws.onmessage = (event) => {
      xtermRef.current?.write(event.data);
    };

    ws.onclose = () => {
      setConnected(false);
      xtermRef.current?.writeln("\r\n\x1b[33mConnection lost. Reconnecting...\x1b[0m");
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectAttempts.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [id]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#a3a3a3",
        selectionBackground: "rgba(255,255,255,0.1)",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(terminalRef.current);

    connect();

    return () => {
      observer.disconnect();
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      term.dispose();
    };
  }, [connect]);

  const sendCommand = () => {
    if (!command.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(command + "\n");
    setCommandHistory((prev) => [...prev, command].slice(-50));
    setHistoryIndex(-1);
    setCommand("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col h-full"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
            <Terminal className="size-5" />
            Console
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex-1 bg-[#0a0a0a] rounded-xl border border-neutral-200/30 dark:border-white/[0.07] overflow-hidden flex flex-col min-h-0">
          <div ref={terminalRef} className="flex-1 min-h-0 p-2" />
          <div className="border-t border-white/10 p-2 flex items-center gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? "Type a command..." : "Connecting..."}
              disabled={!connected}
              className="flex-1 h-8 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none font-mono px-2"
            />
            <button
              onClick={sendCommand}
              disabled={!connected || !command.trim()}
              className="h-8 inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:pointer-events-none transition-colors px-2"
            >
              <ArrowUp className="size-4 text-neutral-300" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
