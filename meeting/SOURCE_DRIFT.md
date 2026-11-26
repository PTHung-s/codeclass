# TRẠNG THÁI HIỆN TẠI (2026-09-10): src ĐÃ CÓ ĐỦ — KHÔNG CÒN VÁ-DIST

Từ kỷ nguyên vá trực tiếp vào bundle minified (index-MeetAv*), toàn bộ tính năng
đã được **port vào TypeScript source** và **build lại từ src** (commits `298ff6c`
server + `4526b4c` client). Bundle hiện tại: `client/dist/assets/index-CNAaMPcN.js`
(tự sinh bởi Vite, code-split). Giờ đây build lại từ src là AN TOÀN.

## Bản vá dist cũ — dùng khi cần đối chiếu/quay lui

- Tag `prod-dist-final` (= `d1fc803`): dist đã vá HOÀN CHỈNH cuối cùng
  (index-MeetAvI.js + server/dist patched). **Lưu ý tag `backup-patched-dist`
  trỏ vào 59b06bf chỉ là bản freeze đầu tiên — thiếu nhiều thứ, đừng dùng.**
- Bản sao server/dist đã vá: `/opt/apps/video-call-backups/server-dist-patched-final/`

## Tính năng đã có trong src (đối chiếu lần cuối)

### Server (server/src)
- SSO: `/api/profile` + `verifyCodeClassToken` (globalThis, cache 120s, CODECLASS_API)
- room:join: ccUser verify, name fallback 'Ẩn danh', teacher-takes-host,
  orphan takeover, membership-guard breakout, returningFromBreakout bypass,
  response isBreakout/parentId, peers có role/avatar, code chỉ cho host
- room:leave, room:claim-host (password / creator-name / teacher token)
- room:delete nới quyền (teacher / mồ côi) + cascade breakout + dọn timer
- code:delta relay đúng nghĩa: áp canonical (RoomManager.applyChanges) +
  journal snap + broadcast room-wide với isTargeted
- code:sync ghi journal snap; code:history host-only
- user:copy / external-paste ghi journal marker kèm text ≤300 ký tự
- Breakout suite: create/list/assign/recall/timer/broadcast/close +
  scheduleBreakoutTimer (clamp 0.2–240 phút) + heartbeat 60s sống-sốt-restart
- Persist: rooms.json ghi BẤT ĐỒNG BỘ + guard _saving + slice aiHistory(60) +
  listRooms ẩn breakout; ROOMS_FILE env
- Caps: assignment 800KB → assignment:rejected; activityStats 400→300;
  AI rate-limit 25/phút/IP

### Client (client/src)
- SSO lobby: fetch /api/profile → prefill tên + tự vào `?room=` hoặc
  meet:lastRoom; meet:lastRoom/meet:lastPass lưu khi join thành công,
  xóa khi Rời phòng; hỏi mật khẩu khi vào phòng khóa
- Máy chấm CodeClass: /api/run/python|cpp (Bearer token, 401 → hướng dẫn
  đăng nhập); ngôn ngữ khác giữ Piston
- Avatar "con vật" CodeClass 3 lớp: lib/avatar.ts + StudentAvatar (VideoTile,
  SFUUserList)
- SFU: receive-only khi tắt cả mic+cam + fallback chuỗi; replaceTrack +
  addDeviceTrack cho bật lại mic/cam; publishSingleTrack; __meetKeepStream
  tái dùng stream khi chuyển phòng (không chớp cam)
- Pin fixes: ô spotlight có nút Bỏ ghim + click để bỏ; dọn ghim mồ côi khi
  peer rời; spotlight chia sẻ màn hình nhường người còn chia sẻ khi dừng
- Breakout: BreakoutPanel (tạo/số nhóm/phút, list, chỉ định, ghé thăm,
  gọi về, hẹn giờ lại, thông báo broadcast, kết thúc) + switchRoom +
  breakout:move tự chuyển + nút "Về lớp chính"
- Playback: MeetPlaybackPlugin (timeline scrub, 1×–240×, tick copy xanh/
  paste đỏ) mở từ nút ▶ trong danh sách thành viên (code:history)
- Xem code: nút Code2 → code:request + setViewingPeerCode + tự mở tab code
  (meet:selectTab)
- Nút "Nhận quyền host" ở header (claim-host)
- ĐÃ BỎ modal "giải trình" rời tab (vẫn đếm vi phạm cho host)
- Xóa phòng trong lobby (confirm + mật khẩu nếu khóa)

## Quy trình build/deploy chuẩn (từ giờ)

```
cd /opt/apps/root/video-call/client && npm run build      # sinh dist mới
cd /opt/apps/root/video-call/server && npm run build && systemctl restart video-call
```

- Cloudflare cache theo URL: tên file mới (hash Vite) tự né cache — không cần
  đổi tay như thời vá-dist.
- systemctl restart video-call: rooms sống trong rooms.json, tự khôi phục khi
  boot (hostId reset về rỗng).
