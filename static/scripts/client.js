const Socket = io();
const Player = {};
const STATUS = {
    // server.js !
    NOT_CONNECTED: 'NOT_CONNECTED',
    IN_LOBBY_WAITING: 'IN_LOBBY_WAITING',
    IN_LOBBY_FULL: 'IN_LOBBY_FULL',
    GAME_STARTED_WAITING_PLAYERS: 'GAME_STARTED_WAITING_PLAYERS',
    IN_GAME: 'IN_GAME',
    IN_GAME_MISSING_PLAYERS: 'IN_GAME_MISSING_PLAYERS',
    // server.js !
};
const Lobby = {
    roomStatus: STATUS.NOT_CONNECTED
};

// Query params cleanup
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('formRoomId') || urlParams.get('formUserId')) {
   window.location.href = '/';
}

const INVALID_INPUT_REGEX = /[^a-zA-Z0-9\s\-_À-ÿ]/g;
function sanitizeUserInput(input) {
    const sanitized = input.val().replace(INVALID_INPUT_REGEX, '');
    input.val(sanitized);
}

$(document).ready(() => {
    Socket.emit('get-random-room-id');
    Socket.emit('get-rooms-list');

    //------------------------------------------------------------//
    // see dialog.js -> Dialog

    // Handle when player makes an error
    Socket.on('lobby-error', (error) => {
        switch (error.type) {
            case 'maximum-rooms-count':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Le nombre de salles maximum a été atteint : ' + error.data);
                break;
            case 'user-already-exists':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Le nom choisi est déjà pris dans cette salle : ' + error.data);
                break;
            case 'already-in-game':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Vous ne pouvez pas rejoindre une partie déjà en cours !');
                break;
            case 'full-lobby':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Vous ne pouvez pas rejoindre la salle de jeu ' + error.data + ', car elle est déjà complète.');
                break;
            case 'password-error':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Le mot de passe de la salle de jeu ' + error.data + ' est incorrect.');
                break;
            case 'wrong-owner':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Vous ne pouvez pas démarrer la partie.');
                break;
            case 'wrong-room-name':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Le nom de la salle est invalide: 20 caractères autorisés: A-Z, a-z, 0,9, -, _, espace.');
                break;     
            case 'invalid-username':
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', 'Le nom d\'utilisateur est invalide: 20 caractères autorisés: A-Z, a-z, 0,9, -, _, espace.');
                break;
            default:
                Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur!', 'Erreur inconnue: ' + error.type + ' ' + error.data);
        }
    });

    //------------------------------------------------------------//

    Lobby.$randomRoomIdBtn = $('#random-room-id-btn');
    Lobby.$roomPasswordLink = $('#room-password-link');
    Lobby.$roomPasswordContainer = $('#room-password-container');
    Lobby.$lobbyInputsContainer = $('#lobby-inputs');
    Lobby.$requiredInputs = $('#room-id, #user-id');
    Lobby.$userInputs = $('#room-id, #user-id, #room-password');
    Lobby.inputs = {
        $roomId: $('#room-id'),
        $userId: $('#user-id'),
        $roomPassword: $('#room-password')
    };
    Lobby.$submitButton = $('#lobby-btn');
    Lobby.$roomsList = $('#rooms-list');
    Lobby.$roomsListContent = Lobby.$roomsList.find('#rooms-list-content');
    Lobby.$playersList = $('#players-list');
    Lobby.$lobbyPlayersList = Lobby.$playersList.find('.lobby-players-list');
    Lobby.$playerCounter = $('#players-counter');
    Lobby.$infoPassword = $('#info-password');
    Lobby.$startContentFrom = $('form#start-content');
    Lobby.$formUserId = $('#formUserId');
    Lobby.$formRoomId = $('#formRoomId');
    Lobby.$formToken = $('#formToken');
    Lobby.$startBtn = $('#start-btn');

    Lobby.$debugButton = $('#debug-button');

    Lobby.$randomRoomIdBtn.click(() => {
        Socket.emit('get-random-room-id');
    });

    // Sanitize the user inputs
    Lobby.$userInputs.on('input', function() {
        sanitizeUserInput($(this));
    });

    // Handle change room id
    Socket.on('random-room-id', (roomId) => {
      Lobby.inputs.$roomId.val('Salle ' + roomId);
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
        sanitizeUserInput(Lobby.inputs.$userId);
        sanitizeUserInput(Lobby.inputs.$roomId);
        sanitizeUserInput(Lobby.inputs.$roomPassword);

        Player.id = Lobby.inputs.$userId.val();
        Player.token = window.crypto.randomUUID();
        const lobbyData = {
            userId: Player.id,
            roomId: Lobby.inputs.$roomId.val(),
            token: Player.token,
            password: Lobby.inputs.$roomPassword.val()
        };
        console.log('Sending start lobby event', lobbyData);

        // Send lobby event to server
        Socket.emit('join-lobby', lobbyData);
    });

    // Handle quick room join button
    Lobby.joinRoomId = (element) => {
        if (Lobby.inputs.$userId.val()) {
            const $roomNameElement = $(element);
            Lobby.inputs.$roomId.val($roomNameElement.data('room-id'));
            Lobby.$submitButton.click();
        }
    };

    // Start the game
    Lobby.$startBtn.click(() => {
        Socket.emit('start-game', {
           roomId: Lobby.inputs.$roomId.val(),
           ownerId: Player.id,
           token: Player.token,
        });
    });

    // Debug button 
    Lobby.$debugButton.click(() => {
        Socket.emit('debug-toggle');
    });
});

