const Socket = io();
const Global = {
  isDebugEnabled: false,
};

const urlParams = new URLSearchParams(window.location.search);
const Room = {
    id: urlParams.get('formRoomId'),
    playedCards: []
};
const Player = {
    id: urlParams.get('formUserId'),
    token: urlParams.get('formToken'),
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

// Handle the room state when a player joined a room again
Socket.on('connected-player-room-state', (data) => {
    console.log('=> connected-player-room-state', data);
    displayPlayerNames(data);
    displayPlayerCards({
      turn: data.turn,
      currentPlayerId: data.currentPlayerId,
      cards: data.cards
    });

    if (data.isWaitingPlayersBets) {
      if (data.hasFoldBet && !Global.$foldCountDisplays.hasClass('hidden')) {
        const $currentFoldCountDisplay = Global.$foldCountDisplays.filter(`[id=fold-${data.foldBet}]`);
        selectFoldCount(Socket, Global, $currentFoldCountDisplay, data.foldBet);
      }
    } else {
      displayPlayersBets(data);
    }

    displayPlayedCards(data);

    if (data.playerScores) {
      displayScores(data.playerScores);
    }
});

function displayPlayerNames(data) {
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
        $playerBet.attr('player-id', playerId);
    });
    Global.$playersBetsContainer.removeClass('hidden');
}

