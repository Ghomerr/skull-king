const Socket = io();
const Global = {};

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('formRoomId');
const Player = {
    id: urlParams.get('formUserId'),
    isCurrentPlayer: false
};

$(document).ready(() => {
    // Join the current game
    Socket.emit('join-game', {
        roomId: roomId,
        userId: Player.id
    });

    Global.$headTitle = $('#head-title');
    Global.$headStatus = $('#head-status');

    Global.$playerCardsContainer = $('#player-cards-container');
    Global.$playerCards = $('.card-display');
    Global.$foldCountPicker = $('#fold-count-picker');
    Global.$foldCountDisplays = $('.fold-count-display');

    Global.$playersBetsContainer = $('#players-bets-container');
    Global.$playersBets = $('.player-bet');
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
    Player.cards = data.cards; // useful ?

    // Display the fold count displays
    // TODO : don't display this if it's not the start of the game !!
    for (let i = 0 ; i <= data.turn ; i++) {
        const foldCountDisplay = Global.$foldCountDisplays.eq(i);
        foldCountDisplay.removeClass('hidden');
    }
    Global.$foldCountPicker.removeClass('hidden');

    // Display player's cards
    data.cards.forEach((card, index) => {
        const $img = Global.$playerCards.children().eq(index);
        $img.attr('src', 'static/assets/' + card.img);
        $img.parent().data('card-id', card.id);
        $img.parent().removeClass('hidden');
    });
    Global.$playerCardsContainer.removeClass('hidden');
});

Socket.on('waiting-players-bets', (data) => {
    Global.$headStatus.text(data.numberOfReadyPlayers + '/' + data.totalNumberOfPlayers + ' joueurs prêts');
});

// Handle when all players have chosen their bet
Socket.on('yo-ho-ho', (data) => {
    console.log('yo-ho-ho', data);

    // Display players bets
    Global.$playersBetsContainer.removeClass('hidden');
    data.bets.forEach((playerBet, index) => {
        const $playerBet = Global.$playersBets.eq(index);
        $playerBet.removeClass('hidden');
        $playerBet.find('.player-name').text(playerBet.userId);
        $playerBet.find('.bet-value > img').attr('src', 'static/assets/score_' + playerBet.foldBet + '.jpg');
    });

    // Display header title and status
    if (data.currentPlayerId === Player.id) {
        Global.$playerCardsContainer.removeClass('not-playing');
        Global.$playerCardsContainer.addClass('playing');
        Global.$headStatus.text('C\'est à moi de jouer...');
        Player.isCurrentPlayer = true;
        // TODO add events to play a card !
    } else {
        Global.$playerCardsContainer.removeClass('playing');
        Global.$playerCardsContainer.addClass('not-playing');
        Global.$headStatus.text('C\'est à ' + data.currentPlayerId + ' de jouer...');
        Player.isCurrentPlayer = false;
        // TODO remove event to play a card
    }
    Global.$headTitle.text('Manche ' + data.turn);

    // Hide previous elements
    Global.$foldCountPicker.addClass('hidden');
    Global.$foldCountDisplays.addClass('hidden');

    // Display yo ho ho !
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'YO HO HO', 'YO HO HO !!!!!');
});

function selectFoldCount(Socket, Global, $currentFoldCountDisplay, event) {
    Global.$foldCountPicker.addClass('bet-selected');
    Global.$foldCountDisplays.removeClass('selected-bet');
    $currentFoldCountDisplay.addClass('selected-bet');

    Socket.emit('set-fold-bet', {
        roomId: roomId,
        userId: Player.id,
        foldBet: +(event.currentTarget.id.split('-')[1])
    });
}

$(document).ready(() => {
    Dialog.openSimpleDialog(Dialog.$simpleDialog, 'Attente', 'En attente des joueurs...');

    // Handle click on flod count display
    Global.$foldCountDisplays.click((event) => {
        const $currentFoldCountDisplay = $(event.currentTarget);

        // Handle event only when not hidden nor already selected
        if (!$currentFoldCountDisplay.hasClass('hidden') && !$currentFoldCountDisplay.hasClass('selected-bet')) {
            console.log('$foldCountDisplays.click() event', event.currentTarget.id);

            if (!Global.$foldCountDisplays.hasClass('selected-bet')) {
                selectFoldCount(Socket, Global, $currentFoldCountDisplay, event);
            } else {
                Dialog.openTwoChoicesDialog(Dialog.$simpleDialog, 'Attention', 'Etes-vous sûr de vouloir changer de pari ?', 'Oui', () => {
                    selectFoldCount(Socket, Global, $currentFoldCountDisplay, event);
                }, 'Non', () => {});
            }
        }        
    });

    // Handle a click on a card when it's the current player
    Global.$playerCards.click((event, other) => {
        if (Player.isCurrentPlayer) {
            console.log('current player clicked a card', event, other);
            const $playedCard = $(event.currentTarget);
            Socket.emit('play-a-card', {
                roomId: roomId,
                playerId: Player.id,
                cardId: $playedCard.data('card-id')
            });
        }
    });
});