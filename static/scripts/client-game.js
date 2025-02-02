const Socket = io();
const Global = {};

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('formRoomId');
const Player = {
    id: urlParams.get('formUserId')
};

// Join the current game
Socket.emit('join-game', {
    roomId: roomId,
    userId: Player.id
});

// Handle when a player is ready to display the waiting modal
Socket.on('ready-players-amount', (data) => {
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs... ' + 
        data.readyPlayersAmout + '/' + data.totalPlayers + ' joueurs connectés.');
});

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', () => {
    Dialog.$simpleDialog.dialog('close');
    // TODO TMP TEST : 
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'START', 'Jeu en cours !');
});

$(document).ready(() => {
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs...');
});