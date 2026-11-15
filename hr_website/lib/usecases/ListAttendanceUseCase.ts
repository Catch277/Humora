import type { AttendanceFilters } from "@/lib/domain/entities/Attendance";
import type {
  AttendancePage,
  IAttendanceRepository,
} from "@/lib/domain/repositories/IAttendanceRepository";

/**
 * Reads the timesheet for the review screen (A4 "search the history"): filter by employee, work date,
 * branch and status, and page through it when the history is longer than one screen.
 *
 * Paging is opt-in — `range` omitted is the unpaginated read the dashboard and `/check-in` still use, and
 * the route validates `page_size` (≤ 500) so a caller cannot ask for the whole table by accident. `total`
 * is the exact number of matching rows, which is what the footer and the "no-show" guard read (that
 * verdict is only meaningful on the full set).
 */
export class ListAttendanceUseCase {
  constructor(private readonly attendanceRepository: IAttendanceRepository) {}

  async execute(
    filters: AttendanceFilters,
    range?: { page: number; pageSize: number },
  ): Promise<AttendancePage> {
    return this.attendanceRepository.findPage(filters, range);
  }
}