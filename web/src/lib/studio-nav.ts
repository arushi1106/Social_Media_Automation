export const STUDIO_NAV_LINKS = [
  { href: "/studio", label: "Overview" },
  { href: "/studio/ideas", label: "Ideas" },
  { href: "/studio/planner", label: "Planner" },
  { href: "/studio/strategy", label: "Strategy" },
  { href: "/studio/projects", label: "Projects" },
  { href: "/studio/work", label: "Work" },
  { href: "/studio/create", label: "New draft" },
  { href: "/studio/templates", label: "Templates" },
  { href: "/studio/drafts", label: "Drafts" },
  { href: "/studio/brand", label: "Brand" },
] as const;

export function isStudioNavCurrent(pathname: string, href: string): boolean {
  if (href === "/studio") {
    return pathname === "/studio" || pathname === "/studio/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
