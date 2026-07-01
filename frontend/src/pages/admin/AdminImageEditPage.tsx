import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FloppyDisk,
  Plus,
  Trash,
  Cube,
  Terminal,
  ListPlus,
  GearSix,
  BracketsCurly,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";

interface EggVariable {
  name: string;
  description: string;
  envKey: string;
  defaultValue: string;
  type: string;
  userViewable: boolean;
  userEditable: boolean;
}

interface EggData {
  id: number;
  name: string;
  description: string;
  dockerImage: string;
  features: string[];
  startup: string;
  installCommand: string;
  configPath: string;
  configStartup: Record<string, string>;
  variables: EggVariable[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

type TabId = "general" | "docker" | "variables" | "install" | "settings" | "raw";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Cube },
  { id: "docker", label: "Docker", icon: Terminal },
  { id: "variables", label: "Variables", icon: ListPlus },
  { id: "install", label: "Install", icon: Terminal },
  { id: "settings", label: "Settings", icon: GearSix },
  { id: "raw", label: "Raw", icon: BracketsCurly },
];

export function AdminImageEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [rawJson, setRawJson] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    dockerImage: "",
    features: [] as string[],
    startup: "",
    installCommand: "",
    configPath: "",
    configStartup: {} as Record<string, string>,
  });

  const [variables, setVariables] = useState<EggVariable[]>([]);
  const [newFeature, setNewFeature] = useState("");

  const fetchEgg = useCallback(async () => {
    try {
      const res = await api.get<{ data: EggData }>(`/admin/images/${id}`);
      const e = res.data;
      setForm({
        name: e.name,
        description: e.description || "",
        dockerImage: e.dockerImage,
        features: e.features || [],
        startup: e.startup || "",
        installCommand: e.installCommand || "",
        configPath: e.configPath || "",
        configStartup: e.configStartup || {},
      });
      setVariables(e.variables || []);
      setRawJson(JSON.stringify(e, null, 2));
    } catch {
      toast("Failed to load image", "error");
      navigate("/admin/images");
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    fetchEgg();
  }, [fetchEgg]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addFeature = () => {
    if (newFeature && !form.features.includes(newFeature)) {
      update("features", [...form.features, newFeature]);
      setNewFeature("");
    }
  };

  const removeFeature = (f: string) => {
    update("features", form.features.filter((feat) => feat !== f));
  };

  const addVariable = () => {
    setVariables((prev) => [
      ...prev,
      { name: "", description: "", envKey: "", defaultValue: "", type: "text", userViewable: true, userEditable: false },
    ]);
  };

  const updateVariable = (index: number, field: keyof EggVariable, value: string | boolean) => {
    setVariables((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/admin/images/${id}`, { ...form, variables });
      toast("Image updated successfully");
      navigate("/admin/images");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRawSave = async () => {
    setSubmitting(true);
    try {
      const parsed = JSON.parse(rawJson);
      await api.post(`/admin/images/${id}`, parsed);
      toast("Image updated from raw JSON");
      fetchEgg();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Invalid JSON", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-neutral-100 dark:bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-neutral-100 dark:bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="max-w-3xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/images")}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{form.name || "Edit Image"}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">ID: {id}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === "general" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => update("description", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Features</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.features.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 dark:bg-white/10 text-sm text-neutral-700 dark:text-neutral-300">
                      {f}
                      <button type="button" onClick={() => removeFeature(f)} className="text-neutral-400 hover:text-red-500">
                        <Trash className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Add feature"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                  />
                  <Button type="button" variant="secondary" onClick={addFeature}>Add</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "docker" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Docker Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Docker Image</Label>
                <Input value={form.dockerImage} onChange={(e) => update("dockerImage", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "variables" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {variables.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-xl border border-neutral-200/30 dark:border-white/[0.07] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Variable {i + 1}</p>
                    <button type="button" onClick={() => removeVariable(i)} className="text-neutral-400 hover:text-red-500">
                      <Trash className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input value={v.name} onChange={(e) => updateVariable(i, "name", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Env Key</Label>
                      <Input value={v.envKey} onChange={(e) => updateVariable(i, "envKey", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Default Value</Label>
                      <Input value={v.defaultValue} onChange={(e) => updateVariable(i, "defaultValue", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <select
                        value={v.type}
                        onChange={(e) => updateVariable(i, "type", e.target.value)}
                        className={cn(
                          "flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm",
                          "text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500",
                        )}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="select">Select</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={v.description} onChange={(e) => updateVariable(i, "description", e.target.value)} />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={v.userViewable}
                        onChange={(e) => updateVariable(i, "userViewable", e.target.checked)}
                        className="rounded"
                      />
                      User Viewable
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={v.userEditable}
                        onChange={(e) => updateVariable(i, "userEditable", e.target.checked)}
                        className="rounded"
                      />
                      User Editable
                    </label>
                  </div>
                </motion.div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addVariable}>
                <Plus className="size-3" />
                Add Variable
              </Button>
            </CardContent>
          </Card>
        )}

        {activeTab === "install" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Install Command</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={form.installCommand}
                onChange={(e) => update("installCommand", e.target.value)}
                className={cn(
                  "w-full h-40 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-mono",
                  "text-neutral-900 dark:text-white placeholder:text-neutral-400",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 resize-none"
                )}
                placeholder="#!/bin/bash"
              />
            </CardContent>
          </Card>
        )}

        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Startup Command</Label>
                <textarea
                  value={form.startup}
                  onChange={(e) => update("startup", e.target.value)}
                  className={cn(
                    "w-full h-32 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-mono",
                    "text-neutral-900 dark:text-white placeholder:text-neutral-400",
                    "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 resize-none"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Config File Path</Label>
                <Input value={form.configPath} onChange={(e) => update("configPath", e.target.value)} placeholder="server.properties" />
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "raw" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Raw JSON Editor</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                className={cn(
                  "w-full h-96 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-mono",
                  "text-neutral-900 dark:text-white placeholder:text-neutral-400",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 resize-none"
                )}
              />
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={handleRawSave} loading={submitting}>
                Save Raw JSON
              </Button>
            </CardContent>
          </Card>
        )}

        {activeTab !== "raw" && (
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => navigate("/admin/images")}>Cancel</Button>
            <Button type="submit" loading={submitting}>
              <FloppyDisk className="size-4" />
              Save Changes
            </Button>
          </div>
        )}
      </form>
    </motion.div>
  );
}
