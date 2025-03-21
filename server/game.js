const Utils = require('./utils.js');

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
        room.gameCards = Utils.shuffle(room.initialCards);
        room.cardsById = {};
        cards.forEach((card) => {
            room.cardsById[card.id] = card;
        });
        room.cardsOfTurn = [];
        room.turn = 9; // TODO : RESET TO 1 AFTER TESTS
        room.currentPlayerIndex = 0;
        room.currentPlayerId = room.users[0].id;

        for (let player of room.users) {
            player.cards = [];
            player.foldBet = null;
            dispatchCards(room.turn, player, room.gameCards);

            // TODO REMOVE THIS TEST
            if (player.id === "Ghomerr") {
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
            }
        }
    }
};

exports.setEventListeners = (io, Socket, room) => {

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        console.log('get-my-cards', data);
        if (data.roomId === room.id) {
            Socket.emit('player-cards',  {
                turn: room.turn,
                cards: room.users
                    .filter(u => u.id === data.userId)
                    .map(u => u.cards)[0].map(c => {
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
                if (playedCard.type === 'choice') {
                    if (data.type === 'pirate') {
                        playedCard.img = 'tigresse_pirate.jpg';
                        playedCard.value = 100;
                        playedCard.bonus = 30;
                        playedCard.type = data.type;
                    } else if (data.type === 'evasion') {
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

                // TODO : test other cases
                if (cardIndex >= 0 && room.cardsOfTurn.length === 0) {
                    // OK Card can be added to the played cards
                    room.cardsOfTurn.push(playedCard);

                    // Remove the card from the player cards
                    player.cards.splice(cardIndex, 1);

                    // Update who played that card
                    playedCard.playedBy = player.id;

                    // Send back the cards of the current player
                    Socket.emit('remove-played-card', {
                        playedCardId: playedCard.id
                    });

                    // Update player turn
                    room.currentPlayerIndex++;

                    // Check if the last player played its card
                    if (currentPlayerIndex === room.users.length) {
                        // TODO : check who wins the fold

                        // TODO : Update winner player folds with the current one

                        // TODO : Display the taken fold and go to the next turn

                        // TODO : Check if it's was the last turn or not to display the score board
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
