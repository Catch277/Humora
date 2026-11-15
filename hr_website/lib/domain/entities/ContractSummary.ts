/** KPI của `/customers`, đọc từ `get_contract_summary()` (SCRUM-101). */
export interface ContractSummary {
  customers_total: number;
  customers_active: number;
  contracts_active: number;
  contracts_expiring: number;
  contracts_expired: number;
  /** Tổng `monthly_fee` của hợp đồng đang hiệu lực. */
  mrr: number;
  renewals_due_30: number;
}

export const EMPTY_CONTRACT_SUMMARY: ContractSummary = {
  customers_total: 0,
  customers_active: 0,
  contracts_active: 0,
  contracts_expiring: 0,
  contracts_expired: 0,
  mrr: 0,
  renewals_due_30: 0,
};
