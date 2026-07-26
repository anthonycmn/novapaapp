import { Check, Clock, Eye, ShieldOff, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Plain-English explanation shown BEFORE a parent can opt in (#6).
 * Written for a parent on a phone, not a lawyer. Every claim here is
 * enforced somewhere in code and covered by a test — if you change the
 * behaviour, change this copy.
 */
export function ConsentExplanation({ studentName }: { studentName: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">What you&apos;re turning on</h2>
            <p className="mt-1 text-sm leading-relaxed">
              After a show, our photographer uploads hundreds of pictures. If
              you turn this on, the app will look through new galleries and
              pull out the ones with {studentName} in them, so you don&apos;t
              have to scroll through all of them.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">How it works</h2>
            <p className="mt-1 text-sm leading-relaxed">
              You upload 2–4 clear photos of {studentName}. The app turns each
              face into a <strong>list of numbers</strong> — a kind of
              fingerprint of facial features. When new show photos come in, it
              does the same thing to those and compares the numbers. Close
              match, we show you the photo.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <h3 className="font-semibold">In plain terms</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                We keep the numbers, not a face scan you could look at.
              </li>
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                Your reference photos are only used to recognize your own
                child, never anyone else&apos;s.
              </li>
              <li className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                Photos stay on SmugMug. We only link to them — buying prints
                still works exactly the same way.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Who can see what</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong>You</strong> see the photos we matched to {studentName}.
                </span>
              </li>
              <li className="flex gap-2">
                <X aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong>Other families</strong> never see your matches or your
                  reference photos. Not ever.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong>Staff</strong> don&apos;t browse your matches. An
                  administrator can see them only to fix a problem you report.
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Turning it off</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <Trash2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  You can switch this off any time. When you do, we delete the
                  face numbers, your reference photos, and the matches —
                  <strong> immediately</strong>, and always within 24 hours.
                </span>
              </li>
              <li className="flex gap-2">
                <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  You&apos;ll see exactly what was deleted, so you don&apos;t
                  have to take our word for it.
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">When we get it wrong</h2>
            <p className="mt-1 text-sm leading-relaxed">
              Face matching isn&apos;t perfect, especially with stage makeup
              and theater lighting. Every matched photo has a
              &ldquo;not {studentName}&rdquo; button. Tell us and we&apos;ll
              stop showing you that photo and get better at recognizing your
              child.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            This is entirely optional. {studentName} takes part in everything
            exactly the same whether you turn this on or not.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
