import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from 'music-metadata';
import { roomManager } from '../room.manager.js';
import { advancingMusicRooms, isActiveMember, musicTimers } from './shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const musicDir = path.join(__dirname, '../../public/music');
const playCountFile = path.join(__dirname, '../../data/playCount.json');

const getPlaylist = (): string[] => {
  try {
    if (!fs.existsSync(musicDir)) return [];
    return fs.readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith('.mp3'));
  } catch (e) {
    console.error('❌ [getPlaylist] Error reading music directory:', e);
    return [];
  }
};

const loadPlayCounts = (): { [track: string]: number } => {
  try {
    if (fs.existsSync(playCountFile)) {
      return JSON.parse(fs.readFileSync(playCountFile, 'utf-8'));
    }
  } catch (e) {
    console.error('❌ [loadPlayCounts] Error:', e);
  }
  return {};
};

const savePlayCounts = (counts: { [track: string]: number }) => {
  try {
    const dir = path.dirname(playCountFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(playCountFile, JSON.stringify(counts, null, 2));
  } catch (e) {
    console.error('❌ [savePlayCounts] Error:', e);
  }
};

const incrementPlayCount = (track: string) => {
  const counts = loadPlayCounts();
  counts[track] = (counts[track] || 0) + 1;

  const currentPlaylist = new Set(getPlaylist());
  const prunedCounts: { [track: string]: number } = {};
  for (const [t, c] of Object.entries(counts)) {
    if (currentPlaylist.has(t)) {
      prunedCounts[t] = c;
    }
  }
  savePlayCounts(prunedCounts);
};

const getTrackDuration = async (filename: string): Promise<number> => {
  try {
    const filePath = path.join(musicDir, filename);
    const metadata = await parseFile(filePath);
    return metadata.format.duration || 0;
  } catch (e) {
    console.error(`❌ [getTrackDuration] Error for ${filename}:`, e);
    return 0;
  }
};

const generatePoll = (exclude?: string | null) => {
  const playlist = getPlaylist();
  const playCounts = loadPlayCounts();

  return playlist
    .filter((t) => t !== exclude)
    .sort((a, b) => {
      const countA = playCounts[a] || 0;
      const countB = playCounts[b] || 0;
      if (countA !== countB) return countA - countB;
      return Math.random() - 0.5;
    })
    .slice(0, 4);
};

const advanceTrack = async (io: Server, roomId: string) => {
  if (advancingMusicRooms.has(roomId)) return;
  advancingMusicRooms.add(roomId);
  try {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.musicState || !room.musicState.poll) return;

    const pollVotes = room.musicState.poll.votes;
    let winningIndex = 0;

    if (Object.keys(pollVotes).length > 0) {
      const rankedStudents = Array.from(room.participants.entries())
        .filter(([id, p]) => id !== room.hostId && (p.points || 0) > 0)
        .map(([id, p]) => ({ id, points: p.points || 0 }))
        .sort((a, b) => b.points - a.points);

      const weights: { [id: string]: number } = {};
      rankedStudents.forEach((p, idx) => {
        if (idx === 0) weights[p.id] = 3;
        else if (idx === 1) weights[p.id] = 2;
        else weights[p.id] = 1;
      });

      const weightedCounts: { [key: number]: number } = {};
      for (const [voterId, optionIdx] of Object.entries(pollVotes)) {
        const weight = weights[voterId] || 1;
        weightedCounts[optionIdx] = (weightedCounts[optionIdx] || 0) + weight;
      }

      let maxWeightedVotes = -1;
      for (const [idx, count] of Object.entries(weightedCounts)) {
        if (count > maxWeightedVotes) {
          maxWeightedVotes = count;
          winningIndex = parseInt(idx, 10);
        }
      }
    } else {
      const optionsCount = room.musicState.poll.options.length;
      winningIndex = optionsCount > 0 ? Math.floor(Math.random() * optionsCount) : 0;
    }

    const nextTrack = room.musicState.poll.options[winningIndex];
    let finalTrack: string | null = nextTrack || null;

    if (!nextTrack) {
      const playlist = getPlaylist();
      finalTrack = playlist[0] || null;
    }

    if (finalTrack) {
      incrementPlayCount(finalTrack);
      const nextDuration = await getTrackDuration(finalTrack);
      room.musicState = {
        currentTrack: finalTrack,
        isPlaying: true,
        startTime: Date.now(),
        duration: nextDuration,
        poll: {
          options: generatePoll(finalTrack),
          votes: {},
          endTime: Date.now() + (nextDuration > 0 ? (nextDuration - 15) * 1000 : 300000),
        },
      };

      io.to(roomId).emit('music:sync', room.musicState);

      if (nextDuration > 0) {
        const timer = musicTimers.get(roomId);
        if (timer) clearTimeout(timer);

        const newTimer = setTimeout(() => {
          void advanceTrack(io, roomId);
        }, (nextDuration + 2) * 1000);
        musicTimers.set(roomId, newTimer);
      }
    }
  } finally {
    advancingMusicRooms.delete(roomId);
  }
};

