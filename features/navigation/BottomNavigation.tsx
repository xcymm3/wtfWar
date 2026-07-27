"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "角色库" },
  { href: "/history", label: "战斗历史" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/create");
  return pathname.startsWith(href);
}

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-navigation" aria-label="主导航">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-navigation-link ${isActive(pathname, item.href) ? "is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
