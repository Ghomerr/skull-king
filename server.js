const express = require("express");
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

// Load scripts
const Utils = require('./server/utils.js');
const Game = require('./server/game.js');
const LobbyRobots = require('./server/lobby-robots.js');
const Analytics = require('./server/analytics.js');

// Load data
const CARDS = require('./server/cards.json');
const PACKAGE = require('./package.json');

// Consts
const SERVER_PORT = 8181;
const MAX_ROOMS = 10;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;
// How long a game waits for its missing players (or for all players to reach the game page)
// before being closed for good. Overridable via env for testing.
const PAUSE_TIMEOUT_MS = parseInt(process.env.PAUSE_TIMEOUT_MS, 10) || 5 * 60 * 1000;
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
// Browser-side analytics (cookieless). Empty outside of Render, unless POSTHOG_KEY is set.
app.get('/analytics.js', (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'no-cache');
    res.send(Analytics.clientScript());
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

function emitPlayerListChangedEvent(room) {
    io.to(room.id).emit('players-list-changed', {
        id: room.id,
        owner: room.owner,
        password: room.password,
        users: [...room.users.map(u => {
            return { id: u.id, isRobot: u.isRobot, robotType: u.robotType };
        })],
        canStartGame: Game.getCanStartGame(room, MIN_PLAYERS, MAX_PLAYERS)
    });
}

// --- Pause / reconnection / room lifecycle ---

// Robots never leave: only human players can be missing
function countMissing(room) {
    return room.users.filter(u => !u.isRobot && !u.isConnected).length;
}

function getMissingNames(room) {
    return room.users.filter(u => !u.isRobot && !u.isConnected).map(u => u.id);
}

function startPauseTimer(room) {
    if (!room.pauseTimeout) {
        room.pauseTimeout = setTimeout(() => endGameByTimeout(room.id), PAUSE_TIMEOUT_MS);
    }
}

function clearPauseTimer(room) {
    if (room.pauseTimeout) {
        clearTimeout(room.pauseTimeout);
        room.pauseTimeout = null;
    }
}

function destroyRoom(roomId) {
    const room = ROOMS[roomId];
    if (room) {
        clearPauseTimer(room);
        Game.disposeRoom(room);
        delete ROOMS[roomId];
        refreshAllRoomsStatus();
    }
}

// The missing players did not come back in time: the game is closed for good
function endGameByTimeout(roomId) {
    const room = ROOMS[roomId];
    if (room) {
        logDebug('Room', roomId, 'closed after', PAUSE_TIMEOUT_MS, 'ms without its missing players');
        if (!Game.isGameOver(room)) {
            Analytics.gameAborted(room, 'joueurs_partis');
            io.to(roomId).emit('game-aborted', { reason: 'timeout' });
        }
        destroyRoom(roomId);
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

    // Run the callback only for the room owner, in the lobby
    function requireLobbyOwner(data, callback) {
        const room = data ? ROOMS[data.roomId] : null;
        if (room && (room.status === STATUS.IN_LOBBY_WAITING || room.status === STATUS.IN_LOBBY_FULL)) {
            const owner = Utils.findUserByIdAndToken(room.users, data.ownerId, data.token);
            if (owner && room.owner === owner.id) {
                callback(room);
            } else {
                Socket.emit('lobby-error', { type: 'wrong-owner' });
            }
        }
    }

    // Handle when player asks a room id
    Socket.on('change-players-order', (data) => {
        requireLobbyOwner(data, (room) => {
            logDebug('newUsersOrder', data.newUsersOrder);

            room.users.sort((u1, u2) => {
                return data.newUsersOrder.findIndex(u => u === u1.id) - data.newUsersOrder.findIndex(u => u === u2.id);
            });

            emitPlayerListChangedEvent(room);
        });
    });

    // Handle add robot
    Socket.on('add-robot', (data) => {
        requireLobbyOwner(data, (room) => {
            LobbyRobots.addRobot(room, data.robotType, emitPlayerListChangedEvent, getRoomList, io);
        });
    });

    // Handle remove robot
    Socket.on('remove-robot', (data) => {
        requireLobbyOwner(data, (room) => {
            LobbyRobots.removeRobot(room, data.robotId, emitPlayerListChangedEvent, getRoomList, io);
        });
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

        // Same player coming back after a connection loss: keep its place in the lobby
        const existingUser = Utils.findUserByIdAndToken(room.users, lobbyData.userId, lobbyData.token);
        if (existingUser && (room.status === STATUS.IN_LOBBY_WAITING || room.status === STATUS.IN_LOBBY_FULL)) {
            existingUser.socketId = Socket.id;
            existingUser.isConnected = true;
            Socket.join(lobbyData.roomId);
            Socket.emit('user-connected', {
                id: existingUser.id,
                token: existingUser.token,
                roomId: lobbyData.roomId,
            });
            emitPlayerListChangedEvent(room);
            return;
        }

        if (room.status === STATUS.IN_LOBBY_WAITING) {
            if (room.users.length < MAX_PLAYERS) {
                if (!room.password || lobbyData.password === room.password) {
                    if (!Utils.findElementById(room.users, lobbyData.userId)) {
                        const newUser = {
                            id: lobbyData.userId,
                            token: lobbyData.token,
                            isConnected: true,
                            socketId: Socket.id
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

    // Handle the start game event, players will be redirected to the game page
    Socket.on('start-game', (lobbyData) => {
        logDebug('Game started for room', lobbyData && lobbyData.roomId);

        requireLobbyOwner(lobbyData, (room) => {
            if (!Game.getCanStartGame(room, MIN_PLAYERS, MAX_PLAYERS)) {
                return;
            }
            room.status = STATUS.GAME_STARTED_WAITING_PLAYERS;
            io.to(room.id).emit('game-started');
            refreshAllRoomsStatus();
        });
    });

    // Link the events of the Game itself (the room is resolved at each event)
    Game.setEventListeners(io, Socket, (roomId) => ROOMS[roomId]);

    // Handle when a player joins the gaming page (first load, page refresh or reconnection)
    Socket.on('join-game', (data) => {
        const room = data ? ROOMS[data.roomId] : null;
        if (!room) {
            console.error('[join-game] Unknown room', data && data.roomId);
            Socket.emit('join-game-error');
            return;
        }
        const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
        if (!player) {
            console.error('[join-game] Unknown user', data.userId);
            Socket.emit('join-game-error');
            return;
        }
        logDebug('join-game', data, 'room status', room.status);

        // Join the room again
        Socket.join(room.id);
        // This socket is now the player's connection: the disconnection of an older one will be ignored
        SOCKETS[Socket.id] = {
            userId: player.id,
            roomId: room.id,
            token: player.token
        };
        player.socketId = Socket.id;
        player.isConnected = true;

        if (room.status === STATUS.GAME_STARTED_WAITING_PLAYERS) {
            // Notifies players
            const readyPlayersAmout = room.users.filter(user => user.isConnected).length;
            const totalPlayers = room.users.length;

            if (readyPlayersAmout < totalPlayers) {
                logDebug('user', player.id, 'joined the room', room.id, 'in status', room.status,
                    'with', readyPlayersAmout, '/', totalPlayers, 'players');
                io.to(room.id).emit('ready-players-amount', {
                    readyPlayersAmout,
                    totalPlayers
                });
            } else {
                logDebug('Last player', player.id, 'joined. Game can start !');
                clearPauseTimer(room);
                room.status = STATUS.IN_GAME;
                room.missingPlayers = 0;
                Game.initializeGame(room, [...CARDS]);
                Analytics.gameStarted(room);
                io.to(room.id).emit('all-players-ready-to-play', {
                    currentPlayerId: room.currentPlayerId,
                    playersIds: room.users.map(user => {
                        return { id: user.id, isRobot: user.isRobot };
                    })
                });
            }
        } else if (room.status === STATUS.IN_GAME || room.status === STATUS.IN_GAME_MISSING_PLAYERS) {
            const wasMissingPlayers = room.status === STATUS.IN_GAME_MISSING_PLAYERS;
            room.missingPlayers = countMissing(room);
            logDebug(player.id, 'joined the room', room.id, 'again ! Missing players=', room.missingPlayers);
            if (room.missingPlayers === 0) {
                room.status = STATUS.IN_GAME;
                clearPauseTimer(room);
            }

            // Display the current missing players
            if (wasMissingPlayers) {
                io.to(room.id).emit('in-game-player-connected', {
                    playerId: player.id,
                    status: room.status,
                    missingPlayers: room.missingPlayers,
                    missingNames: getMissingNames(room)
                });
            }

            // Rebuild the whole game display of this player
            Game.refreshConnectedPlayerRoomState(Socket, room, player);
            Game.wakeUpRobots(room);
        }

        // Display debug
        Socket.emit('debug-changed', {
            isDebugEnabled: SERVER.isDebugEnabled
        });

        refreshAllRoomsStatus();
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
    delete SOCKETS[Socket.id];
    const room = ROOMS[data.roomId];
    if (!room) {
        return;
    }
    // Search player
    const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
    if (!player) {
        logDebug('[player-quit] user not found in room', data);
        return;
    }
    // An older socket of this player (lobby page, or a lost connection already replaced
    // by a new one) closing late must not mark the player as gone
    if (player.socketId && player.socketId !== Socket.id) {
        logDebug('[player-quit] ignored outdated socket', Socket.id, 'of', player.id);
        return;
    }
    logDebug('handleDisconnect, room status=', room.status);

    switch (room.status) {
        case STATUS.GAME_STARTED_WAITING_PLAYERS:
            logDebug('player leave the lobby to go to the game page');
            player.isConnected = false;
            // The room is closed if this player never reaches the game page
            startPauseTimer(room);
            break;

        case STATUS.IN_LOBBY_WAITING:
        case STATUS.IN_LOBBY_FULL: {
            logDebug('[player-quit]', data.userId, 'left the room', data.roomId);

            // Remove player from room
            const index = Utils.findIndexById(room.users, player.id);
            room.users.splice(index, 1);
            const humans = room.users.filter(u => !u.isRobot);
            if (humans.length === 0) {
                // Delete empty room (robots alone can't play)
                destroyRoom(data.roomId);
            } else {
                // Hand over the ownership to another human player
                if (room.owner === player.id) {
                    room.owner = humans[0].id;
                }
                if (room.status === STATUS.IN_LOBBY_FULL && room.users.length < MAX_PLAYERS) {
                    room.status = STATUS.IN_LOBBY_WAITING;
                }
                // Update players list
                emitPlayerListChangedEvent(room);
            }
            break;
        }

        case STATUS.IN_GAME:
        case STATUS.IN_GAME_MISSING_PLAYERS:
            player.isConnected = false;
            room.status = STATUS.IN_GAME_MISSING_PLAYERS;
            room.missingPlayers = countMissing(room);
            logDebug(player.id, 'left during the game in', room.id, 'with', room.missingPlayers, 'missing players');
            // Keep the room alive (even if everyone left) to allow a refresh or a reconnection:
            // it is only closed after PAUSE_TIMEOUT_MS without the missing players
            startPauseTimer(room);
            // Nobody has to wait for a missing player once the game is over
            if (!Game.isGameOver(room)) {
                io.to(data.roomId).emit('player-left-the-room', {
                    playerId: player.id,
                    status: room.status,
                    missingPlayers: room.missingPlayers,
                    missingNames: getMissingNames(room)
                });
            }
            break;

        default:
            logDebug('Player', player.id, 'left the room', room.id, ' with status', room.status, 'but nothing handled here !');
    }
    refreshAllRoomsStatus();
}

// A bug in an event handler must not kill the server: all the rooms would be lost
process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
});

// Server start
Game.init(io, SERVER);
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on http://localhost:' + port);
});