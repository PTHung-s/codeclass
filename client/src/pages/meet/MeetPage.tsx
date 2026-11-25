import { useEffect } from "react";
import { Video } from "lucide-react";

/**
 * MeetPage — "Meeting": mở video-call app trong TAB RIÊNG của trình duyệt
 * (giống Google Meet), thay vì nhúng iframe trong CodeClass.
 *
 * QUAN TRỌNG — tái sử dụng tab bằng TÊN CỐ ĐỊNH ("codeclass_meet"):
 * window.open với tên đã tồn tại sẽ điều hướng + focus tab cũ thay vì mở tab mới.
 * (Không dùng "noopener" — nó ép trình duyệt mở cửa sổ mới, phá cơ chế tái sử dụng.
 *  App meeting cùng origin nên không rủi ro opener.)
 * Trước đây mỗi lần bấm sidebar là 1 tab mới — đây chính là lỗi đã sửa.
 */
const MEET_URL = "/meet/";
const MEET_TAB = "codeclass_meet";

export default function MeetPage() {
  useEffect(() => {
    const win = window.open(MEET_URL, MEET_TAB);
    if (win) { try { win.opener = null; } catch { /* bỏ qua */ } }
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Video size={32} className="text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">Meeting</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Đã mở lớp học trực tuyến trong tab mới. Nếu trình duyệt chặn popup,
        bấm nút bên dưới.
      </p>
      <a
        href={MEET_URL}
        target={MEET_TAB}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Video size={16} />
        Mở Meeting trong tab mới
      </a>
    </div>
  );
}
