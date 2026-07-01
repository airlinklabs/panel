import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-neutral-900 dark:bg-neutral-950 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-800/40 via-transparent to-transparent" />
        <div className="relative z-10 text-center px-12">
          <h1 className="text-4xl font-bold font-display text-white tracking-tight mb-4">
            Airlink
          </h1>
          <p className="text-lg text-neutral-400 max-w-md">
            Game server management made simple.
          </p>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50 dark:bg-neutral-950">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
