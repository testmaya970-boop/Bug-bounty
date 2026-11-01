export interface Bonus {
  id: string;
  reportId?: string;
  reportTitle?: string;
  currency: "INR" | "USD";
  amountMinorUnits: number;
  reason: "exceptional_quality" | "retest" | "campaign" | "other";
  status: "proposed" | "approved" | "rejected" | "cancelled";
  note: string;
  proposedBy: string;
  proposedByName: string | null;
  proposedAt: string;
  decisionNote: string | null;
}

export async function listReportBonuses(_reportId: string): Promise<Bonus[]> {
  return [];
}

export async function listPendingBonuses(
  _organizationId: string,
): Promise<Bonus[]> {
  return [];
}

export async function proposeBonus(
  _reportId: string,
  _amountMinorUnits: number,
  _reason: Bonus["reason"],
  _note: string,
  _idempotencyKey: string,
): Promise<void> {}

export async function decideBonus(
  _bonusId: string,
  _approve: boolean,
  _note: string,
): Promise<void> {}

export async function cancelBonus(_bonusId: string): Promise<void> {}
