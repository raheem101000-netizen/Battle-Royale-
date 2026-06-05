'use strict';

const puzRooms = {};

module.exports = function registerPuzHandlers(io, socket) {
    socket.on('puz:position', (data) => {
        socket.to(data.roomId).emit('puz:position', data);
    });

    socket.on('puz:zone', (data) => {
        socket.to(data.roomId).emit('puz:zone', data);
    });

    socket.on('puz:join', ({roomId, name, color}) => {
        socket.join(roomId);
        const room = puzRooms[roomId] || {id:roomId, players:[], hostId:null};
        if(!room.hostId) room.hostId = socket.id;
        puzRooms[roomId] = room;
        room.players.push({id:socket.id, name, color});
        io.to(roomId).emit('puz:lobby', {players:room.players, hostId:room.hostId});
    });

    socket.on('puz:start', ({roomId}) => {
        io.to(roomId).emit('puz:started');
    });

    socket.on('disconnect', () => {
        Object.values(puzRooms).forEach(room => {
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(room.id).emit('puz:lobby', {players:room.players, hostId:room.hostId});
        });
    });
};
