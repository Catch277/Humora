import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, {
  Callout,
  CompanyContact,
  P,
  Ul,
  type LegalSection,
} from "@/components/legal/LegalDocument";
import { COMPANY_NAME } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng – Humora",
  description:
    "Điều khoản sử dụng nền tảng quản lý nhân sự và ca làm việc Humora: tài khoản, trách nhiệm của khách hàng, thanh toán, dữ liệu và giải quyết tranh chấp.",
};

const sections: LegalSection[] = [
  {
    id: "chap-nhan",
    title: "Chấp nhận điều khoản",
    content: (
      <>
        <P>
          Điều khoản này điều chỉnh việc bạn truy cập website và sử dụng nền tảng quản lý nhân sự và ca làm việc
          Humora do {COMPANY_NAME} (“Humora”, “chúng tôi”) cung cấp. Khi đăng ký, dùng thử hoặc sử dụng dịch vụ, bạn
          xác nhận đã đọc, hiểu và đồng ý với điều khoản này.
        </P>
        <P>
          Nếu bạn đăng ký thay mặt một doanh nghiệp, bạn cam kết mình có thẩm quyền ràng buộc doanh nghiệp đó. Nếu
          doanh nghiệp đã ký hợp đồng hoặc báo giá riêng với Humora, các điều khoản trong hợp đồng hoặc báo giá được
          ưu tiên áp dụng khi có mâu thuẫn.
        </P>
      </>
    ),
  },
  {
    id: "dinh-nghia",
    title: "Giải thích từ ngữ",
    content: (
      <Ul>
        <li><strong className="text-ink">Dịch vụ:</strong> nền tảng Humora gồm ứng dụng di động (Android, iOS) và web quản trị.</li>
        <li><strong className="text-ink">Khách hàng:</strong> doanh nghiệp, tổ chức đăng ký sử dụng Dịch vụ.</li>
        <li><strong className="text-ink">Quản trị viên:</strong> người được Khách hàng giao quản lý tài khoản và phân quyền.</li>
        <li><strong className="text-ink">Người dùng:</strong> nhân viên, quản lý và những người khác được Khách hàng cấp quyền sử dụng.</li>
        <li><strong className="text-ink">Dữ liệu khách hàng:</strong> mọi dữ liệu do Khách hàng và Người dùng đưa vào hoặc tạo ra trên Dịch vụ.</li>
      </Ul>
    ),
  },
  {
    id: "dich-vu",
    title: "Dịch vụ và gói sử dụng",
    content: (
      <>
        <P>
          Humora cung cấp các chức năng chấm công bằng nhận diện khuôn mặt và định vị GPS/WiFi, xếp và duyệt ca làm
          việc, tính lương và trợ lý AI. Phạm vi chức năng phụ thuộc vào gói Khách hàng đăng ký (Cơ bản, Nâng cao hoặc
          Cao cấp); web quản trị có trong gói Nâng cao và Cao cấp.
        </P>
        <P>
          Chúng tôi có thể cải tiến, bổ sung hoặc điều chỉnh tính năng để nâng cao chất lượng dịch vụ. Nếu thay đổi làm
          giảm đáng kể chức năng của gói đang sử dụng, chúng tôi sẽ thông báo trước một thời gian hợp lý.
        </P>
      </>
    ),
  },
  {
    id: "dung-thu",
    title: "Dùng thử miễn phí",
    content: (
      <>
        <P>
          Khách hàng mới có thể dùng thử miễn phí 14 ngày mà không cần cung cấp thẻ tín dụng. Hết thời gian dùng thử,
          Khách hàng cần chọn gói và hoàn tất thủ tục để tiếp tục sử dụng.
        </P>
        <P>
          Nếu không tiếp tục, tài khoản sẽ được tạm ngưng. Dữ liệu được giữ trong một thời gian hợp lý để Khách hàng
          có thể xuất hoặc kích hoạt lại, sau đó có thể bị xoá theo mục “Chấm dứt và xử lý dữ liệu”.
        </P>
      </>
    ),
  },
  {
    id: "tai-khoan",
    title: "Tài khoản và bảo mật",
    content: (
      <Ul>
        <li>Khách hàng cung cấp thông tin đăng ký chính xác và cập nhật khi có thay đổi.</li>
        <li>Quản trị viên chịu trách nhiệm tạo, phân quyền và thu hồi quyền của Người dùng.</li>
        <li>Mỗi tài khoản dành cho một người; không chia sẻ mật khẩu hoặc cho người khác chấm công thay.</li>
        <li>
          Khách hàng và Người dùng bảo mật thông tin đăng nhập và thông báo ngay cho Humora khi phát hiện truy cập trái
          phép. Mọi hoạt động thực hiện bằng tài khoản được xem là do chủ tài khoản thực hiện.
        </li>
      </Ul>
    ),
  },
  {
    id: "trach-nhiem-kh",
    title: "Trách nhiệm của Khách hàng",
    content: (
      <>
        <P>Khi sử dụng Dịch vụ để quản lý nhân sự, Khách hàng cam kết và chịu trách nhiệm:</P>
        <Ul>
          <li>
            Có căn cứ pháp lý để xử lý dữ liệu của nhân viên trên Humora; thông báo rõ cho nhân viên và xin sự đồng ý
            (khi pháp luật yêu cầu) trước khi bật chấm công bằng khuôn mặt hoặc theo vị trí.
          </li>
          <li>
            Cấu hình ca làm, quy chế chấm công và công thức lương phù hợp với pháp luật lao động, hợp đồng lao động và
            quy định nội bộ.
          </li>
          <li>
            Kiểm tra kết quả chấm công và bảng lương trước khi chi trả. Độ chính xác của bảng lương phụ thuộc vào dữ
            liệu đầu vào và cấu hình do Khách hàng thiết lập.
          </li>
          <li>Không sử dụng Dịch vụ để giám sát trái phép, phân biệt đối xử hoặc xâm phạm quyền riêng tư của người lao động.</li>
        </Ul>
        <Callout>
          Humora là công cụ hỗ trợ vận hành, không thay thế tư vấn pháp lý, kế toán hay thuế. Khách hàng nên tham vấn
          chuyên gia khi cần.
        </Callout>
      </>
    ),
  },
  {
    id: "hanh-vi-cam",
    title: "Hành vi bị cấm",
    content: (
      <>
        <P>Khi sử dụng Dịch vụ, bạn không được:</P>
        <Ul>
          <li>Giả mạo khuôn mặt, vị trí, mạng WiFi hoặc dữ liệu chấm công, hoặc nhờ người khác chấm công hộ.</li>
          <li>Truy cập trái phép vào tài khoản, dữ liệu hoặc hệ thống của người khác; vượt qua cơ chế phân quyền.</li>
          <li>Tấn công, gây quá tải, dò quét lỗ hổng hoặc làm gián đoạn Dịch vụ.</li>
          <li>Sao chép, dịch ngược, trích xuất mã nguồn hoặc tạo sản phẩm cạnh tranh từ Dịch vụ, trừ khi pháp luật cho phép.</li>
          <li>Đưa lên nội dung hoặc dữ liệu vi phạm pháp luật, xâm phạm quyền của bên thứ ba.</li>
          <li>Bán lại hoặc cho bên khác sử dụng Dịch vụ khi chưa có sự đồng ý bằng văn bản của Humora.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "phi",
    title: "Phí và thanh toán",
    content: (
      <>
        <P>
          Phí được tính theo số nhân viên nhân với mức giá mỗi người mỗi tháng của bậc quy mô và gói Khách hàng chọn,
          với mức phí tối thiểu là 400.000 đồng mỗi tháng cho mỗi công ty. Chi tiết xem tại mục{" "}
          <Link href="/#pricing" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
            Bảng giá
          </Link>
          . Doanh nghiệp trên 500 nhân viên được báo giá riêng.
        </P>
        <Ul>
          <li>Kỳ thanh toán, phương thức và tiến độ thanh toán được ghi trong báo giá hoặc hợp đồng.</li>
          <li>Thuế giá trị gia tăng và các loại thuế khác (nếu có) được thể hiện trên báo giá, hóa đơn theo quy định pháp luật.</li>
          <li>
            Nếu thanh toán chậm, Humora có thể tạm ngưng Dịch vụ sau khi thông báo cho Khách hàng và cho một thời gian
            hợp lý để khắc phục.
          </li>
          <li>Khi thay đổi giá, chúng tôi sẽ thông báo trước một thời gian hợp lý và không áp dụng hồi tố.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "so-huu-tri-tue",
    title: "Quyền sở hữu và dữ liệu khách hàng",
    content: (
      <Ul>
        <li>
          Humora giữ mọi quyền sở hữu trí tuệ đối với phần mềm, thương hiệu, giao diện và tài liệu của Dịch vụ. Khách
          hàng được cấp quyền sử dụng không độc quyền, không chuyển nhượng trong thời hạn sử dụng Dịch vụ.
        </li>
        <li>
          Khách hàng giữ quyền sở hữu đối với Dữ liệu khách hàng và cho phép Humora xử lý dữ liệu đó trong phạm vi cần
          thiết để cung cấp, bảo trì và bảo mật Dịch vụ.
        </li>
        <li>Góp ý, đề xuất của Khách hàng về sản phẩm có thể được Humora sử dụng để cải tiến mà không phát sinh nghĩa vụ trả phí.</li>
      </Ul>
    ),
  },
  {
    id: "du-lieu-ca-nhan",
    title: "Bảo vệ dữ liệu cá nhân",
    content: (
      <P>
        Việc thu thập và xử lý dữ liệu cá nhân được mô tả trong{" "}
        <Link href="/privacy" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
          Chính sách bảo mật
        </Link>
        . Đối với dữ liệu nhân sự, Khách hàng là bên quyết định mục đích xử lý còn Humora xử lý theo hợp đồng và chỉ
        dẫn của Khách hàng. Hai bên tuân thủ Luật Bảo vệ dữ liệu cá nhân và các văn bản hướng dẫn. Theo yêu cầu,
        Humora sẵn sàng ký thỏa thuận xử lý dữ liệu cá nhân với Khách hàng.
      </P>
    ),
  },
  {
    id: "bao-hanh",
    title: "Hỗ trợ, bảo hành và gián đoạn dịch vụ",
    content: (
      <>
        <P>
          Humora nỗ lực duy trì Dịch vụ hoạt động ổn định và hỗ trợ Khách hàng trong giờ hành chính. Phạm vi bảo
          hành, bảo trì và cam kết thời gian phản hồi (SLA) được quy định trong hợp đồng hoặc báo giá của từng Khách
          hàng.
        </P>
        <P>
          Chúng tôi sẽ thông báo trước đối với các đợt bảo trì theo kế hoạch. Dịch vụ có thể bị gián đoạn do sự kiện
          bất khả kháng hoặc nguyên nhân ngoài tầm kiểm soát hợp lý của chúng tôi, như sự cố hạ tầng mạng, điện, nhà
          cung cấp bên thứ ba hoặc quyết định của cơ quan nhà nước.
        </P>
      </>
    ),
  },
  {
    id: "gioi-han",
    title: "Giới hạn trách nhiệm",
    content: (
      <>
        <P>
          Trong phạm vi pháp luật cho phép, Humora không chịu trách nhiệm đối với thiệt hại gián tiếp, mất lợi nhuận
          hoặc mất cơ hội kinh doanh phát sinh từ việc sử dụng hoặc không thể sử dụng Dịch vụ, và không chịu trách nhiệm
          đối với sai sót do dữ liệu đầu vào hoặc cấu hình của Khách hàng.
        </P>
        <P>
          Tổng mức trách nhiệm bồi thường của Humora đối với Khách hàng không vượt quá tổng phí Khách hàng đã thanh
          toán cho Dịch vụ trong 12 tháng liền trước sự kiện phát sinh trách nhiệm. Giới hạn này không áp dụng đối với
          hành vi cố ý vi phạm hoặc những trường hợp pháp luật không cho phép giới hạn trách nhiệm.
        </P>
      </>
    ),
  },
  {
    id: "cham-dut",
    title: "Chấm dứt và xử lý dữ liệu",
    content: (
      <>
        <Ul>
          <li>Khách hàng có thể chấm dứt sử dụng Dịch vụ theo thời hạn và thủ tục trong hợp đồng hoặc báo giá.</li>
          <li>
            Humora có thể tạm ngưng hoặc chấm dứt Dịch vụ khi Khách hàng vi phạm nghiêm trọng điều khoản này hoặc không
            thanh toán sau khi đã được thông báo.
          </li>
          <li>
            Sau khi chấm dứt, Khách hàng có thời gian hợp lý (theo hợp đồng) để xuất Dữ liệu khách hàng. Sau đó Humora
            xoá hoặc ẩn danh dữ liệu, trừ khi pháp luật yêu cầu lưu trữ.
          </li>
        </Ul>
        <P>Các quy định về sở hữu trí tuệ, bảo mật, giới hạn trách nhiệm và giải quyết tranh chấp vẫn có hiệu lực sau khi chấm dứt.</P>
      </>
    ),
  },
  {
    id: "luat-ap-dung",
    title: "Luật áp dụng và giải quyết tranh chấp",
    content: (
      <P>
        Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp trước hết được giải quyết bằng thương
        lượng thiện chí. Nếu không đạt được thỏa thuận, tranh chấp được đưa ra Tòa án có thẩm quyền tại Việt Nam để giải
        quyết, trừ khi hợp đồng giữa hai bên quy định khác.
      </P>
    ),
  },
  {
    id: "thay-doi",
    title: "Thay đổi điều khoản",
    content: (
      <P>
        Chúng tôi có thể cập nhật điều khoản này theo từng thời kỳ. Phiên bản mới được đăng tại trang này kèm ngày có
        hiệu lực; với thay đổi quan trọng, chúng tôi sẽ thông báo qua email hoặc trong ứng dụng. Việc tiếp tục sử dụng
        Dịch vụ sau ngày có hiệu lực nghĩa là bạn đồng ý với điều khoản mới.
      </P>
    ),
  },
  {
    id: "lien-he",
    title: "Liên hệ",
    content: (
      <>
        <P>Nếu có câu hỏi về điều khoản này, vui lòng liên hệ:</P>
        <CompanyContact />
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Điều khoản sử dụng"
      intro={
        <P>
          Vui lòng đọc kỹ điều khoản dưới đây trước khi sử dụng Humora. Điều khoản này nêu quyền và trách nhiệm của
          Humora, của doanh nghiệp khách hàng và của người dùng khi vận hành chấm công, ca làm và tính lương trên nền
          tảng.
        </P>
      }
      sections={sections}
      other={{ label: "Chính sách bảo mật", href: "/privacy" }}
    />
  );
}