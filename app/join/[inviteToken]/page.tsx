import EventTour from "./OfflineReadyClubTour";

export default async function JoinEventPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  return <EventTour inviteToken={inviteToken} />;
}
