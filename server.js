const express = require("express");
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

// Load scripts
const Utils = require('./server/utils.js');
const Game = require('./server/game.js');

// Load data
const CARDS = require('./server/cards.json');
const PACKAGE = require('./package.json');

// Consts
const SERVER_PORT = 8181;
const MAX_ROOMS = 10;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;
const STATUS = {
    IN_LOBBY_WAITING: 1,
    IN_LOBBY_FULL: 2
};

// Start server and expose main page
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '.') + '/static/main.html');
});
app.use(express.static(path.resolve(__dirname, '.')));

// Sockets handle
const SOCKETS = {};

// Server rooms
const ROOMS = {};
let roomsCount = 0;

// #1 First socket.io native event from client.js
io.on('connection', (Socket) => {
    console.log('New player on the main page. Socket.id=', Socket.id);

     // Prepare the rooms list result
     const roomsList = [];
     for (const [id, room] of Object.entries(ROOMS)) {
         roomsList.push({
             id: id,
             status: room.status,
             usersCount: room.users.length,
             usersNames: room.users.map(u => u.id).join(', ')
         });
     }

     // Handle a player just being connected
     Socket.emit('connected', {
        roomId: Utils.randomRoomId(), // suggested room id to initialize the connection form
        roomsList: roomsList
    });

    // Handle when player asks a room id
    Socket.on('get-random-room-id', () => {
        // #2 Send first response to client : random room id
        Socket.emit('random-room-id', Utils.randomRoomId());
    });

    // A player has started a lobby instance waiting other players
    Socket.on('start-lobby', (lobbyData) => {
        console.log('Handling a start lobby request', Socket.id, lobbyData);

        // Save socket and room ids
        SOCKETS[Socket.id] = {
            userId: lobbyData.userId,
            roomId: lobbyData.roomId
        };

        // For a new room, create its new instance
        if (!ROOMS[lobbyData.roomId]) {
            // Check the max rooms value
            if (Object.keys(ROOMS).length < MAX_ROOMS) {

                const newRoom = {
                    id: lobbyData.roomId,
                    status: STATUS.IN_LOBBY_WAITING,
                    owner: lobbyData.userId,
                    password: lobbyData.password,
                    users: [],
                };

                ROOMS[lobbyData.roomId] = newRoom;
                Game.initializeRoomGameData(newRoom);

            } else {
                Socket.emit('player-error', { type: 'maximum-rooms-count', data: MAX_ROOMS });
                return;
            }
        }

        // Add the new player in the room
        const room = ROOMS[lobbyData.roomId];
        if (room.status === STATUS.IN_LOBBY_WAITING) {
            if (room.users.length < MAX_PLAYERS) {
                if (!room.password || lobbyData.password === room.password) {
                    if (!room.users.some(u => u.id === lobbyData.userId)) {

                        const newUser = {
                            id: lobbyData.userId
                        };
                        room.users.push(newUser);
                        Socket.join(lobbyData.roomId);
                        if (room.users.length === MAX_PLAYERS) {
                            room.status = STATUS.IN_LOBBY_FULL;
                        } 
                        io.to(lobbyData.roomId).emit('players-list-changed', room); // TODO SIMPLIFIED LIST !

                    } else {
                        socket.emit('player-error', { type: 'player-already-exists', data: lobbyData.userId });
                    }
                } else {
                    socket.emit('player-error', { type: 'password-error', data: lobbyData.roomId });
                }
            } else {
                Socket.emit('player-error', { type: 'full-lobby', data: lobbyData.roomId });
            }

        } else {
            Socket.emit('player-error', { type: 'already-in-game' });
        }
    });
});

// Server start
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on http://localhost:' + port);
});