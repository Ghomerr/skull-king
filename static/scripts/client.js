const Socket = io();
const Global = {};
const Lobby = {};
const Player = {};

$(document).ready(() => {

    //------------------------------------------------------------//

    Global.$simpleDialog = $('#simple-dialog');
    Global.openSimpleDialog = ($dialog, title, text, width) => {
        $dialog.dialog('option', 'title', title);
        if (width) {
            $dialog.dialog('option', 'width', width);
        } else {
            // Reset default width
            $dialog.dialog('option', 'width', 300);
        }
        $dialog.find('#dialog-text').text('').append(text);
        $dialog.dialog('open');
    };
    
    // Handle when player makes an error
    Socket.on('player-error', (error) => {
        switch (error.type) {
            case 'maximum-rooms-count':
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur', 'Le nombre de rooms maximum a été atteint : ' + error.data);
                break;
            case 'player-already-exists':
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur', 'Le nom de joueur choisi est déjà pris dans cette room : ' + error.data);
                break;
            case 'already-in-game':
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur', 'Vous ne pouvez pas rejoindre une partie déjà en cours !');
                break;
            case 'full-lobby':
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur', 'Vous ne pouvez pas rejoindre la salle de jeu ' + error.data + ', car elle est déjà complète.');
                break;
            case 'password-error':
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur', 'Le mot de passe de la Salle de jeu ' + error.data + ' est incorrect.');
                break;
            case 'wrong-type':
                Global.openSimpleDialog(Global.$simpleDialog, 'Attention', 'Vous devez jouer une carte ' + error.data + ' !');
                break;
            case 'cannot-play-this-card':
                Global.openSimpleDialog(Global.$simpleDialog, 'Attention', 'Vous ne pouvez pas jouer cette carte : ' + error.data);
                break;
            default:
                Global.openSimpleDialog(Global.$simpleDialog, 'Erreur!', 'Erreur inconnue: ' + error.type + ' ' + error.data);
        }
    });

    //------------------------------------------------------------//

    Lobby.$randomRoomIdBtn = $('#random-room-id-btn');
    Lobby.$roomIdInput = $('#room-id');
    Lobby.$roomPasswordLink = $('#room-password-link');
    Lobby.$roomPasswordContainer = $('#room-password-container');
    Lobby.$lobbyInputsContainer = $('#lobby-inputs'),
    Lobby.$requiredInputs = $('#room-id, #user-id');
    Lobby.inputs = {
        $roomId: $('#room-id'),
        $userId: $('#user-id'),
        $roomPassword: $('#room-password')
    };
    Lobby.$submitButton = $('#lobby-btn');

    Lobby.$randomRoomIdBtn.click(() => {
        Socket.emit('get-random-room-id');
    });
    // Handle change room id
    Socket.on('random-room-id', (roomId) => {
        Lobby.$roomIdInput.val(roomId);
    });

    // Handle click on private party link
    Lobby.$roomPasswordLink.click(() => {
        Lobby.$roomPasswordLink.hide();
        Lobby.$roomPasswordContainer.show();
    });

    // Handle all valid input to enable connection button
    Lobby.$requiredInputs.on('keyup change', () => {
        Lobby.$submitButton.prop('disabled', !Lobby.inputs.$roomId.val() || !Lobby.inputs.$userId.val());
    });

    // Handle lobby button click
    Lobby.$submitButton.click(() => {
        const lobbyData = {
            userId: Lobby.inputs.$userId.val(),
            roomId: Lobby.inputs.$roomId.val(),
            password: Lobby.inputs.$roomPassword.val()
        };
        Player.id = lobbyData.userId;
        console.log('Sending start lobby event', lobbyData);

        // Send lobby event to server
        Socket.emit('start-lobby', lobbyData);
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

// Handle user joined lobby
Socket.on('players-list-changed', (room) => {
    console.log('User has entered in lobby', room);
    Player.roomId = room.id;
    Lobby.$lobbyInputsContainer.hide();

    // TODO NEXT ... 
    $roomsList.hide();
    $playersList.show();
    $playersList.find('.room-id-title').text(room.id);
    const $lobbyPlayersList = $playersList.find('.lobby-players-list');
    $lobbyPlayersList.text('');

    // Display players in the lobby
    room.users.forEach(user => {
        let username = user.id;
        if (user.id === room.owner) {
            username = '<i class="fas fa-crown"></i>' + username;
        }
        if (user.id === myUserId) {
            username = '<strong>' + username + '</strong>';
        }
        $lobbyPlayersList.append('<div class="user">' + username + '</div>');
    });

    // Start conditions
    $playerCounter.text(room.users.length);
    if (room.owner === myUserId) {
        $startBtn.show();
        $startBtn.prop('disabled', room.users.length < 3 || room.users.length > 5);
        if (room.password) {
            $infoPassword.text('Mot de passe : ' + room.password);
            $infoPassword.show();
        }
    }
});