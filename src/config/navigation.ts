/**
 * The single source of truth for app sections. The dashboard feature grid
 * AND the hamburger menu render from these lists, so adding a section here
 * puts it in both places at once — they can never drift apart.
 */

export interface NavSection {
  href: string;
  emoji: string;
  label: string;
  description: string;
}

export const FAMILY_SECTIONS: NavSection[] = [
  { href: "/schedule", emoji: "📅", label: "Schedule", description: "Every rehearsal and class, all children merged" },
  { href: "/feed", emoji: "📣", label: "News", description: "Announcements, ask staff a private question" },
  { href: "/auditions", emoji: "🎬", label: "Auditions", description: "Role preferences and audition info" },
  { href: "/casting", emoji: "🎉", label: "Casting", description: "Your child's role, playbill confirmation, feedback" },
  { href: "/messages", emoji: "✉️", label: "Message the office", description: "Admin or Health & Safety, privately" },
  { href: "/photos", emoji: "📸", label: "Photos", description: "Galleries, and photos of your child" },
  { href: "/family", emoji: "👪", label: "Family profile", description: "Guardians, address, emergency contacts" },
  { href: "/family/documents", emoji: "🗂️", label: "Document vault", description: "Waivers, forms, and receipts" },
  { href: "/store", emoji: "🎟️", label: "Buttons & star pages", description: "Custom buttons and playbill tributes" },
  { href: "/store/lessons", emoji: "🎤", label: "Private lessons", description: "Voice, acting & dance coaching" },
  { href: "/store/orders", emoji: "📦", label: "Your orders", description: "Order history and reorder" },
  { href: "/family/pickup", emoji: "🚗", label: "Drop-off & pick-up", description: "Request early drop-off or late pick-up" },
  { href: "/reviews", emoji: "⭐", label: "Give feedback", description: "Private feedback on classes and shows" },
  { href: "/productions", emoji: "🎭", label: "Productions", description: "Show info and tickets" },
  { href: "/staff", emoji: "👋", label: "Our staff", description: "Teaching artists and production team" },
  { href: "/notifications", emoji: "🔔", label: "Notifications", description: "Everything you've been told" },
  { href: "/notifications/settings", emoji: "⚙️", label: "Notification settings", description: "What we notify you about, quiet hours" },
];

export const STAFF_SECTIONS: NavSection[] = [
  { href: "/admin", emoji: "🛠️", label: "Staff tools", description: "Everything waiting on you, system status" },
  { href: "/admin/messages", emoji: "📨", label: "Family messages", description: "Inbox for your role" },
  { href: "/admin/auditions/prod-frozen", emoji: "🎬", label: "Audition roster", description: "Rubrics for Frozen Jr. auditions" },
  { href: "/admin/casting/prod-frozen", emoji: "🎭", label: "Casting board", description: "Drag students into Frozen Jr. roles" },
  { href: "/admin/cast-list/prod-frozen", emoji: "📋", label: "Cast list status", description: "Filled and accepted roles at a glance" },
  { href: "/admin/email", emoji: "📧", label: "Email families", description: "Templates, targeting, send history" },
  { href: "/admin/questions", emoji: "💬", label: "Question queue", description: "Answer families privately" },
  { href: "/admin/health", emoji: "🩺", label: "Health & safety", description: "Form status, emergency roster" },
  { href: "/admin/pickup", emoji: "🚦", label: "Pick-up approvals", description: "Approve requests, daily roster" },
  { href: "/admin/store", emoji: "🏭", label: "Button orders", description: "Fulfillment, manifest, print sheet" },
  { href: "/admin/photos", emoji: "🖼️", label: "Photo ingestion", description: "Pull galleries, run matching" },
  { href: "/admin/registration", emoji: "🔄", label: "Registration sync", description: "Sync health and resync" },
  { href: "/admin/directory", emoji: "📇", label: "Family directory", description: "All families, students, contacts" },
  { href: "/admin/staff-profiles", emoji: "✅", label: "Profile approvals", description: "Review staff profile changes" },
  { href: "/staff/edit", emoji: "✏️", label: "Edit my profile", description: "Bio and photo, admin-approved" },
  { href: "/staff/feedback", emoji: "📊", label: "My feedback", description: "What families said about your work" },
];
