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
    NOT_CONNECTED: 'NOT_CONNECTED',
    IN_LOBBY_WAITING: 'IN_LOBBY_WAITING',
    IN_LOBBY_FULL: 'IN_LOBBY_FULL',
    GAME_STARTED_WAITING_PLAYERS: 'GAME_STARTED_WAITING_PLAYERS',
    IN_GAME: 'IN_GAME',
    IN_GAME_MISSING_PLAYERS: 'IN_GAME_MISSING_PLAYERS',
    // client.js !
};
// 1-20 chars, same as client regex but with length check
const USER_INPUT_REGEX = /^[a-zA-Z0-9\s\-_À-ÿ]{1,20}$/;

// Sockets handle
const SOCKETS = {};

// Server rooms
const ROOMS = {};

const SERVER = {
    roomCount: 0,
    isDebugEnabled: false
};

// Start server and expose main page
app.get('/', (req, res) => {
    console.log('req.query', req.query);
    // Check req hidden query params submitted
    const room = ROOMS[req.query.formRoomId];
    // If the room exists and the user is valid
    if (room && Utils.findUserByIdAndToken(room.users, req.query.formUserId, req.query.formToken)) {
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

function logDebug(...message) {
  if (console && SERVER.isDebugEnabled) {
    console.log.apply(console, message);
  }
}

// #1 First socket.io native event from client.js
io.on('connection', (Socket) => {
    logDebug('Player has just connected. Socket.id=', Socket.id);
    // Display debug
    Socket.emit('debug-changed', {
        isDebugEnabled: SERVER.isDebugEnabled
    });  

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
            const owner = Utils.findUserByIdAndToken(room.users, data.ownerId, data.token);
            if (owner) {
              logDebug('newUsersOrder', data.newUsersOrder);

              room.users.sort((u1, u2) => {
                return data.newUsersOrder.findIndex(u => u === u1.id) - data.newUsersOrder.findIndex(u => u === u2.id);
              });

              emitPlayerListChangedEvent(room);
            } else {
              Socket.emit('lobby-error', { type: 'wrong-owner' });
            }
        }
    });

    // A player has joined a lobby instance waiting other players
    Socket.on('join-lobby', (lobbyData) => {
        // Check room name
        if (!lobbyData.roomId || !USER_INPUT_REGEX.test(lobbyData.roomId)) {
            Socket.emit('lobby-error', { type: 'wrong-room-name' });
            return;
        }
        // Server-side validation for username
        if (!lobbyData.userId || !USER_INPUT_REGEX.test(lobbyData.userId)) {
            Socket.emit('lobby-error', { type: 'invalid-username' });
            return;
        }

        // Save socket and room ids
        SOCKETS[Socket.id] = {
            userId: lobbyData.userId,
            roomId: lobbyData.roomId,
            token: lobbyData.token
        };
        logDebug('Handling a join lobby request', Socket.id, lobbyData);

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
                    missingPlayers: 0
                };

                ROOMS[lobbyData.roomId] = newRoom;
                Game.initializeRoomGameData(newRoom, SERVER);

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
                    if (!Utils.findElementById(room.users, lobbyData.userId)) {
                        const newUser = {
                            id: lobbyData.userId,
                            token: lobbyData.token,
                            isConnected: true
                        };

                        room.users.push(newUser);
                        Socket.join(lobbyData.roomId);
                        if (room.users.length === MAX_PLAYERS) {
                            room.status = STATUS.IN_LOBBY_FULL;
                        }

                        // Notify the new player with its own info
                        logDebug('New user', newUser.id, 'joined the lobby');
                        Socket.emit('user-connected', {
                          id: newUser.id,
                          token: newUser.token,
                          roomId: lobbyData.roomId,
                        });

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
        logDebug('Game started for room', lobbyData.roomId);

        const room = ROOMS[lobbyData.roomId];
        if (room) {
            const owner = Utils.findUserByIdAndToken(room.users, lobbyData.ownerId, lobbyData.token);
            if (owner) {
              room.status = STATUS.GAME_STARTED_WAITING_PLAYERS;
              io.to(lobbyData.roomId).emit('game-started');
              io.sockets.emit('rooms-status-changed', {
                roomsList: getRoomList()
              });
            } else {
              Socket.emit('lobby-error', { type: 'wrong-owner' });
            }
        }
    });

    // Handle when a player joins the gaming page
    Socket.on('join-game', (data) => {
        const room = ROOMS[data.roomId];
        if (room) {
            logDebug('join-game', data, 'room status', room.status);
            // Join the room again
            Socket.join(room.id);

            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {
                player.isConnected = true;

                if (room.status === STATUS.GAME_STARTED_WAITING_PLAYERS) {              
                    // Notifies players
                    const readyPlayersAmout = room.users.filter(user => user.isConnected).length;
                    const totalPlayers = room.users.length;
    
                    // TODO : handle refresh after YO HO HO !!!
                    if (readyPlayersAmout < totalPlayers) {
                        logDebug('user', player.id, 'joined the room', room.id, 'in status', room.status, 
                            'with', readyPlayersAmout,'/', totalPlayers, 'players');
                        io.to(room.id).emit('ready-players-amount', {
                            readyPlayersAmout,
                            totalPlayers
                        });
                    } else {
                        logDebug('Last player', player.id, 'joined. Game can start !');
                        room.status = STATUS.IN_GAME;
                        Game.initializeGame(room, [...CARDS]);
                        io.to(room.id).emit('all-players-ready-to-play', {
                            currentPlayerId: room.currentPlayerId,
                            playersIds: room.users.map(user => {
                                return user.id;
                            })
                        });
                    }
                } else if (room.status === STATUS.IN_GAME_MISSING_PLAYERS) {
                    room.missingPlayers--;
                    logDebug(player.id, 'joined the room', room.id, 'again ! Missing players=', room.missingPlayers);
                    if (room.missingPlayers === 0) {
                        room.status = STATUS.IN_GAME;
                    }

                    // Display the current missing players
                    io.to(room.id).emit('in-game-player-connected', {
                        playerId: player.id,
                        status: room.status,
                        missingPlayers: room.missingPlayers
                    });

                    Game.refreshConnectedPlayerRoomState(Socket, room, player);
                }

                // Link the events of the Game itself
                Game.setEventListeners(io, Socket, room);

                // Display debug
                Socket.emit('debug-changed', {
                    isDebugEnabled: SERVER.isDebugEnabled
                });  

                refreshAllRoomsStatus();

            } else {
                console.error('[join-game] Unknown user', data.userId);
                Socket.emit('join-game-error');
            }
        } else {
            console.error('[join-game] Unknown room', data.roomId);
            Socket.emit('join-game-error');
        }
    });

    // Handle player leaving the client-game page, sending a disconnect event before unload
    Socket.on('player-disconnect', (data) => {
        if (data) {
            logDebug('player-disconnect event from beforeunload', data);
            handleDisconnect(data, Socket);
        }
    });

    // Handle socket disconnection event
    Socket.on('disconnect', () => {
        const data = SOCKETS[Socket.id];
        if (data) {
            logDebug('player has just disconnected from socket', Socket.id, data);
            handleDisconnect(data, Socket);
        }
    });

    // Handle debug button event
    Socket.on('debug-toggle', () => {
        SERVER.isDebugEnabled = !SERVER.isDebugEnabled;
        io.emit('debug-changed', {
            isDebugEnabled: SERVER.isDebugEnabled
        });
    });
});

