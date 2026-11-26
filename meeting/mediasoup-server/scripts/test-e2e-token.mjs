import { io } from 'socket.io-client';
const BASE='https://codeclass.vnotemate.com';
const SFU=BASE+'/sfu';
const r=await fetch(BASE+'/meet/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'TokTest2',hostName:'Host2',password:''})});
const {id}=await r.json();
const s=io(BASE,{path:'/meet/socket.io',transports:['websocket']});
await new Promise((res,rej)=>{s.on('connect',res);s.on('connect_error',rej);});
const resp=await s.emitWithAck('room:join',{roomId:id,name:'Host2',password:''});
const token=resp.sfuToken, cid=s.id;
console.log('app join ok, cid:',cid,'token len:',token.length);
// SFU join qua proxy
const {origin}=new URL(SFU);
const sf=io(origin,{path:'/sfu/socket.io',transports:['websocket']});
await new Promise((res,rej)=>{sf.on('connect',res);sf.on('connect_error',rej);});
const jr=await sf.emitWithAck('mediasoup:join',{roomId:id,peerName:'Host2',clientPeerId:cid,token});
console.log('SFU join result:', JSON.stringify(jr).slice(0,120));
sf.disconnect(); s.disconnect();
