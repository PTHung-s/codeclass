/**
 * SFURoomStats — thay RoomStats (LiveKit) trong chế độ SFU.
 * Hiển thị số người trong phòng từ signaling socket + trạng thái SFU.
 */
import React, { useEffect, useState } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';

const StatRow = ({ label, value, colorClass = 'text-white' }: { label: string; value: string | number; colorClass?: string }) => (
  <div className="flex items-center justify-between border-b border-line py-2.5">
    <span className="text-sm text-muted">{label}</span>
    <span className={`font-mono text-sm font-bold ${colorClass}`}>{value}</span>
  </div>
);

export const SFURoomStats: React.FC = () => {
  const roomId = useMeetingStore((s) => s.roomId);
  const userName = useMeetingStore((s) => s.userName);
  const peers = useMeetingStore((s) => s.peers);
  const [sfuInfo, setSfuInfo] = useState<string>('—');

  useEffect(() => {
    const sfuBase = (import.meta.env.VITE_SFU_URL || '').replace(/\/$/, '');
    fetch(`${sfuBase}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSfuInfo(d?.status === 'ok' ? 'Connected' : 'Degraded'))
      .catch(() => setSfuInfo('Unreachable'));
  }, []);

  return (
    <div className="space-y-1 bg-raised p-4">
      <div className="mb-4 border-b border-line pb-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
        Phiên SFU
      </div>
      <StatRow label="Room ID" value={roomId || '—'} />
      <StatRow label="Bạn" value={userName || '—'} colorClass="text-ok" />
      <StatRow label="Thành viên" value={peers.length + 1} />
      <StatRow label="Media server" value={sfuInfo} colorClass={sfuInfo === 'Connected' ? 'text-ok' : 'text-muted'} />
    </div>
  );
};
