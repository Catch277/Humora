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
              "status",
              "reject_reason",
              "approver_id",
              "created_at",
              "updated_at",
              "requester",
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
            },
          },
          Shift: {
            type: "object",
            required: ["id", "name", "branch_id", "start_time", "end_time"],
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
              check_in_photo_url: { type: "string", nullable: true },
              check_out_photo_url: { type: "string", nullable: true },
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
