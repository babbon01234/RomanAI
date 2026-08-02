"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/teacher", label: "Lessons" },
  { href: "/teacher/review", label: "Review" },
  { href: "/teacher/questions", label: "Questions" },
  { href: "/teacher/faq", label: "FAQ" },
];

/** @param pending unreviewed passages across every lesson — 0 hides the count. */
export function TeacherNav({ pending }: { pending: number }) {
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
            {/* Work waiting on a person, so it's a count and not a red dot. */}
            {href === "/teacher/review" && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-medium text-ink">
                {pending > 99 ? "99+" : pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
