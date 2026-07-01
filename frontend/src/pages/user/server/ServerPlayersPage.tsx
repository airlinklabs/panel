import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, MagnifyingGlass, X, UserCircle } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";

interface Player {
  name: string;
  uuid: string;
}

interface ServerInfo {
  maxPlayers: number;
  onlinePlayers: number;
  version: string;
}

export function ServerPlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchPlayers = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/server/${id}/players`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
        setServerInfo(data.serverInfo || null);
      }
    } catch {
      toast("Failed to load players", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 10000);
    return () => clearInterval(interval);
  }, [fetchPlayers]);

  const filteredPlayers = players.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-2">
          Players
        </h1>
        {serverInfo && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
            {serverInfo.onlinePlayers}/{serverInfo.maxPlayers} online · {serverInfo.version}
          </p>
        )}

        <div className="relative mb-4">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="flex h-9 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 pl-9 pr-4 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="size-8 bg-neutral-200 dark:bg-white/10 rounded-full" />
                  <div className="h-3 bg-neutral-200 dark:bg-white/10 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {search ? "No players found" : "No players online"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden sm:table-cell">
                      UUID
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
                  {filteredPlayers.map((player) => (
                    <tr
                      key={player.uuid || player.name}
                      className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={`https://mc-heads.net/avatar/${player.uuid}/32`}
                            alt={player.name}
                            className="size-8 rounded-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <span className="font-medium text-neutral-900 dark:text-white">
                            {player.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 font-mono hidden sm:table-cell">
                        {player.uuid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
