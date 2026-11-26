import { io } from 'socket.io-client';
const BASE='https://codeclass.vnotemate.com';
// tạo phòng qua REST
const r=await fetch(BASE+'/meet/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'TokTest',hostName:'Host1',password:''})});
const {id}=await r.json();
console.log('room:',id);
const s=io(BASE,{path:'/meet/socket.io',transports:['websocket']});
await new Promise((res,rej)=>{s.on('connect',res);s.on('connect_error',rej);});
const resp=await s.emitWithAck('room:join',{roomId:id,name:'Host1',password:''});
console.log('join.ok:',resp.ok,'host:',resp.host);
console.log('sfuToken present:', !!resp.sfuToken, 'len:', (resp.sfuToken||'').length);
console.log('sfuToken head:', (resp.sfuToken||'').slice(0,40));
s.disconnect();
