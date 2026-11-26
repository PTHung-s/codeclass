# CodeClass Unified Architecture & Deployment Guide

## 1. Cấu trúc Monorepo

```text
codeclass/
├── package.json              # Scripts điều phối build/typecheck/test toàn repo
├── server/                   # CodeClass Backend API (Express + Prisma + SQLite + WebSocket)
├── client/                   # CodeClass Frontend SPA (React + Vite + Tailwind + Monaco)
├── meeting/
│   ├── server/               # Meeting & Classroom Socket.IO Server (/meet)
│   ├── client/               # Meeting Classroom UI (React + Vite + mediasoup-client)
│   └── mediasoup-server/     # Standalone WebRTC SFU Worker (Linux/Docker)
└── docs/                     # Tài liệu kỹ thuật & vận hành
```

## 2. Chạy phát triển cục bộ (Local Dev)

1. Cài đặt phụ thuộc cho từng module (`npm install` trong `server/`, `client/`, `meeting/server/`, `meeting/client/`).
2. Copy template môi trường:
   - `server/.env.example` → `server/.env`
   - `meeting/server/.env.example` → `meeting/server/.env`
   - Đặt `MEETING_INTERNAL_SECRET` giống nhau ở cả 2 file (hoặc để trống nếu cùng dùng chung máy với `JWT_SECRET` trong `server/.env`).
3. Khởi tạo/đồng bộ SQLite:
   ```bash
   npm run db:push
   ```
4. Chạy các tiến trình:
   ```bash
   npm run dev:server   # :3001 — CodeClass API
   npm run dev:meeting  # :5000 — Meeting server (Vite proxy tự chuyển /meet -> :5000)
   npm run dev:client   # :5173 — CodeClass Frontend
   ```

## 3. Đồng bộ dữ liệu hai chiều (CodeClass ⇄ Meeting)

- **Quản lý lớp trực tuyến (`/meet`):** CodeClass gọi `GET /api/internal/rooms`, `POST /api/rooms`, và `DELETE /api/internal/rooms/:id` sang Meeting Server, kèm theo `courseId` và `hostUserId`.
- **Đồng bộ Quiz & Năng lực học viên:** Mọi phiên Quiz chuẩn và Adaptive Quiz trong phòng Meeting tự đẩy sự kiện `quiz:sync` / `adaptive:sync` về `POST /api/meetings/internal/events`, lưu lịch sử chi tiết vào `meeting_quiz_sessions` / `meeting_quiz_submissions` và ghi nhận `SkillEvidence` (`source="meeting_quiz"`) để cập nhật `SkillMastery`.
- **Kho câu hỏi dùng chung:** Giáo viên trong phòng Meeting bấm **Kho CodeClass** (`GET /api/meetings/quiz-bank`) để lấy câu hỏi đã duyệt từ Quiz Bank / bài học CodeClass (đã gắn sẵn `skillId`).

## 4. Kiểm tra & Build Production

```bash
npm run typecheck:server
npm run typecheck:client
npm test
npm run build:all
```

Trên production (Linux VPS), mỗi dịch vụ chạy tiến trình riêng để hoạt động chấm code / SQLite trên CodeClass không ảnh hưởng độ mượt âm thanh/video của SFU:
1. `server/` (`node dist/index.js`, cổng `3001`) + reverse proxy phục vụ `client/dist/`.
2. `meeting/server/` (`node dist/index.js`, cổng `5000`, `APP_BASE=/meet`, `SOCKET_PATH=/meet/socket.io`) phục vụ `meeting/client/dist/`.
3. `meeting/mediasoup-server/` qua Docker hoặc Node Linux worker (xem `meeting/docker-compose.yml`), kết nối qua `SFU_ADMIN_URL`, `SFU_ADMIN_TOKEN`, `SFU_SHARED_SECRET`.
