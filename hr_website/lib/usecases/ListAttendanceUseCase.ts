import type {
  Attendance,
  AttendanceFilters,
} from "@/lib/domain/entities/Attendance";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";

export class ListAttendanceUseCase {
  constructor(private readonly attendanceRepository: IAttendanceRepository) {}

  async execute(filters: AttendanceFilters): Promise<Attendance[]> {
    return this.attendanceRepository.findAll(filters);
  }
}