const Utils = require('./utils.js');
const GameRobots = require('./game-robots.js');
const Analytics = require('./analytics.js');

const CARD_TYPE = {
    BLACK: 'black',
    EVASION: 'evasion',
    SKULL_KING: 'skull-king',
    PIRATE: 'pirate',
    MERMAID: 'mermaid',
    CHOICE: 'choice'
};

const MAX_TURN = 10;
const ROBOT_BET_DELAY_MS = 1000;
const ROBOT_PLAY_DELAY_MS = 1500;

function logDebug(...message) {
    if (console && SERVER && SERVER.isDebugEnabled) {
        console.log.apply(console, message);
    }
}

let SERVER;
let IO;

// Pending robot timers per room (kept out of the room object so it stays serializable)
const ROBOT_TIMERS = new Map();

// Must be called once at server startup, before any game starts
exports.init = (io, serverInstance) => {
    IO = io;
    SERVER = serverInstance;
};

exports.initializeRoomGameData = (room, serverInstance) => {
    room.canStartGame = false;
    SERVER = serverInstance;
};

// A destroyed room must not be touched anymore by pending robot timers
exports.disposeRoom = (room) => {
    room.isClosed = true;
    clearRobotTimers(room);
};

exports.isGameOver = (room) => {
    return !!room.initialCards && !room.isPlaying;
};

// Safety net used when a player (re)joins: restarts robots if nothing is pending
exports.wakeUpRobots = (room) => {
    checkAndTriggerRobotActions(room);
};

exports.getCanStartGame = (room, minPlayer, maxPlayer) => {
    return room.users.length >= minPlayer && room.users.length <= maxPlayer;
};

exports.initializeGame = (room, cards) => {
    // Room needs to be initialized once only, but the socket is reset at each connection !
    if (!room.initialCards) {
        room.isPlaying = true;
        room.initialCards = cards;
        room.cardsById = {};
        room.firstPlayerIndex = 0;
        const turn = 1, startPlayerIndex = 0;
        initializeNewTurn(room, turn, startPlayerIndex);
    }
};

exports.refreshConnectedPlayerRoomState = (Socket, room, player) => {
    const hasFoldBet = player.foldBet !== null;
    // Allow the player to rebuild the current room state
    Socket.emit('connected-player-room-state', {
        // Common events data
        turn: room.turn,
        currentPlayerId: room.currentPlayerId,
        // Display player names
        playersIds: room.users.map(user => {
            return { id: user.id, isRobot: user.isRobot };
        }),
        // Display missing players (nobody has to wait for them once the game is over)
        missingPlayers: room.isPlaying ? room.missingPlayers || 0 : 0,
        missingNames: room.isPlaying ? room.users.filter(u => !u.isRobot && !u.isConnected).map(u => u.id) : [],
        // Display players bets
        isWaitingPlayersBets: room.isWaitingPlayersBets,
        hasFoldBet: hasFoldBet,
        foldBet: player.foldBet,
        bets: getPlayersBets(room),
        numberOfReadyPlayers: room.numberOfReadyPlayers,
        totalNumberOfPlayers: room.users.length,
        // Display players cards
        cards: getPlayerCards(player, room),
        playedCards: getPlayedCardsEvent(room),
        // Display player scores
        endOfGame: !room.isPlaying,
        gameWinner: room.gameWinner,
        playerScores: room.turn > 1 ?
            getPlayerScoresEvent(room, room.isPlaying ? room.turn - 1 : room.turn, room.turn >= MAX_TURN) :
            null
    });
}

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
    // Robot actions of the previous turn are obsolete
    clearRobotTimers(room);
    room.turn = turn;
    room.gameCards = Utils.deepCopy(Utils.shuffle([...room.initialCards]));
    room.cardsById = {};
    room.isWaitingPlayersBets = true;
    room.gameCards.forEach((card) => {
        room.cardsById[card.id] = card;
    });
    room.numberOfReadyPlayers = 0;
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

    // Check if robots can start playing (betting)
    checkAndTriggerRobotActions(room);
}

