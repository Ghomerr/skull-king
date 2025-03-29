const Socket = io();
const Global = {};

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('formRoomId');
const Player = {
    id: urlParams.get('formUserId'),
    isCurrentPlayer: false
};

// Send a disconnect event when player is leaving the page
window.addEventListener("beforeunload", () => {
    Socket.emit('player-disconnect', {
        roomId: roomId,
        userId: Player.id
    });
});

// Handle when a player is ready to display the waiting modal
Socket.on('ready-players-amount', (data) => {
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⏳ Attente', 'En attente des joueurs... ' + 
        data.readyPlayersAmout + '/' + data.totalPlayers + ' joueurs connectés.');
});

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', (data) => {
    console.log('START all-players-ready-to-play');

    // Dispay players names
    data.playersIds.forEach((playerId, index) => {
        const $playerBet = Global.$playersBets.eq(index);
        $playerBet.removeClass('hidden');
        
        if (playerId === data.currentPlayerId) {
            $playerBet.addClass('current-player');
        } else {
            $playerBet.removeClass('current-player');
        }

        let playerName = Player.id === playerId ? 'Moi' : playerId;
        $playerBet.find('.player-name').text(playerName);
    });
    Global.$playersBetsContainer.removeClass('hidden');

    // Request cards
    Socket.emit('get-my-cards', {
        roomId: roomId,
        userId: Player.id
    });

    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '🟢 START', 'Jeu en cours !');
    console.log('END all-players-ready-to-play');
});

/**
 * Display cards.
 * @param cards data to be displayed
 * @param $cards jquery elements to be updated with data to be displayed
 */
function displayCards(cards, $cards, addSomethingFn) {
    // Reset previous display
    const $allImgs = $cards.find('img');
    $allImgs.attr('src', 'static/assets/back.jpg');
    $allImgs.parent().removeData('card-id');
    $allImgs.parent().addClass('hidden');

    // Update display with the given cards data only
    cards.forEach((card, index) => {
        const $img = $cards.children('img').eq(index);
        $img.attr('src', 'static/assets/' + card.img);
        $img.parent().data('card-id', card.id);
        $img.parent().removeClass('hidden');
        if (addSomethingFn instanceof Function) {
            addSomethingFn(card, $img.parent());
        }
    });
}

// Receiving its cards
Socket.on('player-cards', (data) => {
    // TODO : WHY NOT ALL CARDS ARE SHOWN ON TURN 2 ???
    console.log('player-cards', data);
    Player.cards = data.cards;

    // Display the fold count displays
    for (let i = 0 ; i <= data.turn ; i++) {
        const foldCountDisplay = Global.$foldCountDisplays.eq(i);
        foldCountDisplay.removeClass('hidden');
    }
    Global.$foldCountPicker.removeClass('hidden');
    displayCards(data.cards, Global.$playerCards);
    Global.$playerCardsContainer.removeClass('hidden');
});

// Handle when a player updated its bet to display that it's ready to play
Socket.on('waiting-players-bets', (data) => {
    Global.$headStatus.text(data.numberOfReadyPlayers + '/' + data.totalNumberOfPlayers + ' joueurs prêts');
});

/**
 * Function to be called when the current player changed.
 * It updates the playing or not-playing class to let the player to select a card or not.
 * It also displays if it's the current player to play or someone else.
 */
function displayCurrentPlayer(data) {
    if (data.currentPlayerId === Player.id) {
        Global.$playerCardsContainer.removeClass('not-playing');
        Global.$playerCardsContainer.addClass('playing');
        Global.$headStatus.text('C\'est à moi de jouer...');
        Player.isCurrentPlayer = true;
    } else {
        Global.$playerCardsContainer.removeClass('playing');
        Global.$playerCardsContainer.addClass('not-playing');
        Global.$headStatus.text('C\'est à ' + data.currentPlayerId + ' de jouer...');
        Player.isCurrentPlayer = false;
    }

    // Refresh current-player state
    Global.$playersBets.each((_index, playerBetNode) => {
        const $playerBet = $(playerBetNode);
        const playerName = $playerBet.find('.player-name').text();
        if (playerName === 'Moi' && Player.id === data.currentPlayerId || playerName === data.currentPlayerId) {
            $playerBet.addClass('current-player');
        } else {
            $playerBet.removeClass('current-player');
        }
    });
}

