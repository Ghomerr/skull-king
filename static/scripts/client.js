const Socket = io();
const Global = {};
const Lobby = {};
const Player = {};
const STATUS = {
    // server.js !
    IN_LOBBY_WAITING: 1,
    IN_LOBBY_FULL: 2,
    IN_GAME: 3
    // server.js !
};

$(document).ready(() => {

    //------------------------------------------------------------//

    Global.$simpleDialog = $('#simple-dialog');
    Global.$simpleDialog.dialog({
        modal: true,
        autoOpen: false,
        buttons: {
            Ok: () => {
                Global.$simpleDialog.dialog('close');
            }
        }
    });
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
    Lobby.$lobbyInputsContainer = $('#lobby-inputs');
    Lobby.$requiredInputs = $('#room-id, #user-id');
    Lobby.inputs = {
        $roomId: $('#room-id'),
        $userId: $('#user-id'),
        $roomPassword: $('#room-password')
    };
    Lobby.$submitButton = $('#lobby-btn');
    Lobby.$roomsList = $('#rooms-list');
    Lobby.$roomsListContent = Lobby.$roomsList.find('#rooms-list-content');
    Lobby.$playersList = $('#players-list');
    Lobby.$playerCounter = $('#players-counter');
    Lobby.$infoPassword = $('#info-password');
    Lobby.$startContentFrom = $('form#start-content');
    Lobby.$formUserId = $('#formUserId');
    Lobby.$formRoomId = $('#formRoomId');
    Lobby.$startBtn = $('#start-btn');

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
           roomId: Lobby.inputs.$roomId.val()
        });
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
    }
});

// Handle user joined lobby
Socket.on('players-list-changed', (room) => {
    console.log('User has entered in lobby', room);
    Player.roomId = room.id;
    Lobby.$lobbyInputsContainer.hide();
    Lobby.$roomsList.hide();
    Lobby.$formRoomId.val(Lobby.inputs.$roomId.val());
    Lobby.$formUserId.val(Lobby.inputs.$userId.val());
    Lobby.$playersList.show();
    Lobby.$playersList.find('.room-id-title').text(room.id);
    const $lobbyPlayersList = Lobby.$playersList.find('.lobby-players-list');
    $lobbyPlayersList.text('');

    // Display players in the lobby
    room.users.forEach((user, index) => {
        let username = user.id;
        if (username === room.owner) {
            username = '<i class="fas fa-crown"></i>' + username;
        }
        if (username === Player.id) {
            username = '<strong>' + username + '</strong>';
        }
        $lobbyPlayersList.append('<div class="user" data-player-index="' + index + '">' + username + '</div>');
    });

    
    if (Player.id === room.owner) {
        $lobbyPlayersList.addClass('draggable');
        $('.user').draggable({
            revert: true
        });
        $lobbyPlayersList.droppable({
            accept: '.user',
            drop: (event, ui) => {
              // console.log('event', event, 'ui', ui, 'ui.draggable', ui.draggable, '$(this)', $(this));
              console.log('container top, left, H, W', event.target.offsetTop, event.target.offsetLeft, event.target.offsetHeight, event.target.offsetWidth);
              console.log('draggble top, left, H, W', ui.draggable[0].offsetTop, ui.draggable[0].offsetLeft, ui.draggable[0].offsetHeight, ui.draggable[0].offsetWidth);
              console.log('position offset', ui.position, ui.offset);

              const containerHeight = event.target.offsetHeight;
              const elementHeight = ui.draggable[0].offsetHeight;
              const draggedElement = $(ui.draggable[0]);
              const newIndex = Math.sign(ui.position.top) * Math.round(Math.abs(ui.position.top) / containerHeight);
              const oldIndex = draggedElement.data('player-index');
              if (newIndex !== 0) {
                event.stopPropagation();
                Socket.emit('change-players-order', {
                  newIndex: newIndex,
                  oldIndex: oldIndex
                });
              }
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
    Lobby.$startContentFrom.trigger('submit');
});