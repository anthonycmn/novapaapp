import {
  Bell,
  CalendarDays,
  Camera,
  ClipboardCheck,
  Contact,
  Drama,
  FileSignature,
  Gauge,
  GraduationCap,
  HeartPulse,
  Images,
  Mail,
  MailPlus,
  Megaphone,
  MessagesSquare,
  Mic,
  PackageOpen,
  PartyPopper,
  RotateCcw,
  Settings,
  ShoppingBag,
  Star,
  Stethoscope,
  Theater,
  TrafficCone,
  UserPen,
  Users,
  Wrench,
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
  { href: "/store", Icon: ShoppingBag, label: "Buttons & star pages", description: "Custom buttons and playbill tributes", group: "Store" },
  { href: "/store/lessons", Icon: GraduationCap, label: "Private lessons", description: "Voice, acting & dance coaching", group: "Store" },
  { href: "/store/orders", Icon: PackageOpen, label: "Your orders", description: "Order history and reorder", group: "Store" },
  { href: "/reviews", Icon: Star, label: "Give feedback", description: "Private feedback on classes and shows", group: "More" },
  { href: "/staff", Icon: Contact, label: "Our staff", description: "Teaching artists and production team", group: "More" },
  { href: "/notifications/settings", Icon: Settings, label: "Notification settings", description: "What we notify you about, quiet hours", group: "More" },
];

export const STAFF_SECTIONS: NavSection[] = [
  { href: "/admin", Icon: Wrench, label: "Staff tools", description: "Everything waiting on you, system status", group: "Staff & admin" },
  { href: "/staff/shows", Icon: Drama, label: "My shows", description: "Your productions: casting, roster & curriculum", group: "Staff & admin" },
  { href: "/admin/messages", Icon: Mail, label: "Family messages", description: "Inbox for your role", group: "Staff & admin" },
  { href: "/admin/email", Icon: MailPlus, label: "Email families", description: "Templates, targeting, send history", group: "Staff & admin" },
  { href: "/admin/questions", Icon: MessagesSquare, label: "Question queue", description: "Answer families privately", group: "Staff & admin" },
  { href: "/admin/health", Icon: Stethoscope, label: "Health & safety", description: "Form status, emergency roster", group: "Staff & admin" },
  { href: "/admin/pickup", Icon: HeartPulse, label: "Pick-up approvals", description: "Approve requests, daily roster", group: "Staff & admin" },
  { href: "/admin/store", Icon: PackageOpen, label: "Button orders", description: "Fulfillment, manifest, print sheet", group: "Staff & admin" },
  { href: "/admin/lessons", Icon: GraduationCap, label: "Lesson roster", description: "Weekly private-lesson slots and students", group: "Staff & admin" },
  { href: "/admin/photos", Icon: Camera, label: "Photo ingestion", description: "Pull galleries, run matching", group: "Staff & admin" },
  { href: "/admin/registration", Icon: RotateCcw, label: "Registration sync", description: "Sync health and resync", group: "Staff & admin" },
  { href: "/admin/directory", Icon: Gauge, label: "Family directory", description: "All families, students, contacts", group: "Staff & admin" },
  { href: "/admin/staff-profiles", Icon: ClipboardCheck, label: "Profile approvals", description: "Review staff profile changes", group: "Staff & admin" },
  { href: "/staff/edit", Icon: UserPen, label: "Edit my profile", description: "Bio and photo, admin-approved", group: "Staff & admin" },
  { href: "/staff/feedback", Icon: Star, label: "My feedback", description: "What families said about your work", group: "Staff & admin" },
];

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
