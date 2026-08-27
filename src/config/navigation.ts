import {
  HandHeart,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarOff,
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
 * like different companies: emoji render in the OS's own colors and no
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

/*
 * These three used to be a group called "This week", which was the wrong
 * shape: the week was split across three destinations, so answering "have we
 * got anything on tonight, and has anything changed?" meant visiting all
 * three. The dashboard now carries all of it (Tony, 17 Aug 2026).
 *
 * They stay in the sidebar because each is still the FULL version of what the
 * dashboard shows a slice of — the month view and the iCal subscription, every
 * announcement rather than the last three, every notification ever sent. The
 * group is named for what they are rather than for when they happen.
 */
export const FAMILY_SECTIONS: NavSection[] = [
  { href: "/schedule", Icon: CalendarDays, label: "Full calendar", description: "Month view, conflicts, and add to your own calendar", group: "Dashboard" },
  { href: "/feed", Icon: Megaphone, label: "News", description: "Announcements, ask staff a private question", group: "Dashboard" },
  { href: "/notifications", Icon: Bell, label: "Notifications", description: "Everything you've been told", group: "Dashboard" },
  { href: "/auditions", Icon: Mic, label: "Auditions", description: "Role preferences and audition info", group: "On stage" },
  { href: "/casting", Icon: PartyPopper, label: "Casting", description: "Your child's role, playbill confirmation, feedback", group: "On stage" },
  // Split on 17 Aug 2026. One list of both meant scrolling past nine musicals
  // to find a Tuesday dance class; the labels match the staff portal's own.
  { href: "/shows", Icon: Theater, label: "Shows", description: "Your show, its calls, and tickets", group: "On stage" },
  { href: "/classes", Icon: BookOpen, label: "Classes", description: "When your class meets, and its updates", group: "On stage" },
  { href: "/photos", Icon: Images, label: "Photos", description: "Galleries, and photos of your child", group: "On stage" },
  { href: "/family", Icon: Users, label: "Family profile", description: "Guardians, address, emergency contacts", group: "Your family" },
  { href: "/family/documents", Icon: FileSignature, label: "Document vault", description: "Waivers, forms, and receipts", group: "Your family" },
  { href: "/family/pickup", Icon: TrafficCone, label: "Pickup & drop-off", description: "Request an early pickup or a late drop-off", group: "Your family" },
  { href: "/family/absences", Icon: CalendarOff, label: "Report an absence", description: "A rehearsal or performance your child will miss", group: "Your family" },
  // Sheets are built per show in the staff portal and appear here the moment
  // they are published — hub 0048, 26 Aug 2026.
  { href: "/volunteers", Icon: HandHeart, label: "Volunteer", description: "Sign up to help with your show", group: "Your family" },
  { href: "/messages", Icon: MessagesSquare, label: "Message the office", description: "Admin or Health & Safety, privately", group: "Your family" },
  { href: "/store/buttons", Icon: ShoppingBag, label: "Spirit buttons", description: "Pick a show, add a photo, see the button", group: "Store" },
  { href: "/store/star-pages", Icon: ShoppingBag, label: "Star pages", description: "Playbill tributes to your performer", group: "Store" },
  { href: "/store/lessons", Icon: GraduationCap, label: "Private lessons", description: "Voice, acting & dance coaching", group: "Store" },
  { href: "/coaches", Icon: Contact, label: "Coaching", description: "Meet the coaches and what they teach", group: "Store" },
  { href: "/store/orders", Icon: PackageOpen, label: "Your orders", description: "Order history and reorder", group: "Store" },
  { href: "/reviews", Icon: Star, label: "Give feedback", description: "Private feedback on classes and shows", group: "More" },
  { href: "/staff", Icon: Contact, label: "Our staff", description: "Bios of the people teaching your children", group: "More" },
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
export const STAFF_PORTAL_URL = "https://staffportal.northernvirginiaperformingarts.org";

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
