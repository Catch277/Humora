import type { Shift } from "@/lib/domain/entities/Shift";

export interface IShiftRepository {
  findAll(): Promise<Shift[]>;
  findById(id: string): Promise<Shift | null>;
}