function handleSetFoldBet(io, room, player, foldBet, playerSocket) {
    // Bets are only accepted during the bets phase (late or duplicated bets are ignored)
    if (!room.isPlaying || !room.isWaitingPlayersBets) {
        return;
    }

    // Fold bet check
    const roundedBet = Math.round(foldBet);
    if (typeof foldBet !== 'number' || foldBet < 0 || foldBet > room.turn || roundedBet !== foldBet) {
        if (playerSocket) {
            playerSocket.emit('player-error', {
                type: 'wrong-fold-bet',
                data: foldBet
            });
        }
        return;
    }

    logDebug('=> set-fold-bet', player.id, roundedBet);
    player.foldBet = roundedBet;

    const totalNumberOfPlayers = room.users.length;
    room.numberOfReadyPlayers = room.users.filter(u => u.foldBet !== null).length;

    // If all players have chosen their bet, display the turn start !
    if (totalNumberOfPlayers === room.numberOfReadyPlayers) {
        room.isWaitingPlayersBets = false;
        io.to(room.id).emit('yo-ho-ho', {
            turn: room.turn,
            bets: getPlayersBets(room),
            currentPlayerId: room.currentPlayerId
        });

        // After yo-ho-ho, check if it's a robot's turn to play a card
        checkAndTriggerRobotActions(room);
    } else {
        // Notifies players of how many players are ready
        io.to(room.id).emit('waiting-players-bets', {
            numberOfReadyPlayers: room.numberOfReadyPlayers,
            totalNumberOfPlayers: totalNumberOfPlayers
        });

        // Check if more robots should bet
        checkAndTriggerRobotActions(room);
    }
}

// Search the requested type of cards for the current fold (null when any card can be played)
function getRequestedType(playedCards) {
    const firstColorCard = playedCards.find(c => !c.isSpecial);
    if (firstColorCard) {
        for (let i = 0; i < playedCards.length; i++) {
            const cardOfTurn = playedCards[i];
            if (cardOfTurn.id === firstColorCard.id) {
                break;
            }
            // A Special card in first position makes no type of card for this turn
            if (cardOfTurn.isSpecial && cardOfTurn.type !== CARD_TYPE.EVASION) {
                return null;
            }
        }
        return firstColorCard.type;
    }
    return null;
}

// Cards of the player's hand that respect the requested type of the current fold
function getPlayableCards(room, player) {
    const typeOfCards = getRequestedType(room.playedCards);
    const playerHasRequestedTypeOfCards = !!typeOfCards && player.cards.some(c => c.type === typeOfCards);
    return player.cards.filter(c => c.isSpecial || !playerHasRequestedTypeOfCards || c.type === typeOfCards);
}