// Handle when all players have chosen their bet
Socket.on('yo-ho-ho', (data) => {
    console.log('yo-ho-ho', data);

    // Display players bets
    data.bets.forEach((playerBet, index) => {
        const $playerBetValue = Global.$playersBetsValues.eq(index);
        $playerBetValue.find('img').attr('src', 'static/assets/score_' + playerBet.foldBet + '.jpg');
        $playerBetValue.removeClass('hidden');
    });

    displayCurrentPlayer(data);
    Global.$headTitle.text('Manche ' + data.turn);

    // Hide previous elements
    Global.$foldCountPicker.addClass('hidden');
    Global.$foldCountDisplays.addClass('hidden');

    // Display yo ho ho !
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '🏴‍☠️ YO HO HO', 'YO HO HO !!!!!');
});

// Handle when a player has just played a card and it must be removed from its hand
Socket.on('remove-played-card', (data) => {
    Global.$playerCards.each((index, card) => {
        // console.log('card to remove', data.playedCardId, '?', card);
        const $playedCard = $(card);
        if (+$playedCard.data('card-id') === data.playedCardId) {
            $playedCard.remove();
            const playedCardIndex = Player.cards.findIndex(card => card.id === data.playedCardId);
            Player.cards.splice(playedCardIndex, 1);
        }
    });
});

// Handle when a player has played a card to display current played cards and the current player name
Socket.on('card-has-been-played', (data) => {
    displayCurrentPlayer(data);
    displayCards(data.playedCards, Global.$playedCards, (cardData, $cardElement) => {
        $cardElement.find('span').text(cardData.playedBy === Player.id ? 'Moi' : cardData.playedBy);
    });
});

function openFoldDialog(foldOwner, foldSize, hasToGetCards) {
    // Open fold dialog
    const dialogTitle = foldOwner === Player.id ? 'J\'ai' : foldOwner + ' a';
    Dialog.$foldDisplayDialog.dialog('option', 'title', '🥇 ' + dialogTitle + ' remporté le pli !');
    Dialog.$foldDisplayDialog.dialog('option', 'width', foldSize * 200);
    // Ask cards for the next turn
    if (hasToGetCards) {
        Dialog.$foldDisplayDialog.dialog('option', 'close', () => {
                Socket.emit('get-my-cards', {
                    roomId: roomId,
                    userId: Player.id
                });
        });
    }
    Dialog.$foldDisplayDialog.dialog('option', 'buttons', [{
        text: 'Ok',
        click: () => {
            Dialog.$foldDisplayDialog.dialog('close');
        }
    }]);
    Dialog.$foldDisplayDialog.dialog('open');
}

Socket.on('player-won-current-turn', (data) => {
    // Next player will be the winner
    displayCurrentPlayer(data);

    // Remove played cards
    displayCards([], Global.$playedCards);

    // Prepare display fold dialog content
    displayCards(data.fold, Global.$foldCards, (cardData, $cardElement) => {
        $cardElement.find('span').text(cardData.playedBy === Player.id ? 'Moi' : cardData.playedBy);
    });
    openFoldDialog(data.currentPlayerId, data.fold.length, !data.isLastTurn);

    // TODO : remove previous bets !!
});

