'use strict';

// Curvytron-compatible room system built on Socket.io
// Replicates the same room events as Curvytron77

const rooms = {};
let roomCounter = 0;

function generateRoomId() {
    return 'room_' + (++roomCounter) + '_' + Date.now();
}

function serializeRoom(room) {
    return {
        id: room.id,
        name: room.name,
        open: room.open,
        players: Object.values(room.players).map(p => serializePlayer(p)),
        master: room.master,
        game: room.game
    };
}

function serializePlayer(player) {
    return {
        id: player.id,
        name: player.name,
        color: player.color,
        ready: player.ready,
        paid: player.paid,
        master: player.master
    };
}

function setupRoomEvents(io) {
    io.on('connection', socket => {
        let currentRoom = null;
        let playerData = null;

        // Create room
        socket.on('room:create', (data) => {
            const roomId = generateRoomId();
            const room = {
                id: roomId,
                name: data.name || 'Room ' + roomCounter,
                open: data.open !== false,
                password: data.password || null,
                master: socket.id,
                players: {},
                messages: [],
                game: null,
                started: false
            };
            rooms[roomId] = room;

            playerData = {
                id: socket.id,
                name: data.player?.name || 'Player',
                color: data.player?.color || '#ffffff',
                ready: false,
                paid: false,
                master: true
            };
            room.players[socket.id] = playerData;
            currentRoom = room;

            socket.join(roomId);
            socket.emit('room:join', { room: serializeRoom(room), player: serializePlayer(playerData) });
            io.emit('room:open', { room: { id: roomId, name: room.name, open: room.open, players: Object.keys(room.players).length } });
        });

        // Join room
        socket.on('room:join', (data) => {
            const room = rooms[data.room];
            if (!room) return socket.emit('room:error', { message: 'Room not found' });
            if (room.started) return socket.emit('room:error', { message: 'Game already started' });
            if (!room.open && room.password !== data.password) return socket.emit('room:error', { message: 'Wrong password' });
            if (Object.keys(room.players).length >= 8) return socket.emit('room:error', { message: 'Room is full' });

            playerData = {
                id: socket.id,
                name: data.player?.name || 'Player',
                color: data.player?.color || '#ff4444',
                ready: false,
                paid: false,
                master: false
            };
            room.players[socket.id] = playerData;
            currentRoom = room;

            socket.join(room.id);
            socket.emit('room:join', { room: serializeRoom(room), player: serializePlayer(playerData) });
            io.to(room.id).emit('room:player:join', { player: serializePlayer(playerData) });
            io.emit('room:update', { id: room.id, players: Object.keys(room.players).length });
        });

        // Get room list
        socket.on('room:list', () => {
            const list = Object.values(rooms)
                .filter(r => r.open && !r.started)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    players: Object.keys(r.players).length,
                    open: r.open
                }));
            socket.emit('room:list', { rooms: list });
        });

        // Chat
        socket.on('room:talk', (data) => {
            if (!currentRoom) return;
            const msg = {
                player: playerData ? playerData.name : 'Unknown',
                content: data.content || data.message || '',
                time: Date.now()
            };
            currentRoom.messages.push(msg);
            io.to(currentRoom.id).emit('room:talk', msg);
        });

        // Ready — called after payment confirmed
        socket.on('room:ready', () => {
            if (!currentRoom || !playerData) return;
            playerData.ready = true;
            playerData.paid = true;
            currentRoom.players[socket.id] = playerData;
            io.to(currentRoom.id).emit('room:player:ready', { player: serializePlayer(playerData) });
            io.to(currentRoom.id).emit('room:state', serializeRoom(currentRoom));
        });

        // Launch — host starts game
        socket.on('room:launch', (data) => {
            const isDev = data && data.dev === true;
            if (!currentRoom) return;
            if (!isDev && currentRoom.master !== socket.id) return;
            const readyPlayers = Object.values(currentRoom.players).filter(p => p.ready);
            if (!isDev && readyPlayers.length < 1) {
                return socket.emit('room:error', { message: 'Need at least 1 ready player' });
            }
            currentRoom.started = true;
            io.to(currentRoom.id).emit('room:launch:start');
            setTimeout(() => {
                io.to(currentRoom.id).emit('room:game:start', {
                    roomId: currentRoom.id,
                    players: Object.values(currentRoom.players).map(p => serializePlayer(p))
                });
            }, 3000);
        });

        // Leave room
        socket.on('room:leave', () => {
            if (currentRoom) leaveRoom();
        });

        // Disconnect
        socket.on('disconnect', () => {
            if (currentRoom) leaveRoom();
        });

        function leaveRoom() {
            if (!currentRoom) return;
            const room = currentRoom;
            delete room.players[socket.id];
            socket.leave(room.id);
            io.to(room.id).emit('room:player:leave', { player: socket.id });

            if (Object.keys(room.players).length === 0) {
                delete rooms[room.id];
                io.emit('room:close', { id: room.id });
            } else if (room.master === socket.id) {
                room.master = Object.keys(room.players)[0];
                room.players[room.master].master = true;
                io.to(room.id).emit('room:master', { master: room.master });
            }
            io.to(room.id).emit('room:state', serializeRoom(room));
            io.emit('room:update', { id: room.id, players: Object.keys(room.players).length });
            currentRoom = null;
            playerData = null;
        }
    });
}

module.exports = { setupRoomEvents, rooms };