// Returns true when the card has actually been played
function handlePlayCard(io, room, player, cardId, type, playerSocket) {
    logDebug('=> handlePlayCard', player.id, cardId, type);

    // Cards can only be played by the current player, once all bets are done
    if (!room.isPlaying || room.isWaitingPlayersBets || room.users[room.currentPlayerIndex] !== player) {
        return false;
    }

    const playedCard = room.cardsById[cardId];
    const cardIndex = playedCard ? Utils.findIndexById(player.cards, playedCard.id) : -1;
    if (cardIndex < 0) {
        logDebug(player.id, 'tried to play a card not in its hand', cardId);
        return false;
    }

    // Check if the player can play its card
    if (room.playedCards.length < room.users.length && getPlayableCards(room, player).includes(playedCard)) {
        if (playedCard.type === CARD_TYPE.CHOICE) {
            if (type === CARD_TYPE.EVASION) {
                playedCard.img = 'tigresse_evasion.jpg';
                playedCard.value = 0;
                playedCard.bonus = 0;
                playedCard.type = type;
            } else {
                if (type !== CARD_TYPE.PIRATE) {
                    logDebug('wrong choice', type, 'default is pirate');
                }
                playedCard.img = 'tigresse_pirate.jpg';
                playedCard.value = 100;
                playedCard.bonus = 30;
                playedCard.type = CARD_TYPE.PIRATE;
            }
        }

        logDebug(player.id, 'played the following card:', playedCard);

        // Requested type of cards, computed before adding the played card
        const typeOfCards = getRequestedType(room.playedCards);

        // OK Card can be added to the played cards
        room.playedCards.push(playedCard);

        // Remove the card from the player cards
        player.cards.splice(cardIndex, 1);

        // Update who played that card
        playedCard.playedBy = player.id;

        // Notify the player (if not robot) that its card has been removed
        if (!player.isRobot && playerSocket) {
            playerSocket.emit('remove-played-card', {
                playedCardId: playedCard.id
            });
        }

        // Update current player turn
        logDebug('before updating next player', room.currentPlayerId, room.currentPlayerIndex);
        room.currentPlayerIndex++;
        if (room.currentPlayerIndex === room.users.length) {
            room.currentPlayerIndex = 0;
        }
        logDebug('new current player is', room.currentPlayerIndex, room.users[room.currentPlayerIndex].id);

        // Check if the last player played its card
        if (room.playedCards.length === room.users.length) {
            // Check who wins the fold
            let bestPlayedCard = null;
            let hasMermaid = false;
            let firstMermaid = null;
            room.playedCards.forEach((card) => {
                if (!bestPlayedCard || bestPlayedCard.value < card.value &&
                    (card.isSpecial || !typeOfCards || card.type === typeOfCards
                        || (bestPlayedCard.value < 20 && card.type === CARD_TYPE.BLACK))) {
                    bestPlayedCard = card;
                }
                if (!hasMermaid && card.type === CARD_TYPE.MERMAID) {
                    hasMermaid = true;
                    firstMermaid = card;
                }
            });

            if (bestPlayedCard.type === CARD_TYPE.SKULL_KING && hasMermaid) {
                bestPlayedCard = firstMermaid;
                bestPlayedCard.value = 1000;
                room.playedCards.filter(c => c.type === CARD_TYPE.PIRATE).forEach(c => c.bonus = 0);
            }

            logDebug('best card of round is', bestPlayedCard, 'played by', bestPlayedCard.playedBy);

            const foldWinner = Utils.findElementById(room.users, bestPlayedCard.playedBy);
            bestPlayedCard.isBestCard = true;
            const playedCards = [...room.playedCards];
            foldWinner.folds.push(playedCards);

            let isLastCardPlayed = player.cards.length === 0;

            const startPlayerIndex = Utils.findIndexById(room.users, foldWinner.id);
            const foldWinnerAmount = foldWinner.folds.length;
            if (isLastCardPlayed) {
                if (room.turn < MAX_TURN) {
                    const previousTurn = room.turn;
                    room.firstPlayerIndex++;
                    if (room.firstPlayerIndex === room.users.length) {
                        room.firstPlayerIndex = 0;
                    }
                    initializeNewTurn(room, previousTurn + 1, room.firstPlayerIndex);
                    io.to(room.id).emit('players-scores', getPlayerScoresEvent(room, previousTurn, false));
                } else {
                    room.isPlaying = false;
                    room.users.forEach(p => computePlayerScore(p, MAX_TURN));
                    const scoresEvent = getPlayerScoresEvent(room, MAX_TURN, true);
                    room.gameWinner = scoresEvent.playerScores[0].id;
                    Analytics.gameEnded(room);
                    io.to(room.id).emit('players-scores', scoresEvent);
                }
            } else {
                resetCurrentRound(room, startPlayerIndex);
            }

            const playerWonCurrentFoldEvent = {
                endOfGame: !room.isPlaying,
                hasToGetCards: room.isPlaying && isLastCardPlayed,
                currentPlayerId: foldWinner.id,
                gameWinner: room.gameWinner,
                foldWinnerPosition: startPlayerIndex + 1,
                foldWinnerAmount: foldWinnerAmount,
                numberOfReadyPlayers: room.numberOfReadyPlayers,
                totalNumberOfPlayers: room.users.length,
                fold: playedCards.map(c => {
                    const owner = Utils.findElementById(room.users, c.playedBy);
                    return {
                        img: c.img,
                        playedBy: c.playedBy,
                        isRobot: owner ? owner.isRobot : false
                    };
                })
            };
            io.to(room.id).emit('player-won-current-fold', playerWonCurrentFoldEvent);

            // After round/turn ends, check if robot starts next
            checkAndTriggerRobotActions(room);

        } else {
            // Next player to play
            room.currentPlayerId = room.users[room.currentPlayerIndex].id;
            const playedCardEvent = {
                currentPlayerId: room.currentPlayerId,
                playedCards: getPlayedCardsEvent(room)
            };
            io.to(room.id).emit('card-has-been-played', playedCardEvent);

            // Check if next player is robot
            checkAndTriggerRobotActions(room);
        }
        return true;
    }

    // The card does not follow the requested type
    if (playerSocket) {
        playerSocket.emit('player-error', {
            type: 'cannot-play-this-card',
            data: playedCard.name
        });
    }
    return false;
}

