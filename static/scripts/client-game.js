const Socket = io();
const Global = {};

const urlParams = new URLSearchParams(window.location.search);
const Room = {
    id: urlParams.get('formRoomId'),
    playedCards: []
};
const Player = {
    id: urlParams.get('formUserId'),
    cards: [],
    isCurrentPlayer: false,
    isBot: false
};

// Handle when a player is ready to display the waiting modal
Socket.on('ready-players-amount', (data) => {
    console.log('=> ready-players-amount', data);
    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⏳ Attente', 'En attente des joueurs... ' + 
        data.readyPlayersAmout + '/' + data.totalPlayers + ' joueurs connectés.');
});

function getMyCards(event) {
    console.log('get-my-cards =>', event);
    Socket.emit('get-my-cards', event);
}

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', (data) => {
    console.log('=> START all-players-ready-to-play', data);

    // Display players names
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
    getMyCards({
        roomId: Room.id,
        userId: Player.id
    });

    Dialog.$simpleDialog.dialog('close');
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '🟢 START', 'Jeu en cours !');
    console.log('=> END all-players-ready-to-play');
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

function playCard(cardEvent) {
    console.log('play-a-card =>', cardEvent);
    Socket.emit('play-a-card', cardEvent);
}

function autoPlay() {
    if (Player.isBot) {
        Global.$botButton.addClass('active');
        // Fold bet picker is visible, choose a bet
        if (!Global.$foldCountPicker.hasClass('hidden')) {
            const betValue = Player.cards.filter(card => card.value >= 30).length;
            Global.$foldCountPicker.find('#fold-' + betValue).click();
        } else {
            if (Player.isCurrentPlayer) {
                // Find the first played card color
                const noPlayedCards = Room.playedCards.length === 0;
                const firstColorCard = noPlayedCards ? null : Room.playedCards.find(c => !c.isSpecial);
                const indexOfPlayedCardType = firstColorCard ? Player.cards.findIndex(c => c.type === firstColorCard.type) : -1;

                // No played card yet, or no color played, or no card of played type, play the first card
                if (indexOfPlayedCardType === -1) {
                    // TODO : WHY THE BOT MAY NOT HAVE NO CARD HERE ????
                    playCard({
                        roomId: Room.id,
                        playerId: Player.id,
                        cardId: Player.cards[0].id
                    });
                } else {
                    // Play the first card of the played type (handle the tigresse choice)
                    const cardToBePlayed = Player.cards[indexOfPlayedCardType];
                    playCard({
                        roomId: Room.id,
                        playerId: Player.id,
                        cardId: cardToBePlayed.id,
                        type: cardToBePlayed.type !== 'choice' ?? 'evasion'
                    });
                }
            }
        }
    } else {
        Global.$botButton.removeClass('active');
    }
}

// Receiving its cards
Socket.on('player-cards', (data) => {
    console.log('=> player-cards', data);
    Player.cards = [...data.cards];
    Player.isCurrentPlayer = false;

    // Display the fold count displays
    for (let i = 0 ; i <= data.turn ; i++) {
        const foldCountDisplay = Global.$foldCountDisplays.eq(i);
        foldCountDisplay.removeClass('hidden');
    }
    Global.$foldCountPicker.removeClass('hidden');
    displayCards(Player.cards, Global.$playerCards);
    Global.$playerCardsContainer.removeClass('hidden');

    // Reset these classes because the players aren't playing but selecting a new bet for this new turn
    Global.$playerCardsContainer.removeClass('not-playing');
    Global.$playerCardsContainer.removeClass('playing');
    Global.$foldCountPicker.removeClass('bet-selected');
    Global.$foldCountDisplays.removeClass('selected-bet');
    Global.$playersBetsValues.addClass('hidden');
    Global.$foldCounterContainer.addClass('hidden');

    // Display the scores between each turn
    if (!Player.isBot && data.turn > 1) {
        Dialog.$scoresDisplayDialog.removeClass('hidden');
        Dialog.openSimpleDialog(Dialog.$scoresDisplayDialog, '🏆 Scores', null, 600);
    }

    // Display the player that will play and the current round
    displayCurrentPlayer(data);
    Global.$headTitle.text('Manche ' + data.turn);

    autoPlay();
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
    console.log('=> yo-ho-ho', data);

    // Display players bets
    data.bets.forEach((playerBet, index) => {
        const $playerBetValue = Global.$playersBetsValues.eq(index);
        $playerBetValue.find('img').attr('src', 'static/assets/score_' + playerBet.foldBet + '.jpg');
        $playerBetValue.removeClass('hidden');
    });
    Global.$foldCounterContainer.find('span').text('0');
    Global.$foldCounterContainer.removeClass('hidden');

    displayCurrentPlayer(data);
    Global.$headTitle.text('Manche ' + data.turn);

    // Hide previous elements
    Global.$foldCountPicker.addClass('hidden');
    Global.$foldCountDisplays.addClass('hidden');

    // Display yo ho ho !
    if (!Player.isBot) {
        Dialog.openSimpleDialog(Dialog.$simpleDialog, '🏴‍☠️ YO HO HO', 'YO HO HO !!!!!');
    } else {
        autoPlay();
    }
});

