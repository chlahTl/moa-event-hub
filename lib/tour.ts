export const GENDERS = new Set(["여성", "남성", "응답하지 않음"]);
export const AGE_GROUPS = new Set(["유아", "초등", "중등", "고등", "청년", "후기"]);

type EventWindow = {
  status: string;
  eventDate: string;
  startDate: string | null;
  endDate: string | null;
  deletedAt?: string | null;
};

export function normalizeParticipantName(value?: string) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ") ?? "";
}

export function getEventAvailability(event: EventWindow) {
  if (event.deletedAt) {
    return { available: false, message: "더 이상 참여할 수 없는 행사입니다." };
  }
  if (event.status !== "active") {
    return { available: false, message: "현재 운영 중인 행사가 아닙니다." };
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startDate = event.startDate || event.eventDate;
  const endDate = event.endDate || event.eventDate;
  if (startDate && today < startDate) {
    return { available: false, message: `${startDate}부터 참여할 수 있습니다.` };
  }
  if (endDate && today > endDate) {
    return { available: false, message: "종료된 행사입니다." };
  }
  return { available: true, message: "" };
}
