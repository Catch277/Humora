/** KPI của `/maintenance`, đọc từ `get_maintenance_summary()` (SCRUM-102). */
export interface MaintenanceSummary {
  services_total: number;
  services_active: number;
  in_warranty: number;
  warranty_expired: number;
  due_soon: number;
  overdue: number;
  planned_visits: number;
  overdue_visits: number;
}

export const EMPTY_MAINTENANCE_SUMMARY: MaintenanceSummary = {
  services_total: 0,
  services_active: 0,
  in_warranty: 0,
  warranty_expired: 0,
  due_soon: 0,
  overdue: 0,
  planned_visits: 0,
  overdue_visits: 0,
};
