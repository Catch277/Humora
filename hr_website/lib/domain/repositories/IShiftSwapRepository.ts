import type {
  RequestShiftSwapInput,
  ReviewShiftSwapInput,
  ShiftSwap,
  ShiftSwapFilters,
} from "@/lib/domain/entities/ShiftSwap";

/** Every write is an RPC (`request_shift_swap` …) so the database checks the whole transition. */
export interface IShiftSwapRepository {
  findAll(filters: ShiftSwapFilters): Promise<ShiftSwap[]>;
  findById(id: string): Promise<ShiftSwap | null>;
  request(input: RequestShiftSwapInput): Promise<ShiftSwap>;
  respond(id: string, accept: boolean): Promise<ShiftSwap>;
  cancel(id: string): Promise<ShiftSwap>;
  review(id: string, input: ReviewShiftSwapInput): Promise<ShiftSwap>;
}
