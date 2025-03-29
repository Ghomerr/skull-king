const Utils = require('./utils.js');

const CARD_TYPE = {
    EVASION: 'evasion',
    PIRATE: 'pirate',
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
        const turn = 2, startPlayerIndex = 0;
        initializeNewTurn(room, turn, startPlayerIndex);
    }
};

function initializeNewTurn(room, turn, startPlayerIndex) {
    room.turn = turn;
    room.gameCards = Utils.shuffle([...room.initialCards]);
    room.cardsOfTurn = [];
    room.currentPlayerIndex = startPlayerIndex;
    room.currentPlayerId = room.users[startPlayerIndex].id;
    console.log('INITIALIZING A NEW TURN OF ROOM', room.id, 'TURN', turn, 'START WITH', room.currentPlayerId, 'PLAYER');

    for (let player of room.users) {
        player.cards = [];
        player.folds = [];
        player.foldBet = null;
        dispatchCards(room.turn, player, room.gameCards);

        // TODO REMOVE THIS TEST
        /*if (player.id === "Ghomerr") {
            // ADD TIGRESSE HERE !!!
            player.cards.push({
                "id": 106,
                "name": "FAKE Tigresse",
                "type": "choice",
                "img": "tigresse_choice.jpg",
                "value": 100,
                "bonus": 30,
                "isSpecial": true
            });
        }//*/
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
                if (room.cardsOfTurn.length > 0) {
                    // Examples : 
                    // * 0=purple -> purple
                    // * 0=evasion, 1=purple -> purple
                    // * 0=pirate, 1=purple -> no type
                    // * 0=evasion, 1=pirate, 2=purple -> no type
                    const firstColorCard = room.cardsOfTurn.find(c => !c.isSpecial);
                    if (firstColorCard) {
                        let cardOfTurn = null;
                        let hasBreakingTypeCard = false;
                        for (let i = 0 ; i < room.cardsOfTurn.length ; i++) {
                            cardOfTurn = room.cardsOfTurn[i];
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
                if (cardIndex >= 0 && room.cardsOfTurn.length < room.users.length &&           
                        // Check if the player can play its card
                        (playedCard.isSpecial || !playerHasRequestedTypeOfCards || playedCard.type === typeOfCards)) {

                    // OK Card can be added to the played cards
                    room.cardsOfTurn.push(playedCard);

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
                    if (room.cardsOfTurn.length === room.users.length) {
                        console.log('last card of the turn', room.turn, 'has been played');
                        // Check who wins the fold
                        let bestCardOfTurn = null;
                        room.cardsOfTurn.forEach((card) => {
                            // Best card is : first and only card or a card of high value AND
                            if (!bestCardOfTurn || bestCardOfTurn.value < card.value && 
                                // a type of cards doesn't exist OR it's a special card OR type exists and its the same type
                                (!typeOfCards || card.isSpecial || card.type === typeOfCards)) {
                                bestCardOfTurn = card;
                            }
                        });
                        console.log('best card of turn is', bestCardOfTurn, 'played by', bestCardOfTurn.playedBy);

                        // Update winner player folds with the current one
                        const winnerOfTurn = Utils.findElementById(room.users, bestCardOfTurn.playedBy);
                        winnerOfTurn.folds.push(...room.cardsOfTurn);
                        const cardsOfTurn = [...room.cardsOfTurn];
                      
                        // Prepare next turn
                        let isLastTurn = false;
                        if (room.turn < 10) {
                            const startPlayerIndex = Utils.findIndexById(room.users, winnerOfTurn.id);
                            initializeNewTurn(room, room.turn + 1, startPlayerIndex);

                        } else {
                            isLastTurn = true;
                            console.log('END OF THE GAME !');

                            // TODO : display the board
                        }

                        // Display the taken fold and go to the next turn
                        io.to(room.id).emit('player-won-current-turn', {
                            isLastTurn: isLastTurn,
                            currentPlayerId: winnerOfTurn.id,
                            fold: cardsOfTurn.map(c => {
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
                            playedCards: room.cardsOfTurn.map(c => { 
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