// Events

// First event received from server.js
Socket.on('connected', (data) => {
    console.log('Client connected with server', data);

    // Init room id from generated server value
    const roomId = data.roomId;
    Lobby.inputs.$roomId.val(roomId);

    // Socket.emit('get-version');
});

// Handle the user connected event to get the player token
Socket.on('user-connected', (data) => {
  if (data.userId === Player.id) {
    Player.token = data.token;
  }
});

Socket.on('rooms-status-changed', (data) => {
    console.log('=> rooms-status-changed', data); 
    // Display rooms list
    const roomsList = data.roomsList;
    if (roomsList.length > 0 && Lobby.roomStatus === STATUS.NOT_CONNECTED) {
        Lobby.$roomsListContent.text('');
        for (const roomData of roomsList) {
            // Prepare displayed data
            const roomTooltip = roomData.status === STATUS.IN_LOBBY_WAITING ?
                'Rejoindre cette salle de jeu' :
                roomData.status === STATUS.IN_LOBBY_FULL ?
                'Impossible de rejoindre une salle de jeu complète' :
                'Impossible de rejoindre une salle déjà en jeu';
            const roomIcon = roomData.status === STATUS.IN_LOBBY_WAITING ?
                'fa-sign-in-alt' :
                'fa-ban';
            const roomStatus = roomData.status === STATUS.IN_LOBBY_WAITING ? 
                'ATTENTE DE JOUEUR' : roomData.status === STATUS.IN_LOBBY_FULL ? 'COMPLÈTE' : 'EN JEU';
            // Create room line with room data
            const roomsListText = '<div class="room-line room-status-' + roomData.status + '">' +
                '<div class="room-name" title="' + roomTooltip + '" data-room-id="' + roomData.id + 
                '" onclick="Lobby.joinRoomId(this);">' +
                '<i class="fas ' + roomIcon + ' "></i> ' +
                '<span>' + roomData.id + '</span>' +
                '</div>' +
                '<div class="room-info" title="' + roomData.usersNames + '">' + roomData.usersCount + ' joueur(s)</div>' +
                '<div class="room-status">' + roomStatus + '</div>' +
                '</div>';
            Lobby.$roomsListContent.append(roomsListText);
        }
        Lobby.$roomsList.show();
    } else {
        Lobby.$roomsList.hide();
    }
});

// Handle user joined lobby
Socket.on('players-list-changed', (room) => {
    console.log('User has entered in lobby', room);
    Player.roomId = room.id;
    Lobby.roomStatus = room.STATUS;
    Lobby.$lobbyInputsContainer.hide();
    Lobby.$roomsList.hide();
    Lobby.$playersList.show();
    Lobby.$playersList.find('.room-id-title').text(room.id);
    Lobby.$lobbyPlayersList.text('');

    // Display players in the lobby
    room.users.forEach((user, index) => {
        let username = user.id;
        if (user.id === Player.id) {
            username = '<strong>' + username + '</strong>';
        }
        if (user.id === room.owner) {
            username = '<i class="fas fa-crown"></i>' + username;
        }
        Lobby.$lobbyPlayersList.append('<li class="user">' + username + '</li>');
    });

    // Owner can order players in the list
    if (Player.id === room.owner) {
        Lobby.$lobbyPlayersList.addClass('draggable');
        Lobby.$lobbyPlayersList.sortable({
            update: (_event, _ui) => {
                const newUsersOrder = [];
                Lobby.$lobbyPlayersList.children().each((_index, userNode) => {
                    newUsersOrder.push($(userNode).text());
                });
                Socket.emit('change-players-order', {
                    roomId: room.id,
                    ownerId: Player.id,
                    token: Player.token,
                    newUsersOrder: newUsersOrder
                });
            }
        });
    }

    // Start conditions
    Lobby.$playerCounter.text(room.users.length);
    if (room.owner === Player.id) {
        Lobby.$startBtn.show();
        Lobby.$startBtn.prop('disabled', !room.canStartGame);
        if (room.password) {
            Lobby.$infoPassword.text('Mot de passe : ' + room.password);
            Lobby.$infoPassword.show();
        }
    }
});

// Handle game started
Socket.on('game-started', () => {
    sanitizeUserInput(Lobby.inputs.$userId);
    Lobby.$formRoomId.val(Lobby.inputs.$roomId.val());
    Lobby.$formUserId.val(Lobby.inputs.$userId.val());
    Lobby.$formToken.val(Player.token);
    Lobby.$startContentFrom.trigger('submit');
});

// Handle debug changed
Socket.on('debug-changed', (data) => {
    console.log('debug-changed', data);
    if (data.isDebugEnabled) {
        Lobby.$debugButton.addClass('active');
    } else {
        Lobby.$debugButton.removeClass('active');
    }
});