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

     // Prepare rooms list result
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
});

// Server start
const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Server listening on port', port);
});