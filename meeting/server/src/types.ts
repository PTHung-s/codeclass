export interface Participant {
  name: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isActive?: boolean;
  isHandRaised?: boolean;
  code?: string;
  language?: { name: string; version: string };
  violations?: number;
  copyCount?: number;
  pasteCount?: number;
  points?: number;
  isConnected?: boolean;
  violationHistory?: Array<{ type: string; reason: string; timestamp: number }>;
  activityStats: Array<{ timestamp: number; added: number; deleted: number }>;
  /** Nhật ký playback code (snap/copy/paste) — chỉ host xem qua code:history */
  codeLog?: Array<{ t: number; k: 'snap' | 'copy' | 'paste'; text?: string; n?: number }>;
  /** SSO CodeClass */
  role?: string;
  avatar?: string | null;
  ccId?: string;
  /** Token phiên ẩn danh để reconnect an toàn (chống giả mạo tên) */
  sessionToken?: string;
  joinedAt?: number;
  /**
   * Các bài code học sinh đã LƯU (để quay lại chỉnh sửa/chạy lại, và để giáo
   * viên chấm điểm). Khác với `code` — `code` là bản đang gõ, còn đây là các
   * bản đã đặt tên và cất đi.
   */
  savedCode?: SavedCode[];
}

/** Một bài code học sinh đã lưu. */
export interface SavedCode {
  id: string;
  /** Tên bài do học sinh đặt, VD "Bài 1 - Tính tổng" */
  title: string;
  code: string;
  language: { name: string; version: string };
  savedAt: number;
  /** Lần cuối học sinh mở/chạy lại bài này */
  lastOpenedAt?: number;
  /** Số lần bấm Chạy trên bài này — giáo viên tham khảo khi chấm */
  runCount?: number;
}

export interface Message {
  senderId: string;
  senderName: string;
  text: string;
  time: number;
  /** Thông báo host phát tới mọi phòng nhóm */
  broadcast?: boolean;
}

export interface Assignment {
  id: string;
  data: string;
  type: 'image' | 'pdf';
  name: string;
}

/**
 * Danh sách signaling socket.id của những người được tick "nghe host".
 * Luật bất đối xứng (host LUÔN nghe được tất cả):
 *   - Host luôn nghe mọi người, kể cả người không được tick.
 *   - Người được tick nghe được host và nghe được nhau.
 *   - Người không được tick KHÔNG nghe được ai ngoài host.
 */
export type HearHostList = string[];

export interface AudioGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Room {
  id: string;
  name: string;
  password?: string;
  hostId: string;
  hostName?: string;
  courseId?: string;
  hostUserId?: string;
  /** Bí mật cấp cho người tạo phòng standalone (giáo viên SSO không cần) */
  hostSecret?: string;
  participants: Map<string, Participant>;
  createdAt: number;
  messages: Message[];
  pinned?: string;
  forcePin: boolean;
  assignments: Assignment[];
  currentAssignmentIndex?: number;
  audioMode?: 'all' | 'selected';
  hearHost?: HearHostList;
  hostFocus?: boolean;
  audioGroups?: AudioGroup[];
  /**
   * Chế độ giám sát thi cử. Bật = host yêu cầu cả lớp chia sẻ màn hình.
   *  - monitoring: host đang giám sát
   *  - requireShare: đã ra lệnh, học sinh phải chia sẻ
   *  - pinnedScreenId: màn hình đang được ghim cho CẢ LỚP xem (tối đa 1)
   *  - refusals: socketId của học sinh chưa/không chia sẻ (host theo dõi)
   */
  exam?: {
    monitoring: boolean;
    requireShare: boolean;
    pinnedScreenId: string | null;
    startedAt: number;
    /** Trạng thái chia sẻ màn hình & loại bề mặt ('monitor' | 'window' | 'browser' | 'unknown') của từng học viên */
    shareStatus?: Record<string, { sharing: boolean; surface?: string; updatedAt: number }>;
  };
  activeQuiz?: any;
  quizResponses?: any[];
  activeAdaptive?: {
    id: string;
    title: string;
    status: 'active' | 'ended';
    createdAt: number;
    currentQuestion?: any;
    questionEndsAt?: number | null;
    questionTimeLimit?: number;
    questionIndex: number;
    questionHistory: any[];
    responses: Map<string, { selectedOption: number; isCorrect: boolean; userName: string; socketId: string }>;
    scores: Map<string, { score: number; userName: string; socketId: string }>;
  } | null;
  aiHistory?: Map<string, any[]>;
  musicState?: MusicState;
  /** ─── Breakout rooms (phòng nhóm con của lớp) ─── */
  isBreakout?: boolean;
  parentId?: string | null;
  /** id các phòng nhóm đang hoạt động của lớp chính */
  breakouts?: string[];
  /** Mốc tự gọi về (host hẹn giờ) — null = không hẹn */
  breakoutEndsAt?: number | null;
  /** Học sinh tự chọn/đổi phòng nhóm */
  breakoutAllowSelfSelect?: boolean;
  /** Mốc kết thúc đếm ngược 30s trước khi gọi về / đóng nhóm */
  breakoutClosingAt?: number | null;
}

export interface MusicState {
  currentTrack: string | null;
  isPlaying: boolean;
  startTime: number;
  pausedAt?: number;
  duration?: number;
  poll: MusicPoll | null;
}

export interface MusicPoll {
  options: string[];
  votes: { [identity: string]: number };
  endTime: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  courseId?: string | null;
  locked: boolean;
  size: number;
  createdAt: number;
  activeQuizTitle?: string | null;
  examMonitoring?: boolean;
}
