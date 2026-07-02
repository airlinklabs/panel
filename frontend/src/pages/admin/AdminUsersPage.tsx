import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MagnifyingGlass,
  Trash,
  PencilSimple,
  Eye,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";

interface UserData {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  serverLimit: number;
  avatar?: string;
  servers?: { id: number }[];
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: UserData[] }>("/admin/users/list");
      setUsers(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDelete = async (userId: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await api.delete(`/admin/users/delete/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // silent
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto pt-16">
      <div className="sm:flex sm:items-center px-8 pt-6 pb-4">
        <div className="sm:flex-auto">
          <h1 className="text-base font-medium leading-6 text-neutral-800 dark:text-white">Users</h1>
          <p className="mt-1 tracking-tight text-sm text-neutral-500">Manage your users</p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/admin/users/create")}
              className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium transition hover:opacity-90"
            >
              New User
            </button>
          </div>
        </div>
      </div>

      <div className="mx-8 mb-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600/30 bg-white dark:bg-neutral-700 pl-10 pr-4 py-2 text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 placeholder-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-8 mb-6">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Total Users</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{users.length}</p>
          <p className="text-sm text-neutral-400 mt-2">Registered users</p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white mb-2">Admins</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{users.filter((u) => u.isAdmin).length}</p>
          <p className="text-sm text-neutral-400 mt-2">Administrator accounts</p>
        </div>
      </div>

      <div className="overflow-x-auto shadow-sm rounded-xl mx-8 mt-2 mb-8 border border-neutral-200 dark:border-neutral-800/40">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Name</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Role</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Servers</th>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-neutral-800 dark:text-white sm:pl-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-neutral-800">
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-4">
                    <div className="h-5 bg-neutral-100 dark:bg-white/5 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No users found</p>
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/users/edit/${user.id}`)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <img
                          src={user.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user.username)}`}
                          alt={user.username}
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neutral-400 border-2 border-white dark:border-neutral-900" />
                        </span>
                      </div>
                      <div className="font-medium text-neutral-800 dark:text-white">{user.username}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {user.isAdmin ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Admin</span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">User</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">{user.servers?.length || 0}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/edit/${user.id}`); }}
                        className="rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-medium hover:opacity-90 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }}
                        className="rounded-xl bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition"
                        aria-label="Delete user"
                      >
                        <Trash size={14} className="text-white" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