function getPlayedCardsEvent(room) {
    return (room.playedCards || []).map(c => {
        const owner = Utils.findElementById(room.users, c.playedBy);
        return {
            id: c.id,
            type: c.type,
            isSpecial: c.isSpecial,
            img: c.img,
            playedBy: c.playedBy,
            isRobot: owner ? owner.isRobot : false
        };
    });
}

// Schedule a robot action once: an action already pending for the same key is kept
function scheduleRobotAction(room, key, delay, action) {
    let timers = ROBOT_TIMERS.get(room);
    if (!timers) {
        timers = {};
        ROBOT_TIMERS.set(room, timers);
    }
    if (timers[key]) {
        return;
    }
    timers[key] = setTimeout(() => {
        delete timers[key];
        if (room.isClosed) {
            return;
        }
        try {
            action();
        } catch (e) {
            console.error('[robot] action failed in room', room.id, e);
        }
    }, delay);
}

function clearRobotTimers(room) {
    const timers = ROBOT_TIMERS.get(room);
    if (timers) {
        Object.values(timers).forEach(t => clearTimeout(t));
    }
    ROBOT_TIMERS.delete(room);
}

// Robot card choice, always checked against the rules: an illegal choice would block the game
function getRobotPlayableAction(room, robot) {
    const playableCards = getPlayableCards(room, robot);
    if (playableCards.length === 0) {
        return null;
    }
    const robotAction = GameRobots.getRobotCardToPlay(room, robot);
    if (robotAction && playableCards.some(c => c.id === robotAction.cardId)) {
        return robotAction;
    }
    console.error('[robot]', robot.id, 'chose an illegal card', robotAction, 'in room', room.id);
    const fallbackCard = playableCards[0];
    return {
        cardId: fallbackCard.id,
        type: fallbackCard.type === CARD_TYPE.CHOICE ? CARD_TYPE.EVASION : null
    };
}

function checkAndTriggerRobotActions(room) {
    if (!IO || room.isClosed || !room.isPlaying) return;

    if (room.isWaitingPlayersBets) {
        // Robots that haven't bet yet
        room.users.filter(u => u.isRobot && u.foldBet === null).forEach(robot => {
            // Delay robot action slightly to feel more natural
            scheduleRobotAction(room, 'bet-' + robot.id, ROBOT_BET_DELAY_MS, () => {
                if (room.isWaitingPlayersBets && robot.foldBet === null) {
                    handleSetFoldBet(IO, room, robot, GameRobots.getRobotBet(robot, room.turn));
                }
            });
        });
    } else {
        const currentPlayer = room.users[room.currentPlayerIndex];
        if (currentPlayer && currentPlayer.isRobot) {
            scheduleRobotAction(room, 'play', ROBOT_PLAY_DELAY_MS, () => {
                // The game state may have changed since the action was scheduled
                if (!room.isPlaying || room.isWaitingPlayersBets || room.users[room.currentPlayerIndex] !== currentPlayer) {
                    checkAndTriggerRobotActions(room);
                    return;
                }
                const robotAction = getRobotPlayableAction(room, currentPlayer);
                if (robotAction) {
                    handlePlayCard(IO, room, currentPlayer, robotAction.cardId, robotAction.type);
                }
            });
        }
    }
}

