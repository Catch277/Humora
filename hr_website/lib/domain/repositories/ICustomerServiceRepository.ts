import type { MaintenanceSummary } from "@/lib/domain/entities/MaintenanceSummary";
import type {
  CreateMaintenanceVisitInput,
  MaintenanceVisit,
  MaintenanceVisitFilters,
  UpdateMaintenanceVisitInput,
} from "@/lib/domain/entities/MaintenanceVisit";
import type {
  CustomerService,
  CustomerServiceFilters,
  CustomerServiceInput,
  ServiceOverview,
  UpdateCustomerServiceInput,
} from "@/lib/domain/entities/CustomerService";

/**
 * Bảo hành, bảo trì và lịch sử lần bảo trì (SCRUM-102).
 *
 * The derived dates (`next_due_on`, `warranty_state`, `maintenance_state`) come from
 * `get_maintenance_overview()`, so the chip, the KPI and the reminder queue cannot disagree. A visit's state
 * is not stored either — `maintenanceVisitState()` derives it from the two dates.
 */
export interface ICustomerServiceRepository {
  overview(filters: CustomerServiceFilters): Promise<ServiceOverview[]>;
  findById(id: string): Promise<CustomerService | null>;
  create(input: CustomerServiceInput): Promise<CustomerService>;
  update(input: UpdateCustomerServiceInput): Promise<CustomerService>;
  remove(id: string): Promise<void>;
  summary(): Promise<MaintenanceSummary>;

  visits(filters: MaintenanceVisitFilters): Promise<MaintenanceVisit[]>;
  findVisitById(id: string): Promise<MaintenanceVisit | null>;
  createVisit(input: CreateMaintenanceVisitInput): Promise<MaintenanceVisit>;
  updateVisit(input: UpdateMaintenanceVisitInput): Promise<MaintenanceVisit>;
  removeVisit(id: string): Promise<void>;
}
