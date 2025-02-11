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
    Global.$foldCountPicker = $('#fold-count-picker');
    Global.$foldCountDisplays = $('.fold-count-display');
});


// Handle when a player is ready to display the waiting modal
Socket.on('ready-players-amount', (data) => {
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs... ' + 
        data.readyPlayersAmout + '/' + data.totalPlayers + ' joueurs connectés.');
});

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', () => {
    console.log('START all-players-ready-to-play');

    // Request cards
    Socket.emit('get-my-cards', {
        roomId: roomId,
        userId: Player.id
    });

    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'START', 'Jeu en cours !');
    console.log('END all-players-ready-to-play');
});

// Receiving its cards
Socket.on('player-cards', (data) => {
    console.log('player-cards', data);
    Player.cards = data.cards;

    // Display the fold count displays
    for (let i = 0 ; i <= data.turn ; i++) {
        const foldCountDisplay = Global.$foldCountDisplays.eq(i);
        foldCountDisplay.removeClass('hidden');
    }
    Global.$foldCountPicker.removeClass('hidden');

    // Display player's cards
    data.cards.forEach((card, index) => {
        const $img = Global.$playerCards.children().eq(index);
        $img.attr('src', 'static/assets/' + card.img);
        $img.parent().removeClass('hidden');
    });
    Global.$playerCardsContainer.removeClass('hidden');
});

// Handle when all players have chosen their bet
Socket.on('yo-ho-ho', (data) => {
    console.log('yo-ho-ho', data);
    Global.$foldCountPicker.addClass('hidden');
    Global.$foldCountDisplays.addClass('hidden');

    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'YO HO HO', 'YO HO HO !!!!!');
});

$(document).ready(() => {
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs...');

    // Handle click on flod count display
    Global.$foldCountDisplays.click((event) => {
        const $currentFoldCountDisplay = $(event.currentTarget);

        // Handle event only when not hidden nor already selected
        if (!$currentFoldCountDisplay.hasClass('hidden') && !$currentFoldCountDisplay.hasClass('selected-bet')) {
            console.log('click event', event.currentTarget.id);
            Global.$foldCountPicker.addClass('bet-selected');
            Global.$foldCountDisplays.removeClass('selected-bet');
            $currentFoldCountDisplay.addClass('selected-bet');
    
            Socket.emit('set-fold-bet', {
                roomId: roomId,
                userId: Player.id,
                foldBet: +(event.currentTarget.id.split('-')[1])
            });
        }        
    });
});