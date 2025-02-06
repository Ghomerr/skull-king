const Socket = io();
const Global = {};

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('formRoomId');
const Player = {
    id: urlParams.get('formUserId')
};

$(document).ready(() => {
    // Join the current game
    Socket.emit('join-game', {
        roomId: roomId,
        userId: Player.id
    });

    Global.$playerCardsContainer = $('#player-cards-container');
    Global.$playerCards = $('.card-display');
});


// Handle when a player is ready to display the waiting modal
Socket.on('ready-players-amount', (data) => {
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs... ' + 
        data.readyPlayersAmout + '/' + data.totalPlayers + ' joueurs connectés.');
});

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', () => {
    console.log('all-players-ready-to-play');
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'START', 'Jeu en cours !');

    // Request cards
    Socket.emit('get-my-cards', {
        roomId: roomId,
        userId: Player.id
    });
});

// Receiving its cards
Socket.on('player-cards', (data) => {
    console.log('player-cards', data);
    Player.cards = data.cards;
    Global.$playerCards.hide();
    data.cards.forEach((card, index) => {
        const $img = Global.$playerCards.children().eq(index);
        $img.attr('src', 'static/assets/' + card.img);
        $img.parent().show();
    });
    Global.$playerCardsContainer.removeClass('hidden');
});

$(document).ready(() => {
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs...');
});