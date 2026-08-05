import StampClaim from "./StampClaim";

export default async function StampPage({ params }: { params: Promise<{ pointToken: string }> }) {
  const { pointToken } = await params;
  return <StampClaim pointToken={pointToken} />;
}
