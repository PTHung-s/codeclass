import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { usePresence } from "../../../hooks/usePresence";
import { initialOf } from "./recordingUtils";
import { StudentName } from "../../../components/ui/StudentName";

/**
 * Add a student who joined after Start. Sourced from live presence, so the
 * teacher only sees students actually online and able to send events.
 */
export default function AddStudentDialog({
  open,
  onClose,
  existingUserIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  existingUserIds: Set<string>;
  onAdd: (userId: string) => void;
}) {
  const online = usePresence();
  const [search, setSearch] = useState("");

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return online
      .filter((s) => !existingUserIds.has(s.userId))
      .filter((s) => !q || s.fullName.toLowerCase().includes(q));
  }, [online, existingUserIds, search]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm học sinh vào buổi ghi</DialogTitle>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên..."
          className="mb-2"
        />

        {!candidates.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {online.length === 0
              ? "Không có học sinh nào đang online."
              : "Tất cả học sinh đang online đều đã có trong buổi ghi."}
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {candidates.map((s) => (
              <div key={s.userId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {initialOf(s.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <StudentName fullName={s.fullName} nickname={s.nickname} primaryClassName="text-xs font-medium" />
                  <span className="block truncate text-[10px] text-muted-foreground">{s.activityLabel}</span>
                </span>
                <Button
                  size="xs"
                  onClick={() => {
                    onAdd(s.userId);
                    onClose();
                  }}
                >
                  <UserPlus className="h-3 w-3" /> Thêm
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
