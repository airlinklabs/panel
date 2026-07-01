import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass,
  Plus,
  Trash,
  PencilSimple,
  User,
  UsersThree,
  X,
  Warning,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";

interface UserData {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  serverLimit: number;
  createdAt: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/delete/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Users</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {users.length} registered {users.length === 1 ? "user" : "users"}
          </p>
        </div>
        <Button onClick={() => navigate("/admin/users/create")}>
          <Plus className="size-4" />
          Create User
        </Button>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-neutral-50 dark:bg-white/[0.02]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <UsersThree className="size-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {search ? "No users match your search" : "No users found"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/30 dark:border-white/[0.07]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Username</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Limit</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/30 dark:divide-white/[0.07]">
                  {filtered.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/users/edit/${user.id}`)}
                    >
                      <td className="px-4 py-3 text-neutral-500 tabular-nums">{user.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                            <User className="size-4 text-neutral-400" />
                          </div>
                          <span className="font-medium text-neutral-900 dark:text-white">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 hidden sm:table-cell">{user.email}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant={user.isAdmin ? "info" : "default"}>
                          {user.isAdmin ? "Admin" : "User"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 tabular-nums hidden lg:table-cell">{user.serverLimit}</td>
                      <td className="px-4 py-3 text-neutral-400 hidden lg:table-cell">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/users/edit/${user.id}`)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                          >
                            <PencilSimple className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-2 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <Warning className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <ModalTitle className="text-center">Delete User</ModalTitle>
            <ModalDescription className="text-center">
              Are you sure you want to delete <strong>{deleteTarget?.username}</strong>? This action cannot be undone.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary" disabled={deleting}>Cancel</Button>
            </ModalClose>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash className="size-4" />
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