Socket.on('player-error', (error) => {
    switch (error.type) {
        case 'cannot-play-this-card':
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Vous ne pouvez pas jouer cette carte : ' + error.data);
            break;
        case 'wrong-type':
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Vous devez jouer une carte ' + error.data + ' !');
            break;
        default:
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur!', 'Erreur inconnue: ' + error.type + ' ' + error.data);
    }
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
    // Join the current game
    Socket.emit('join-game', {
        roomId: roomId,
        userId: Player.id
    });

    Global.$headTitle = $('#head-title');
    Global.$headStatus = $('#head-status');

    Global.$playedCards = $('.played-card');
    Global.$foldCards = $('.fold-card');

    Global.$playerCardsContainer = $('#player-cards-container');
    Global.$playerCards = Global.$playerCardsContainer.find('.card-display');
    Global.$foldCountPicker = $('#fold-count-picker');
    Global.$foldCountDisplays = $('.fold-count-display');

    Global.$playersBetsContainer = $('#players-bets-container');
    Global.$playersBets = $('.player-bet');
    Global.$playersBetsValues = Global.$playersBets.find('.bet-value');

    Global.$choiceTigresseEvasion = $('#tigresse-evasion');
    Global.$choiceTigressePirate = $('#tigresse-pirate');

    // TODO : only if the game hasn't started !!!!
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⏳ Attente', 'En attente des joueurs...');

    // Handle click on flod count display
    Global.$foldCountDisplays.click((event) => {
        const $currentFoldCountDisplay = $(event.currentTarget);

        // Handle event only when not hidden nor already selected
        if (!$currentFoldCountDisplay.hasClass('hidden') && !$currentFoldCountDisplay.hasClass('selected-bet')) {
            console.log('$foldCountDisplays.click() event', event.currentTarget.id);

            if (!Global.$foldCountDisplays.hasClass('selected-bet')) {
                selectFoldCount(Socket, Global, $currentFoldCountDisplay, event);
            } else {
                Dialog.openTwoChoicesDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Etes-vous sûr de vouloir changer de pari ?', 'Oui', () => {
                    selectFoldCount(Socket, Global, $currentFoldCountDisplay, event);
                }, 'Non', () => {});
            }
        }
    });

    // Handle a click on a card when it's the current player
    Global.$playerCards.click((event) => {
        if (Player.isCurrentPlayer) {
            console.log('current player clicked a card', event);
            const $playedCard = $(event.currentTarget);
            const cardId = $playedCard.data('card-id');
            const card = Player.cards.find(c => c.id === cardId);

            if (card.type === 'choice') {
                // Display the choice dialog
                Dialog.$choiceCardDialog.dialog('open');
            } else {
                Socket.emit('play-a-card', {
                    roomId: roomId,
                    playerId: Player.id,
                    cardId: cardId
                });
            }
        }
    });

    Global.$choiceTigresseEvasion.click((event) =>  {
        doChoiceTigresse(event, 'evasion');
    });
    Global.$choiceTigressePirate.click((event) =>  {
        doChoiceTigresse(event, 'pirate');
    });
    function doChoiceTigresse(event, type) {
        if (Player.isCurrentPlayer) {
            console.log('current player choosed to play a Tigresse as', type, event);
            Socket.emit('play-a-card', {
                roomId: roomId,
                playerId: Player.id,
                cardId: 106, // tigresse
                type: type
            });
            Dialog.$choiceCardDialog.dialog('close');
        }
    }

    Dialog.$choiceCardDialog = $('#choice-card-dialog');
    Dialog.$choiceCardDialog.dialog({
        modal: true,
        width: 400,
        autoOpen: false,
        closeOnEscape: false,
        buttons: {},
        open: () => {
            $('.ui-dialog[aria-describedby=choice-card-dialog] .ui-dialog-titlebar-close').hide();
        }
    });
    Dialog.$choiceCardDialog.removeClass('hidden');

    Dialog.$foldDisplayDialog = $('#fold-display-dialog');
    Dialog.$foldDisplayDialog.dialog({
        modal: true,
        autoOpen: false,
    });
    Dialog.$foldDisplayDialog.removeClass('hidden');
});