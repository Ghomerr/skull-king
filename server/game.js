const Utils = require('./utils.js');

const CARD_TYPE = {
    EVASION: 'evasion',
    SKULL_KING: 'skull-king',
    PIRATE: 'pirate',
    MERMAID: 'mermaid',
    CHOICE: 'choice'
};

exports.initializeRoomGameData = (room) => {
    room.canStartGame = false;
};

exports.getCanStartGame = (room, minPlayer, maxPlayer) => {
    return room.users.length >= minPlayer && room.users.length <= maxPlayer;
};

exports.initializeGame = (room, cards) => {
    // Room needs to be initialized once only, but the socket is reset at each connection !
    if (!room.initialCards) {
        room.initialCards = cards;
        room.cardsById = {};
        cards.forEach((card) => {
            room.cardsById[card.id] = card;
        });
        const turn = 1, startPlayerIndex = 0;
        initializeNewTurn(room, turn, startPlayerIndex);
    }
};

function resetCurrentRound(room, startPlayerIndex) {
    room.playedCards = [];
    room.currentPlayerIndex = startPlayerIndex;
    room.currentPlayerId = room.users[startPlayerIndex].id;
}

function initializeNewTurn(room, turn, startPlayerIndex) {
    room.turn = turn;
    room.gameCards = Utils.shuffle([...room.initialCards]);
    resetCurrentRound(room, startPlayerIndex);
    console.log('INITIALIZING A NEW TURN OF ROOM', room.id, 'TURN', turn, 'START WITH', room.currentPlayerId, 'PLAYER');

    for (let player of room.users) {
        player.cards = [];
        player.folds = [];
        player.foldBet = null;

        // For tests only
        if (player.id === "Test1") {
            dispatchCardsOfList(room.cardsById, room.turn, player, room.gameCards,
              [200, 105, 104, 92]);
        } else if (player.id === "Test2") {
            dispatchCardsOfList(room.cardsById, room.turn, player, room.gameCards,
              [103, 102, 101, 91]);
        } else {
            // DEFAULT CARDS DISPATCH
            dispatchCards(room.turn, player, room.gameCards);
        }
    }
}

exports.setEventListeners = (io, Socket, room) => {

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        if (data.roomId === room.id) {
            const player = Utils.findElementById(room.users, data.userId);
            // TODO : WHY ONLY ONE CARD AT TURN 2 ???
            console.log('get-my-cards', data, player.cards.length, 'cards');
            Socket.emit('player-cards',  {
                turn: room.turn,
                cards: player.cards.map(c => {
                        return {
                            id: c.id,
                            type: c.type,
                            img: c.img
                        };
                    })
            });
        }
    });

    // Handle when a player set its fold bet
    Socket.on('set-fold-bet', (data) => {
        if (data.roomId === room.id) {
            const player = Utils.findElementById(room.users, data.userId);
            if (player) {
                console.log('set-fold-bet', data);
                player.foldBet = data.foldBet;
            }

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
        }
    });

    // Handle when a player plays a card
    Socket.on('play-a-card', (data) => {
        if (room.id === data.roomId) {
            if (data.playerId === room.currentPlayerId) {
                console.log('play-a-card', data);

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
                    }
                }

                const player = Utils.findElementById(room.users, room.currentPlayerId);
                const cardIndex = Utils.findIndexById(player.cards, playedCard.id);

                console.log(player.id, 'played the following card:', playedCard);

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
                        // Check if the player can play its card
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
                    room.currentPlayerIndex++;
                    if (room.currentPlayerIndex === room.users.length) {
                        room.currentPlayerIndex = 0;
                    }

                    // Check if the last player played its card, when there is the same amount of cards played than users
                    if (room.playedCards.length === room.users.length) {
                        // Check who wins the fold
                        let bestPlayedCard = null;
                        let hasMermaid = false;
                        let firstMermaid = null;
                        room.playedCards.forEach((card) => {
                            // Best card is : first and only card or a card of high value AND
                            if (!bestPlayedCard || bestPlayedCard.value < card.value &&
                                // a type of cards doesn't exist OR it's a special card OR type exists and its the same type
                                (!typeOfCards || card.isSpecial || card.type === typeOfCards)) {
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
                        }

                        console.log('best card of round is', bestPlayedCard, 'played by', bestPlayedCard.playedBy);

                        // Update winner player folds with the current one
                        const foldWinner = Utils.findElementById(room.users, bestPlayedCard.playedBy);
                        const playedCards = [...room.playedCards];
                        foldWinner.folds.push(playedCards);

                        let isLastCardPlayed = player.cards.length === 0;
                        let isLastTurn = false;

                        // Prepare next turn when the last card has been played
                        const startPlayerIndex = Utils.findIndexById(room.users, foldWinner.id);
                        if (isLastCardPlayed) {
                            console.log('last card of the turn', room.turn, 'has been played');
                            if (room.turn < 10) {
                                initializeNewTurn(room, room.turn + 1, startPlayerIndex);

                            } else {
                                isLastTurn = true;
                                console.log('END OF THE GAME !');
                                // TODO : display the board
                            }
                        } else {
                            resetCurrentRound(room, startPlayerIndex);
                            console.log('new round of turn', room.turn, 'starting with player', room.currentPlayerId);
                        }

                        // Display the taken fold and go to the next card
                        io.to(room.id).emit('player-won-current-fold', {
                            hasToGetCards: !isLastTurn && isLastCardPlayed,
                            currentPlayerId: foldWinner.id,
                            fold: playedCards.map(c => {
                                return {
                                    img: c.img,
                                    playedBy: c.playedBy
                                }
                            })
                        }); 
                                              
                    } else {
                        // Next player to play
                        room.currentPlayerId = room.users[room.currentPlayerIndex].id;

                        // Notify players with the played cards
                        io.to(room.id).emit('card-has-been-played', {
                            currentPlayerId: room.currentPlayerId,
                            playedCards: room.playedCards.map(c => { 
                                return {
                                    id: c.id,
                                    img: c.img,
                                    playedBy: c.playedBy
                                }; 
                            })
                        });
                    }
                } else {
                    // Notify the player that its cards cannot be played
                    Socket.emit('player-error',  {
                        type: 'cannot-play-this-card',
                        data: playedCard.name
                    });
                }
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
