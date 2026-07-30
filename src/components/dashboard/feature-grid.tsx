import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Everything the app can do, in one place. The bottom tab bar only holds
 * five destinations, so without this the rest of the app is effectively
 * hidden behind an overflow menu.
 */
const FAMILY_FEATURES = [
  { href: "/schedule", emoji: "📅", label: "Schedule", description: "Every rehearsal and class, all children merged" },
  { href: "/feed", emoji: "📣", label: "News", description: "Announcements, ask staff a private question" },
  { href: "/photos", emoji: "📸", label: "Photos", description: "Galleries, and photos of your child" },
  { href: "/family", emoji: "👪", label: "Family profile", description: "Guardians, address, emergency contacts" },
  { href: "/family/documents", emoji: "🗂️", label: "Document vault", description: "Waivers, forms, and receipts" },
  { href: "/auditions", emoji: "🎬", label: "Auditions", description: "Role preferences and audition info" },
  { href: "/casting", emoji: "🎉", label: "Casting", description: "Your child's role, playbill confirmation, feedback" },
  { href: "/messages", emoji: "✉️", label: "Message the office", description: "Admin or Health & Safety, privately" },
  { href: "/store", emoji: "🎟️", label: "Spirit buttons", description: "Design and order custom buttons" },
  { href: "/store/catalog", emoji: "⭐", label: "Star pages & lessons", description: "Playbill tributes, voice & acting coaching" },
  { href: "/store/orders", emoji: "📦", label: "Your orders", description: "Order history and reorder" },
  { href: "/family/pickup", emoji: "🚗", label: "Drop-off & pick-up", description: "Request early drop-off or late pick-up" },
  { href: "/reviews", emoji: "⭐", label: "Give feedback", description: "Private feedback on classes and shows" },
  { href: "/productions", emoji: "🎭", label: "Productions", description: "Show info and tickets" },
  { href: "/staff", emoji: "👋", label: "Our staff", description: "Teaching artists and production team" },
  { href: "/notifications", emoji: "🔔", label: "Notifications", description: "Everything you've been told" },
];

const STAFF_FEATURES = [
  { href: "/admin", emoji: "🛠️", label: "Staff tools", description: "Everything waiting on you, system status" },
  { href: "/admin/messages", emoji: "📨", label: "Family messages", description: "Inbox for your role" },
  { href: "/admin/auditions/prod-frozen", emoji: "🎬", label: "Audition roster", description: "Rubrics for Frozen Jr. auditions" },
  { href: "/admin/casting/prod-frozen", emoji: "🎭", label: "Casting board", description: "Drag students into Frozen Jr. roles" },
  { href: "/admin/email", emoji: "📧", label: "Email families", description: "Templates, targeting, send history" },
  { href: "/admin/questions", emoji: "💬", label: "Question queue", description: "Answer families privately" },
  { href: "/admin/health", emoji: "🩺", label: "Health & safety", description: "Form status, emergency roster" },
  { href: "/admin/pickup", emoji: "🚦", label: "Pick-up approvals", description: "Approve requests, daily roster" },
  { href: "/admin/store", emoji: "🏭", label: "Button orders", description: "Fulfillment, manifest, print sheet" },
  { href: "/admin/photos", emoji: "🖼️", label: "Photo ingestion", description: "Pull galleries, run matching" },
  { href: "/admin/registration", emoji: "🔄", label: "Registration sync", description: "Sync health and resync" },
  { href: "/staff/feedback", emoji: "📊", label: "My feedback", description: "What families said about your work" },
  { href: "/staff/edit", emoji: "✏️", label: "Edit my profile", description: "Bio and photo, admin-approved" },
  { href: "/admin/directory", emoji: "📇", label: "Family directory", description: "All families, students, contacts" },
  { href: "/admin/staff-profiles", emoji: "✅", label: "Profile approvals", description: "Review staff profile changes" },
];

function Grid({ items }: { items: typeof FAMILY_FEATURES }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-1 p-3">
              <span aria-hidden className="text-xl">
                {item.emoji}
              </span>
              <span className="text-sm font-medium leading-tight">{item.label}</span>
              <span className="text-xs leading-tight text-muted-foreground">
                {item.description}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function FeatureGrid({ isStaff }: { isStaff: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Everything in the app</CardTitle>
        <CardDescription>
          The tabs below cover the day-to-day; here&apos;s the rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <Grid items={FAMILY_FEATURES} />
        {isStaff && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Staff &amp; admin
            </h3>
            <Grid items={STAFF_FEATURES} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
