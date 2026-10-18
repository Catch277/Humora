import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, {
  Callout,
  CompanyContact,
  P,
  Sub,
  Ul,
  type LegalSection,
} from "@/components/legal/LegalDocument";
import { COMPANY_NAME } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Chính sách bảo mật – Humora",
  description:
    "Cách Humora thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu cá nhân, gồm dữ liệu khuôn mặt và vị trí khi chấm công.",
};

const sections: LegalSection[] = [
  {
    id: "pham-vi",
    title: "Phạm vi áp dụng và vai trò của Humora",
    content: (
      <>
        <P>
          Chính sách này áp dụng khi bạn truy cập website Humora, gửi yêu cầu liên hệ cho chúng tôi hoặc sử dụng
          nền tảng Humora (ứng dụng di động và web quản trị). Chính sách được xây dựng theo Luật Bảo vệ dữ liệu cá
          nhân số 91/2025/QH15 (có hiệu lực từ ngày 01/01/2026), Nghị định 356/2025/NĐ-CP hướng dẫn thi hành Luật
          và các quy định pháp luật có liên quan.
        </P>
        <P>Vai trò của Humora phụ thuộc vào việc bạn là ai:</P>
        <Ul>
          <li>
            <strong className="text-ink">Khách truy cập website, người gửi yêu cầu liên hệ, demo hoặc báo giá:</strong>{" "}
            {COMPANY_NAME} là bên quyết định mục đích và cách thức xử lý dữ liệu của bạn.
          </li>
          <li>
            <strong className="text-ink">Nhân viên và quản lý sử dụng Humora tại nơi làm việc:</strong> doanh nghiệp
            sử dụng lao động (khách hàng của Humora) quyết định việc chấm công, xếp ca và tính lương, nên là bên
            quyết định mục đích xử lý dữ liệu nhân sự. Humora xử lý dữ liệu theo hợp đồng và chỉ dẫn của doanh nghiệp
            đó để vận hành nền tảng.
          </li>
        </Ul>
        <P>
          Nếu bạn là nhân viên, hãy liên hệ doanh nghiệp nơi bạn làm việc trước về quyền đối với dữ liệu của mình.
          Humora sẽ hỗ trợ doanh nghiệp đáp ứng các yêu cầu đó.
        </P>
      </>
    ),
  },
  {
    id: "du-lieu",
    title: "Dữ liệu chúng tôi thu thập",
    content: (
      <>
        <Sub>Khi bạn truy cập website và liên hệ với chúng tôi</Sub>
        <Ul>
          <li>Họ tên, email, số điện thoại, tên doanh nghiệp, số nhân viên, gói quan tâm và nội dung lời nhắn bạn nhập vào biểu mẫu.</li>
          <li>Dữ liệu kỹ thuật cơ bản do máy chủ ghi nhận khi truy cập, như địa chỉ IP, loại trình duyệt và thiết bị.</li>
        </Ul>

        <Sub>Khi bạn sử dụng nền tảng Humora</Sub>
        <Ul>
          <li>
            <strong className="text-ink">Tài khoản và hồ sơ:</strong> họ tên, mã nhân viên, chức danh, cửa hàng hoặc
            bộ phận, thông tin liên hệ do doanh nghiệp hoặc bạn cung cấp.
          </li>
          <li>
            <strong className="text-ink">Ca làm và chấm công:</strong> lịch ca, thời điểm vào ca và ra ca, đơn xin
            nghỉ, yêu cầu đổi ca và kết quả duyệt.
          </li>
          <li>
            <strong className="text-ink">Lương:</strong> dữ liệu phục vụ tính lương theo cấu hình của doanh nghiệp.
          </li>
          <li>
            <strong className="text-ink">Dữ liệu khuôn mặt (sinh trắc học)</strong> để xác thực chấm công bằng Face ID.
          </li>
          <li>
            <strong className="text-ink">Dữ liệu vị trí và mạng WiFi</strong> tại thời điểm chấm công, để kiểm tra bạn
            có ở trong phạm vi cho phép của nơi làm việc hay không.
          </li>
          <li>
            <strong className="text-ink">Nội dung trao đổi với trợ lý AI</strong> trong ứng dụng.
          </li>
          <li>Nhật ký hoạt động và bảo mật của tài khoản, phục vụ hỗ trợ kỹ thuật và phát hiện truy cập bất thường.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "nhay-cam",
    title: "Dữ liệu nhạy cảm: khuôn mặt và vị trí",
    content: (
      <>
        <P>
          Theo pháp luật Việt Nam, dữ liệu sinh trắc học và dữ liệu vị trí cá nhân là dữ liệu cá nhân nhạy cảm, cần
          được bảo vệ chặt chẽ hơn. Với hai loại dữ liệu này, Humora cam kết:
        </P>
        <Ul>
          <li>Chỉ dùng dữ liệu khuôn mặt để xác thực danh tính khi chấm công, không dùng cho mục đích khác.</li>
          <li>Chỉ kiểm tra vị trí và mạng WiFi vào thời điểm chấm công để xác định phạm vi làm việc.</li>
          <li>Giới hạn quyền truy cập theo vai trò, chỉ những người cần thiết mới được xem.</li>
          <li>Không bán, không cho thuê và không trao đổi dữ liệu cá nhân vì mục đích thương mại.</li>
        </Ul>
        <Callout>
          <strong>Dành cho doanh nghiệp khách hàng:</strong> trước khi bật Face ID hoặc chấm công theo vị trí, doanh
          nghiệp có trách nhiệm thông báo rõ cho nhân viên và có được sự đồng ý hoặc căn cứ hợp pháp khác theo quy
          định. Nhân viên có thể rút lại sự đồng ý bằng cách thông báo cho doanh nghiệp; khi đó doanh nghiệp quyết
          định phương thức chấm công thay thế phù hợp.
        </Callout>
      </>
    ),
  },
  {
    id: "muc-dich",
    title: "Mục đích và căn cứ xử lý",
    content: (
      <>
        <P>Chúng tôi xử lý dữ liệu cá nhân cho các mục đích sau:</P>
        <Ul>
          <li>Cung cấp và vận hành dịch vụ: chấm công, xếp và duyệt ca, tính lương, trợ lý AI.</li>
          <li>Xác thực người dùng, bảo mật tài khoản và phòng chống gian lận chấm công.</li>
          <li>Phản hồi yêu cầu liên hệ, đặt lịch demo, dùng thử và gửi báo giá.</li>
          <li>Hỗ trợ kỹ thuật và liên lạc về dịch vụ (thông báo bảo trì, thay đổi điều khoản).</li>
          <li>Cải thiện sản phẩm dựa trên dữ liệu tổng hợp, không nhận diện cá nhân.</li>
          <li>Tuân thủ nghĩa vụ pháp lý và yêu cầu hợp pháp của cơ quan nhà nước có thẩm quyền.</li>
        </Ul>
        <P>
          Căn cứ xử lý gồm sự đồng ý của chủ thể dữ liệu, việc thực hiện hợp đồng với doanh nghiệp khách hàng, nghĩa
          vụ pháp lý của chúng tôi và các căn cứ khác mà pháp luật cho phép. Chúng tôi không xử lý dữ liệu cá nhân
          trái quy định của pháp luật.
        </P>
      </>
    ),
  },
  {
    id: "chia-se",
    title: "Chia sẻ dữ liệu",
    content: (
      <>
        <P>Chúng tôi chỉ chia sẻ dữ liệu trong các trường hợp sau:</P>
        <Ul>
          <li>
            <strong className="text-ink">Doanh nghiệp khách hàng của bạn:</strong> quản trị viên và quản lý xem được
            dữ liệu nhân sự, chấm công và lương trong phạm vi quyền được phân.
          </li>
          <li>
            <strong className="text-ink">Nhà cung cấp dịch vụ:</strong> đơn vị cung cấp hạ tầng lưu trữ đám mây, gửi
            email, hỗ trợ khách hàng và dịch vụ AI, chỉ xử lý dữ liệu theo hợp đồng và nghĩa vụ bảo mật với chúng tôi.
          </li>
          <li>
            <strong className="text-ink">Cơ quan nhà nước có thẩm quyền:</strong> khi có yêu cầu hợp pháp theo quy
            định của pháp luật.
          </li>
          <li>
            <strong className="text-ink">Đơn vị kế thừa:</strong> trong trường hợp sáp nhập, chia tách hoặc chuyển
            giao hoạt động kinh doanh, chúng tôi sẽ thông báo cho bạn và yêu cầu bên nhận tiếp tục bảo vệ dữ liệu.
          </li>
        </Ul>
        <P>
          Một số nhà cung cấp có thể đặt máy chủ ngoài lãnh thổ Việt Nam. Khi chuyển dữ liệu cá nhân ra nước ngoài,
          chúng tôi thực hiện đầy đủ các điều kiện và thủ tục theo quy định của pháp luật Việt Nam.
        </P>
      </>
    ),
  },
  {
    id: "luu-tru",
    title: "Thời gian lưu trữ",
    content: (
      <Ul>
        <li>
          Dữ liệu tài khoản và hồ sơ nhân sự được lưu trong thời gian hợp đồng của doanh nghiệp khách hàng còn hiệu lực.
        </li>
        <li>
          Khi hợp đồng chấm dứt, chúng tôi xoá hoặc ẩn danh dữ liệu, hoặc trả lại cho doanh nghiệp khách hàng, trong
          thời hạn nêu trong hợp đồng, trừ khi pháp luật yêu cầu lưu trữ lâu hơn.
        </li>
        <li>
          Dữ liệu liên hệ của khách tiềm năng được lưu cho đến khi bạn yêu cầu xoá hoặc khi không còn cần thiết cho
          mục đích liên hệ ban đầu.
        </li>
        <li>Nhật ký hệ thống được lưu trong thời gian cần thiết cho mục đích bảo mật và đối soát.</li>
      </Ul>
    ),
  },
  {
    id: "bao-mat",
    title: "Biện pháp bảo mật",
    content: (
      <>
        <Ul>
          <li>Mã hoá dữ liệu khi truyền tải qua mạng (HTTPS/TLS).</li>
          <li>Phân quyền theo vai trò: mỗi người chỉ truy cập được dữ liệu thuộc phạm vi của mình.</li>
          <li>Giới hạn số nhân sự của Humora được truy cập dữ liệu, ghi nhận nhật ký truy cập.</li>
          <li>Rà soát và cập nhật các biện pháp kỹ thuật, tổ chức định kỳ.</li>
        </Ul>
        <P>
          Không hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ xử lý
          kịp thời, thông báo cho doanh nghiệp khách hàng, người bị ảnh hưởng và cơ quan có thẩm quyền theo quy định
          của pháp luật.
        </P>
      </>
    ),
  },
  {
    id: "quyen",
    title: "Quyền của bạn",
    content: (
      <>
        <P>Theo quy định của pháp luật, bạn có các quyền sau đối với dữ liệu cá nhân của mình:</P>
        <Ul>
          <li>Được biết về việc xử lý dữ liệu.</li>
          <li>Đồng ý hoặc không đồng ý, và rút lại sự đồng ý đã đưa ra.</li>
          <li>Truy cập, xem và yêu cầu chỉnh sửa dữ liệu.</li>
          <li>Yêu cầu cung cấp, xoá hoặc hạn chế xử lý dữ liệu.</li>
          <li>Phản đối việc xử lý dữ liệu trong các trường hợp pháp luật cho phép.</li>
          <li>Khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường thiệt hại theo quy định.</li>
        </Ul>
        <P>
          <strong className="text-ink">Cách thực hiện:</strong> nếu bạn là nhân viên, hãy gửi yêu cầu cho doanh nghiệp
          nơi bạn làm việc. Với dữ liệu mà {COMPANY_NAME} trực tiếp quản lý (ví dụ thông tin liên hệ bạn gửi qua
          website), hãy liên hệ chúng tôi theo thông tin ở mục cuối. Chúng tôi có thể cần xác minh danh tính trước khi
          xử lý yêu cầu và sẽ phản hồi trong thời hạn pháp luật quy định.
        </P>
      </>
    ),
  },
  {
    id: "tre-em",
    title: "Người dưới 18 tuổi",
    content: (
      <P>
        Humora được thiết kế cho doanh nghiệp và người lao động, không chủ đích thu thập dữ liệu của trẻ em. Nếu doanh
        nghiệp khách hàng sử dụng lao động chưa đủ 18 tuổi trên nền tảng, doanh nghiệp có trách nhiệm bảo đảm đã có sự
        đồng ý của người đại diện theo pháp luật và tuân thủ các quy định riêng về dữ liệu của trẻ em và người chưa thành niên.
      </P>
    ),
  },
  {
    id: "cookie",
    title: "Cookie và công nghệ tương tự",
    content: (
      <P>
        Website chỉ dùng các công nghệ lưu trữ cần thiết để hoạt động. Nếu sau này chúng tôi bổ sung công cụ phân tích
        hoặc quảng cáo, chúng tôi sẽ cập nhật chính sách này và thông báo cho bạn trước khi áp dụng.
      </P>
    ),
  },
  {
    id: "thay-doi",
    title: "Thay đổi chính sách",
    content: (
      <P>
        Chúng tôi có thể cập nhật chính sách này khi dịch vụ hoặc quy định pháp luật thay đổi. Phiên bản mới được đăng
        tại trang này kèm ngày có hiệu lực. Với thay đổi quan trọng, chúng tôi sẽ thông báo qua email hoặc trong ứng dụng.
      </P>
    ),
  },
  {
    id: "lien-he",
    title: "Liên hệ về dữ liệu cá nhân",
    content: (
      <>
        <P>Mọi câu hỏi hoặc yêu cầu liên quan đến chính sách này, vui lòng liên hệ:</P>
        <CompanyContact />
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Chính sách bảo mật"
      intro={
        <P>
          Humora tôn trọng và bảo vệ dữ liệu cá nhân của bạn. Chính sách này giải thích chúng tôi thu thập những dữ
          liệu nào, dùng vào việc gì, chia sẻ với ai, lưu giữ bao lâu và bạn có những quyền gì. Việc sử dụng dịch vụ
          cũng chịu sự điều chỉnh của{" "}
          <Link href="/terms" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
            Điều khoản sử dụng
          </Link>
          .
        </P>
      }
      sections={sections}
      other={{ label: "Điều khoản sử dụng", href: "/terms" }}
    />
  );
}