function getPlayerScoresEvent(room, previousTurn, endOfGame) {
    return {
        endOfGame: endOfGame,
        turn: previousTurn,
        playerScores: room.users.map(player => {
            return {
                id: player.id,
                isRobot: player.isRobot,
                totalScore: player.totalScore,
                scores: player.scores
            };
        })
            .sort((p1, p2) => p2.totalScore - p1.totalScore)
    };
}

function getPlayerCards(player) {
    return player.cards.map(c => {
        return {
            id: c.id,
            type: c.type,
            img: c.img,
            value: c.value
        };
    });
}

function getPlayersBets(room) {
    return room.users.map(player => {
        return {
            userId: player.id,
            foldBet: player.foldBet,
            folds: player.folds ? player.folds.length : 0
        };
    })
}

// Game events of a socket, registered once per connection: the room is resolved at each event,
// so a socket keeps working after a reconnection or a page refresh
exports.setEventListeners = (io, Socket, getRoom) => {
    function getGameRoom(data) {
        const room = data ? getRoom(data.roomId) : null;
        return room && room.initialCards ? room : null;
    }

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        const room = getGameRoom(data);
        if (room) {
            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {
                const playerCards = getPlayerCards(player);
                const playerCardsEvent = {
                    turn: room.turn,
                    currentPlayerId: room.currentPlayerId,
                    cards: playerCards,
                    numberOfReadyPlayers: room.numberOfReadyPlayers,
                    totalNumberOfPlayers: room.users.length
                }
                logDebug('player-cards =>', playerCardsEvent);
                Socket.emit('player-cards', playerCardsEvent);
            } else {
                console.error('[get-my-cards] player not found', data);
            }
        }
    });

    // Handle when a player set its fold bet
    Socket.on('set-fold-bet', (data) => {
        const room = getGameRoom(data);
        if (room) {
            const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
            if (player) {
                handleSetFoldBet(io, room, player, data.foldBet, Socket);
            } else {
                console.error('[set-fold-bet] player not found', data);
            }
        }
    });

    // Handle when a player plays a card
    Socket.on('play-a-card', (data) => {
        const room = getGameRoom(data);
        if (room) {
            const player = Utils.findUserByIdAndToken(room.users, data.playerId, data.token);
            if (player && player.id === room.currentPlayerId && !room.isWaitingPlayersBets) {
                handlePlayCard(io, room, player, data.cardId, data.type, Socket);
            } else {
                // No player found or not the current player to play
                Socket.emit('player-error', {
                    type: 'wrong-player'
                });
            }
        }
    });

    // Emoji handling
    Socket.on('send-emoji', (data) => {
        const room = getGameRoom(data);
        if (room) {
            const player = Utils.findUserByIdAndToken(room.users, data.playerId, data.token);
            if (player) {
                logDebug('=> send-emoji', data);
                // Check emoji sanity
                if (data.emojiCode >= 0x1F600 && data.emojiCode <= 0x1F64F ||
                    data.emojiCode >= 0x1F440 && data.emojiCode <= 0x1F44F ||
                    data.emojiCode >= 0x1F4A0 && data.emojiCode <= 0x1F4AF ||
                    data.emojiCode >= 0x1F910 && data.emojiCode <= 0x1F92F
                ) {
                    io.to(room.id).emit('player-display-emoji', {
                        emojiCode: data.emojiCode,
                        playerId: data.playerId
                    });
                } else {
                    console.error('[send-emoji] wrong emoji code', data);
                }
            } else {
                console.error('[send-emoji] player not found', data);
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