// Thư viện lời nhắn (speech bubble) tiếng Việt cho mascot.
// Mỗi hàm trả về một câu ngẫu nhiên trong pool, có chèn ngữ cảnh (tên, điểm, streak...).
// Giữ mỗi câu ngắn (≤ ~110 ký tự) để vừa speech bubble.

/** Trả về một phần tử ngẫu nhiên (deterministic-enough cho UI, không cần an toàn mật mã). */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Rút gọn tên họ (lấy tên cuối) để câu chào tự nhiên hơn. */
function firstName(full?: string | null): string | null {
  if (!full) return null
  const t = full.trim()
  if (!t) return null
  const parts = t.split(/\s+/)
  return parts[parts.length - 1]
}

/* ── Chào hỏi khi vào Dashboard (idle) ── */
export function msgGreet(opts?: { name?: string | null; streak?: number }): string {
  const name = firstName(opts?.name)
  const streak = opts?.streak ?? 0
  const base: string[] = name
    ? [
        `Chào ${name}! Sẵn sàng học tiếp nào 👋`,
        `He again, ${name}! Vui quá, lại gặp nhau rồi 😊`,
        `${name} tới rồi — bắt đầu thôi nào!`,
        `Chào cậu, ${name}! Hôm nay học gì nào?`,
      ]
    : [
        `Chào bạn! Sẵn sàng học tiếp nào 👋`,
        `Lại gặp nhau rồi, vui quá! 😊`,
        `Bắt đầu thôi nào — mình đồng hành cùng bạn!`,
      ]
  if (streak >= 7) return pick([...base, `Streak ${streak} ngày! Bạn quả là cày cuốc 🔥`])
  if (streak >= 3) return pick([...base, `Streak ${streak} ngày rồi — giữ lửa nhé! 🔥`])
  if (streak === 0) return pick([...base, `Hôm nay chưa điểm danh — giữ streak đi! 💪`])
  return pick(base)
}

/* ── Đúng 1 câu (cheer) ── */
export function msgCorrect(): string {
  return pick([
    "Chuẩn rồi! 🤩",
    "Đúng rồi, giỏi quá! ✨",
    "Ăn câu này! 💯",
    "Chính xác! Tiếp tục nào!",
    "Quá đỉnh! Câu sau cũng vậy nha 👏",
    "Yep! Bạn đang vào guồng rồi đó!",
  ])
}

/* ── Sai 1 câu (sad nhẹ, động viên) ── */
export function msgWrong(): string {
  return pick([
    "Tiếc quá, câu này hụt 😢",
    "Gần đúng rồi, cố lên!",
    "Sai chút xíu — xem lại thử nhé 💪",
    "Không sao, sai để mà học!",
    "Hụt rồi, nhưng mình làm lại được mà!",
  ])
}

/* ── Đỗ / AC toàn bộ (celebrate) ── */
export function msgSolved(opts?: { score?: number; total?: number; tokens?: number }): string {
  const score = opts?.score
  const total = opts?.total
  const perfect = score != null && total != null && score === total
  const tail =
    opts?.tokens && opts.tokens > 0 ? ` · +${opts.tokens} 🪙` : ""
  const core = score != null && total != null ? ` ${score}/${total}` : ""
  if (perfect) {
    return pick([
      `Xuất sắc — toàn điểm${core}! 🏆${tail}`,
      `Toàn điểm${core}, pro quá! 🎉${tail}`,
      `Một màn trình diễn hoàn hảo${core}! 🌟${tail}`,
    ])
  }
  return pick([
    `Đỗ rồi${core}! Chúc mừng 🎉${tail}`,
    `Qua bài${core}! Cố gắng tuyệt vời 👏${tail}`,
    `Xong rồi${core}! Bạn làm được mà 💪${tail}`,
  ])
}

/* ── Trượt / không AC (sad) ── */
export function msgFail(opts?: { score?: number; total?: number; passScore?: number }): string {
  const score = opts?.score
  const total = opts?.total
  const core = score != null && total != null ? ` ${score}/${total}` : ""
  const need = opts?.passScore != null ? ` Cần đạt ${opts.passScore}%` : ""
  return pick([
    `Chưa đạt lần này${core} — không sao đâu 😢`,
    `Tiếc quá${core}.${need} — làm lại được mà!`,
    `Gần rồi${core}, cố thêm chút nữa nhé 💪`,
    `Chưa qua${core} — sai ở đâu mình khắc phục ở đó!`,
  ])
}

/* ── Bất ngờ sợ (scared): hết giờ / mất hết tim ── */
export function msgShocked(reason?: "timeout" | "hearts"): string {
  if (reason === "hearts") {
    return pick([
      "Hết tim rồi — bình tĩnh, làm lại nào! 😱",
      "Ôi không, hết tim! Lần sau cẩn thận hơn nhé 💔",
    ])
  }
  if (reason === "timeout") {
    return pick([
      "Hết giờ rồi! 😱 Lần sau nhanh tay hơn nha.",
      "Tít! Hết thời gian — mình thử lại nhé!",
    ])
  }
  return pick(["Ôi không! 😱", "Hú vía! Thử lại nào!", "Bất ngờ quá! Kệ mình chút nữa nha!"])
}

/* ── Hype: nhận token / lên cấp / streak dài ── */
export function msgHype(opts?: { tokens?: number; level?: number | string }): string {
  if (opts?.tokens && opts.tokens > 0 && opts?.level != null) {
    return pick([`Lên Lv.${opts.level} + ${opts.tokens} tokens! Cháy đi! 🚀`, `Ultrà! Lv.${opts.level} và +${opts.tokens} 🪙 🔥`])
  }
  if (opts?.tokens && opts.tokens > 0) {
    return pick([`+${opts.tokens} tokens! Cháy tiếp đi! 🔥`, `Tặng ${opts.tokens} tokens — xịn xò! 🪙`, `+${opts.tokens}! Bạn xứng đáng 🚀`])
  }
  if (opts?.level != null) {
    return pick([`Lên Lv.${opts.level} rồi, khủng khiếp! 🚀`, `Level up! Lv.${opts.level} 🔥`])
  }
  return pick(["Cháy đi! 🔥", "Bạn đang rất ổn! 🚀", "Hype quá! Tiếp tục nào!"])
}

/* ── Tip nhẹ khi idle lâu (idle) ── */
export function msgTip(): string {
  return pick([
    "Mẹo: đọc kỹ đề trước khi code nhé 😉",
    "Cố gắng giữ chuỗi mỗi ngày!",
    "Nhớ nghỉ mắt 1 phút nha 👀",
    "Sai là chuyện thường — quan trọng là làm lại!",
    "Thử chạy test tay trước khi nộp nhé.",
    "Học ít mà đều, hiệu quả hơn nhiều!",
  ])
}

/* ── Vừa bắt đầu một bài học / quiz ── */
export function msgStart(): string {
  return pick([
    "Cùng bắt đầu nào! Cố lên 💪",
    "Bài mới — mình tin bạn làm được!",
    "Tập trung lên, thôi nào! 🎯",
  ])
}
