import { ExternalLink, ScrollText } from "lucide-react";
import { org } from "@/config/org";
import {
  POLICIES_URL,
  PRIVACY_SECTIONS,
  REGISTRATION_TERMS,
  type PolicySection,
} from "@/config/policies";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * What this household agreed to by registering.
 *
 * Tony, 18 Aug 2026: "It should just live there as a document regarding all the
 * policies they sign and the photos. They should not be able to opt out of
 * anything."
 *
 * So: a document. No checkbox, no toggle, nothing to submit. Every section is
 * the published wording's summary and links to the wording itself, which is the
 * controlling text — registration constitutes acceptance of all of it, and a
 * portal that let a family quietly turn one off would be describing an
 * agreement neither side actually has.
 */
export function PoliciesRecord() {
  return (
    <Card pad={false}>
      <SectionHeader
        title="Policies you agreed to"
        inCard
        right={
          <span className="text-[12px] text-muted-foreground">
            Accepted at registration
          </span>
        }
      />

      <p className="border-b px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Registering with {org.shortName} accepts all of these. They are kept here
        so you can look one up mid-season without hunting through your email —
        the full wording on our website is the version that binds, and it is
        linked from every line.
      </p>

      <PolicyList title="Terms & conditions" sections={REGISTRATION_TERMS} />
      <PolicyList title="Privacy" sections={PRIVACY_SECTIONS} />

      <div className="border-t px-4 py-3">
        <a
          href={POLICIES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
        >
          <ScrollText aria-hidden size={13} />
          Read the full policies
          <ExternalLink aria-hidden size={11} />
        </a>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Anything you would like changed — including asking us not to photograph
          your child — is a written request to{" "}
          <a
            href={`mailto:${org.supportEmail}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {org.supportEmail}
          </a>
          , so that it reaches the people it has to reach.
        </p>
      </div>
    </Card>
  );
}

function PolicyList({
  title,
  sections,
}: {
  title: string;
  sections: PolicySection[];
}) {
  return (
    <div className="border-b last:border-b-0">
      <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="divide-y">
        {sections.map((section) => (
          <li key={section.anchor}>
            <a
              href={`${POLICIES_URL}#${section.anchor}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-4 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{section.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {section.summary}
                </span>
              </span>
              <ExternalLink
                aria-hidden
                size={12}
                className="mt-1 shrink-0 text-muted-foreground"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
