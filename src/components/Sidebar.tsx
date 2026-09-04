"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/projects", label: "Projects", icon: "◻" },
  { href: "/agents", label: "Agents", icon: "◈" },
  { href: "/tasks", label: "Tasks", icon: "▸" },
  { href: "/models", label: "Models", icon: "◇" },
  { href: "/security", label: "Security", icon: "⬡" },
  { href: "/audit", label: "Audit", icon: "◎" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-[#12121a] border-r border-[#27272a] flex flex-col">
      <div className="p-5 border-b border-[#27272a]">
        <h1 className="text-lg font-bold tracking-tight text-[#e4e4e7]">
          KANIYAN
        </h1>
        <p className="text-xs text-[#71717a] mt-1">
          AI Software Factory
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-[#6366f1]/10 text-[#818cf8] border border-[#6366f1]/20"
                  : "text-[#a1a1aa] hover:bg-[#22223a] hover:text-[#e4e4e7] border border-transparent"
              }`}
            >
              <span className="text-base w-5 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#27272a]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
          <span className="text-xs text-[#71717a]">
            System Operational
          </span>
        </div>
      </div>
    </aside>
  );
}
