export const GENDERS = new Set(["여성", "남성"]);
export const AGE_GROUP_OPTIONS = [
  { value: "유아", detail: "8세 이하" },
  { value: "초등", detail: "9~13세" },
  { value: "중등", detail: "14~16세" },
  { value: "고등", detail: "17~19세" },
  { value: "청년", detail: "20~24세" },
  { value: "후기", detail: "25~39세" },
  { value: "일반", detail: "40세 이상" },
] as const;
export const AGE_GROUPS = new Set<string>(AGE_GROUP_OPTIONS.map((option) => option.value));

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
    return { available: false, message: "현재 참여할 수 없는 행사입니다." };
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
