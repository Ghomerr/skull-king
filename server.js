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
    NOT_CONNECTED: 0,
    IN_LOBBY_WAITING: 1,
    IN_LOBBY_FULL: 2,
    GAME_STARTED_WAITING_PLAYERS: 3,
    IN_GAME: 4
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
    if (req.query.formRoomId && ROOMS[req.query.formRoomId] && 
            Utils.findIndexById(ROOMS[req.query.formRoomId].users, req.query.formUserId) >= 0) {
        console.log('req.query', req.query);
        res.sendFile(path.resolve(__dirname, '.') + '/static/game.html');
    } else {
        res.sendFile(path.resolve(__dirname, '.') + '/static/main.html');
    }
});
app.use(express.static(path.resolve(__dirname, '.')));

// Prepare the rooms list result
function getRoomList() {
    const roomsList = [];
    for (const [id, room] of Object.entries(ROOMS)) {
        roomsList.push({
            id: id,
            status: room.status,
            usersCount: room.users.length,
            usersNames: room.users.map(u => u.id).join(', ')
        });
    }
    return roomsList;
}

// #1 First socket.io native event from client.js
io.on('connection', (Socket) => {
    console.log('Player has just connected. Socket.id=', Socket.id);  

    // Handle a player request on the main page to receive rooms list
    Socket.on('get-rooms-list', () => {
        Socket.emit('rooms-status-changed', {
           roomsList: getRoomList()
       });
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
                Socket.emit('lobby-error', { type: 'maximum-rooms-count', data: MAX_ROOMS });
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
                            id: lobbyData.userId,
                            isConnected: true
                        };
                        room.users.push(newUser);
                        Socket.join(lobbyData.roomId);
                        if (room.users.length === MAX_PLAYERS) {
                            room.status = STATUS.IN_LOBBY_FULL;
                        } 

                        emitPlayerListChangedEvent(room);
                        io.sockets.emit('rooms-status-changed', {
                            roomsList: getRoomList()
                        });

                    } else {
                        Socket.emit('lobby-error', { type: 'user-already-exists', data: lobbyData.userId });
                    }
                } else {
                    Socket.emit('lobby-error', { type: 'password-error', data: lobbyData.roomId });
                }
            } else {
                Socket.emit('lobby-error', { type: 'full-lobby', data: lobbyData.roomId });
            }

        } else {
            Socket.emit('lobby-error', { type: 'already-in-game' });
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

        const room = ROOMS[lobbyData.roomId];
        if (room) {
            room.status = STATUS.GAME_STARTED_WAITING_PLAYERS;
            io.to(lobbyData.roomId).emit('game-started');
            io.sockets.emit('rooms-status-changed', {
                roomsList: getRoomList()
            });
        }       
    });

    // Handle when a player joins the gaming page
    Socket.on('join-game', (data) => {
        console.log('join-game', data);
        const room = ROOMS[data.roomId];
        if (room) {
            // Join the room again
            Socket.join(room.id);
            
            const playerIndex = Utils.findIndexById(room.users, data.userId);
            if (playerIndex >= 0) {

                const player = room.users[playerIndex];
                player.isConnected = true;

                // Notifies players
                const readyPlayersAmout = room.users.filter(user => user.isConnected).length;
                const totalPlayers = room.users.length;

                // TODO : handle refresh after YO HO HO !!!
                if (readyPlayersAmout < totalPlayers) {
                    console.log('user', player.id, 'joined the game', room.id, 'with', readyPlayersAmout,'/', totalPlayers, 'players');
                    io.to(room.id).emit('ready-players-amount', {
                        readyPlayersAmout,
                        totalPlayers
                    });
                } else {
                    console.log('Last player', player.id, 'joined. Game can start !');
                    room.status = STATUS.IN_GAME;
                    Game.initializeGame(room, [...CARDS]);
                    io.to(room.id).emit('all-players-ready-to-play');
                }
                Game.setEventListeners(io, Socket, room);

            } else {
                console.err('[join-game] Unknown room', data.userId);
            }
        } else {
            console.err('[join-game] Unknown user', data.roomId);
        }
    });

    Socket.on('player-disconnect', (data) => {
        console.log('player-disconnect', data);
        handleDisconnect(data, Socket);
    });

    // Handle player quit event
    Socket.on('disconnect', () => {
        const data = SOCKETS[Socket.id];
        console.log('player has just disconnected', data);
        handleDisconnect(data, Socket);
    });
});

function handleDisconnect(data, Socket) {
    if (data) {
        delete SOCKETS[Socket.id];
        const room = ROOMS[data.roomId];
        if (room) {
            // Search player index
            let index = Utils.findIndexById(room.users, data.userId);
            if (index >= 0) {
                if (room.status === STATUS.GAME_STARTED_WAITING_PLAYERS) {
                    console.log('player leave the lobby to go to the game page');
                    room.users[index].isConnected = false;
                } else {
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
                    io.sockets.emit('rooms-status-changed', {
                        roomsList: getRoomList()
                    });
                }
            } else {
                console.log('[player-quit] user not found in room', data);
            }
        }
    }
}

// Server start
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on http://localhost:' + port);
});