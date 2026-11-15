import type { AttendancePhotoKind } from "@/lib/domain/entities/Attendance";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";

/**
 * The outcome of asking for one photo of one record.
 *
 * `found: false` and `path: null` are deliberately different answers: the first is "no such record (or
 * not yours)" → `404`, the second is "this record has no photo of that kind" — which is the normal
 * state of a row clocked in from the web, where there is no camera.
 */
export type AttendancePhotoLookup =
  | { found: false }
  | { found: true; path: string | null };

/**
 * Resolves the object path of a check-in / check-out photo (SCRUM-95).
 *
 * The record is read through `IAttendanceRepository.findById`, so RLS decides whether the caller may
 * see it at all and the route never touches the table itself. The path comes back exactly as stored;
 * whether the object still exists (the 90-day retention job may have removed it) is the storage
 * helper's question, not this one's.
 */
export class GetAttendancePhotoUseCase {
  constructor(private readonly attendanceRepository: IAttendanceRepository) {}

  async execute(input: {
    attendanceId: string;
    kind: AttendancePhotoKind;
  }): Promise<AttendancePhotoLookup> {
    const record = await this.attendanceRepository.findById(input.attendanceId);

    if (!record) {
      return { found: false };
    }

    return {
      found: true,
      path:
        input.kind === "in"
          ? record.check_in_photo_url
          : record.check_out_photo_url,
    };
  }
}