// Handle when a player has just played a card, and it must be removed from its hand
Socket.on('remove-played-card', (data) => {
    console.log('=> remove-played-card', data);
    Global.$playerCards.each((index, card) => {
        const $playedCard = $(card);
        if (+$playedCard.data('card-id') === data.playedCardId) {
            $playedCard.addClass('hidden');
            const playedCardIndex = Player.cards.findIndex(card => card.id === data.playedCardId);
            Player.cards.splice(playedCardIndex, 1);
        }
    });
});

// Handle when a player has played a card to display current played cards and the current player name
Socket.on('card-has-been-played', (data) => {
    console.log('=> card-has-been-played', data);
    Room.playedCards = data.playedCards;
    displayCurrentPlayer(data);
    displayCards(data.playedCards, Global.$playedCards, (cardData, $cardElement) => {
        $cardElement.find('span').text(cardData.playedBy === Player.id ? 'Moi' : cardData.playedBy);
    });
    autoPlay();
});

function openFoldDialog(foldOwner, foldSize, hasToGetCards) {
    // Open fold dialog
    const dialogTitle = foldOwner === Player.id ? '🥇 J\'ai' :  '🏳 ' + foldOwner + ' a';
    Dialog.$foldDisplayDialog.dialog('option', 'title', dialogTitle + ' remporté le pli !');
    Dialog.$foldDisplayDialog.dialog('option', 'width', foldSize * 200);
    // Ask cards for the next turn
    Dialog.$foldDisplayDialog.dialog('option', 'close', () => {
        if (hasToGetCards) {
            getMyCards({
                roomId: Room.id,
                userId: Player.id
            });
        }
    });
    Dialog.$foldDisplayDialog.dialog('option', 'buttons', [{
        text: 'Ok',
        click: () => {
            Dialog.$foldDisplayDialog.dialog('close');
        }
    }]);
    Dialog.$foldDisplayDialog.dialog('open');
}

Socket.on('player-won-current-fold', (data) => {
    console.log('=> player-won-current-fold', data);

    // Next player will be the winner
    displayCurrentPlayer(data);

    // Increment the fold counter value of the fold winner Player
    const $foldCounterValue = Global.$foldCounterContainer.find('#fold-counter-value-' + data.foldWinnerPosition);
    $foldCounterValue.text(data.foldWinnerAmount);   

    // Remove played cards
    Room.playedCards = [];
    displayCards([], Global.$playedCards);

    // Prepare display fold dialog content
    displayCards(data.fold, Global.$foldCards, (cardData, $cardElement) => {
        $cardElement.find('span').text(cardData.playedBy === Player.id ? 'Moi' : cardData.playedBy);
    });

    if (!Player.isBot) {
        // Display who won the fold
        openFoldDialog(data.currentPlayerId, data.fold.length, data.hasToGetCards);
    } else if (data.hasToGetCards) {
        // Player is a bot and it was the last fold of the turn, get new cards
        getMyCards({
            roomId: Room.id,
            userId: Player.id
        });
    } else {
        // Player is a bot and must auto play
        autoPlay();
    }
});

