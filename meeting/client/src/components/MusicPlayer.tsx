import React, { useEffect, useRef, useState } from "react";
import { useMeetingStore } from "../store/useMeetingStore";
import { useSFUParticipants } from "../hooks/useSFUParticipants";
import { socket } from "../services/socket";
import { originUrl } from "../services/apiBase";

const MusicPlayer: React.FC = () => {
  const { 
    musicState, setMusicState, roomId, isHost, musicVolume, 
    setMusicProgress, hostId, isMicEnabled 
  } = useMeetingStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const participants = useSFUParticipants();
  const [duckingMultiplier, setDuckingMultiplier] = useState(1);

  // Ducking logic
  const hostParticipant = participants.find(p => p.identity === hostId);
  const isHostMicOn = isHost ? isMicEnabled : (hostParticipant?.isMicrophoneEnabled || false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setMusicProgress({
        currentTime: audio.currentTime,
        duration: audio.duration || 0
      });
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateProgress);
    };
  }, [setMusicProgress]);

  // Handle Ducking Multiplier (Smooth transition whenever Host Mic is ON/OFF)
  useEffect(() => {
    const target = isHostMicOn ? 0.1 : 1.0;
    
    // Log để kiểm tra (F12)
    if (hostId) {
      console.log(`[MusicDuck] HostID: ${hostId}, MicOn: ${isHostMicOn}, TargetVol: ${target}`);
    }

    let animationFrame: number;
    const startValue = duckingMultiplier;
    const startTime = performance.now();
    const duration = 2000; 

    const fade = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = startValue + (target - startValue) * progress;
      
      setDuckingMultiplier(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(fade);
      }
    };

    animationFrame = requestAnimationFrame(fade);
    return () => cancelAnimationFrame(animationFrame);
  }, [isHostMicOn, hostId]);

  // Sync Actual Audio Volume (Instant response for slider, applied with ducking)
  useEffect(() => {
    if (audioRef.current) {
      // Clamp volume between 0 and 1 to avoid IndexSizeError
      const finalVolume = musicVolume * duckingMultiplier;
      audioRef.current.volume = Math.max(0, Math.min(1, finalVolume));
    }
  }, [musicVolume, duckingMultiplier]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Listen for music sync events (handler có tên để off() không gỡ listener chỗ khác)
    const handleSync = (state: any) => setMusicState(state);
    const handlePoll = ({ votes }: { votes: any }) => {
      setMusicState({
        poll: useMeetingStore.getState().musicState.poll
          ? { ...useMeetingStore.getState().musicState.poll!, votes }
          : null
      });
    };
    socket.on("music:sync", handleSync);
    socket.on("music:poll-update", handlePoll);

    // Initial sync request
    socket.emit("music:request-sync", { roomId });

    return () => {
      socket.off("music:sync", handleSync);
      socket.off("music:poll-update", handlePoll);
    };
  }, [roomId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicState.currentTrack) return;

    // Không nối `?t=startTime` để Pause/Resume không tải lại file MP3 từ đầu
    const trackUrl = originUrl(`/music/${encodeURIComponent(musicState.currentTrack)}`);

    if (audio.src !== trackUrl) {
      audio.src = trackUrl;
      audio.load();
    }

    if (musicState.isPlaying) {
      const elapsed = Math.max(0, (Date.now() - musicState.startTime) / 1000);
      if (Math.abs(audio.currentTime - elapsed) > 2) {
        if (musicState.duration && elapsed >= musicState.duration) {
          return;
        }
        audio.currentTime = elapsed;
      }
      audio.play().catch(err => {
        console.warn("Autoplay blocked or audio error:", err);
      });
    } else {
      audio.pause();
      if (musicState.pausedAt && musicState.startTime) {
        const pausedElapsed = Math.max(0, (musicState.pausedAt - musicState.startTime) / 1000);
        if (Math.abs(audio.currentTime - pausedElapsed) > 1.5 && (!musicState.duration || pausedElapsed < musicState.duration)) {
          audio.currentTime = pausedElapsed;
        }
      }
    }
  }, [musicState.currentTrack, musicState.isPlaying, musicState.startTime, musicState.pausedAt, musicState.duration]);

  const handleEnded = () => {
    if (isHost) {
      // Host triggers the next track when current one ends
      socket.emit("music:next-track", { roomId });
    }
  };

  return <audio ref={audioRef} onEnded={handleEnded} crossOrigin="anonymous" />;
};

export default MusicPlayer;
