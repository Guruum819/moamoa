/**
 * Korean withholding estimates for a single shift (one day's pay).
 *
 * 100,000원 → 96,700원 is exactly 3.3% business-income withholding
 * (income tax 3,000 + local tax 300). It is not the daily-worker formula.
 * A 100,000원 daily-worker day has 0 income tax (under the 150,000원
 * deduction and the 1,000원 small-amount exemption, which reaches 0 up to
 * 187,000원) and 900원 employment insurance, so the estimate is 99,100원.
 */

export type TaxType = 'none' | 'biz33' | 'ins4' | 'daily';

export type TaxLine = { label: string; amount: number };

export type TaxResult = {
  gross: number;
  lines: TaxLine[];
  deduction: number;
  net: number;
};

export const TAX_OPTIONS: { id: TaxType; label: string; hint: string }[] = [
  { id: 'none', label: '없음', hint: '세금을 빼지 않아요' },
  { id: 'biz33', label: '3.3%', hint: '사업소득 3% + 지방소득세 0.3%' },
  { id: 'ins4', label: '4대보험', hint: '2026년 근로자 부담 예상' },
  { id: 'daily', label: '일용직', hint: '일 15만원 공제 · 고용보험 0.9%' },
];

function won(n: number): number {
  return Math.max(0, Math.round(n));
}

/** 사업소득 원천징수: 소득세 3% (원 미만 절사) + 지방소득세 10% (원 미만 절사). */
export function business33(gross: number): TaxResult {
  const income = Math.floor((won(gross) * 3) / 100);
  const local = Math.floor(income / 10);
  const lines: TaxLine[] = [];
  if (income) lines.push({ label: '소득세 3%', amount: income });
  if (local) lines.push({ label: '지방소득세', amount: local });
  const deduction = income + local;
  return { gross: won(gross), lines, deduction, net: won(gross) - deduction };
}

/**
 * 2026 employee shares, floored to the won on each line.
 * 국민연금 4.75%, 건강보험 3.595%, 장기요양 = 건강보험료 × 0.9448/7.19,
 * 고용보험(실업급여) 0.9%. 산재보험은 회사 부담이라 빼지 않아요.
 * Matches the published 3,000,000원 payslip total of 291,522원.
 * Monthly income floor/cap is not applied to a single shift.
 */
export function insurance4(gross: number): TaxResult {
  const base = won(gross);
  const pension = Math.floor((base * 475) / 10000);
  const health = Math.floor((base * 3595) / 100000);
  const longTermCare = Math.floor((health * 9448) / 71900);
  const employment = Math.floor((base * 9) / 1000);
  const lines: TaxLine[] = [
    { label: '국민연금 4.75%', amount: pension },
    { label: '건강보험 3.595%', amount: health },
    { label: '장기요양', amount: longTermCare },
    { label: '고용보험 0.9%', amount: employment },
  ].filter((line) => line.amount > 0);
  const deduction = pension + health + longTermCare + employment;
  return { gross: base, lines, deduction, net: base - deduction };
}

/**
 * 일용근로소득, one day paid on its own.
 * 소득세 = floor((일급 - 150,000) × 6% × 45%). Under 1,000원 is not withheld
 * (소액부징수), so a day of 187,000원 (999원) is 0. 지방소득세 is 10% of the
 * income tax, cut to 10원. 고용보험 근로자 0.9% is withheld on the full day pay.
 * Several days paid as one sum can lose the small-amount exemption; this app
 * estimates each shift as its own day.
 */
export function dailyWorker(gross: number): TaxResult {
  const base = won(gross);
  const taxable = Math.max(0, base - 150000);
  const rawIncome = Math.floor((taxable * 27) / 1000);
  const income = rawIncome >= 1000 ? rawIncome : 0;
  const local = income > 0 ? Math.floor(income / 10 / 10) * 10 : 0;
  const employment = Math.floor((base * 9) / 1000);
  const lines: TaxLine[] = [];
  if (income) lines.push({ label: '일용 소득세', amount: income });
  if (local) lines.push({ label: '지방소득세', amount: local });
  if (employment) lines.push({ label: '고용보험 0.9%', amount: employment });
  const deduction = income + local + employment;
  return { gross: base, lines, deduction, net: base - deduction };
}

export function applyTax(gross: number, type: TaxType): TaxResult {
  if (type === 'biz33') return business33(gross);
  if (type === 'ins4') return insurance4(gross);
  if (type === 'daily') return dailyWorker(gross);
  const base = won(gross);
  return { gross: base, lines: [], deduction: 0, net: base };
}

export function taxLabel(type: TaxType): string {
  return TAX_OPTIONS.find((option) => option.id === type)?.label ?? '없음';
}
