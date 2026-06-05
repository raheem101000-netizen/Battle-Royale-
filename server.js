'use strict';
process.chdir(__dirname);
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server: IOServer } = require('socket.io');
const puz = require('./puz-server');

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { transports: ['polling'] });

const homePath = path.join(__dirname, 'web/home.html');
console.log('home.html exists:', fs.existsSync(homePath), homePath);

app.get('/', (req, res) => {
    console.log('GET /');
    res.sendFile(homePath);
});
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'web/index.html')));
app.get('/puz', (req, res) => res.sendFile(path.join(__dirname, 'web/index.html')));
app.use(express.static(path.join(__dirname, 'web')));

io.on('connection', (socket) => {
    socket.on('puz:join', ({roomId, name, color}) => {
        let room = puz.puzRooms[roomId];
        if(!room) room = puz.createPuzRoom(roomId);
        socket.join(roomId);
        puz.addHumanPlayer(room, socket.id, name, color);
        const humans = Object.values(room.players).filter(p=>!p.isBot);
        const hostId = humans[0].id;
        io.to(roomId).emit('puz:lobby', {players:humans.map(p=>({id:p.id,name:p.name,color:p.color})), hostId});
    });
    socket.on('puz:start', ({roomId}) => {
        const room = puz.puzRooms[roomId];
        if(!room || room.active) return;
        const humans = Object.values(room.players).filter(p=>!p.isBot).length;
        const botsNeeded = Math.max(0, 8-humans);
        for(let i=0;i<botsNeeded;i++) puz.addBot(room,i);
        puz.startPuzRoom(room, io);
        io.to(roomId).emit('puz:started', {walls:room.walls});
    });
    socket.on('puz:input', ({roomId, input}) => {
        const room = puz.puzRooms[roomId];
        if(!room || !room.players[socket.id]) return;
        room.players[socket.id].input = input;
    });
    socket.on('puz:reload', ({roomId}) => {
        const room = puz.puzRooms[roomId];
        if(!room || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        if(!p.reloading && p.ammo < p.maxAmmo){p.reloading=true;p.reloadTimer=90;}
    });
    socket.on('puz:position', (data) => {
        socket.to(data.roomId).emit('puz:position', data);
    });
    socket.on('disconnect', () => {
        Object.values(puz.puzRooms).forEach(room => {
            if(room.players[socket.id]) {
                room.players[socket.id].alive = false;
                room.aliveCount--;
                delete room.players[socket.id];
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Puz Royale listening on port ' + PORT));
