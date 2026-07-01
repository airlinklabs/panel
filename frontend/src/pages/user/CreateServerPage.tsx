import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Server, Cpu, MemoryStick, HardDrive } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext";

interface Node {
  id: number;
  name: string;
  address: string;
}

interface Image {
  id: number;
  name: string;
  dockerImages: string;
  startup: string;
  variables: string;
  portRequirements: string;
}

export function CreateServerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [images, setImages] = useState<Image[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [imageId, setImageId] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [memory, setMemory] = useState(512);
  const [cpu, setCpu] = useState(100);
  const [storage, setStorage] = useState(5120);
  const [resourceLimits, setResourceLimits] = useState({ maxMemory: 512, maxCpu: 100, maxStorage: 5120 });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch("/create-server", { credentials: "same-origin" });
        const data = await res.json();
        setNodes(data.nodes || []);
        setImages(data.images || []);
        if (data.resourceLimits) setResourceLimits(data.resourceLimits);
      } catch {
        toast("Failed to load server creation options", "error");
      } finally {
        setFetching(false);
      }
    };
    fetchOptions();
  }, [toast]);

  const selectedImage = images.find((img) => img.id === parseInt(imageId));
  const dockerOptions = selectedImage
    ? (() => {
        try {
          const parsed = JSON.parse(selectedImage.dockerImages || "[]");
          return parsed.flatMap((obj: Record<string, string>) =>
            Object.entries(obj).map(([key, value]) => ({ label: key, value }))
          );
        } catch {
          return [];
        }
      })()
    : [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/create-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          nodeId,
          imageId,
          dockerImage,
          Memory: memory,
          Cpu: cpu,
          Storage: storage,
        }),
        credentials: "same-origin",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create server");
      }

      toast("Server created successfully", "success");
      navigate("/");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create server", "error");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/3" />
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-white/10 rounded-lg w-1/4" />
                <div className="h-10 bg-neutral-200 dark:bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 mb-4 transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-6">
          Create Server
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Basic Info
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                  Server name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Server"
                  required
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Configuration
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                    Node
                  </label>
                  <select
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors appearance-none"
                  >
                    <option value="">Select a node</option>
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                    Image / Egg
                  </label>
                  <select
                    value={imageId}
                    onChange={(e) => {
                      setImageId(e.target.value);
                      setDockerImage("");
                    }}
                    required
                    className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors appearance-none"
                  >
                    <option value="">Select an image</option>
                    {images.map((img) => (
                      <option key={img.id} value={img.id}>
                        {img.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {dockerOptions.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-neutral-900 dark:text-white mb-1.5 block">
                    Docker Image
                  </label>
                  <select
                    value={dockerImage}
                    onChange={(e) => setDockerImage(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 transition-colors appearance-none"
                  >
                    <option value="">Select a docker image</option>
                    {dockerOptions.map((opt) => (
                      <option key={opt.value} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-neutral-200/30 dark:border-white/[0.07] rounded-xl p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Resources
            </h2>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <MemoryStick className="size-4 text-neutral-400" />
                    Memory
                  </label>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {memory}MB
                  </span>
                </div>
                <input
                  type="range"
                  min={128}
                  max={resourceLimits.maxMemory}
                  step={64}
                  value={memory}
                  onChange={(e) => setMemory(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-neutral-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-neutral-900 dark:accent-white"
                />
                <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                  <span>128MB</span>
                  <span>{resourceLimits.maxMemory}MB</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <Cpu className="size-4 text-neutral-400" />
                    CPU
                  </label>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {cpu}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={resourceLimits.maxCpu}
                  step={50}
                  value={cpu}
                  onChange={(e) => setCpu(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-neutral-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-neutral-900 dark:accent-white"
                />
                <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                  <span>50%</span>
                  <span>{resourceLimits.maxCpu}%</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <HardDrive className="size-4 text-neutral-400" />
                    Storage
                  </label>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {storage}MB
                  </span>
                </div>
                <input
                  type="range"
                  min={128}
                  max={resourceLimits.maxStorage}
                  step={128}
                  value={storage}
                  onChange={(e) => setStorage(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-neutral-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-neutral-900 dark:accent-white"
                />
                <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                  <span>128MB</span>
                  <span>{resourceLimits.maxStorage}MB</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-10 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 border border-neutral-200 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5 text-sm px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name || !nodeId || !imageId || !dockerImage}
              className="h-10 inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50 text-sm gap-2 px-4"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Server className="size-4" />
                  Create server
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