function refreshAllRoomsStatus() {
    io.sockets.emit('rooms-status-changed', {
        roomsList: getRoomList()
    });
}

function handleDisconnect(data, Socket) {
    if (data) {
        delete SOCKETS[Socket.id];
        const room = ROOMS[data.roomId];
        if (room) {
            logDebug('handleDisconnect, room status=', room.status);

            // Search player index
            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {
                switch(room.status) {
                    case STATUS.GAME_STARTED_WAITING_PLAYERS:
                        logDebug('player leave the lobby to go to the game page');
                        player.isConnected = false;
                    break;

                    case STATUS.IN_LOBBY_WAITING:
                    case STATUS.IN_LOBBY_FULL:
                        logDebug('[player-quit]', data.userId, 'left the room', data.roomId);
                    
                        // Remove player from room
                        const index = Utils.findIndexById(room.users, data.userId);
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
                        break;
                        
                    case STATUS.IN_GAME:
                    case STATUS.IN_GAME_MISSING_PLAYERS:
                        player.isConnected = false;
                        room.status = STATUS.IN_GAME_MISSING_PLAYERS;
                        room.missingPlayers++;
                        logDebug(player.id, 'left during the game in', room.id, 'with status', room.status, 'with', room.missingPlayers, 'missing players');
                        if (room.missingPlayers < room.users.length) {
                            io.to(data.roomId).emit('player-left-the-room', {
                                playerId: player.id,
                                status: room.status,
                                missingPlayers: room.missingPlayers
                            });
                        } else {
                            // No more players, remove the room
                            logDebug(player.id, 'was the last player of', room.id, 'so it has been closed');
                            delete ROOMS[data.roomId];
                        }
                        break;

                    default:
                        log-debug('Player', player.id, 'left the room', room.id,' with status', room.status, 'but nothing handled here !');
                }
                refreshAllRoomsStatus();
            } else {
                logDebug('[player-quit] user not found in room', data);
            }
        }
    }
}

// Server start
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on http://localhost:' + port);
});