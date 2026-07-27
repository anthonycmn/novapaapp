import { notFound, redirect } from "next/navigation";
import { org } from "@/config/org";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { PrintButton } from "@/components/media/print-button";

export const metadata = { title: "Resume" };

/**
 * Printable theatrical resume (#4). Laid out to the industry convention:
 * name and vitals at the top, then Roles / Training / Special Skills, sized
 * to sit behind an 8×10 headshot.
 *
 * Print styles are inline rather than in globals.css because this is the
 * only page in the app designed for paper.
 */
export default async function ResumePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { studentId } = await params;

  const provider = getProvider();
  let student;
  try {
    student = await provider.getStudent(user.id, studentId);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  if (!student) notFound();

  const history = await provider.getShowHistory(user.id, studentId);

  const roles = student.resumeCredits.filter((credit) => credit.category === "role");
  const training = student.resumeCredits.filter((credit) => credit.category === "training");
  const skills = student.resumeCredits.filter((credit) => credit.category === "special_skill");

  // Fall back to show history when the resume builder is empty, so the page
  // is never blank for a student who has performed.
  const roleRows =
    roles.length > 0
      ? roles.map((credit) => ({
          title: credit.title,
          organization: credit.organization,
          year: credit.year,
        }))
      : history.map((entry) => ({
          title: `${entry.role} — ${entry.productionTitle}`,
          organization: entry.organization ?? "NOVA PA",
          year: entry.year,
        }));

  const fullName = `${student.preferredName ?? student.firstName} ${student.lastName}`;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: letter portrait; margin: 0.6in; }
              .no-print { display: none !important; }
              body { background: white !important; }
              .resume-sheet {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                max-width: none !important;
              }
            }
          `,
        }}
      />

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Print at 100% scale. Staple behind an 8×10 headshot, trimmed to match.
        </p>
        <PrintButton label="Print resume" />
      </div>

      <article className="resume-sheet mx-auto max-w-[7.5in] rounded-lg border bg-white p-8 text-black shadow-sm">
        <header className="border-b-2 border-black pb-3 text-center">
          <h1 className="font-display text-3xl font-bold tracking-wide">{fullName}</h1>
          <p className="mt-1 text-sm">
            {[
              student.pronouns,
              student.vocalRange && `Vocal range: ${student.vocalRange}`,
              `Grade ${student.grade}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          <p className="mt-0.5 text-sm">
            {org.name} · {org.programBrand}
          </p>
        </header>

        <Section title="Theatre">
          {roleRows.length === 0 ? (
            <p className="text-sm italic">No credits yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {roleRows.map((row, index) => (
                  <tr key={index} className="align-top">
                    <td className="py-1 pr-4 font-semibold">{row.title}</td>
                    <td className="py-1 pr-4">{row.organization ?? ""}</td>
                    <td className="w-16 py-1 text-right tabular-nums">{row.year ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {(training.length > 0 || student.danceExperience) && (
          <Section title="Training">
            <ul className="flex flex-col gap-1 text-sm">
              {training.map((credit) => (
                <li key={credit.id} className="flex justify-between gap-4">
                  <span className="font-semibold">{credit.title}</span>
                  <span>
                    {[credit.organization, credit.year].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
              {student.danceExperience && <li>{student.danceExperience}</li>}
            </ul>
          </Section>
        )}

        {skills.length > 0 && (
          <Section title="Special skills">
            <p className="text-sm">
              {skills.map((credit) => credit.title).join(" · ")}
            </p>
          </Section>
        )}

        <footer className="mt-6 border-t pt-2 text-center text-xs">
          Represented by {org.name} · {org.supportEmail}
        </footer>
      </article>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-black/40 pb-0.5 text-sm font-bold uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </section>
  );
}

