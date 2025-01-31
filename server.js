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
    // client.js !
    IN_LOBBY_WAITING: 1,
    IN_LOBBY_FULL: 2,
    IN_GAME: 3
    // client.js !
};

// Sockets handle
const SOCKETS = {};

// Server rooms
const ROOMS = {};
let roomsCount = 0;

// Start server and expose main page
app.get('/', (req, res) => {
    // Check req hidden query params submitted
    console.log('req.query', req.query);
    if (req.query.formRoomId && ROOMS[req.query.formRoomId] && 
            Utils.findIndexById(ROOMS[req.query.formRoomId].users, req.query.formUserId) >= 0) {
        res.sendFile(path.resolve(__dirname, '.') + '/static/game.html');
    } else {
        res.sendFile(path.resolve(__dirname, '.') + '/static/main.html');
    }
});
app.use(express.static(path.resolve(__dirname, '.')));

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

    // Handle when player asks a room id
    Socket.on('change-players-order', (data) => {
        const room = ROOMS[data.roomId];
        if (room) {
            console.log('newUsersOrder', data.newUsersOrder);

            room.users.sort((u1, u2) => {
               return data.newUsersOrder.findIndex(u => u === u1.id) - data.newUsersOrder.findIndex(u => u === u2.id);
            });

            emitPlayerListChangedEvent(room);
        }
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

                        emitPlayerListChangedEvent(room);

                    } else {
                        Socket.emit('player-error', { type: 'player-already-exists', data: lobbyData.userId });
                    }
                } else {
                    Socket.emit('player-error', { type: 'password-error', data: lobbyData.roomId });
                }
            } else {
                Socket.emit('player-error', { type: 'full-lobby', data: lobbyData.roomId });
            }

        } else {
            Socket.emit('player-error', { type: 'already-in-game' });
        }
    });

    function emitPlayerListChangedEvent(room) {
        io.to(room.id).emit('players-list-changed', {
            id: room.id,
            owner: room.owner,
            password: room.password,
            users: [...room.users.map(u => {
               return { id: u.id };
            })],
            canStartGame: Game.getCanStartGame(room, MIN_PLAYERS, MAX_PLAYERS)
        });
    }

    // Handle the start game event, players will be redirected to the game page
    Socket.on('start-game', (lobbyData) => {
        console.log('Game started for room', lobbyData.roomId);
        // TODO : DON'T DISCONNECT PLAYERS !!!!
        io.to(lobbyData.roomId).emit('game-started');
    });

    // Handle player quit event
    Socket.on('disconnect', () => {
        const data = SOCKETS[Socket.id];
        if (data) {
            console.log('player-quit', data);
            delete SOCKETS[Socket.id];
            const room = ROOMS[data.roomId];
            if (room) {
                // Search player index
                let index = Utils.findIndexById(room.users, data.userId);
                if (index >= 0) {
                    console.log('[player-quit]', data.userId, 'left the room', data.roomId);
                    // Remove player from room
                    room.users.splice(index, 1);
                    if (room.users.length === 0) {
                        // Delete empty room
                        delete ROOMS[data.roomId];
                    } else {
                        // Update players list
                        io.to(data.roomId).emit('players-list-changed', room);
                        if (room.status === STATUS.IN_LOBBY_FULL && room.users.length < MAX_PLAYERS) {
                            room.status = STATUS.IN_LOBBY_WAITING;
                        }
                        // Other status ??
                    }
                } else {
                    console.log('[player-quit] user not found in room', data);
                }
            }
        }
    });
});

// Server start
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on http://localhost:' + port);
});