import type {
  CreateCustomerInput,
  Customer,
  CustomerFilters,
  CustomerOverview,
  UpdateCustomerInput,
} from "@/lib/domain/entities/Customer";
import type {
  CreateCustomerLeadInput,
  CustomerLead,
  CustomerLeadFilters,
  UpdateCustomerLeadInput,
} from "@/lib/domain/entities/CustomerLead";

/**
 * Khách hàng (SCRUM-101). The list is `get_customer_overview()` so an active-contract count and the next
 * end date come from the database rather than from N queries in a screen.
 *
 * The demo/trial queue (C3) is part of the same aggregate: a lead becomes a customer, and both are the
 * owner's commercial data. It is a separate table and a separate set of methods, never a flag on `customers`.
 */
export interface ICustomerRepository {
  findAll(filters: CustomerFilters): Promise<CustomerOverview[]>;
  findById(id: string): Promise<Customer | null>;
  create(input: CreateCustomerInput): Promise<Customer>;
  update(id: string, input: UpdateCustomerInput): Promise<Customer>;
  remove(id: string): Promise<void>;

  findLeads(filters: CustomerLeadFilters): Promise<CustomerLead[]>;
  createLead(input: CreateCustomerLeadInput): Promise<CustomerLead>;
  updateLead(id: string, input: UpdateCustomerLeadInput): Promise<CustomerLead>;
  removeLead(id: string): Promise<void>;
}
