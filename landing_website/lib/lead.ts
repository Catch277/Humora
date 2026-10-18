export type LeadPayload = {
  topic: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  employees: string;
  plan: string;
  message: string;
  source: "landing";
};

/* Landing là site tĩnh, không có backend → form gửi JSON tới một endpoint bên ngoài
   (Formspree, Getform, Google Apps Script, API riêng…) khai báo trong .env.local:
     NEXT_PUBLIC_LEAD_ENDPOINT=https://formspree.io/f/xxxxxxxx
   Chưa khai báo thì ném lỗi "NO_ENDPOINT" để form KHÔNG báo thành công giả. */
export async function submitLead(payload: LeadPayload): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_LEAD_ENDPOINT;
  if (!endpoint) throw new Error("NO_ENDPOINT");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
}