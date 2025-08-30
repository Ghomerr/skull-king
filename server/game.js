const Utils = require('./utils.js');

const CARD_TYPE = {
    BLACK: 'black',
    EVASION: 'evasion',
    SKULL_KING: 'skull-king',
    PIRATE: 'pirate',
    MERMAID: 'mermaid',
    CHOICE: 'choice'
};

const MAX_TURN = 10;

function logDebug(...message) {
  if (console && SERVER.isDebugEnabled) {
    console.log.apply(console, message);
  }
}

let SERVER;

exports.initializeRoomGameData = (room, serverInstance) => {
    room.canStartGame = false;
    SERVER = serverInstance;
};

exports.getCanStartGame = (room, minPlayer, maxPlayer) => {
    return room.users.length >= minPlayer && room.users.length <= maxPlayer;
};

exports.initializeGame = (room, cards) => {
    // Room needs to be initialized once only, but the socket is reset at each connection !
    if (!room.initialCards) {
        room.initialCards = cards;
        room.cardsById = {};
        room.firstPlayerIndex = 0;
        const turn = 1, startPlayerIndex = 0;
        initializeNewTurn(room, turn, startPlayerIndex);
    }
};

function resetCurrentRound(room, startPlayerIndex) {
    room.playedCards = [];
    room.currentPlayerIndex = startPlayerIndex;
    room.currentPlayerId = room.users[startPlayerIndex].id;
}

// Compute player score
function computePlayerScore(player, previousTurn) {
    if (previousTurn >= 1) {
        let bonus = 0;
        for (let fold of player.folds) {
            const bestCardOfFold = fold.find(c => c.isBestCard);
            for (let card of fold) {
                if (card.bonus > 0) {
                    // Other cards always give their bonus 
                    // A special card gives bonus only if the bestCard has a higher value
                    if (!card.isSpecial || bestCardOfFold.value > card.value) {
                        bonus += card.bonus;
                    }
                }
            }
        }

        let score = {
            bet: player.foldBet,
            folds: player.folds.length,
            value: -1,
            bonus: bonus,
            total: -1
        };

        // Player succeeded in doing its bet
        if (player.foldBet === player.folds.length) {
            if (player.foldBet === 0) {
                score.value = previousTurn * 10;
            } else {
                score.value = player.folds.length * 20;
            }
        } else {
            if (player.foldBet === 0) {
                score.value = previousTurn * -10;
            } else {
                // Player failed to do its bet and loose points for each missed fold
                score.value = Math.abs(player.folds.length - player.foldBet) * -10;
            }
        }

        // Compute total for the previous turn
        score.total = score.value + score.bonus;
        if (!player.scores) {
            player.scores = [];
        }
        player.scores.push(score);

        // Compute global player score here to be displayed
        let totalScore = 0;
        for (let s of player.scores) {
            totalScore += s.total;
        }
        player.totalScore = totalScore;

        logDebug('Player', player.id, 'scores for the turn', previousTurn, score);
    }
}

function initializeNewTurn(room, turn, startPlayerIndex) {
    room.turn = turn;
    room.gameCards = Utils.deepCopy(Utils.shuffle([...room.initialCards]));
    room.cardsById = {};
    room.gameCards.forEach((card) => {
        room.cardsById[card.id] = card;
    });
    resetCurrentRound(room, startPlayerIndex);
    logDebug('INITIALIZING A NEW TURN OF ROOM', room.id, 'TURN', turn, 'START WITH', room.currentPlayerId, 'PLAYER of index', room.currentPlayerIndex);

    for (let player of room.users) {
        // Compute previous turn players scores
        computePlayerScore(player, room.turn - 1);

        // Init or reset player turn data
        player.cards = [];
        player.folds = [];
        player.foldBet = null;

        // For tests only
        if (player.id === "Test1") {
            dispatchCardsOfList(room.cardsById, room.turn, player, room.gameCards,
              [34]);
        } else if (player.id === "Test2") {
            dispatchCardsOfList(room.cardsById, room.turn, player, room.gameCards,
              [1]);
        } else {
            // DEFAULT CARDS DISPATCH
            dispatchCards(room.turn, player, room.gameCards);
        }
    }
}

