const RELATIVE_DATE_RE = /(今天|明天|后天|大后天|昨天|前天)/;
const WEEKDAY_RE = /(下?)(周|星期)([一二三四五六日天])/;
const DATE_RE = /(\d{1,2})[月.\/-](\d{1,2})[日号]?/;

const WEEKDAY_MAP: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };

export function parseNaturalDate(text: string): { date: string; label: string } | null {
  const now = new Date();

  // 今天/明天/后天/大后天
  const relMatch = text.match(RELATIVE_DATE_RE);
  if (relMatch) {
    const offsets: Record<string, number> = { "今天": 0, "明天": 1, "后天": 2, "大后天": 3, "昨天": -1, "前天": -2 };
    const d = new Date(now);
    d.setDate(d.getDate() + (offsets[relMatch[1]] ?? 0));
    return { date: formatDate(d), label: relMatch[1] };
  }

  // 下周五 / 周三
  const weekMatch = text.match(WEEKDAY_RE);
  if (weekMatch) {
    const target = WEEKDAY_MAP[weekMatch[3]];
    if (target !== undefined) {
      const d = new Date(now);
      const current = d.getDay();
      let diff = target - current;
      if (diff <= 0) diff += 7;
      if (weekMatch[1] === "下") diff += 7;
      d.setDate(d.getDate() + diff);
      return { date: formatDate(d), label: weekMatch[0] };
    }
  }

  // 6月15日 / 6.15 / 6/15
  const dateMatch = text.match(DATE_RE);
  if (dateMatch) {
    const month = parseInt(dateMatch[1], 10);
    const day = parseInt(dateMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = now.getFullYear();
      const d = new Date(year, month - 1, day);
      if (d < now) d.setFullYear(year + 1);
      return { date: formatDate(d), label: dateMatch[0] };
    }
  }

  return null;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}
