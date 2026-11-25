import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { StudentName } from "../ui/StudentName";

export default function RosterRemovalDialog({ open, studentId, studentName, studentNickname, onClose }: { open: boolean; studentId: string; studentName: string; studentNickname?: string | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post("/roster-exclusions", { studentId, reason: reason.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roster-exclusions"] }); qc.invalidateQueries({ queryKey: ["attendance-sheet"] }); qc.invalidateQueries({ queryKey: ["tuition-sheet"] }); setReason(""); onClose(); },
  });
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" onClick={e => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Loại khỏi danh sách chung?</h2>
      <div className="mt-2 text-sm text-gray-500"><StudentName fullName={studentName} nickname={studentNickname} primaryClassName="text-sm font-medium text-gray-700 dark:text-gray-200" /> sẽ không xuất hiện trong điểm danh/học phí mới. Lịch sử vẫn được giữ nguyên.</div>
      <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Lý do (không bắt buộc)" className="mt-4 w-full rounded-lg border p-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" rows={3} />
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-sm">Hủy</button><button disabled={mutation.isPending} onClick={() => mutation.mutate()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{mutation.isPending ? "Đang lưu…" : "Xác nhận"}</button></div>
    </div>
  </div>;
}
