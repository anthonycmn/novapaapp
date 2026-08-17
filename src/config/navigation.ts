import {
  Bell,
  CalendarDays,
  Contact,
  FileSignature,
  GraduationCap,
  Images,
  Megaphone,
  MessagesSquare,
  Mic,
  PackageOpen,
  PartyPopper,
  Settings,
  ShoppingBag,
  Star,
  Theater,
  TrafficCone,
  UserPen,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The single source of truth for app sections. The sidebar, the mobile
 * drawer AND the dashboard feature grid render from these lists, so adding a
 * section here puts it everywhere at once — they can never drift apart.
 *
 * Icons are lucide, matching the staff portal (Tony, 2026-08-16). The emoji
 * these used to carry were the other half of why the two products looked
 * like different companies: emoji render in the OS's own colours and no
 * amount of palette work brings them into line.
 */

export interface NavSection {
  href: string;
  Icon: LucideIcon;
  label: string;
  description: string;
  /** Sidebar grouping, mirroring the staff portal's grouped nav. */
  group: string;
}

export const FAMILY_SECTIONS: NavSection[] = [
  { href: "/schedule", Icon: CalendarDays, label: "Schedule", description: "Every rehearsal and class, all children merged", group: "This week" },
  { href: "/feed", Icon: Megaphone, label: "News", description: "Announcements, ask staff a private question", group: "This week" },
  { href: "/notifications", Icon: Bell, label: "Notifications", description: "Everything you've been told", group: "This week" },
  { href: "/auditions", Icon: Mic, label: "Auditions", description: "Role preferences and audition info", group: "On stage" },
  { href: "/casting", Icon: PartyPopper, label: "Casting", description: "Your child's role, playbill confirmation, feedback", group: "On stage" },
  { href: "/productions", Icon: Theater, label: "Productions", description: "Show info and tickets", group: "On stage" },
  { href: "/photos", Icon: Images, label: "Photos", description: "Galleries, and photos of your child", group: "On stage" },
  { href: "/family", Icon: Users, label: "Family profile", description: "Guardians, address, emergency contacts", group: "Your family" },
  { href: "/family/documents", Icon: FileSignature, label: "Document vault", description: "Waivers, forms, and receipts", group: "Your family" },
  { href: "/family/pickup", Icon: TrafficCone, label: "Drop-off & pick-up", description: "Request early drop-off or late pick-up", group: "Your family" },
  { href: "/messages", Icon: MessagesSquare, label: "Message the office", description: "Admin or Health & Safety, privately", group: "Your family" },
  { href: "/store/buttons", Icon: ShoppingBag, label: "Spirit buttons", description: "Pick a show, add a photo, see the button", group: "Store" },
  { href: "/store", Icon: ShoppingBag, label: "Star pages", description: "Playbill tributes to your performer", group: "Store" },
  { href: "/store/lessons", Icon: GraduationCap, label: "Private lessons", description: "Voice, acting & dance coaching", group: "Store" },
  { href: "/store/orders", Icon: PackageOpen, label: "Your orders", description: "Order history and reorder", group: "Store" },
  { href: "/reviews", Icon: Star, label: "Give feedback", description: "Private feedback on classes and shows", group: "More" },
  { href: "/staff", Icon: Contact, label: "Our staff", description: "Teaching artists and production team", group: "More" },
  { href: "/notifications/settings", Icon: Settings, label: "Notification settings", description: "What we notify you about, quiet hours", group: "More" },
];

/**
 * Staff sections still surfaced in the parent portal.
 *
 * Tony, 16 Aug 2026: "all of the admin/staff tools in the parent portal
 * [should] port over and be bridged to the staff portal… parents should not
 * have access to that information."
 *
 * Parents never could — every /admin route calls hasRoleAtLeast server-side,
 * the provider re-checks each call, and RLS sits under all of it. What this
 * change removes is the *duplication*: the seven staff no longer see a second
 * copy of their own tools while signed in here. The routes still exist and
 * are still guarded, so bookmarks and deep links keep working; they are
 * simply no longer advertised.
 *
 * One entry stays, deliberately. The staff portal's BioApprovals page says
 * why in its own header: "Staff edit their public bios in the parent portal;
 * families see nothing until it passes this desk." Authoring lives here,
 * approval lives there. Remove this and the approval queue has no source.
 */
export const STAFF_SECTIONS: NavSection[] = [
  { href: "/staff/edit", Icon: UserPen, label: "Edit my profile", description: "Your public bio and headshot — admin-approved before families see it", group: "Staff" },
];

/**
 * Where the eleven duplicated tools went, plus the three ported on
 * 16 Aug 2026 (registration sync, open questions, my feedback). Rendered as
 * a single outbound link rather than fifteen dead rows.
 */
export const STAFF_PORTAL_URL = "https://novapa-staff-portal.netlify.app";

/** Section lists grouped for the sidebar, in declaration order. */
export function groupSections(sections: NavSection[]): Array<[string, NavSection[]]> {
  const groups = new Map<string, NavSection[]>();
  for (const section of sections) {
    const existing = groups.get(section.group);
    if (existing) existing.push(section);
    else groups.set(section.group, [section]);
  }
  return [...groups];
}
