import { Server, Socket } from 'socket.io';
import { registerRoomHandlers } from './room.socket.js';
import { registerCodeHandlers } from './code.socket.js';
import { registerQuizHandlers } from './quiz.socket.js';
import { registerExamHandlers } from './exam.socket.js';
import { registerAssignmentHandlers } from './assignment.socket.js';
import { registerBreakoutHandlers } from './breakout.socket.js';
import { registerMusicHandlers } from './music.socket.js';

export { mintSfuToken } from './shared.js';

export const registerMeetingHandlers = (io: Server, socket: Socket) => {
  registerRoomHandlers(io, socket);
  registerCodeHandlers(io, socket);
  registerQuizHandlers(io, socket);
  registerExamHandlers(io, socket);
  registerAssignmentHandlers(io, socket);
  registerBreakoutHandlers(io, socket);
  registerMusicHandlers(io, socket);
};
