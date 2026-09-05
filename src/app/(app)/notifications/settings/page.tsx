import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import type { NotificationType } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import {
  setQuietHoursAction,
  toggleNotificationTypeAction,
} from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PushToggle } from "@/components/pwa/push-toggle";

export const metadata = { title: "Notification settings" };

const TYPES: Array<{ type: NotificationType; label: string; hint: string }> = [
  { type: "feed_post", label: "Feed posts", hint: "New announcements from staff" },
  { type: "direct_message", label: "Replies", hint: "Answers to your questions" },
  { type: "form_due", label: "Forms", hint: "Health forms due or expiring" },
  { type: "schedule_change", label: "Schedule changes", hint: "Rehearsal moves and cancellations" },
  { type: "payment_due", label: "Payments", hint: "Balance reminders" },
  { type: "photos_posted", label: "Photos", hint: "New photos of your child" },
  { type: "casting_released", label: "Casting", hint: "Cast lists going live" },
];

export default async function NotificationSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const prefs = await getProvider().getNotificationPrefs(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Notification settings</h1>

      {/* The device switch first: the type toggles below decide what is
          worth interrupting for, but only once a device can be interrupted
          at all (hub 0068). */}
      <PushToggle />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What we notify you about</CardTitle>
          <CardDescription>
            Critical safety and logistics messages always come through.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0">
          {TYPES.map(({ type, label, hint }) => {
            const enabled = prefs.enabled[type] !== false;
            return (
              <form
                key={type}
                action={toggleNotificationTypeAction.bind(null, type, !enabled)}
                className="flex min-h-12 items-center justify-between gap-3 border-b py-2 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Button
                  type="submit"
                  variant={enabled ? "default" : "outline"}
                  size="sm"
                  aria-pressed={enabled}
                >
                  {enabled ? "On" : "Off"}
                </Button>
              </form>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
          <CardDescription>
            Pushes hold until morning; nothing is lost — everything stays in
            the notification center.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={setQuietHoursAction} className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quietHoursStart">From</Label>
              <Input
                id="quietHoursStart"
                name="quietHoursStart"
                type="time"
                defaultValue={prefs.quietHoursStart ?? ""}
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quietHoursEnd">Until</Label>
              <Input
                id="quietHoursEnd"
                name="quietHoursEnd"
                type="time"
                defaultValue={prefs.quietHoursEnd ?? ""}
                className="w-32"
              />
            </div>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
