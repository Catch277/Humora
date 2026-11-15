import type {
  ContractSummary,
} from "@/lib/domain/entities/ContractSummary";
import type {
  Contract,
  ContractFilters,
  ContractOverview,
  CreateContractInput,
  UpdateContractInput,
} from "@/lib/domain/entities/CustomerContract";
import type {
  CustomerEmail,
  CustomerEmailFilters,
  LogCustomerEmailInput,
} from "@/lib/domain/entities/CustomerEmail";

/**
 * Hợp đồng, nhật ký email và KPI của C3/C4 (SCRUM-101).
 *
 * Reads go through RPCs when a derived value is involved (`get_contract_overview`, `get_contract_summary`),
 * because `EXPIRING` depends on each row's own `reminder_days` and the day in Bangkok — a filter the
 * PostgREST query language cannot express. Writes are row CRUD under the owner-only RLS policies: the fee
 * is a generated column, so there is nothing a client could invent by posting it.
 */
export interface ICustomerContractRepository {
  overview(filters: ContractFilters): Promise<ContractOverview[]>;
  findById(id: string): Promise<Contract | null>;
  create(input: CreateContractInput): Promise<Contract>;
  update(input: UpdateContractInput): Promise<Contract>;
  /** Closes a contract with who/why; the status is never edited through `update`. */
  terminate(id: string, terminatedOn: string, reason: string): Promise<Contract>;
  remove(id: string): Promise<void>;
  /** KPI strip of `/customers`; `get_contract_summary()` in one round trip. */
  summary(): Promise<ContractSummary>;

  emails(filters: CustomerEmailFilters): Promise<CustomerEmail[]>;
  logEmail(input: LogCustomerEmailInput): Promise<CustomerEmail>;
  removeEmail(id: string): Promise<void>;
}
