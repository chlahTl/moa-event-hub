import VisitForm from "./GuidedClubVisit";

export default async function VisitPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  return <VisitForm clubId={clubId} />;
}
