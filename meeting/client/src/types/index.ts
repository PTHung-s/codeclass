export interface Peer {
  socketId: string;
  name: string;
  role?: string | null;
  avatar?: string | null;
  isConnected?: boolean;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isHandRaised?: boolean;
  code?: string;
  language?: { name: string; version: string };
  violations?: number;
  copyCount?: number;
  pasteCount?: number;
  points?: number;
  isActive?: boolean;
  violationHistory?: Array<{ type: string; reason: string; timestamp: number }>;
  activityStats?: Array<{ timestamp: number; added: number; deleted: number }>;
}

export interface Message {
  senderId: string;
  senderName: string;
  text: string;
  time: number;
  broadcast?: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostName?: string;
  locked: boolean;
  size: number;
  createdAt: number;
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

export interface AudioGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface BreakoutSummary {
  rooms: Array<{ id: string; name: string; size: number }>;
  allowSelfSelect: boolean;
  endsAt: number | null;
  closingAt: number | null;
  mainSize: number;
}
