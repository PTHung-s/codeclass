import { useEffect, useState } from "react";
import { ShieldCheck, Flame } from "lucide-react";
import { Dialog, DialogContent, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";
import { useAuthContext } from "../../contexts/AuthContext";
import api from "../../lib/api";

type AnnouncementMode = "never" | "once" | "daily" | "always";

interface AnnouncementConfig {
  enabled: boolean;
  mode: AnnouncementMode;
  timesPerDay: number;
  title: string;
  body: string;
}

const STORAGE_PREFIX = "cc-announcement-v1";
const DEFAULT_TITLE = "Thông báo hệ thống";
const DEFAULT_BODY = "";

/** localStorage helpers — iso ngày (VN ~ thời điểm client) để đếm theo ngày */
const today = () => new Date().toISOString().slice(0, 10);

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return { shownOnce: false, count: 0, date: "" };
    const p = JSON.parse(raw);
    return {
      shownOnce: Boolean(p.shownOnce),
      count: Number.isFinite(p.count) ? p.count : 0,
      date: typeof p.date === "string" ? p.date : "",
    };
  } catch {
    return { shownOnce: false, count: 0, date: "" };
  }
}

function persistState({ shownOnce, count, date }: { shownOnce: boolean; count: number; date: string }) {
  try {
    localStorage.setItem(STORAGE_PREFIX, JSON.stringify({ shownOnce, count, date }));
  } catch {
    /* ignore */
  }
}

/** Quyết định popup có nên hiển thị lần này hay không, rồi cập nhật trạng thái. */
function shouldShow(cfg: AnnouncementConfig) {
  if (!cfg.enabled) return false;
  const st = readState();
  switch (cfg.mode) {
    case "never":
      return false;
    case "once":
      if (st.shownOnce) return false;
      persistState({ shownOnce: true, count: 0, date: today() });
      return true;
    case "daily": {
      const t = today();
      const count = st.date === t ? st.count : 0;
      if (count >= cfg.timesPerDay) return false;
      persistState({ shownOnce: st.shownOnce, count: count + 1, date: t });
      return true;
    }
    case "always":
      return true;
    default:
      return false;
  }
}

/**
 * Popup thông báo toàn cục — nội dung & quy tắc hiện do admin điều khiển
 * (đọc từ /api/announcement). Vai trò: hiển thị đúng thiết lập của admin.
 */
export default function ShieldFixAnnouncement() {
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<AnnouncementConfig | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    api
      .get("/announcement")
      .then((r) => r.data as AnnouncementConfig)
      .catch(() => null)
      .then((data) => {
        if (!data) return;
        setCfg(data);
        if (shouldShow(data)) setOpen(true);
      });

    // "always" — mỗi lần người dùng quay lại tab/web (visibilitychange) là một
    // lần "vào web" mới, nên hiện lại. Các chế độ khác vẫn tôn trọng bộ đếm.
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      setCfg((cur) => {
        if (!cur) return cur;
        if (cur.mode === "always") setOpen(true);
        return cur;
      });
    };
    const onFocus = () => {
      setCfg((cur) => {
        if (cur?.mode === "always") setOpen(true);
        return cur;
      });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id]);

  const dismiss = () => setOpen(false);

  if (!cfg) return null;

  const title = cfg.title?.trim() || DEFAULT_TITLE;
  const paragraphs = cfg.body
    ? cfg.body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    : [DEFAULT_BODY];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
        {/* Header */}
        <div className="relative flex flex-col items-center gap-3 border-b border-border bg-muted/30 px-6 py-7 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="size-6" strokeWidth={1.8} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-primary">
              Thông báo hệ thống
            </p>
            <h2 className="text-lg leading-tight font-semibold tracking-tight text-foreground">{title}</h2>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-6 text-sm leading-relaxed text-muted-foreground">
          {paragraphs.map((para, i) => {
            const isCallout = para.startsWith("!callout");
            const text = isCallout ? para.replace(/^!callout\s*/, "") : para;
            if (isCallout) {
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
                  <Flame className="mt-0.5 size-4 shrink-0 text-orange-500" strokeWidth={1.8} />
                  <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
                </div>
              );
            }
            return <p key={i}>{text}</p>;
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-6 py-4">
          <DialogClose
            render={
              <Button className="w-full" size="lg" onClick={dismiss}>
                Đã hiểu
              </Button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}