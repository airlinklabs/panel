import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh">
      <div
        className="w-full max-w-[420px] shrink-0 flex flex-col justify-center max-md:border-0 max-md:max-w-full max-md:border-r-0 max-md:px-6 max-md:py-10 max-md:min-h-dvh max-md:justify-center max-md:relative max-md:z-[1] max-md:bg-white/95 dark:max-md:bg-[#141414]/95"
        style={{
          padding: "56px 44px",
          background: "color-mix(in srgb, var(--theme-bg-card, white) 92%, transparent)",
          boxShadow: "24px 0 70px rgba(43, 55, 49, 0.12)",
          backdropFilter: "blur(18px)",
          borderRight: "1px solid var(--theme-border, #e5e5e5)",
        }}
      >
        <Outlet />
      </div>
      <div
        className="flex-1 max-md:hidden"
        style={{
          background: "url('/assets/wallpapers/login.jpeg') center/cover no-repeat",
        }}
      />
    </div>
  );
}
