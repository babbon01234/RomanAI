"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/teacher", label: "Lessons" },
  { href: "/teacher/questions", label: "Questions" },
  { href: "/teacher/faq", label: "FAQ" },
];

export function TeacherNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6">
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/teacher" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "relative py-1 text-[13px] transition-colors " +
              (active
                ? "text-parchment after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold"
                : "text-parchment/55 hover:text-parchment/85")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