Socket.on('players-scores', (data) => {
    console.log('=> players-scores', data);

    Global.$scoresDisplayContainer.text('');
    const $tableNode = $('<table/>');
    $tableNode.addClass('scores-table');
    const $tableHeader = $('<tr/>');
    $tableHeader.append($('<th/>').text('Joueur'));
    for (let i = 1 ; i <= data.turn ; i++) {
        $tableHeader.append($('<td/>').text('Manche ' + i));
    }
    $tableHeader.append($('<th/>').text('Total'));
    $tableNode.append($tableHeader);

    data.playerScores.forEach((playerScore, index) => {
        const $playerScoreLine = $('<tr/>');

        const $playerHeader = $('<th/>');
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        $playerHeader.append($('<div/>').text(playerScore.id === Player.id ? 'Moi' : playerScore.id));
        $playerHeader.append($('<div/>').text(medal));
        $playerScoreLine.append($playerHeader);

        playerScore.scores.forEach(score => {
            const $scoreCell = $('<td/>');

            const $betAndFolds = $('<div class="bet-and-fold-container"/>');
            const $betValue = $('<div class="bet-value"/>');
            $betValue.append($('<img/>').attr('src', 'static/assets/score_' + score.bet + '.jpg'));
            $betAndFolds.append($betValue);
            const $foldValue = $('<div class="fold-counter-container"/>');
            $foldValue.append($('<img src="static/assets/back.jpg" width="15px"/>'));
            $foldValue.append($('<span class="floating-fold-value"/>').text(score.folds));
            $betAndFolds.append($foldValue);

            $scoreCell.append($betAndFolds);
            $scoreCell.append($('<hr/>'));
            $scoreCell.append($('<div/>').text(score.value + (score.bonus > 0 ? ' + ⭐' + score.bonus : '')));

            $playerScoreLine.append($scoreCell);
        });
        
        $playerScoreLine.append($('<td/>').append($('<strong/>').text(playerScore.totalScore)));
        $tableNode.append($playerScoreLine);
    });

    Global.$scoresDisplayContainer.append($tableNode);

    if (data.endOfGame) {
        Dialog.$scoresDisplayDialog.removeClass('hidden');
        Dialog.openSimpleDialog(Dialog.$scoresDisplayDialog, '🏆 Scores', null, 600);
    }
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

    const foldBetEvent = {
        roomId: Room.id,
        userId: Player.id,
        foldBet: +(event.currentTarget.id.split('-')[1])
    };
    console.log('set-fold-bet =>', foldBetEvent);
    Socket.emit('set-fold-bet', foldBetEvent);
}

function doChoiceTigresse(event, type) {
    if (Player.isCurrentPlayer) {
        console.log('current player choosed to play a Tigresse as', type, event);
        playCard({
            roomId: Room.id,
            playerId: Player.id,
            cardId: 106, // tigresse
            type: type
        });
        Dialog.$choiceCardDialog.dialog('close');
    }
}

$(document).ready(() => {
    // Send a disconnect event when player is leaving the page
    window.addEventListener("beforeunload", () => {
        Socket.emit('player-disconnect', {
            roomId: Room.id,
            userId: Player.id
        });
    });

    // Join the current game
    Socket.emit('join-game', {
        roomId: Room.id,
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
    Global.$foldCounterContainer = Global.$playersBets.find('.fold-counter-container');

    Global.$choiceTigresseEvasion = $('#tigresse-evasion');
    Global.$choiceTigressePirate = $('#tigresse-pirate');

    Global.$helpButton = $('#help-button');
    Global.$botButton = $('#bot-button');
    Global.$scoresButton = $('#scores-button');
    Global.$scoresDisplayContainer = $('#scores-display-container');

    // TODO : only if the game hasn't started !!!!
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⏳ Attente', 'En attente des joueurs...');

    // Handle click on fold count display
    Global.$foldCountDisplays.click((event) => {
        const $currentFoldCountDisplay = $(event.currentTarget);

        // Handle event only when not hidden nor already selected
        if (!$currentFoldCountDisplay.hasClass('hidden') && !$currentFoldCountDisplay.hasClass('selected-bet')) {
            console.log('$foldCountDisplays.click() event', event.currentTarget.id);

            if (!Global.$foldCountDisplays.hasClass('selected-bet')) {
                selectFoldCount(Socket, Global, $currentFoldCountDisplay, event);
            } else {
                Dialog.openTwoChoicesDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Êtes-vous sûr de vouloir changer' +
                  ' de pari ?', 'Oui', () => {
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
                playCard({
                    roomId: Room.id,
                    playerId: Player.id,
                    cardId: cardId
                });
            }
        }
    });

    // Tigresse choice dialog
    Global.$choiceTigresseEvasion.click((event) =>  {
        doChoiceTigresse(event, 'evasion');
    });
    Global.$choiceTigressePirate.click((event) =>  {
        doChoiceTigresse(event, 'pirate');
    });
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

    // Fold dialog
    Dialog.$foldDisplayDialog = $('#fold-display-dialog');
    Dialog.$foldDisplayDialog.dialog({
        modal: true,
        autoOpen: false,
    });
    Dialog.$foldDisplayDialog.removeClass('hidden');

    // Help dialog
    Dialog.$helpDialog = $('#help-display-dialog');
    Dialog.$helpDialog.dialog({
        modal: true,
        autoOpen: false
    });
    Global.$helpButton.click((_) => {
        Dialog.$helpDialog.removeClass('hidden');
        Dialog.openSimpleDialog(Dialog.$helpDialog, 'ℹ️ Aide', null, 600);
    });

    // Bot button
    Global.$botButton.click((_) => {
        Player.isBot = !Player.isBot;
        const buttonTitle = Player.isBot ? 'Désactiver mode Auto' : 'Activer mode Auto';
        Global.$botButton.attr('title', buttonTitle);
        if (Player.isBot) {
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '🦜 Mode Auto Activé', 'Le mode 🦜 Auto est activé pour ce joueur !');
        }
        autoPlay();
    });

    // Scores button
    Dialog.$scoresDisplayDialog = $('#scores-display-dialog');
    Dialog.$scoresDisplayDialog.dialog({
        modal: true,
        autoOpen: false,
    });
    Global.$scoresButton.click((_) => {
        Dialog.$scoresDisplayDialog.removeClass('hidden');
        Dialog.openSimpleDialog(Dialog.$scoresDisplayDialog, '🏆 Scores', null, 600);
    });
});