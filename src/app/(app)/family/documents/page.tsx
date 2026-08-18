import { redirect } from "next/navigation";
import { FileText, Lock } from "lucide-react";
import { getProvider } from "@/lib/api";
import { DOCUMENT_CATEGORIES } from "@/lib/api/documents/types";
import { isFsaEligibleFee } from "@/lib/api/documents/fsa";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import {
  AgreementsPanel,
  type StudentPaperwork,
} from "@/components/family/agreements-panel";
import { PoliciesRecord } from "@/components/family/policies-record";
import { DeleteDocumentButton, DocumentUploadForm } from "./document-forms";

export const metadata = { title: "Documents" };

/** Household document vault (#3): waivers, forms, receipts. */
export default async function DocumentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const season = await provider.getCurrentSeason();
  const [documents, students, enrollments] = await Promise.all([
    provider.getFamilyDocuments(user.id, user.familyId),
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getEnrollmentsForFamily(user.id, user.familyId),
  ]);

  /**
   * Each child's paperwork, gathered once for the panel above the uploads.
   *
   * `hasCampFees` decides whether an FSA statement would say anything. It is
   * camp specifically, not any enrollment (Tony, 17 Aug 2026: "only camp fees
   * on the FSA statement") — a term of classes is not care that lets a parent
   * work, so a statement built from it is a claim that gets refused.
   */
  const paperwork: StudentPaperwork[] = await Promise.all(
    students.map(async (student) => ({
      student,
      healthForm: await provider.getHealthForm(user.id, student.id, season.id),
      hasCampFees: enrollments.some(
        (enrollment) =>
          enrollment.studentId === student.id &&
          enrollment.status !== "withdrawn" &&
          isFsaEligibleFee(enrollment.offeringCategory)
      ),
    }))
  );

  const categoryLabel = new Map(
    DOCUMENT_CATEGORIES.map((category) => [category.value, category.label])
  );
  const studentName = new Map(
    students.map((student) => [student.id, student.preferredName ?? student.firstName])
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Document vault</h1>
        <p className="text-muted-foreground">
          Everything you have signed, everything still to sign, and your tax
          paperwork. Private to your family and NOVA PA staff.
        </p>
      </div>

      {/* What we asked them for, before what they chose to keep. A parent
          opening this page mid-season is far likelier to be here because
          somebody told them a form was missing than to file a receipt. */}
      <AgreementsPanel paperwork={paperwork} periodEnd={season.endsOn} />

      {/* The standing agreements, as a document rather than a settings page.
          Tony, 18 Aug 2026: parents read what they signed here; they do not
          opt out of it here. */}
      <PoliciesRecord />

      <h2 className="mt-2 text-lg font-semibold">Your own files</h2>
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden className="size-8" />}
          title="Nothing filed yet"
          description="Upload signed waivers, school forms, or anything you want to keep handy."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li key={document.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={document.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {document.name}
                    </a>
                    <p className="truncate text-sm text-muted-foreground">
                      {categoryLabel.get(document.category)}
                      {document.studentId && ` · ${studentName.get(document.studentId) ?? ""}`}
                      {" · "}
                      {(document.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                      {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  {document.uploadedByStaff && (
                    <Badge variant="secondary" className="shrink-0">
                      <Lock aria-hidden className="mr-1 size-3" />
                      From NOVA PA
                    </Badge>
                  )}
                  <DeleteDocumentButton
                    documentId={document.id}
                    name={document.name}
                    disabled={document.uploadedByStaff}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
            Add a document
          </CardTitle>
          <CardDescription>PDF or photo, up to 20 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadForm familyId={user.familyId} students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
