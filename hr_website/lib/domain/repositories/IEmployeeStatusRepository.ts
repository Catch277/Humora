import type {
  EmployeeStatus,
  EmployeeStatusFilters,
} from "@/lib/domain/entities/EmployeeStatus";

export interface IEmployeeStatusRepository {
  /** Calls the `get_employee_status` RPC (SCRUM-22) and normalises its rows. */
  findAll(filters: EmployeeStatusFilters): Promise<EmployeeStatus[]>;
}