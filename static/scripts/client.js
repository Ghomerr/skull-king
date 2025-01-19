const Socket = io();
const Lobby = {};

$(document).ready(() => {
    
    Lobby.$randomRoomIdBtn = $('#random-room-id-btn');
    Lobby.$roomIdInput = $('#room-id');

    Lobby.$randomRoomIdBtn.click(() => {
        Socket.emit('get-random-room-id');
    });
    // Handle change room id
    Socket.on('random-room-id', (roomId) => {
        Lobby.$roomIdInput.val(roomId);
    });
});

// Events
// First event received from server.js
Socket.on('connected', (data) => {
    console.log('Client connected with server', data);

    // Init room id from generated server value
    const roomId = data.roomId;
    Lobby.$roomIdInput.val(roomId);

    // Socket.emit('get-version');

    // Display rooms list
    const roomsList = data.roomsList;
    if (roomsList.length) {
        $roomsListContent.text('');
        for (const roomData of roomsList) {
            // Prepare displayed data
            const roomTooltip = roomData.status === 'lobby' ?
                'Rejoindre cette salle de jeu' :
                roomData.status === 'full-lobby' ?
                'Impossible de rejoindre une salle de jeu complète' :
                'Impossible de rejoindre une salle déjà en jeu';
            const roomIcon = roomData.status === 'lobby' ?
                'fa-sign-in-alt' :
                'fa-ban';
            const roomStatus = roomData.status === 'lobby' ? 'LOBBY' : roomData.status === 'full-lobby' ? 'COMPLÈTE' : 'EN JEU';
            // Create room line with room data
            const roomsListText = '<div class="room-line ' + roomData.status + '">' +
                '<div class="room-name" title="' + roomTooltip + '" data-room-id="' + roomData.id + '" onclick="joinRoomId(this);">' +
                '<i class="fas ' + roomIcon + ' "></i> ' +
                '<span>' + roomData.id + '</span>' +
                '</div>' +
                '<div class="room-info" title="' + roomData.usersNames + '">' + roomData.usersCount + ' joueur(s)</div>' +
                '<div class="room-status">' + roomStatus + '</div>' +
                '</div>';
            //$roomsListContent.append(roomsListText);
        }
        //$roomsList.show();
    }
});