// All players are ready, the game can be started !
Socket.on('all-players-ready-to-play', (data) => {
    console.log('=> START all-players-ready-to-play', data);

    displayPlayerNames(data);

    // Request cards
    getMyCards({
        roomId: Room.id,
        userId: Player.id,
        token: Player.token
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
                        token: Player.token,
                        cardId: Player.cards[0].id
                    });
                } else {
                    // Play the first card of the played type (handle the tigresse choice)
                    const cardToBePlayed = Player.cards[indexOfPlayedCardType];
                    playCard({
                        roomId: Room.id,
                        playerId: Player.id,
                        token: Player.token,
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

function displayPlayerCards(data) {
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
}

// Receiving its cards
Socket.on('player-cards', (data) => {
    console.log('=> player-cards', data);
    displayPlayerCards(data);
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
    Global.$playersBets.removeClass('current-player');
    Global.$playersBets.filter(`[player-id="${data.currentPlayerId}"]`).addClass('current-player');
}

function displayPlayersBets(data) {
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
}

// Handle when all players have chosen their bet
Socket.on('yo-ho-ho', (data) => {
    console.log('=> yo-ho-ho', data);

  // Display players bets
  displayPlayersBets(data);

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

function displayPlayedCards(data) {
    Room.playedCards = data.playedCards;
    displayCurrentPlayer(data);
    displayCards(data.playedCards, Global.$playedCards, (cardData, $cardElement) => {
      $cardElement.find('span').text(cardData.playedBy === Player.id ? 'Moi' : cardData.playedBy);
    });
}

// Handle when a player has played a card to display current played cards and the current player name
Socket.on('card-has-been-played', (data) => {
    console.log('=> card-has-been-played', data);
    displayPlayedCards(data);
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
                userId: Player.id,
                token: Player.token
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
            userId: Player.id,
            token: Player.token
        });
    } else {
        // Player is a bot and must auto play
        autoPlay();
    }
});

function displayScores(data) {
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
}

Socket.on('players-scores', (data) => {
    console.log('=> players-scores', data);
    displayScores(data);
});

// Handle event when a player left the room during the game
Socket.on('player-left-the-room', (data) => {
    console.log('=> player-left-the-room', data);

    Global.$missingPlayersAmount.text(data.missingPlayers);
    const $playerBetElement = Global.$playersBets.filter(`[player-id="${data.playerId}"]`);
    $playerBetElement.addClass('missing-player');

    Dialog.$missingPlayersDialog.dialog('open');
});

// Handle event when a player join the game again
Socket.on('in-game-player-connected', (data) => {
    // TODO : handle this event properly
    console.log('=> in-game-player-connected', data);

    const $playerBetElement = Global.$playersBets.filter(`[player-id="${data.playerId}"]`);
    $playerBetElement.removeClass('missing-player');
    Global.$missingPlayersAmount.text(data.missingPlayers);

    if (data.missingPlayers === 0) {
        Dialog.$missingPlayersDialog.dialog('close');
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
        case 'wrong-player':
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Vous ne pouvez pas jouer maintenant !');
            break;
        case 'wrong-fold-bet':
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Vous ne pouvez pas faire ce pari: ' + error.data + ' !');
            break;
        default:
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur!', 'Erreur inconnue: ' + error.type + ' ' + error.data);
    }
});

// Handling emoji display event
Socket.on('player-display-emoji', (data) => {
    console.log('=> player-display-emoji', data);
    const $playerBetElement = Global.$playersBets.filter(`[player-id="${data.playerId}"]`);
    const $emojiDisplayer = $playerBetElement.find('.emoji-displayer');
    const $emojiDisplay = $emojiDisplayer.find('.emoji-display');
    const $emojiArrow = $emojiDisplayer.find('.emoji-arrow');

    // Display emoji
    $emojiDisplay.find('span').text(String.fromCodePoint(data.emojiCode));

    $emojiDisplayer.css({
        visibility: 'hidden',
    });
    $emojiDisplayer.removeClass('hidden');

    const displayerWidth = $emojiDisplay.outerWidth();
    const displayerHeight = $emojiDisplay.outerHeight();
    const playerBetWidth = $playerBetElement.outerWidth();
    const playerBetHeight = $playerBetElement.outerHeight();
    const arrowWidth = $emojiArrow.outerWidth();
    const arrowHeight = $emojiArrow.outerHeight();

    // Move the displayer at the right position
    const top = -displayerHeight - playerBetHeight;
    const left = Math.round((playerBetWidth / 2) - (displayerWidth / 2));
    $emojiDisplay.css({ 
        top: top + 'px', 
        left: left + 'px',
        visibility: 'visible'
     });

    const arrowTop = - playerBetHeight - 2;
    const arrowLeft = Math.round((playerBetWidth / 2) - (arrowWidth / 2));
    $emojiArrow.css({
        top: arrowTop + 'px',
        left: arrowLeft,
        visibility: 'visible'
    });

    // Temporary hide the emoji (TODO : do it from the server !)
    setTimeout(() => {
        $emojiDisplayer.addClass('hidden');
    }, 5000);
});

Socket.on('join-game-error', () => {
    // Reload the main page
    window.location.href = '/';
});

// Handle debug changed
Socket.on('debug-changed', (data) => {
    console.log('debug-changed', data);
    if (data.isDebugEnabled) {
        Global.$debugButton.addClass('active');
        // Beta features to enable
        // Global.$emojiButton.removeClass('hidden');
    } else {
        Global.$debugButton.removeClass('active');
        // Beta features to disable
        // Global.$emojiButton.addClass('hidden');
    }
  Global.isDebugEnabled = data.isDebugEnabled;
});

function selectFoldCount(Socket, Global, $currentFoldCountDisplay, foldBet) {
    Global.$foldCountPicker.addClass('bet-selected');
    Global.$foldCountDisplays.removeClass('selected-bet');
    $currentFoldCountDisplay.addClass('selected-bet');

    const foldBetEvent = {
        roomId: Room.id,
        userId: Player.id,
        token: Player.token,
        foldBet: foldBet
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
            token: Player.token,
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
            userId: Player.id,
            token: Player.token
        });
    });

    // Join the current game
    Socket.emit('join-game', {
        roomId: Room.id,
        userId: Player.id,
        token: Player.token
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

    Global.$missingPlayersAmount = $('#missing-players-amount');

    Global.$emojiButton = $('#emoji-button');
    Global.$emojisContainer = $('#emojis-container');
    Global.$debugButton = $('#debug-button');

    // TODO : only if the game hasn't started !!!!
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⏳ Attente', 'En attente des joueurs...');

    // Handle click on fold count display
    Global.$foldCountDisplays.click((event) => {
        const $currentFoldCountDisplay = $(event.currentTarget);

        // Handle event only when not hidden nor already selected
        if (!$currentFoldCountDisplay.hasClass('hidden') && !$currentFoldCountDisplay.hasClass('selected-bet')) {
            console.log('$foldCountDisplays.click() event', event.currentTarget.id);

            const foldBet = +(event.currentTarget.id.split('-')[1]);
            if (!Global.$foldCountDisplays.hasClass('selected-bet')) {
                selectFoldCount(Socket, Global, $currentFoldCountDisplay, foldBet);
            } else {
                Dialog.openTwoChoicesDialog(Dialog.$simpleDialog, '⚠️ Attention', 'Êtes-vous sûr de vouloir changer' +
                  ' de pari ?', 'Oui', () => {
                    selectFoldCount(Socket, Global, $currentFoldCountDisplay, foldBet);
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
                    token: Player.token,
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

    // Missing players dialog
    Dialog.$missingPlayersDialog = $('#missing-players-dialog');
    Dialog.$missingPlayersDialog.dialog({
        modal: true,
        autoOpen: false,
        closeOnEscape: false,
        buttons: {},
        open: () => {
            $('.ui-dialog[aria-describedby=missing-players-dialog] .ui-dialog-titlebar-close').hide();
        }
    });
    Dialog.$missingPlayersDialog.removeClass('hidden');

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

    // Debug button 
    Global.$debugButton.click(() => {
        Socket.emit('debug-toggle');
    });

    // Emojis
    Global.$emojiButton.click((event) => {
      if (Global.$emojisContainer.hasClass('hidden')) {
        const $anchor = $(event.currentTarget);           // event trigger element
        const off = $anchor.offset();                     // position in document
        const top = Math.round(off.top + $anchor.outerHeight());
        let left = Math.round(off.left) + $anchor.outerWidth() / 2;

        const prevVisibility = Global.$emojisContainer.css('visibility');

        Global.$emojisContainer.css({ visibility: 'hidden' });
        const panelWidth = Global.$emojisContainer.outerWidth();
        left -= panelWidth / 2; // to display the panel in the middle of the button
        const viewportRight = $(window).scrollLeft() + $(window).width();

        // Option: avoid the element to overlap on right
        if (left + panelWidth > viewportRight) {
          left = Math.max(0, viewportRight - panelWidth - 8);
        }

        // Apply final position and visibility
        Global.$emojisContainer.css({
          position: 'absolute',
          top: top,
          left: left,
          visibility: prevVisibility
        });

        Global.$emojisContainer.removeClass('hidden');
      } else {
        Global.$emojisContainer.addClass('hidden');
      }
    });
    
    function drawEmoji(codePoint) {
        const emoji = String.fromCodePoint(codePoint);
        Global.$emojisContainer.append($('<span/>').text(emoji).attr('code', codePoint));
    }

    // Emoji Faces
    for (let codePoint = 0x1F600; codePoint <= 0x1F64F; codePoint++) {
        drawEmoji(codePoint);
    }
    // Emoji Hands and other body parts
    for (let codePoint = 0x1F440; codePoint <= 0x1F44F; codePoint++) {
        drawEmoji(codePoint); 
    }
    // Emoji Emotes
    for (let codePoint = 0x1F4A0; codePoint <= 0x1F4AF; codePoint++) {
        drawEmoji(codePoint); 
    }
    // Emoji other faces and hands
    for (let codePoint = 0x1F910; codePoint <= 0x1F92F; codePoint++) {
        drawEmoji(codePoint); 
    }

    // Send emoji
    Global.$emojisContainer.find('span').click((event) => {
        const $emoji = $(event.currentTarget);
        const codePoint = $emoji.attr('code');
        Socket.emit('send-emoji', {
            roomId: Room.id,
            playerId: Player.id,
            token: Player.token,
            emojiCode: codePoint
        });
        Global.$emojisContainer.addClass('hidden');
    });
});