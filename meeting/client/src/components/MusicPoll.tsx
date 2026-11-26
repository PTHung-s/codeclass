import React from "react";
import { useMeetingStore } from "../store/useMeetingStore";
import { socket } from "../services/socket";
import { Music, Play, Pause, SkipForward, BarChart3, Volume2 } from "lucide-react";
import SidebarTemplate from "./SidebarTemplate";

interface MusicPollProps {
  onClose: () => void;
}

const MusicPoll: React.FC<MusicPollProps> = ({ onClose }) => {
  const { 
    musicState, 
    roomId, 
    isHost,
    hostId,
    mySocketId,
    myPoints,
    musicVolume,
    setMusicVolume,
    musicProgress,
    peers
  } = useMeetingStore();

  // Tính trọng số khớp 100% với server: loại Host, tính cả chính mình + chỉ người có > 0 LP mới được x3/x2
  const getWeight = (voterId: string) => {
    const candidates: Array<{ socketId: string; points: number }> = peers
      .filter((p) => p.socketId !== hostId && (p.points || 0) > 0)
      .map((p) => ({ socketId: p.socketId, points: p.points || 0 }));

    const selfId = mySocketId || socket.id;
    if (!isHost && selfId && myPoints > 0 && !candidates.some((c) => c.socketId === selfId)) {
      candidates.push({ socketId: selfId, points: myPoints });
    }
    candidates.sort((a, b) => b.points - a.points);
    const index = candidates.findIndex((p) => p.socketId === voterId);
    if (index === 0) return 3;
    if (index === 1) return 2;
    return 1;
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = musicProgress.duration > 0 
    ? (musicProgress.currentTime / musicProgress.duration) * 100 
    : 0;

  const handleTogglePlay = () => {
    socket.emit("music:toggle", { roomId, isPlaying: !musicState.isPlaying });
  };

  const handleSkip = () => {
    socket.emit("music:next-track", { roomId });
  };

  const handleVote = (index: number) => {
    socket.emit("music:vote", { roomId, optionIndex: index });
  };

  // Calculate weighted vote counts
  const voteData = musicState.poll?.options.map((_, idx) => {
    if (!musicState.poll) return 0;
    // Thay vì đếm số người, ta cộng dồn trọng số (điểm vote) của mỗi người
    return Object.entries(musicState.poll.votes || {}).reduce((sum, [voterId, optionIdx]) => {
      if (optionIdx === idx) {
        return sum + getWeight(voterId);
      }
      return sum;
    }, 0);
  }) || [];
  
  const totalVotes = voteData.reduce((a, b) => a + b, 0);

  // Voting restriction: close 15s before end (use musicProgress for accuracy)
  const isVotingClosed = musicProgress.duration > 0 
    ? (musicProgress.currentTime > (musicProgress.duration - 15)) 
    : false;

  return (
    <SidebarTemplate
      title="Âm nhạc học tập"
      icon={Music}
      onClose={onClose}
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Current Playing */}
        <div className="bg-line rounded-2xl p-4 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <Music size={48} />
          </div>
          
          <p className="text-[10px] text-accent font-bold uppercase tracking-wider mb-1">Đang phát</p>
          <h3 className="text-sm font-bold text-white truncate pr-8">
            {musicState.currentTrack || "Chưa có nhạc"}
          </h3>
          
          <div className="mt-4 flex items-center gap-4">
            {isHost && (
              <button 
                onClick={handleTogglePlay}
                className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-ink hover:bg-accent transition-colors shrink-0"
              >
                {musicState.isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
              </button>
            )}
            
            <div className="flex-1 space-y-2">
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                  <span>{formatTime(musicProgress.currentTime)}</span>
                  <span>{formatTime(musicProgress.duration)}</span>
                </div>
              </div>

              {/* Volume Bar */}
              <div className="flex items-center gap-2">
                <Volume2 size={12} className="text-gray-400" />
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                />
              </div>
            </div>

            {isHost && (
              <button 
                onClick={handleSkip}
                className="text-gray-400 hover:text-white transition-colors shrink-0"
                title="Bỏ qua"
              >
                <SkipForward size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Voting Section */}
        {musicState.poll && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <BarChart3 size={14} className="text-green-400" />
                Vote bài tiếp theo
              </h4>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500">{totalVotes} điểm vote</span>
                {isVotingClosed && (
                  <span className="text-[9px] text-orange-400 font-bold">Đã đóng vote</span>
                )}
              </div>
            </div>

            <div className={`grid gap-2 ${isVotingClosed ? 'opacity-60' : ''}`}>
              {musicState.poll.options.map((option, idx) => {
                const count = voteData[idx];
                const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const isMyVote = musicState.poll?.votes[socket.id as string] === idx;
                
                return (
                  <button
                    key={idx}
                    onClick={() => !isVotingClosed && handleVote(idx)}
                    disabled={isVotingClosed}
                    className={`group relative w-full p-3 rounded-xl bg-line border transition-all overflow-hidden text-left ${
                      isVotingClosed 
                        ? 'border-line cursor-not-allowed' 
                        : isMyVote
                          ? 'border-accent shadow-lg shadow-accent/10'
                          : 'border-line hover:border-accent/50 active:scale-[0.98]'
                    }`}
                  >
                    {/* Progress Bar Background */}
                    <div 
                      className={`absolute left-0 top-0 bottom-0 transition-all duration-500 ${
                        isMyVote ? 'bg-accent/20' : 'bg-accent/10'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                    
                    <div className="relative flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2 pr-4 truncate">
                        {isMyVote && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 shadow-sm shadow-accent" />}
                        <span className={`truncate ${isMyVote ? 'text-accent font-bold' : 'text-white font-medium'}`}>
                          {option.replace(".mp3", "")}
                        </span>
                      </div>
                      <span className={`font-bold ${isMyVote ? 'text-accent' : 'text-gray-400'}`}>{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {!isVotingClosed && (
              <p className="text-[10px] text-gray-500 text-center italic">
                Bạn có thể thay đổi lựa chọn của mình bất kỳ lúc nào
              </p>
            )}
          </div>
        )}

        {!musicState.currentTrack && (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-line rounded-full flex items-center justify-center mx-auto text-gray-400">
              <Music size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Chưa có nhạc được phát</p>
              <p className="text-xs text-gray-500">Giáo viên sẽ bắt đầu buổi học với âm nhạc.</p>
            </div>

            {isHost && (
              <button 
                onClick={handleTogglePlay}
                className="mt-4 px-6 py-2 bg-accent text-accent-ink rounded-full text-sm font-bold hover:brightness-110 transition-all shadow-lg shadow-accent/20"
              >
                Bắt đầu ngay
              </button>
            )}
          </div>
        )}
      </div>
    </SidebarTemplate>
  );
};

export default MusicPoll;
