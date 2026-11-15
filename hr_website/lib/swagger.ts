import { createSwaggerSpec } from "next-swagger-doc";

export function getApiDocs() {
  return createSwaggerSpec({
    apiFolder: "app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "HR Website API",
        version: "1.0.0",
        description: "API documentation for the HR Website backend.",
      },
      components: {
        schemas: {
          User: {
            type: "object",
            required: ["id", "full_name", "role", "branch_id"],
            properties: {
              id: { type: "string", format: "uuid" },
              full_name: { type: "string" },
              role: { type: "string" },
              branch_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "Chi nhánh tài khoản thuộc về (SCRUM-63); null nghĩa là chưa gán chi nhánh.",
              },
            },
          },
          StaffMember: {
            type: "object",
            required: ["id", "full_name", "role", "is_active", "created_at", "branch_id"],
            properties: {
              id: { type: "string", format: "uuid" },
              full_name: { type: "string" },
              role: {
                type: "string",
                enum: ["OWNER", "MANAGER", "EMPLOYEE"],
                description:
                  "Vai trò hệ thống (SCRUM-59); chỉ OWNER quản lý nhân sự, MANAGER điều hành ca/timesheet/doanh thu.",
              },
              is_active: {
                type: "boolean",
                description: "false nghĩa là tài khoản đã nghỉ việc.",
              },
              created_at: { type: "string", format: "date-time" },
              branch_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "Chi nhánh nhân viên thuộc về (SCRUM-63); null là chưa gán — nhân viên chưa gán chi nhánh không đọc được dữ liệu nào theo chi nhánh và không gửi được đơn.",
              },
            },
          },
          Organization: {
            type: "object",
            required: ["id", "name", "created_by", "created_at", "updated_at"],
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              created_by: { type: "string", format: "uuid", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          OrganizationSummary: {
            type: "object",
            required: ["organization", "code", "member_count", "pending_invite_count"],
            properties: {
              organization: {
                allOf: [{ $ref: "#/components/schemas/Organization" }],
                nullable: true,
                description:
                  "null khi tài khoản chưa tạo và chưa tham gia tổ chức nào (màn hình /onboarding).",
              },
              code: {
                type: "string",
                nullable: true,
                description:
                  "Mã tham gia của tổ chức; null khi người gọi không phải OWNER (RLS giữ mã lại).",
              },
              member_count: {
                type: "integer",
                description: "Số tài khoản trong tổ chức (chỉ đếm được người cùng tổ chức).",
              },
              pending_invite_count: {
                type: "integer",
                description: "Số lời mời chưa được sử dụng (claimed_by còn null).",
              },
            },
          },
          OrganizationInvite: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "email",
              "full_name",
              "role",
              "source",
              "invited_by",
              "claimed_by",
              "claimed_at",
              "created_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              full_name: { type: "string", nullable: true },
              role: {
                type: "string",
                enum: ["EMPLOYEE", "MANAGER"],
                description: "Vai trò khi gia nhập; lời mời không bao giờ tạo ra OWNER.",
              },
              source: {
                type: "string",
                enum: ["invite", "provisioned"],
                description:
                  "provisioned = chủ sở hữu tạo tài khoản với mật khẩu tạm (SCRUM-52), invite = mời tài khoản đã có.",
              },
              invited_by: { type: "string", format: "uuid", nullable: true },
              claimed_by: { type: "string", format: "uuid", nullable: true },
              claimed_at: { type: "string", format: "date-time", nullable: true },
              created_at: { type: "string", format: "date-time" },
            },
          },
          StaffProvisionResult: {
            type: "object",
            required: ["user_id", "email", "must_change_password"],
            properties: {
              user_id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              must_change_password: {
                type: "boolean",
                description:
                  "Luôn true: tài khoản phải tự đổi mật khẩu tạm ở /change-password trước khi dùng hệ thống.",
              },
            },
          },
          AuthSession: {
            type: "object",
            required: ["userId", "email"],
            properties: {
              userId: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
            },
          },
          AuthSignUpRequest: {
            type: "object",
            required: ["email", "password", "full_name"],
            properties: {
              email: {
                type: "string",
                format: "email",
                example: "nhanvien@humora.vn",
              },
              password: {
                type: "string",
                format: "password",
                minLength: 8,
                example: "CorrectHorseBatteryStaple",
              },
              full_name: {
                type: "string",
                maxLength: 120,
                example: "Nguyễn Văn A",
              },
            },
          },
          AuthSignUpResult: {
            type: "object",
            required: ["userId", "email", "emailConfirmationRequired"],
            properties: {
              userId: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              emailConfirmationRequired: {
                type: "boolean",
                description:
                  "true khi dự án Supabase bật xác nhận email: tài khoản đã tạo nhưng chưa có phiên đăng nhập.",
              },
            },
          },
          PasswordResetRequest: {
            type: "object",
            required: ["email"],
            properties: {
              email: {
                type: "string",
                format: "email",
                example: "hr.lead@humora.vn",
              },
            },
          },
          PasswordResetResult: {
            type: "object",
            required: ["success", "email"],
            properties: {
              success: {
                type: "boolean",
                description:
                  "Luôn true khi yêu cầu đã được chuyển cho Supabase Auth — câu trả lời không thay đổi dù email có tồn tại hay không, để không ai dò được danh sách nhân sự.",
              },
              email: { type: "string", format: "email" },
            },
          },
          Branch: {
            type: "object",
            required: [
              "id",
              "name",
              "asset_prefix",
              "address",
              "manager_id",
              "latitude",
              "longitude",
              "attendance_radius",
              "created_at",
              "updated_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              asset_prefix: {
                type: "integer",
                nullable: true,
                minimum: 1,
                description:
                  "Số thứ tự chi nhánh (SCRUM-67), cấp một lần khi tạo và không bao giờ cấp lại: nó là tiền tố mã tài sản của mọi thiết bị thuộc chi nhánh (`01HSVH-0001`), nên đổi tên chi nhánh không làm tem đã dán sai. `null` với chi nhánh tạo trước SCRUM-67 — mã tài sản khi đó chỉ còn phần viết tắt.",
              },
              address: { type: "string", nullable: true },
              manager_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "Chi nhánh trưởng (public.users.id).",
              },
              latitude: {
                type: "number",
                nullable: true,
                minimum: 8.5436,
                maximum: 23.3883,
                description: "Vĩ độ, chỉ chấp nhận toạ độ tại Việt Nam (8.5436–23.3883° N).",
              },
              longitude: {
                type: "number",
                nullable: true,
                minimum: 102.0967,
                maximum: 109.4944,
                description: "Kinh độ, chỉ chấp nhận toạ độ tại Việt Nam (102.0967–109.4944° E).",
              },
              attendance_radius: {
                type: "integer",
                description: "Bán kính cho phép chấm công (mét) quanh toạ độ chi nhánh.",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          RevenueRecord: {
            type: "object",
            required: [
              "id",
              "branch_id",
              "open_amount",
              "created_at",
              "created_by",
              "close_amount",
              "close_note",
              "close_image_url",
              "closed_by",
              "closed_at",
              "audit_log",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              branch_id: { type: "string", format: "uuid" },
              open_amount: { type: "number", minimum: 0 },
              created_at: { type: "string", format: "date-time" },
              created_by: { type: "string", format: "uuid" },
              close_amount: { type: "number", minimum: 0, nullable: true },
              close_note: { type: "string", nullable: true },
              close_image_url: { type: "string", nullable: true },
              closed_by: { type: "string", format: "uuid", nullable: true },
              closed_at: { type: "string", format: "date-time", nullable: true },
              audit_log: { type: "array", items: {} },
            },
          },
          RequestEntity: {
            type: "object",
            required: [
              "id",
              "branch_id",
              "user_id",
              "request_type",
              "title",
              "content",
              "work_date",
              "shift_id",
              "target_employee_id",
              "status",
              "reject_reason",
              "approver_id",
              "created_at",
              "updated_at",
              "requester",
              "shift",
              "target_employee",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Chi nhánh liên quan (public.branches.id).",
              },
              user_id: {
                type: "string",
                format: "uuid",
                description: "Nhân viên gửi đơn (public.users.id).",
              },
              request_type: {
                type: "string",
                description: "Loại đơn: nghỉ phép, đổi ca, điều chỉnh công, ...",
              },
              title: { type: "string", nullable: true },
              content: { type: "string", nullable: true },
              work_date: {
                type: "string",
                format: "date",
                nullable: true,
                description:
                  "Ngày đơn hướng tới (SCRUM-82, YYYY-MM-DD); bắt buộc với nghỉ phép / đổi ca / điều chỉnh công và null với đơn “Khác” hoặc với dòng tạo trước SCRUM-82.",
              },
              shift_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "Ca được nhượng lại, chỉ với đơn “Đổi ca” (SCRUM-82); duyệt đơn này sẽ chuyển ca đó sang `target_employee_id`.",
              },
              target_employee_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "Đồng nghiệp nhận ca, chỉ với đơn “Đổi ca” (SCRUM-82); đã được kiểm tra rảnh ca bằng `eligible_swap_targets()` lúc gửi đơn và kiểm tra lại lúc duyệt.",
              },
              status: {
                type: "string",
                enum: ["PENDING", "APPROVED", "REJECTED"],
              },
              reject_reason: { type: "string", nullable: true },
              approver_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "Người duyệt (lấy từ phiên đăng nhập).",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              requester: {
                type: "object",
                nullable: true,
                description:
                  "Nhân viên nhúng từ khoá ngoại requests_user_id_fkey; null khi RLS ẩn hồ sơ.",
                required: ["id", "full_name"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  full_name: { type: "string" },
                },
              },
              shift: {
                allOf: [{ $ref: "#/components/schemas/Shift" }],
                nullable: true,
                description:
                  "Ca nhúng từ khoá ngoại requests_shift_id_fkey (SCRUM-82); null với mọi loại đơn không nêu ca.",
              },
              target_employee: {
                type: "object",
                nullable: true,
                description:
                  "Đồng nghiệp nhúng từ khoá ngoại requests_target_employee_id_fkey (SCRUM-82); null với mọi loại đơn không nêu người nhận ca.",
                required: ["id", "full_name"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  full_name: { type: "string" },
                },
              },
            },
          },
          SwapCandidate: {
            type: "object",
            required: ["id", "full_name"],
            description:
              "Một đồng nghiệp có thể nhận ca trong đơn “Đổi ca” (SCRUM-82): nhân viên đang làm việc, cùng chi nhánh, không phải người gửi đơn và rảnh trong ca đó — do `public.eligible_swap_targets()` quyết định.",
            properties: {
              id: { type: "string", format: "uuid" },
              full_name: { type: "string" },
            },
          },
          Shift: {
            type: "object",
            required: ["id", "name", "branch_id", "start_time", "end_time", "is_active"],
            properties: {
              id: { type: "string", format: "uuid" },
              name: {
                type: "string",
                description: "Tên ca làm việc (Ca sáng, Ca chiều, Nghỉ, ...).",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "null nghĩa là ca áp dụng cho mọi chi nhánh.",
              },
              start_time: {
                type: "string",
                nullable: true,
                description: "Giờ bắt đầu (HH:MM:SS).",
              },
              end_time: {
                type: "string",
                nullable: true,
                description: "Giờ kết thúc (HH:MM:SS).",
              },
              is_active: {
                type: "boolean",
                description:
                  "SCRUM-85: false = ca đã ngừng dùng (`Ca tối` 14:00–23:00). `GET /api/shifts` bỏ hẳn " +
                  "những ca đó; một dòng lịch cũ còn trỏ tới ca ấy vẫn hiển thị được vì mỗi assignment " +
                  "nhúng bản sao của mẫu ca.",
              },
            },
          },
          ShiftAssignment: {
            type: "object",
            required: [
              "id",
              "employee_id",
              "branch_id",
              "shift_id",
              "work_date",
              "status",
              "note",
              "created_at",
              "updated_at",
              "employee",
              "shift",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              employee_id: {
                type: "string",
                format: "uuid",
                description: "Nhân viên được xếp ca (public.users.id).",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Chi nhánh làm việc (public.branches.id).",
              },
              shift_id: {
                type: "string",
                format: "uuid",
                description: "Ca làm việc được chọn (public.shifts.id).",
              },
              work_date: {
                type: "string",
                format: "date",
                description: "Ngày làm việc (YYYY-MM-DD).",
              },
              status: {
                type: "string",
                enum: ["SCHEDULED", "LEAVE", "CANCELLED"],
                description: "Đi làm, nghỉ phép hoặc đã huỷ.",
              },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              employee: {
                type: "object",
                nullable: true,
                description: "Nhân viên nhúng từ khoá ngoại; null khi RLS ẩn hồ sơ.",
                required: ["id", "full_name"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  full_name: { type: "string" },
                },
              },
              shift: {
                allOf: [{ $ref: "#/components/schemas/Shift" }],
                nullable: true,
                description: "Ca làm việc nhúng từ khoá ngoại (kèm giờ để kiểm tra trùng ca).",
              },
            },
          },
          ShiftAssignmentWriteRequest: {
            type: "object",
            required: ["employee_id", "branch_id", "shift_id", "work_date"],
            properties: {
              employee_id: { type: "string", format: "uuid" },
              branch_id: { type: "string", format: "uuid" },
              shift_id: { type: "string", format: "uuid" },
              work_date: { type: "string", format: "date" },
              status: {
                type: "string",
                enum: ["SCHEDULED", "LEAVE", "CANCELLED"],
                default: "SCHEDULED",
              },
              note: { type: "string", maxLength: 500, nullable: true },
            },
          },
          EmployeeStatus: {
            type: "object",
            required: [
              "work_date",
              "employee_id",
              "full_name",
              "role",
              "branch_id",
              "branch_name",
              "status",
              "shift_name",
              "check_in_at",
              "check_out_at",
              "check_in_distance_m",
              "attendance_radius",
            ],
            properties: {
              work_date: {
                type: "string",
                format: "date",
                description: "Ngày nghiệp vụ (Asia/Bangkok) mà bản ghi trạng thái mô tả.",
              },
              employee_id: { type: "string", format: "uuid" },
              full_name: { type: "string" },
              role: {
                type: "string",
                enum: ["OWNER", "MANAGER", "EMPLOYEE"],
                description: "Vai trò hệ thống: OWNER, MANAGER hoặc EMPLOYEE (SCRUM-59).",
              },
              branch_id: { type: "string", format: "uuid", nullable: true },
              branch_name: { type: "string", nullable: true },
              status: {
                type: "string",
                enum: [
                  "WORKING",
                  "NOT_STARTED",
                  "ON_LEAVE",
                  "FINISHED",
                  "NO_SHIFT",
                  "RESIGNED",
                ],
                description:
                  "Đang làm việc, chưa vào ca, nghỉ phép, đã tan ca, không có ca hôm nay, đã nghỉ việc.",
              },
              shift_name: { type: "string", nullable: true },
              check_in_at: { type: "string", format: "date-time", nullable: true },
              check_out_at: { type: "string", format: "date-time", nullable: true },
              check_in_distance_m: { type: "integer", nullable: true },
              attendance_radius: {
                type: "integer",
                nullable: true,
                description: "Bán kính cho phép của chi nhánh, để so với khoảng cách chấm công.",
              },
            },
          },
          Attendance: {
            type: "object",
            required: [
              "id",
              "employee_id",
              "branch_id",
              "shift_id",
              "work_date",
              "check_in_at",
              "check_out_at",
              "check_in_latitude",
              "check_in_longitude",
              "check_out_latitude",
              "check_out_longitude",
              "check_in_distance_m",
              "check_in_photo_url",
              "check_out_photo_url",
              "worked_seconds",
              "resumed_at",
              "status",
              "note",
              "complaint",
              "complaint_at",
              "complaint_status",
              "complaint_resolved_by",
              "complaint_resolved_at",
              "exception_status",
              "exception_note",
              "exception_resolved_by",
              "exception_resolved_at",
              "verified_by",
              "verified_at",
              "corrected_by",
              "corrected_at",
              "correction_reason",
              "created_at",
              "updated_at",
              "employee",
              "branch",
              "shift",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              employee_id: {
                type: "string",
                format: "uuid",
                description: "Nhân viên chấm công (public.users.id).",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Chi nhánh làm việc (public.branches.id).",
              },
              shift_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "Ca đã xếp; null khi làm ngoài lịch.",
              },
              work_date: {
                type: "string",
                format: "date",
                description: "Ngày làm việc (YYYY-MM-DD).",
              },
              check_in_at: { type: "string", format: "date-time", nullable: true },
              check_out_at: { type: "string", format: "date-time", nullable: true },
              check_in_latitude: { type: "number", nullable: true },
              check_in_longitude: { type: "number", nullable: true },
              check_out_latitude: { type: "number", nullable: true },
              check_out_longitude: { type: "number", nullable: true },
              check_in_distance_m: {
                type: "integer",
                nullable: true,
                description:
                  "Khoảng cách (mét) từ điểm chấm công tới tâm chi nhánh, dùng để xét vùng hợp lệ. Database tính lại từ toạ độ nên không do client gửi.",
              },
              check_in_photo_url: {
                type: "string",
                nullable: true,
                description:
                  "Đường dẫn object trong bucket private `attendance-photos` (SCRUM-95), không phải URL công khai. Đọc ảnh qua `GET /api/attendance/{id}/photo?kind=in`.",
              },
              check_out_photo_url: {
                type: "string",
                nullable: true,
                description:
                  "Đường dẫn object của ảnh ra ca; null khi ca chưa chấm ra hoặc chấm ra trên web. Đọc qua `GET /api/attendance/{id}/photo?kind=out`.",
              },
              worked_seconds: {
                type: "integer",
                description:
                  "Tổng thời gian đã làm (giây) do database tích luỹ (SCRUM-69): mỗi lần ra ca cộng thêm đoạn kể từ giờ vào — hoặc từ lần vào ca lại gần nhất — nên khoảng nghỉ giữa ra ca và vào ca lại không bị tính.",
              },
              resumed_at: {
                type: "string",
                format: "date-time",
                nullable: true,
                description:
                  "Thời điểm bắt đầu đoạn làm hiện tại sau khi vào ca lại (SCRUM-69); null khi ca chưa từng được mở lại.",
              },
              status: {
                type: "string",
                enum: ["ON_TIME", "LATE", "EARLY_LEAVE", "ABSENT", "INCOMPLETE"],
              },
              note: { type: "string", nullable: true },
              complaint: {
                type: "string",
                nullable: true,
                description: "Khiếu nại của nhân viên (SCRUM-29).",
              },
              complaint_at: { type: "string", format: "date-time", nullable: true },
              complaint_status: {
                type: "string",
                enum: ["OPEN", "RESOLVED"],
                nullable: true,
                description:
                  "null khi chưa có khiếu nại; OPEN từ lúc ghi nhận tới khi quản lý xử lý xong.",
              },
              complaint_resolved_by: {
                type: "string",
                format: "uuid",
                nullable: true,
              },
              complaint_resolved_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              exception_status: {
                type: "string",
                enum: ["OPEN", "RESOLVED"],
                nullable: true,
                description:
                  "Quyết định của quản lý cho bất thường chấm công (SCRUM-97): null = chưa từng đặt, RESOLVED = đã xử lý, OPEN = mở lại. Không sửa giờ công.",
              },
              exception_note: {
                type: "string",
                nullable: true,
                description:
                  "Cách xử lý do quản lý ghi; bắt buộc khi `exception_status = RESOLVED` (ràng buộc `attendance_exception_resolution_check`).",
              },
              exception_resolved_by: {
                type: "string",
                format: "uuid",
                nullable: true,
              },
              exception_resolved_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              verified_by: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "Quản lý đã xác minh bản ghi.",
              },
              verified_at: { type: "string", format: "date-time", nullable: true },
              corrected_by: {
                type: "string",
                format: "uuid",
                nullable: true,
                description: "Quản lý đã sửa giờ của bản ghi (SCRUM-23).",
              },
              corrected_at: { type: "string", format: "date-time", nullable: true },
              correction_reason: {
                type: "string",
                nullable: true,
                description: "Lý do sửa giờ, bắt buộc khi có corrected_at.",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              employee: {
                type: "object",
                nullable: true,
                required: ["id", "full_name"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  full_name: { type: "string" },
                },
              },
              branch: {
                type: "object",
                nullable: true,
                description:
                  "Chi nhánh nhúng kèm toạ độ và bán kính để xét vùng chấm công.",
                required: ["id", "name", "latitude", "longitude", "attendance_radius"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  latitude: { type: "number", nullable: true },
                  longitude: { type: "number", nullable: true },
                  attendance_radius: { type: "integer" },
                },
              },
              shift: {
                allOf: [{ $ref: "#/components/schemas/Shift" }],
                nullable: true,
              },
            },
          },
          RevenueReport: {
            type: "object",
            required: ["period", "date", "range", "summary", "comparison", "series"],
            properties: {
              period: {
                type: "string",
                enum: ["day", "week", "month", "quarter", "year"],
              },
              date: { type: "string", format: "date" },
              range: {
                type: "object",
                required: ["start_at", "end_at"],
                properties: {
                  start_at: { type: "string", format: "date-time" },
                  end_at: { type: "string", format: "date-time" },
                },
              },
              summary: { $ref: "#/components/schemas/RevenueReportSummary" },
              comparison: {
                type: "object",
                required: [
                  "previous_total_revenue_amount",
                  "difference",
                  "percentage_change",
                ],
                properties: {
                  previous_total_revenue_amount: { type: "number" },
                  difference: { type: "number" },
                  percentage_change: { type: "number", nullable: true },
                },
              },
              series: {
                type: "array",
                items: { $ref: "#/components/schemas/RevenueReportPoint" },
              },
            },
          },
          RevenueReportSummary: {
            type: "object",
            required: [
              "total_open_amount",
              "total_close_amount",
              "total_revenue_amount",
              "record_count",
            ],
            properties: {
              total_open_amount: { type: "number" },
              total_close_amount: { type: "number" },
              total_revenue_amount: { type: "number" },
              record_count: { type: "integer" },
            },
          },
          RevenueReportPoint: {
            type: "object",
            required: [
              "bucket_start",
              "total_open_amount",
              "total_close_amount",
              "total_revenue_amount",
              "record_count",
            ],
            properties: {
              bucket_start: { type: "string", format: "date-time" },
              total_open_amount: { type: "number" },
              total_close_amount: { type: "number" },
              total_revenue_amount: { type: "number" },
              record_count: { type: "integer" },
            },
          },
          QuickSearchResult: {
            type: "object",
            required: ["query", "type", "total", "users", "requests", "shifts"],
            properties: {
              query: { type: "string" },
              type: { type: "string", enum: ["all", "users", "requests", "shifts"] },
              total: { type: "integer" },
              users: {
                type: "array",
                items: { $ref: "#/components/schemas/QuickSearchUser" },
              },
              requests: {
                type: "array",
                items: { $ref: "#/components/schemas/QuickSearchRequest" },
              },
              shifts: {
                type: "array",
                items: { $ref: "#/components/schemas/QuickSearchShift" },
              },
            },
          },
          QuickSearchUser: {
            type: "object",
            required: ["id", "full_name", "role"],
            properties: {
              id: { type: "string", format: "uuid" },
              full_name: { type: "string" },
              role: { type: "string" },
            },
          },
          QuickSearchRequest: {
            type: "object",
            required: ["id", "branch_id", "request_type", "status", "updated_at"],
            properties: {
              id: { type: "string", format: "uuid" },
              branch_id: { type: "string", format: "uuid" },
              request_type: { type: "string" },
              status: { type: "string" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          QuickSearchShift: {
            type: "object",
            required: ["id", "name", "branch_id", "start_time", "end_time"],
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              branch_id: { type: "string", format: "uuid" },
              start_time: { type: "string", nullable: true },
              end_time: { type: "string", nullable: true },
            },
          },
          Notification: {
            type: "object",
            required: [
              "id",
              "user_id",
              "title",
              "body",
              "type",
              "is_read",
              "related_entity_type",
              "related_entity_id",
              "created_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              user_id: { type: "string", format: "uuid" },
              title: { type: "string" },
              body: { type: "string" },
              type: {
                type: "string",
                description:
                  "A code written by the notification triggers (SCRUM-70/71/72) and labelled by " +
                  "lib/domain/notificationCatalog.ts: REVENUE_OPENED, REVENUE_CLOSED, REVENUE_DIFF, " +
                  "REQUEST_CREATED, REQUEST_APPROVED, REQUEST_REJECTED, REQUEST_REVIEWED, " +
                  "SHIFT_ASSIGNED, SHIFT_CHANGED, SHIFT_REMOVED, SHIFT_LEAVE, ATTENDANCE_LATE, " +
                  "ATTENDANCE_OUTSIDE, ATTENDANCE_EARLY_LEAVE, ATTENDANCE_RESUMED, " +
                  "ATTENDANCE_CORRECTED, ATTENDANCE_VERIFIED, ATTENDANCE_COMPLAINT, " +
                  "COMPLAINT_RESOLVED, ACCOUNT_CREATED, ACCOUNT_PASSWORD_RESET, STAFF_ROLE_CHANGED, " +
                  "STAFF_OFFBOARDED, STAFF_BRANCH_CHANGED, BRANCH_CREATED, BRANCH_UPDATED, " +
                  "BRANCH_DELETED, BRANCH_MANAGER_ASSIGNED, FACILITY_CREATED, FACILITY_UPDATED, " +
                  "FACILITY_DELETED, FACILITY_MOVED, FACILITY_CATEGORY_CREATED, " +
                  "ORGANIZATION_MEMBER_JOINED, ORGANIZATION_INVITED, ORGANIZATION_UPDATED.",
              },
              is_read: { type: "boolean" },
              related_entity_type: {
                type: "string",
                nullable: true,
                description:
                  "What the notification is about (revenue, request, shift_assignment, attendance, " +
                  "user, branch, facility, facility_category, organization); the app turns it into " +
                  "the \"Xem\" link.",
              },
              related_entity_id: { type: "string", format: "uuid", nullable: true },
              created_at: { type: "string", format: "date-time" },
            },
          },
          PaginatedNotifications: {
            type: "object",
            required: ["data", "total", "page", "page_size"],
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Notification" },
              },
              total: { type: "integer", description: "Total number of notifications." },
              page: { type: "integer", description: "Current page number." },
              page_size: { type: "integer", description: "Number of items per page." },
            },
          },
          NotificationSetting: {
            type: "object",
            required: ["id", "user_id", "channel", "enabled", "updated_at"],
            properties: {
              id: { type: "string", format: "uuid" },
              user_id: { type: "string", format: "uuid" },
              channel: { type: "string", description: "Notification channel (e.g. email, push, in_app)." },
              enabled: { type: "boolean" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          ChatAskRequest: {
            type: "object",
            required: ["question"],
            properties: {
              question: {
                type: "string",
                minLength: 1,
                description: "Câu hỏi của nhân viên về chính sách, quy định hoặc hợp đồng.",
                example: "Chính sách nghỉ phép năm của công ty là bao nhiêu ngày?",
              },
            },
          },
          DocumentChunk: {
            type: "object",
            required: ["content", "source", "similarity"],
            properties: {
              content: {
                type: "string",
                description: "Nội dung đoạn tài liệu được tìm thấy.",
              },
              source: {
                type: "string",
                description: "Tên / tiêu đề tài liệu nguồn (dùng để trích dẫn).",
              },
              similarity: {
                type: "number",
                format: "float",
                minimum: 0,
                maximum: 1,
                description: "Điểm tương đồng cosine với câu hỏi [0, 1].",
              },
            },
          },
          ChatAskResponse: {
            type: "object",
            required: ["answer", "sources"],
            properties: {
              answer: {
                type: "string",
                description: "Câu trả lời được sinh bởi Gemini dựa trên ngữ cảnh tài liệu.",
                example: "Theo [Nguồn 1: Nội quy công ty], nhân viên được nghỉ phép 12 ngày mỗi năm.",
              },
              sources: {
                type: "array",
                description: "Danh sách các đoạn tài liệu được dùng làm ngữ cảnh, sắp xếp theo độ tương đồng giảm dần.",
                items: {
                  $ref: "#/components/schemas/DocumentChunk",
                },
              },
            },
          },
          KnowledgeSourceSummary: {
            type: "object",
            required: ["title", "chunks"],
            properties: {
              title: {
                type: "string",
                description:
                  "Tiêu đề tài liệu (cột `title` của `company_documents` / `user_contracts`; RPC `match_*` trả về nó dưới tên `document_name`).",
              },
              chunks: {
                type: "integer",
                description:
                  "Số đoạn đã nhúng vector cho tài liệu này — cận dưới khi `truncated` = true.",
              },
            },
          },
          KnowledgeCorpus: {
            type: "object",
            required: ["totalChunks", "documents", "truncated"],
            properties: {
              totalChunks: {
                type: "integer",
                description: "Tổng số đoạn trong kho (đếm chính xác bằng `count: exact`).",
              },
              documents: {
                type: "array",
                description: "Bảng kê theo tài liệu, nhiều đoạn nhất trước.",
                items: { $ref: "#/components/schemas/KnowledgeSourceSummary" },
              },
              truncated: {
                type: "boolean",
                description:
                  "true khi bảng kê chỉ đọc được một phần số đoạn, lúc đó `chunks` là cận dưới.",
              },
            },
          },
          KnowledgeSources: {
            type: "object",
            required: ["companyDocuments", "userContracts"],
            properties: {
              companyDocuments: {
                $ref: "#/components/schemas/KnowledgeCorpus",
              },
              userContracts: {
                $ref: "#/components/schemas/KnowledgeCorpus",
              },
            },
          },
          Facility: {
            type: "object",
            required: [
              "id",
              "branch_id",
              "name",
              "code",
              "category",
              "quantity",
              "condition",
              "last_checked_at",
              "note",
              "created_at",
              "updated_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Chi nhánh sở hữu thiết bị (public.branches.id).",
              },
              name: { type: "string", example: "Máy pha cà phê Breville" },
              code: {
                type: "string",
                nullable: true,
                description:
                  "Mã tài sản (SCRUM-67) — hệ thống tự sinh, không sửa và không gửi được: `{số chi nhánh}{viết tắt chi nhánh}-{số}`, ví dụ `01HSVH-0001` (chi nhánh chưa có số thứ tự thì mã chỉ còn phần viết tắt). Phần viết tắt lấy chữ đầu của từng từ trong tên chi nhánh (dấu được bỏ, `Quận 10` → `Q10`), phần số lấy theo chi nhánh và duy nhất trong tổ chức. `null` chỉ với thiết bị tạo trước khi có SCRUM-66 — lần lưu kế tiếp sẽ cấp mã mới.",
                example: "01HSVH-0001",
              },
              category: {
                type: "string",
                description:
                  "Mã nhóm thiết bị (SCRUM-65), phải thuộc danh mục `facility_categories` của tổ chức — xem GET /api/facility-categories.",
                example: "KITCHEN",
              },
              quantity: {
                type: "integer",
                minimum: 1,
                description: "Số lượng thiết bị cùng loại tại chi nhánh.",
              },
              condition: {
                type: "string",
                enum: ["GOOD", "FAIR", "MAINTENANCE", "BROKEN"],
                description:
                  "Tình trạng: tốt, cần theo dõi, đang sửa chữa, hỏng (SCRUM-46 xử lý bảo trì).",
              },
              last_checked_at: {
                type: "string",
                format: "date",
                nullable: true,
                description: "Ngày kiểm tra gần nhất (YYYY-MM-DD).",
              },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          FacilityWriteRequest: {
            type: "object",
            description:
              "Thân yêu cầu tạo/sửa thiết bị. Mã tài sản không nằm trong thân yêu cầu (SCRUM-67): hệ thống tự sinh theo chi nhánh, nên gửi thêm `code` sẽ nhận `400`.",
            required: ["branch_id", "name"],
            properties: {
              branch_id: { type: "string", format: "uuid" },
              name: { type: "string", maxLength: 120 },
              category: {
                type: "string",
                pattern: "^[A-Z0-9_]{1,60}$",
                default: "OTHER",
                description:
                  "Mã nhóm thiết bị lấy từ GET /api/facility-categories (SCRUM-65); gửi mã không có trong danh mục của tổ chức sẽ nhận `400`.",
              },
              quantity: { type: "integer", minimum: 1, maximum: 9999, default: 1 },
              condition: {
                type: "string",
                enum: ["GOOD", "FAIR", "MAINTENANCE", "BROKEN"],
                default: "GOOD",
              },
              last_checked_at: {
                type: "string",
                format: "date",
                nullable: true,
              },
              note: { type: "string", maxLength: 500, nullable: true },
            },
          },
          FacilityCategory: {
            type: "object",
            required: ["id", "organization_id", "code", "name", "created_at"],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: {
                type: "string",
                format: "uuid",
                description: "Tổ chức sở hữu danh mục (SCRUM-65).",
              },
              code: {
                type: "string",
                description:
                  "Giá trị lưu trong `facilities.category`: chữ hoa, chỉ A-Z, 0-9 và `_`.",
                example: "KITCHEN",
              },
              name: {
                type: "string",
                description: "Tên nhóm hiển thị trên màn hình.",
                example: "Khu pha chế",
              },
              created_at: { type: "string", format: "date-time" },
            },
          },
          FacilityCategoryWriteRequest: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                maxLength: 60,
                description:
                  "Tên nhóm thiết bị, duy nhất trong tổ chức; `code` được sinh tự động từ tên này.",
                example: "Máy móc",
              },
            },
          },
          ReverseGeocodeResult: {
            type: "object",
            required: ["address"],
            properties: {
              address: {
                type: "string",
                nullable: true,
                maxLength: 300,
                description:
                  "Địa chỉ đầy đủ của toạ độ (Nominatim/OpenStreetMap, tiếng Việt); null khi nhà cung cấp không có địa chỉ cho điểm đó.",
                example:
                  "128 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
              },
            },
          },
          PayProfile: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "employee_id",
              "hourly_rate",
              "overtime_multiplier",
              "fixed_allowance",
              "effective_from",
              "note",
              "created_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              employee_id: { type: "string", format: "uuid" },
              hourly_rate: {
                type: "integer",
                description: "VND cho một giờ (0..10.000.000).",
              },
              overtime_multiplier: {
                type: "number",
                description: "Hệ số nhân cho giờ của ca tăng ca (1..5).",
              },
              fixed_allowance: {
                type: "integer",
                description: "Phụ cấp cố định mỗi tháng; 0 nghĩa là không có.",
              },
              effective_from: {
                type: "string",
                format: "date",
                description: "Ngày đơn giá bắt đầu có hiệu lực.",
              },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
            },
          },
          Payslip: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "employee_id",
              "branch_id",
              "period_start",
              "period_end",
              "status",
              "regular_minutes",
              "overtime_minutes",
              "shifts_counted",
              "shifts_skipped",
              "work_amount",
              "other_earnings",
              "gross_amount",
              "deduction_amount",
              "net_amount",
              "generated_at",
              "published_at",
              "published_by",
              "acknowledged_at",
              "dispute_note",
              "disputed_at",
              "dispute_resolved_at",
              "void_reason",
              "voided_at",
              "created_at",
              "updated_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              employee_id: { type: "string", format: "uuid" },
              branch_id: { type: "string", format: "uuid", nullable: true },
              period_start: { type: "string", format: "date" },
              period_end: { type: "string", format: "date" },
              status: {
                type: "string",
                enum: ["DRAFT", "PUBLISHED", "VOID"],
                description:
                  "DRAFT sinh lại được; PUBLISHED là bản ghi đã trả và bị đóng băng; VOID giữ lại để đối soát.",
              },
              regular_minutes: { type: "integer" },
              overtime_minutes: { type: "integer" },
              shifts_counted: { type: "integer" },
              shifts_skipped: {
                type: "integer",
                description:
                  "Số ca có chấm công nhưng không được tính (thiếu giờ ra, ca 0 phút…).",
              },
              work_amount: { type: "integer", description: "Tổng tiền của các ca." },
              other_earnings: {
                type: "integer",
                description: "Phụ cấp cố định + các khoản EARNING nhập tay.",
              },
              gross_amount: { type: "integer" },
              deduction_amount: { type: "integer" },
              net_amount: { type: "integer" },
              generated_at: { type: "string", format: "date-time" },
              published_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              published_by: { type: "string", format: "uuid", nullable: true },
              acknowledged_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              dispute_note: {
                type: "string",
                nullable: true,
                description: "Nội dung khiếu nại của nhân viên.",
              },
              disputed_at: { type: "string", format: "date-time", nullable: true },
              dispute_resolved_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              void_reason: { type: "string", nullable: true },
              voided_at: { type: "string", format: "date-time", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          PayslipWorkLine: {
            type: "object",
            required: [
              "id",
              "payslip_id",
              "work_date",
              "minutes",
              "is_overtime",
              "hourly_rate",
              "multiplier",
              "amount",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              payslip_id: { type: "string", format: "uuid" },
              attendance_id: { type: "string", format: "uuid", nullable: true },
              work_date: { type: "string", format: "date" },
              shift_name: { type: "string", nullable: true },
              minutes: { type: "integer" },
              is_overtime: { type: "boolean" },
              hourly_rate: { type: "integer" },
              multiplier: { type: "number" },
              amount: { type: "integer" },
            },
          },
          PayslipItem: {
            type: "object",
            required: [
              "id",
              "payslip_id",
              "kind",
              "code",
              "label",
              "amount",
              "source",
              "created_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              payslip_id: { type: "string", format: "uuid" },
              kind: { type: "string", enum: ["EARNING", "DEDUCTION"] },
              code: { type: "string", example: "BONUS" },
              label: { type: "string", example: "Thưởng doanh số" },
              amount: { type: "integer" },
              source: {
                type: "string",
                enum: ["AUTO", "MANUAL"],
                description:
                  "AUTO là phụ cấp cố định do hệ thống sinh ra và không xoá được.",
              },
              created_at: { type: "string", format: "date-time" },
            },
          },
          PayslipDetail: {
            type: "object",
            required: ["payslip", "work_lines", "items"],
            properties: {
              payslip: { $ref: "#/components/schemas/Payslip" },
              work_lines: {
                type: "array",
                items: { $ref: "#/components/schemas/PayslipWorkLine" },
              },
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/PayslipItem" },
              },
            },
          },
          PayEstimate: {
            type: "object",
            required: [
              "period_start",
              "period_end",
              "has_pay_profile",
              "regular_minutes",
              "overtime_minutes",
              "shifts_counted",
              "shifts_skipped",
              "work_amount",
              "allowance_amount",
              "gross_estimate",
            ],
            properties: {
              period_start: { type: "string", format: "date" },
              period_end: { type: "string", format: "date" },
              has_pay_profile: {
                type: "boolean",
                description:
                  "false nghĩa là tài khoản chưa có đơn giá giờ nào, nên màn hình không hiện 0 ₫.",
              },
              regular_minutes: { type: "integer" },
              overtime_minutes: { type: "integer" },
              shifts_counted: { type: "integer" },
              shifts_skipped: { type: "integer" },
              work_amount: { type: "integer" },
              allowance_amount: { type: "integer" },
              gross_estimate: { type: "integer" },
            },
          },
          PublishPayslipsResult: {
            type: "object",
            required: ["published", "held_for_complaints"],
            properties: {
              published: { type: "integer" },
              held_for_complaints: {
                type: "integer",
                description:
                  "Số phiếu bị giữ lại vì nhân viên còn khiếu nại bảng công chưa xử lý.",
              },
            },
          },
          DemoPaySalaryInput: {
            type: "object",
            description:
              "Thân yêu cầu thêm/sửa một mức lương thử việc (SCRUM-100). Hai cột tổng do SQL tính, không gửi lên.",
            required: [
              "positionCode",
              "positionTitle",
              "monthlyHours",
              "hourlyRate",
              "effectiveFrom",
            ],
            properties: {
              positionCode: {
                type: "string",
                description:
                  "DIRECTOR, MANAGER, SHIFT_LEAD hoặc BARISTA (danh sách trong `lib/domain/demoSalaryPositions.ts`).",
              },
              positionTitle: {
                type: "string",
                description: "Tên vị trí hiển thị, lưu nguyên văn (2..80 ký tự).",
              },
              monthlyHours: {
                type: "number",
                description: "Giờ công chuẩn mỗi tháng, > 0 và ≤ 744, tối đa 2 chữ số thập phân.",
              },
              hourlyRate: {
                type: "integer",
                description: "VND cho một giờ (0..10.000.000).",
              },
              allowanceAmount: {
                type: "integer",
                description: "Phụ cấp (0..1.000.000.000); thiếu = 0.",
              },
              bonusAmount: {
                type: "integer",
                description: "Thưởng (0..1.000.000.000); thiếu = 0.",
              },
              deductionAmount: {
                type: "integer",
                description:
                  "Khấu trừ (0..1.000.000.000); thiếu = 0. Vượt quá gross trả `400` DEMO_PAY_DEDUCTIONS_EXCEED_GROSS.",
              },
              effectiveFrom: {
                type: "string",
                format: "date",
                description: "Ngày bắt đầu áp dụng (YYYY-MM-DD).",
              },
              note: { type: "string", nullable: true, description: "Tối đa 500 ký tự." },
              status: {
                type: "string",
                enum: ["ACTIVE", "ARCHIVED"],
                description:
                  "Tuỳ chọn: thiếu = ACTIVE khi thêm mới, và giữ nguyên giá trị đang lưu khi sửa.",
              },
            },
          },
          DemoPaySalary: {
            type: "object",
            description:
              "Một dòng `demo_pay_salaries` (SCRUM-100). Dữ liệu mô phỏng: không đi vào phiếu lương, chấm công hay KPI lương thật.",
            required: [
              "id",
              "organization_id",
              "position_code",
              "position_title",
              "monthly_hours",
              "hourly_rate",
              "gross_amount",
              "net_amount",
              "effective_from",
              "status",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              position_code: { type: "string" },
              position_title: { type: "string" },
              monthly_hours: { type: "number" },
              hourly_rate: { type: "integer" },
              allowance_amount: { type: "integer" },
              bonus_amount: { type: "integer" },
              deduction_amount: { type: "integer" },
              gross_amount: {
                type: "integer",
                description:
                  "round(monthly_hours × hourly_rate) + allowance + bonus — do CHECK của CSDL ràng buộc.",
              },
              net_amount: {
                type: "integer",
                description: "gross_amount − deduction_amount.",
              },
              effective_from: { type: "string", format: "date" },
              status: {
                type: "string",
                enum: ["ACTIVE", "ARCHIVED"],
              },
              note: { type: "string", nullable: true },
              created_by: { type: "string", format: "uuid", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          PayrollReconciliationRow: {
            type: "object",
            description:
              "Một nhân viên trong bản đối soát tháng (SCRUM-99): con số đang lưu cạnh con số tính lại từ bằng chứng.",
            required: [
              "employee_id",
              "stored_net",
              "computed_net",
              "delta",
              "flags",
            ],
            properties: {
              employee_id: { type: "string", format: "uuid" },
              full_name: { type: "string", nullable: true },
              branch_id: { type: "string", format: "uuid", nullable: true },
              payslip_id: { type: "string", format: "uuid", nullable: true },
              status: {
                type: "string",
                nullable: true,
                description:
                  "DRAFT hoặc PUBLISHED; null khi tháng này chưa có phiếu lương nào.",
              },
              stored_work_amount: {
                type: "integer",
                description: "Tiền giờ công đang lưu trên phiếu.",
              },
              computed_work_amount: {
                type: "integer",
                description:
                  "Tiền giờ công tính lại bằng `payroll_work_lines()` — thứ bộ sinh phiếu sẽ ghi.",
              },
              stored_allowance: {
                type: "integer",
                description: "Khoản phụ cấp cố định (AUTO) đang lưu.",
              },
              computed_allowance: {
                type: "integer",
                description:
                  "Phụ cấp cố định theo đơn giá hiệu lực; 0 khi tháng không có ca nào được tính.",
              },
              manual_earning: {
                type: "integer",
                description: "Tổng khoản cộng nhập tay (không gồm ADJUSTMENT).",
              },
              manual_deduction: {
                type: "integer",
                description: "Tổng khoản trừ nhập tay (không gồm ADJUSTMENT).",
              },
              adjustment_amount: {
                type: "integer",
                description:
                  "Khoản chốt lương thực nhận (SCRUM-93), có dấu: dương là cộng, âm là trừ.",
              },
              stored_net: { type: "integer" },
              computed_net: { type: "integer" },
              delta: {
                type: "integer",
                description: "computed_net − stored_net.",
              },
              shifts_counted: { type: "integer" },
              shifts_skipped: { type: "integer" },
              computed_counted: { type: "integer" },
              computed_skipped: { type: "integer" },
              regular_minutes: { type: "integer" },
              overtime_minutes: { type: "integer" },
              open_shifts: {
                type: "integer",
                description:
                  "Số ca được tính tới giờ tan ca thay vì có giờ ra thật (SCRUM-94/75).",
              },
              flags: {
                type: "array",
                items: { type: "string" },
                description:
                  "STALE, MISSING_PAYSLIP, WOULD_REMOVE, NO_ATTENDANCE, NO_RATE, OPEN_SHIFT, MANUAL_ITEMS, ADJUSTMENT, DRAFT, PUBLISHED. Mã lạ vẫn được trả về để màn hình render nguyên văn.",
              },
            },
          },
          PayrollSyncRow: {
            type: "object",
            description:
              "Một dòng của lần đồng bộ lương (SCRUM-99): việc đã (hoặc sẽ) làm và con số trước/sau.",
            required: [
              "employee_id",
              "action",
              "reason",
              "before_net",
              "after_net",
              "delta",
            ],
            properties: {
              employee_id: { type: "string", format: "uuid" },
              action: {
                type: "string",
                description: "CREATE, REFRESH hoặc SKIP.",
              },
              reason: {
                type: "string",
                description:
                  "MISSING_PAYSLIP, STALE, IN_SYNC, PUBLISHED hoặc NO_ATTENDANCE.",
              },
              before_net: { type: "integer" },
              after_net: { type: "integer" },
              delta: { type: "integer" },
            },
          },
          DashboardBranchStatistics: {
            type: "object",
            required: [
              "branch_id",
              "branch_name",
              "employee_total",
              "employee_active",
              "employee_resigned",
              "scheduled_total",
              "no_show_total",
              "working_employees",
              "absent_employees",
              "attendance_total",
              "on_time",
              "late",
              "early_leave",
              "absent",
              "incomplete",
              "revenue_total",
              "revenue_records",
              "attendance_rate",
            ],
            properties: {
              branch_id: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "null là nhóm \"chưa gán chi nhánh\" của chủ sở hữu (SCRUM-63).",
              },
              branch_name: { type: "string" },
              employee_total: {
                type: "integer",
                description: "Số tài khoản thuộc chi nhánh, mọi vai trò.",
              },
              employee_active: { type: "integer" },
              employee_resigned: {
                type: "integer",
                description: "Số tài khoản đã nghỉ việc (`users.is_active = false`).",
              },
              scheduled_total: {
                type: "integer",
                description: "Số ca đã xếp trong kỳ (`shift_assignments.status = 'SCHEDULED'`).",
              },
              no_show_total: {
                type: "integer",
                description:
                  "Số lượt vắng: ca đã xếp, đã tan và không có dòng chấm công nào.",
              },
              working_employees: {
                type: "integer",
                description: "Số người có ít nhất một dòng chấm công trong kỳ (distinct).",
              },
              absent_employees: {
                type: "integer",
                description: "Số người có ít nhất một lượt vắng (distinct).",
              },
              attendance_total: {
                type: "integer",
                description: "Số dòng chấm công đã ghi trong kỳ.",
              },
              on_time: { type: "integer" },
              late: { type: "integer" },
              early_leave: { type: "integer" },
              absent: {
                type: "integer",
                description: "Số dòng chấm công có trạng thái `ABSENT` (không gồm `no_show_total`).",
              },
              incomplete: { type: "integer" },
              revenue_total: {
                type: "number",
                description: "Doanh thu đã chốt trong kỳ: `close_amount - open_amount`.",
              },
              revenue_records: { type: "integer" },
              attendance_rate: {
                type: "number",
                nullable: true,
                description:
                  "Tỷ lệ đi làm (%) = đã chấm công / (đã chấm công + lượt vắng); null khi kỳ không có dữ liệu.",
              },
            },
          },
          DashboardStatistics: {
            type: "object",
            required: [
              "period",
              "date",
              "range",
              "generated_at",
              "revenue",
              "attendance",
              "workforce",
              "branches",
              "totals",
            ],
            properties: {
              period: { type: "string", enum: ["day", "month", "year"] },
              date: { type: "string", format: "date" },
              range: {
                type: "object",
                required: ["start_at", "end_at", "start_date", "end_date"],
                properties: {
                  start_at: { type: "string", format: "date-time" },
                  end_at: { type: "string", format: "date-time" },
                  start_date: { type: "string", format: "date" },
                  end_date: { type: "string", format: "date" },
                },
              },
              generated_at: { type: "string", format: "date-time" },
              revenue: {
                type: "object",
                required: [
                  "series",
                  "total",
                  "record_count",
                  "previous_total",
                  "percentage_change",
                  "by_branch",
                ],
                properties: {
                  series: {
                    type: "array",
                    description:
                      "Mỗi mốc thời gian một điểm đã lấp 0: `YYYY-MM-DD` cho kỳ ngày/tháng, `YYYY-MM` cho kỳ năm.",
                    items: {
                      type: "object",
                      required: ["bucket", "total_revenue", "record_count"],
                      properties: {
                        bucket: { type: "string" },
                        total_revenue: { type: "number" },
                        record_count: { type: "integer" },
                      },
                    },
                  },
                  total: { type: "number" },
                  record_count: { type: "integer" },
                  previous_total: { type: "number" },
                  percentage_change: {
                    type: "number",
                    nullable: true,
                    description: "null khi kỳ trước chưa có ca nào được chốt.",
                  },
                  by_branch: {
                    type: "array",
                    items: {
                      type: "object",
                      required: [
                        "branch_id",
                        "branch_name",
                        "total_revenue",
                        "record_count",
                      ],
                      properties: {
                        branch_id: { type: "string", format: "uuid", nullable: true },
                        branch_name: { type: "string" },
                        total_revenue: { type: "number" },
                        record_count: { type: "integer" },
                      },
                    },
                  },
                },
              },
              attendance: {
                type: "object",
                required: [
                  "recorded",
                  "on_time",
                  "late",
                  "early_leave",
                  "absent",
                  "incomplete",
                  "no_show",
                  "total",
                  "attendance_rate",
                ],
                properties: {
                  recorded: { type: "integer" },
                  on_time: { type: "integer" },
                  late: { type: "integer" },
                  early_leave: { type: "integer" },
                  absent: {
                    type: "integer",
                    description: "Dòng chấm công có trạng thái `ABSENT`.",
                  },
                  incomplete: { type: "integer" },
                  no_show: {
                    type: "integer",
                    description: "Lượt vắng không có dòng chấm công (ca đã tan).",
                  },
                  total: { type: "integer" },
                  attendance_rate: { type: "number", nullable: true },
                },
              },
              workforce: {
                type: "object",
                required: [
                  "total",
                  "active",
                  "resigned",
                  "working",
                  "absent",
                  "active_rate",
                ],
                properties: {
                  total: { type: "integer" },
                  active: { type: "integer" },
                  resigned: { type: "integer" },
                  working: {
                    type: "integer",
                    description: "Số người đi làm trong kỳ (distinct).",
                  },
                  absent: {
                    type: "integer",
                    description: "Số người có ít nhất một lượt vắng (distinct).",
                  },
                  active_rate: { type: "number", nullable: true },
                },
              },
              branches: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/DashboardBranchStatistics",
                },
              },
              totals: {
                allOf: [{ $ref: "#/components/schemas/DashboardBranchStatistics" }],
                description:
                  "Tổng của phạm vi người gọi đọc được (một chi nhánh nếu đang lọc, toàn tổ chức với chủ sở hữu).",
              },
            },
          },
          Customer: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "company_name",
              "app_name",
              "contact_email",
              "status",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              company_name: { type: "string" },
              app_name: {
                type: "string",
                description: "Tên App đăng ký của khách hàng (C4).",
              },
              contact_name: { type: "string", nullable: true },
              contact_email: { type: "string", format: "email" },
              contact_phone: { type: "string", nullable: true },
              address: { type: "string", nullable: true },
              tax_code: { type: "string", nullable: true },
              status: {
                type: "string",
                enum: ["PROSPECT", "ACTIVE", "SUSPENDED", "CHURNED"],
              },
              notes: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          CustomerOverview: {
            allOf: [{ $ref: "#/components/schemas/Customer" }],
            type: "object",
            properties: {
              active_contracts: { type: "integer" },
              monthly_total: { type: "number" },
              next_end_date: { type: "string", format: "date", nullable: true },
            },
          },
          CustomerInput: {
            type: "object",
            required: ["companyName", "appName", "contactEmail"],
            properties: {
              companyName: { type: "string", maxLength: 160 },
              appName: { type: "string", maxLength: 80 },
              contactName: { type: "string", nullable: true },
              contactEmail: { type: "string", format: "email" },
              contactPhone: { type: "string", nullable: true },
              address: { type: "string", nullable: true },
              taxCode: { type: "string", nullable: true },
              status: {
                type: "string",
                enum: ["PROSPECT", "ACTIVE", "SUSPENDED", "CHURNED"],
                default: "PROSPECT",
              },
              notes: { type: "string", nullable: true, maxLength: 1000 },
            },
          },
          Contract: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "customer_id",
              "contract_no",
              "plan_code",
              "employee_count",
              "unit_price",
              "monthly_fee",
              "billing_cycle",
              "start_date",
              "end_date",
              "status",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              customer_id: { type: "string", format: "uuid" },
              contract_no: { type: "string" },
              plan_code: {
                type: "string",
                enum: ["BASIC", "ADVANCED", "PREMIUM"],
              },
              employee_count: { type: "integer" },
              unit_price: { type: "number", description: "VND/người/tháng." },
              monthly_fee: {
                type: "number",
                description:
                  "Cột sinh trong CSDL: đơn giá × số nhân viên, sàn 400.000 ₫. Không gửi được từ client.",
              },
              billing_cycle: {
                type: "string",
                enum: ["MONTHLY", "QUARTERLY", "YEARLY"],
              },
              start_date: { type: "string", format: "date" },
              end_date: { type: "string", format: "date" },
              auto_renew: { type: "boolean" },
              reminder_days: { type: "integer" },
              status: {
                type: "string",
                enum: ["DRAFT", "ACTIVE", "TERMINATED"],
                description:
                  "Ý định của chủ sở hữu; EXPIRING/EXPIRED được suy ra từ end_date.",
              },
              terminated_on: { type: "string", format: "date", nullable: true },
              termination_reason: { type: "string", nullable: true },
              renews_contract_id: {
                type: "string",
                format: "uuid",
                nullable: true,
              },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          ContractOverview: {
            allOf: [{ $ref: "#/components/schemas/Contract" }],
            type: "object",
            properties: {
              customer_name: { type: "string" },
              app_name: { type: "string" },
              contact_email: { type: "string" },
              days_to_end: { type: "integer" },
              effective_status: {
                type: "string",
                enum: ["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"],
              },
              cycle_months: { type: "integer" },
              period_amount: { type: "number" },
              last_reminder_at: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              email_count: { type: "integer" },
            },
          },
          ContractInput: {
            type: "object",
            required: [
              "customerId",
              "contractNo",
              "planCode",
              "employeeCount",
              "unitPrice",
              "startDate",
              "endDate",
            ],
            properties: {
              customerId: { type: "string", format: "uuid" },
              contractNo: { type: "string", maxLength: 60 },
              planCode: {
                type: "string",
                enum: ["BASIC", "ADVANCED", "PREMIUM"],
              },
              employeeCount: { type: "integer", minimum: 1, maximum: 100000 },
              unitPrice: { type: "number", minimum: 0, maximum: 10000000 },
              billingCycle: {
                type: "string",
                enum: ["MONTHLY", "QUARTERLY", "YEARLY"],
                default: "MONTHLY",
              },
              startDate: { type: "string", format: "date" },
              endDate: { type: "string", format: "date" },
              autoRenew: { type: "boolean", default: true },
              reminderDays: {
                type: "integer",
                minimum: 0,
                maximum: 365,
                default: 30,
              },
              status: {
                type: "string",
                enum: ["DRAFT", "ACTIVE"],
                default: "ACTIVE",
              },
              note: { type: "string", nullable: true },
            },
          },
          ContractRenewInput: {
            type: "object",
            required: [
              "contractNo",
              "planCode",
              "employeeCount",
              "unitPrice",
              "startDate",
              "endDate",
            ],
            properties: {
              contractNo: { type: "string" },
              planCode: {
                type: "string",
                enum: ["BASIC", "ADVANCED", "PREMIUM"],
              },
              employeeCount: { type: "integer" },
              unitPrice: { type: "number" },
              billingCycle: {
                type: "string",
                enum: ["MONTHLY", "QUARTERLY", "YEARLY"],
                default: "MONTHLY",
              },
              startDate: {
                type: "string",
                format: "date",
                description: "Phải sau end_date của hợp đồng cũ.",
              },
              endDate: { type: "string", format: "date" },
              autoRenew: { type: "boolean", default: true },
              reminderDays: { type: "integer", default: 30 },
              note: { type: "string", nullable: true },
            },
          },
          CustomerEmail: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "customer_id",
              "direction",
              "subject",
              "counterpart_email",
              "sent_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              customer_id: { type: "string", format: "uuid" },
              contract_id: { type: "string", format: "uuid", nullable: true },
              direction: {
                type: "string",
                enum: ["INBOUND", "OUTBOUND", "NOTE"],
              },
              subject: { type: "string" },
              counterpart_email: { type: "string", format: "email" },
              counterpart_name: { type: "string", nullable: true },
              gmail_thread_id: { type: "string", nullable: true },
              gmail_message_id: { type: "string", nullable: true },
              gmail_thread_url: {
                type: "string",
                nullable: true,
                description: "Chỉ nhận https://mail.google.com/…",
              },
              sent_at: { type: "string", format: "date-time" },
              snippet: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
            },
          },
          CustomerEmailInput: {
            type: "object",
            required: ["customerId", "subject", "counterpartEmail"],
            properties: {
              customerId: { type: "string", format: "uuid" },
              contractId: { type: "string", format: "uuid", nullable: true },
              direction: {
                type: "string",
                enum: ["INBOUND", "OUTBOUND", "NOTE"],
                default: "OUTBOUND",
              },
              subject: { type: "string", maxLength: 200 },
              counterpartEmail: { type: "string", format: "email" },
              counterpartName: { type: "string", nullable: true },
              gmailThreadId: { type: "string", nullable: true },
              gmailMessageId: { type: "string", nullable: true },
              gmailThreadUrl: { type: "string", nullable: true },
              sentAt: { type: "string", format: "date-time" },
              snippet: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
            },
          },
          CustomerService: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "customer_id",
              "service_name",
              "warranty_start_on",
              "warranty_months",
              "warranty_end_on",
              "maintenance_interval_months",
              "status",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              customer_id: { type: "string", format: "uuid" },
              contract_id: { type: "string", format: "uuid", nullable: true },
              service_name: { type: "string" },
              serial_no: { type: "string", nullable: true },
              warranty_start_on: { type: "string", format: "date" },
              warranty_months: { type: "integer" },
              warranty_end_on: {
                type: "string",
                format: "date",
                description:
                  "Cột sinh: warranty_start_on + warranty_months. Không gửi được từ client.",
              },
              maintenance_interval_months: {
                type: "integer",
                description: "0 nghĩa là không bảo trì định kỳ.",
              },
              status: { type: "string", enum: ["ACTIVE", "ENDED"] },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          ServiceOverview: {
            allOf: [{ $ref: "#/components/schemas/CustomerService" }],
            type: "object",
            properties: {
              customer_name: { type: "string" },
              app_name: { type: "string" },
              contact_email: { type: "string" },
              contract_no: { type: "string", nullable: true },
              last_completed_on: { type: "string", format: "date", nullable: true },
              next_due_on: { type: "string", format: "date", nullable: true },
              next_planned_on: { type: "string", format: "date", nullable: true },
              warranty_state: {
                type: "string",
                enum: ["NONE", "IN_WARRANTY", "EXPIRING", "EXPIRED"],
              },
              maintenance_state: {
                type: "string",
                enum: ["NONE", "OK", "DUE_SOON", "OVERDUE"],
              },
            },
          },
          CustomerServiceInput: {
            type: "object",
            required: ["customerId", "serviceName", "warrantyStartOn"],
            properties: {
              customerId: { type: "string", format: "uuid" },
              contractId: { type: "string", format: "uuid", nullable: true },
              serviceName: { type: "string", maxLength: 120 },
              serialNo: { type: "string", nullable: true },
              warrantyStartOn: { type: "string", format: "date" },
              warrantyMonths: {
                type: "integer",
                minimum: 0,
                maximum: 120,
                default: 12,
              },
              maintenanceIntervalMonths: {
                type: "integer",
                minimum: 0,
                maximum: 60,
                default: 6,
              },
              status: {
                type: "string",
                enum: ["ACTIVE", "ENDED"],
                default: "ACTIVE",
              },
              note: { type: "string", nullable: true },
            },
          },
          MaintenanceVisit: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "service_id",
              "customer_id",
              "scheduled_on",
              "kind",
              "cost",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              service_id: { type: "string", format: "uuid" },
              customer_id: { type: "string", format: "uuid" },
              scheduled_on: { type: "string", format: "date" },
              completed_on: { type: "string", format: "date", nullable: true },
              kind: {
                type: "string",
                enum: ["MAINTENANCE", "REPAIR", "SUPPORT", "TRAINING"],
              },
              technician: { type: "string", nullable: true },
              cost: { type: "number" },
              summary: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          MaintenanceVisitInput: {
            type: "object",
            required: ["serviceId", "customerId", "scheduledOn"],
            properties: {
              serviceId: { type: "string", format: "uuid" },
              customerId: {
                type: "string",
                format: "uuid",
                description: "Phải khớp khách hàng của dịch vụ.",
              },
              scheduledOn: { type: "string", format: "date" },
              completedOn: {
                type: "string",
                format: "date",
                nullable: true,
                description: "Điền ngày này thì summary là bắt buộc.",
              },
              kind: {
                type: "string",
                enum: ["MAINTENANCE", "REPAIR", "SUPPORT", "TRAINING"],
                default: "MAINTENANCE",
              },
              technician: { type: "string", nullable: true },
              cost: { type: "number", default: 0 },
              summary: { type: "string", nullable: true },
            },
          },
          MaintenanceVisitPatch: {
            type: "object",
            description:
              "Chỉ các trường được gửi là được ghi; bỏ trống giữ giá trị đã lưu, null thì xoá.",
            properties: {
              scheduledOn: { type: "string", format: "date" },
              completedOn: { type: "string", format: "date", nullable: true },
              kind: {
                type: "string",
                enum: ["MAINTENANCE", "REPAIR", "SUPPORT", "TRAINING"],
              },
              technician: { type: "string", nullable: true },
              cost: { type: "number" },
              summary: { type: "string", nullable: true },
            },
          },
          ReminderItem: {
            type: "object",
            required: [
              "key",
              "kind",
              "customerId",
              "customerName",
              "itemKind",
              "itemId",
              "dueOn",
              "daysLeft",
            ],
            properties: {
              key: { type: "string" },
              kind: {
                type: "string",
                enum: ["RENEWAL", "EXPIRY", "MAINTENANCE", "USAGE", "OTHER"],
              },
              customerId: { type: "string", format: "uuid" },
              customerName: { type: "string" },
              appName: { type: "string" },
              contactEmail: { type: "string", format: "email" },
              itemKind: { type: "string", enum: ["contract", "service"] },
              itemId: { type: "string", format: "uuid" },
              itemLabel: { type: "string" },
              dueOn: { type: "string", format: "date" },
              daysLeft: {
                type: "integer",
                description: "Âm khi ngày đã qua.",
              },
              lastSentAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              subject: { type: "string" },
              body: { type: "string" },
            },
          },
          ReminderInput: {
            type: "object",
            required: ["customerId", "kind", "dueOn"],
            properties: {
              customerId: { type: "string", format: "uuid" },
              contractId: { type: "string", format: "uuid", nullable: true },
              serviceId: { type: "string", format: "uuid", nullable: true },
              kind: {
                type: "string",
                enum: ["RENEWAL", "EXPIRY", "MAINTENANCE", "USAGE", "OTHER"],
              },
              dueOn: { type: "string", format: "date" },
              channel: {
                type: "string",
                enum: ["EMAIL", "PHONE", "MEETING", "IN_PERSON"],
                default: "EMAIL",
              },
              subject: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
              note: { type: "string", nullable: true },
            },
          },
          CustomerReminderLog: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "customer_id",
              "kind",
              "due_on",
              "channel",
              "sent_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              customer_id: { type: "string", format: "uuid" },
              contract_id: { type: "string", format: "uuid", nullable: true },
              service_id: { type: "string", format: "uuid", nullable: true },
              kind: {
                type: "string",
                enum: ["RENEWAL", "EXPIRY", "MAINTENANCE", "USAGE", "OTHER"],
              },
              due_on: { type: "string", format: "date" },
              channel: {
                type: "string",
                enum: ["EMAIL", "PHONE", "MEETING", "IN_PERSON"],
              },
              subject: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
              sent_at: { type: "string", format: "date-time" },
              note: { type: "string", nullable: true },
            },
          },
          ContractSummary: {
            type: "object",
            required: [
              "customers_total",
              "customers_active",
              "contracts_active",
              "contracts_expiring",
              "contracts_expired",
              "mrr",
              "renewals_due_30",
            ],
            properties: {
              customers_total: { type: "integer" },
              customers_active: { type: "integer" },
              contracts_active: { type: "integer" },
              contracts_expiring: { type: "integer" },
              contracts_expired: { type: "integer" },
              mrr: {
                type: "number",
                description: "Tổng phí tháng của hợp đồng đang hiệu lực.",
              },
              renewals_due_30: { type: "integer" },
            },
          },
          MaintenanceSummary: {
            type: "object",
            required: [
              "services_total",
              "services_active",
              "in_warranty",
              "warranty_expired",
              "due_soon",
              "overdue",
              "planned_visits",
              "overdue_visits",
            ],
            properties: {
              services_total: { type: "integer" },
              services_active: { type: "integer" },
              in_warranty: { type: "integer" },
              warranty_expired: { type: "integer" },
              due_soon: { type: "integer" },
              overdue: { type: "integer" },
              planned_visits: { type: "integer" },
              overdue_visits: { type: "integer" },
            },
          },
          CustomerLead: {
            type: "object",
            required: [
              "id",
              "organization_id",
              "company_name",
              "contact_email",
              "source",
              "status",
              "received_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              organization_id: { type: "string", format: "uuid" },
              company_name: { type: "string" },
              contact_name: { type: "string", nullable: true },
              contact_email: { type: "string", format: "email" },
              contact_phone: { type: "string", nullable: true },
              employee_count: { type: "integer", nullable: true },
              plan_interest: { type: "string", nullable: true },
              message: { type: "string", nullable: true },
              source: {
                type: "string",
                description: "Nơi yêu cầu đến từ (LANDING, PHONE, …).",
              },
              status: {
                type: "string",
                enum: [
                  "NEW",
                  "CONTACTED",
                  "DEMO_SCHEDULED",
                  "CONVERTED",
                  "REJECTED",
                ],
              },
              received_at: { type: "string", format: "date-time" },
              converted_customer_id: {
                type: "string",
                format: "uuid",
                nullable: true,
              },
              note: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          CustomerLeadInput: {
            type: "object",
            required: ["companyName", "contactEmail"],
            properties: {
              companyName: { type: "string", maxLength: 160 },
              contactName: { type: "string", nullable: true },
              contactEmail: { type: "string", format: "email" },
              contactPhone: { type: "string", nullable: true },
              employeeCount: { type: "integer", nullable: true },
              planInterest: { type: "string", nullable: true },
              message: { type: "string", nullable: true, maxLength: 2000 },
              source: { type: "string", default: "LANDING" },
              status: {
                type: "string",
                enum: [
                  "NEW",
                  "CONTACTED",
                  "DEMO_SCHEDULED",
                  "CONVERTED",
                  "REJECTED",
                ],
                default: "NEW",
              },
              note: { type: "string", nullable: true },
            },
          },
          CustomerLeadPatch: {
            type: "object",
            required: ["status"],
            properties: {
              status: {
                type: "string",
                enum: [
                  "NEW",
                  "CONTACTED",
                  "DEMO_SCHEDULED",
                  "CONVERTED",
                  "REJECTED",
                ],
              },
              note: { type: "string", nullable: true },
              convertedCustomerId: {
                type: "string",
                format: "uuid",
                nullable: true,
                description:
                  "Khách hàng đã tạo từ yêu cầu này; đánh dấu CONVERTED không tự tạo khách.",
              },
            },
          },
          ErrorResponse: {
            type: "object",
            required: ["error"],
            properties: {
              error: {
                type: "string",
                description: "Mô tả lỗi.",
                example: "Trường `question` là bắt buộc và phải là chuỗi không rỗng.",
              },
            },
          },
        },
      },
    },
    failOnErrors: true,
  });
}
