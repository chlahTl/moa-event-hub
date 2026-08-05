import EventTour from "./ResilientClubTour";

export default async function JoinEventPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  return <EventTour inviteToken={inviteToken} />;
}