export const registerMusicHandlers = (io: Server, socket: Socket) => {
  socket.on('music:request-sync', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (isActiveMember(room, socket) && room?.musicState) {
      socket.emit('music:sync', room.musicState);
    }
  });

  socket.on('music:toggle', async ({ roomId, isPlaying }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;

    if (!room.musicState) {
      const playlist = getPlaylist();
      const playCounts = loadPlayCounts();
      const sortedPlaylist = [...playlist].sort((a, b) => {
        const countA = playCounts[a] || 0;
        const countB = playCounts[b] || 0;
        if (countA !== countB) return countA - countB;
        return Math.random() - 0.5;
      });
      const firstTrack = sortedPlaylist[0] || null;
      if (firstTrack) incrementPlayCount(firstTrack);
      const duration = firstTrack ? await getTrackDuration(firstTrack) : 0;
      const now = Date.now();

      room.musicState = {
        currentTrack: firstTrack,
        isPlaying: !!isPlaying,
        startTime: now,
        pausedAt: isPlaying ? undefined : now,
        duration,
        poll: firstTrack
          ? {
              options: generatePoll(firstTrack),
              votes: {},
              endTime: now + (duration > 0 ? (duration - 15) * 1000 : 300000),
            }
          : null,
      };

      if (isPlaying && duration > 0) {
        const timer = setTimeout(() => void advanceTrack(io, roomId), (duration + 2) * 1000);
        musicTimers.set(roomId, timer);
      }
    } else {
      room.musicState.isPlaying = !!isPlaying;
      if (isPlaying) {
        if (!room.musicState.currentTrack) {
          room.musicState.startTime = Date.now();
          delete room.musicState.pausedAt;
          const playlist = getPlaylist();
          if (playlist.length > 0) {
            const playCounts = loadPlayCounts();
            const sortedPlaylist = [...playlist].sort((a, b) => {
              const countA = playCounts[a] || 0;
              const countB = playCounts[b] || 0;
              if (countA !== countB) return countA - countB;
              return Math.random() - 0.5;
            });
            room.musicState.currentTrack = sortedPlaylist[0];
            incrementPlayCount(room.musicState.currentTrack);
            const duration = await getTrackDuration(room.musicState.currentTrack);
            room.musicState.duration = duration;
            room.musicState.poll = {
              options: generatePoll(room.musicState.currentTrack),
              votes: {},
              endTime: Date.now() + (duration > 0 ? (duration - 15) * 1000 : 300000),
            };
            if (duration > 0) {
              const timer = musicTimers.get(roomId);
              if (timer) clearTimeout(timer);
              musicTimers.set(roomId, setTimeout(() => void advanceTrack(io, roomId), (duration + 2) * 1000));
            }
          }
        } else {
          const now = Date.now();
          if (room.musicState.pausedAt) {
            room.musicState.startTime += now - room.musicState.pausedAt;
            delete room.musicState.pausedAt;
          }
          const duration = room.musicState.duration || 0;
          if (room.musicState.poll && duration > 0) {
            room.musicState.poll.endTime = room.musicState.startTime + (duration - 15) * 1000;
          }
          if (duration > 0) {
            const elapsedSec = Math.max(0, (now - room.musicState.startTime) / 1000);
            const remainingSec = Math.max(0, duration - elapsedSec);
            const timer = musicTimers.get(roomId);
            if (timer) clearTimeout(timer);
            musicTimers.set(
              roomId,
              setTimeout(() => void advanceTrack(io, roomId), (remainingSec + 2) * 1000),
            );
          }
        }
      } else {
        room.musicState.pausedAt = Date.now();
        const timer = musicTimers.get(roomId);
        if (timer) {
          clearTimeout(timer);
          musicTimers.delete(roomId);
        }
      }
    }
    io.to(roomId).emit('music:sync', room.musicState);
  });

  socket.on('music:vote', ({ roomId, optionIndex }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room || !room.musicState || !room.musicState.poll) return;
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= room.musicState.poll.options.length
    ) {
      return;
    }

    const now = room.musicState.isPlaying
      ? Date.now()
      : (room.musicState.pausedAt || Date.now());
    const duration = room.musicState.duration || 0;
    const startTime = room.musicState.startTime;

    if (duration > 0 && now > startTime + (duration - 15) * 1000) {
      return;
    }

    room.musicState.poll.votes[socket.id] = optionIndex;
    io.to(roomId).emit('music:poll-update', { votes: room.musicState.poll.votes });
  });

  socket.on('music:next-track', async ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!isActiveMember(room, socket) || !room || !room.musicState) return;

    const now = room.musicState.isPlaying
      ? Date.now()
      : (room.musicState.pausedAt || Date.now());
    const duration = room.musicState.duration || 0;
    const isFinished = duration > 0 && now > room.musicState.startTime + duration * 1000;

    if (socket.id !== room.hostId && !isFinished) return;

    const existingTimer = musicTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      musicTimers.delete(roomId);
    }

    await advanceTrack(io, roomId);
  });
};