function dispatchPlayerScores(io, room, previousTurn, endOfGame) {
    // Dispatch player score
    io.to(room.id).emit('players-scores', {
        endOfGame: endOfGame,
        turn: previousTurn,
        playerScores: room.users
            .map(player => {
                return {
                    id: player.id,
                    totalScore: player.totalScore,
                    scores: player.scores
                };
            })
            .sort((p1, p2) => p2.totalScore - p1.totalScore)
    });
}

exports.setEventListeners = (io, Socket, room) => {

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        if (data.roomId === room.id) {
            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {
                const playerCards =  
                player.cards.map(c => {
                    return {
                        id: c.id,
                        type: c.type,
                        img: c.img,
                        value: c.value
                    };
                });
                logDebug('player-cards =>', playerCards);
                Socket.emit('player-cards',  {
                    turn: room.turn,
                    currentPlayerId: room.currentPlayerId,
                    cards: playerCards
                });
            } else {
                console.error('[get-my-cards] player not found', data);
            }
        }
    });

    // Handle when a player set its fold bet
    Socket.on('set-fold-bet', (data) => {
        if (data.roomId === room.id) {
            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {

                // Fold bet check
                const roundedBet = Math.round(data.foldBet);
                if (data.foldBet < 0 || data.foldBet > room.turn || roundedBet !== data.foldBet) {
                    Socket.emit('player-error',  {
                        type: 'wrong-fold-bet',
                        data: data.foldBet
                    });
                    return;
                }

                logDebug('=> set-fold-bet', data);
                player.foldBet = roundedBet;

                const totalNumberOfPlayers = room.users.length;
                const numberOfReadyPlayers = room.users.filter(u => u.foldBet !== null).length;

                // If all players have chosen their bet, display the turn start !
                if (totalNumberOfPlayers === numberOfReadyPlayers) {
                    io.to(room.id).emit('yo-ho-ho', {
                        turn: room.turn,
                        bets: room.users.map(player => {
                            return {
                                userId: player.id,
                                foldBet: player.foldBet
                            };
                        }),
                        currentPlayerId: room.currentPlayerId
                    });
                } else {
                    // Notifies players of how many players are ready
                    io.to(room.id).emit('waiting-players-bets', {
                        numberOfReadyPlayers: numberOfReadyPlayers,
                        totalNumberOfPlayers: totalNumberOfPlayers
                    });
                }

            } else {
                console.error('[set-fold-bet] player not found', data);
            }           
        }
    });

    // Handle when a player plays a card
    Socket.on('play-a-card', (data) => {
        if (room.id === data.roomId) {
            const player = Utils.findUserByIdAndToken(room.users, data.playerId, data.token);
            if (player && player.id === room.currentPlayerId) {
                logDebug('=> play-a-card', data);

                const playedCard = room.cardsById[data.cardId];
                if (playedCard.type === CARD_TYPE.CHOICE) {
                    if (data.type === CARD_TYPE.PIRATE) {
                        playedCard.img = 'tigresse_pirate.jpg';
                        playedCard.value = 100;
                        playedCard.bonus = 30;
                        playedCard.type = data.type;
                    } else if (data.type === CARD_TYPE.EVASION) {
                        playedCard.img = 'tigresse_evasion.jpg';
                        playedCard.value = 0;
                        playedCard.bonus = 0;
                        playedCard.type = data.type;
                    } else {
                        // TODO : wrong choice
                        logDebug('wrong choice', data.type);
                    }
                }

                
                const cardIndex = Utils.findIndexById(player.cards, playedCard.id);

                logDebug(player.id, 'played the following card:', playedCard);

                // Search the requested type of cards for the current turn
                let typeOfCards = null;
                let playerHasRequestedTypeOfCards = false;
                if (room.playedCards.length > 0) {
                    // Examples : 
                    // * 0=purple -> purple
                    // * 0=evasion, 1=purple -> purple
                    // * 0=pirate, 1=purple -> no type
                    // * 0=evasion, 1=pirate, 2=purple -> no type
                    const firstColorCard = room.playedCards.find(c => !c.isSpecial);
                    if (firstColorCard) {
                        let cardOfTurn = null;
                        let hasBreakingTypeCard = false;
                        for (let i = 0 ; i < room.playedCards.length ; i++) {
                            cardOfTurn = room.playedCards[i];
                            if (cardOfTurn.id === firstColorCard.id) {
                                break;
                            }
                            // A Special card in first position makes no type of card for this turn
                            if (cardOfTurn.isSpecial && cardOfTurn.type !== CARD_TYPE.EVASION) {
                                hasBreakingTypeCard = true;
                                break;
                            }
                        }

                        if (!hasBreakingTypeCard) {
                            typeOfCards = firstColorCard.type;
                            // Search if the player has the requested type of cards
                            playerHasRequestedTypeOfCards = player.cards.some(c => c.type === typeOfCards);
                        }
                    }
                }
                
                // Card has been found (technical, should never happen) AND
                // Check if it's not the last turn (should never happen)
                if (cardIndex >= 0 && room.playedCards.length < room.users.length &&           
                        // Check if the player can play its card : played card is special 
                        // OR player has no card of the played type 
                        // OR played card is of the right card type for this turn
                        (playedCard.isSpecial || !playerHasRequestedTypeOfCards || playedCard.type === typeOfCards)) {

                    // OK Card can be added to the played cards
                    room.playedCards.push(playedCard);

                    // Remove the card from the player cards
                    player.cards.splice(cardIndex, 1);

                    // Update who played that card
                    playedCard.playedBy = player.id;

                    // Notify the current player that its card has been removed
                    Socket.emit('remove-played-card', {
                        playedCardId: playedCard.id
                    });

                    // Update current player turn
                    logDebug('before updating next player', room.currentPlayerId, room.currentPlayerIndex);
                    room.currentPlayerIndex++;
                    if (room.currentPlayerIndex === room.users.length) {
                        room.currentPlayerIndex = 0;
                    }
                    logDebug('new current player is', room.currentPlayerIndex, room.users[room.currentPlayerIndex].id);

                    // Check if the last player played its card, when there is the same amount of cards played than users
                    if (room.playedCards.length === room.users.length) {
                        // Check who wins the fold
                        let bestPlayedCard = null;
                        let hasMermaid = false;
                        let firstMermaid = null;
                        room.playedCards.forEach((card) => {
                            // Best card is: first and only card or a card of high value AND
                            if (!bestPlayedCard || bestPlayedCard.value < card.value &&
                                // it's a special card, OR a type of cards doesn't exist, OR type exists and its the
                                // same type OR the type of card is numerical card and the played card is a black card
                                (card.isSpecial || !typeOfCards || card.type === typeOfCards 
                                    || bestPlayedCard.value < 20 && card.type === CARD_TYPE.BLACK)) {
                                bestPlayedCard = card;
                            }
                            if (!hasMermaid && card.type === CARD_TYPE.MERMAID) {
                                hasMermaid = true;
                                firstMermaid = card;
                            }
                        });

                        // If a mermaid has been played with the Skull king, the first one wins !
                        if (bestPlayedCard.type === CARD_TYPE.SKULL_KING && hasMermaid) {
                            bestPlayedCard = firstMermaid;
                            bestPlayedCard.value = 1000;
                            // Pirates won't have bonuses
                            room.playedCards.filter(c => c.type === CARD_TYPE.PIRATE).forEach(c => c.bonus = 0);
                        }

                        logDebug('best card of round is', bestPlayedCard, 'played by', bestPlayedCard.playedBy);

                        // Update winner player folds with the current one
                        const foldWinner = Utils.findElementById(room.users, bestPlayedCard.playedBy);
                        bestPlayedCard.isBestCard = true;
                        const playedCards = [...room.playedCards];
                        foldWinner.folds.push(playedCards);

                        let isLastCardPlayed = player.cards.length === 0;
                        let isLastTurn = false;

                        // Prepare the next turn when the last card has been played
                        const startPlayerIndex = Utils.findIndexById(room.users, foldWinner.id);
                        const foldWinnerAmount = foldWinner.folds.length;
                        if (isLastCardPlayed) {
                            logDebug('last card of the turn', room.turn, 'has been played by', foldWinner.id, 'at index', startPlayerIndex);
                                                       
                            if (room.turn < MAX_TURN) {
                                // Next first player
                                const previousTurn = room.turn;
                                logDebug('Before a new turn, last first player index', room.firstPlayerIndex, 'was', room.users[room.firstPlayerIndex].id, 'at turn', previousTurn);                                
                                room.firstPlayerIndex++;
                                if (room.firstPlayerIndex === room.users.length) {
                                    room.firstPlayerIndex = 0;
                                }
                                initializeNewTurn(room, previousTurn + 1, room.firstPlayerIndex);
                                dispatchPlayerScores(io, room, previousTurn, false);

                            } else {
                                isLastTurn = true;
                                logDebug('END OF THE GAME ! Turn=', room.turn);
                                // TODO : display a proper end state (hide round, current player, bets)

                                // Compute final scores for each players
                                room.users.forEach(player => {
                                    computePlayerScore(player, MAX_TURN);
                                })
                                dispatchPlayerScores(io, room, MAX_TURN, true);
                            }
                        } else {
                            resetCurrentRound(room, startPlayerIndex);
                            logDebug('new round of turn', room.turn, 'starting with winning player', room.currentPlayerId, 'at index', room.currentPlayerIndex);
                        }

                        // Display the taken fold and go to the next card
                        const playerWonCurrentFoldEvent = {
                            hasToGetCards: !isLastTurn && isLastCardPlayed,
                            currentPlayerId: foldWinner.id,
                            foldWinnerPosition: startPlayerIndex + 1, // +1 to handle the position on client side
                            foldWinnerAmount: foldWinnerAmount,
                            fold: playedCards.map(c => {
                                return {
                                    img: c.img,
                                    playedBy: c.playedBy
                                }
                            })
                        };
                        logDebug('player-won-current-fold =>', playerWonCurrentFoldEvent);
                        io.to(room.id).emit('player-won-current-fold', playerWonCurrentFoldEvent); 
                                              
                    } else {
                        // Next player to play
                        room.currentPlayerId = room.users[room.currentPlayerIndex].id;
                        logDebug('A card has been played. Next player to play is', room.currentPlayerId);

                        // Notify players with the played cards
                        const playedCardEvent = {
                            currentPlayerId: room.currentPlayerId,
                            playedCards: room.playedCards.map(c => { 
                                return {
                                    id: c.id,
                                    type: c.type,
                                    img: c.img,
                                    playedBy: c.playedBy
                                }; 
                            })
                        };
                        logDebug('card-has-been-played =>', playedCardEvent);
                        io.to(room.id).emit('card-has-been-played', playedCardEvent);
                    }
                } else {
                    // Notify the player that its cards cannot be played
                    Socket.emit('player-error',  {
                        type: 'cannot-play-this-card',
                        data: playedCard.name
                    });
                }
            } else {
                // No player found or not the current player to play
                Socket.emit('player-error',  {
                    type: 'wrong-player'
                });
            }
        }
    });
};

function dispatchCardsOfList(cardsById, turn, player, gameCards, list) {
    for (let i = 0; i < turn; i++) {
        const cardToAdd = i < list.length ? cardsById[list[i]] : gameCards.pop();
        const cardIndex = Utils.findIndexById(gameCards, cardToAdd.id);
        gameCards.slice(cardIndex, 1);
        player.cards.push(cardToAdd);
    }
    sortPlayerCards(player.cards);
}

function dispatchCards(turn, player, gameCards) {
    for (let i = 1; i <= turn; i++) {
        player.cards.push(gameCards.pop());
    }
    sortPlayerCards(player.cards);
}

function sortPlayerCards(playerCards) {
    playerCards.sort((c1, c2) => {
        const typeCompare = c1.type.localeCompare(c2.type);
        if (typeCompare === 0) {
            return c1.value - c2.value;
        }
        return typeCompare;
    });
}