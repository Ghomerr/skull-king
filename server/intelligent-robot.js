const CARD_TYPE = {
    BLACK: 'black',
    EVASION: 'evasion',
    SKULL_KING: 'skull-king',
    PIRATE: 'pirate',
    MERMAID: 'mermaid',
    CHOICE: 'choice'
};

/**
 * Evaluate the number of tricks a hand can win.
 * Logic:
 * - High cards (numbers > 10 in standard, > 30 in black) are likely to win.
 * - Special cards (Pirates, Skull King) are very likely to win.
 * - Mermaids are likely to win if no Skull King is present, or if they capture the Skull King.
 * - If the total estimated tricks is low, the robot might prefer to bid 0.
 */
function getRobotBet(robot, turn) {
    let estimatedTricks = 0;
    
    robot.cards.forEach(card => {
        if (card.type === CARD_TYPE.SKULL_KING) {
            estimatedTricks += 0.9;
        } else if (card.type === CARD_TYPE.PIRATE) {
            estimatedTricks += 0.7;
        } else if (card.type === CARD_TYPE.MERMAID) {
            estimatedTricks += 0.5;
        } else if (card.type === CARD_TYPE.BLACK) {
            if (card.value >= 30) estimatedTricks += 0.6; // 10-14 black
            else if (card.value >= 25) estimatedTricks += 0.3; // 5-9 black
        } else if (card.type === CARD_TYPE.CHOICE) { // Tigresse
            estimatedTricks += 0.6;
        } else {
            // Standard colors
            if (card.value >= 12) estimatedTricks += 0.4; // 12-14 color
        }
    });

    let bet = Math.round(estimatedTricks);
    
    // If bet is very low compared to turn, maybe attempt 0?
    // In Skull King, 0 is often a good strategy if you have a bad hand.
    if (bet === 0 || (bet === 1 && turn >= 5 && !robot.cards.some(c => c.value >= 100))) {
        return 0;
    }

    return Math.min(bet, turn);
}

/**
 * Decide which card to play.
 * Logic:
 * - If we bid 0 or already have enough tricks: play to LOSE.
 * - If we still need tricks: play to WIN.
 */
function getRobotCardToPlay(room, robot) {
    if (robot.cards.length === 0) return null;

    const currentTricks = robot.folds ? robot.folds.length : 0;
    const targetTricks = robot.foldBet;
    const needsToWin = targetTricks > currentTricks;
    const mustLose = targetTricks === 0 || currentTricks >= targetTricks;

    // Find the suit to follow
    const firstColorCard = room.playedCards.find(c => !c.isSpecial);
    const requestedType = firstColorCard ? firstColorCard.type : null;

    // Analyze currently played cards to see what is the best card on the table
    const getBestCardOnTable = (playedCards, reqType) => {
        if (playedCards.length === 0) return null;
        let best = null;
        let hasM = playedCards.some(c => c.type === CARD_TYPE.MERMAID);
        playedCards.forEach(card => {
            if (!best) { best = card; return; }
            const isBetter = (card.value > best.value && (
                card.isSpecial || !reqType || card.type === reqType || (best.value < 20 && card.type === CARD_TYPE.BLACK)
            ));
            if (isBetter) best = card;
        });
        if (best && best.type === CARD_TYPE.SKULL_KING && hasM) {
            best = playedCards.find(c => c.type === CARD_TYPE.MERMAID);
        }
        return best;
    };

    const bestCardOnTable = getBestCardOnTable(room.playedCards, requestedType);

    let cardToPlay = null;
    let choiceType = null;

    if (mustLose) {
        // Strategy: Play the card that is most likely to LOSE.
        // 1. Evasion
        // 2. Low card that follows suit
        // 3. Low card that doesn't follow suit (discard)
        // 4. Special cards (harder to lose with, use them as discard if possible)

        const evasions = robot.cards.filter(c => c.type === CARD_TYPE.EVASION);
        if (evasions.length > 0) {
            cardToPlay = evasions[0];
        } else {
            const followSuitCards = requestedType ? robot.cards.filter(c => c.type === requestedType) : [];
            if (followSuitCards.length > 0) {
                // Must follow suit, play the lowest one
                followSuitCards.sort((a, b) => a.value - b.value);
                cardToPlay = followSuitCards[0];
            } else {
                // Can't follow suit or no suit requested, play lowest card overall
                // EXCEPT special cards that might win (Pirates, etc.) unless they are the only option
                const nonSpecialCards = robot.cards.filter(c => !c.isSpecial);
                if (nonSpecialCards.length > 0) {
                    nonSpecialCards.sort((a, b) => a.value - b.value);
                    cardToPlay = nonSpecialCards[0];
                } else {
                    // Only special cards left
                    robot.cards.sort((a, b) => a.value - b.value);
                    cardToPlay = robot.cards[0];
                }
            }
        }

        if (cardToPlay.type === CARD_TYPE.CHOICE) choiceType = CARD_TYPE.EVASION;

    } else {
        // Strategy: Play to WIN.
        // 1. If we can win with a high card of requested suit, do it.
        // 2. If we can win with an atout (black) or special card, do it.
        // 3. If we can't win, play the lowest card to save high cards for later.

        const followSuitCards = requestedType ? robot.cards.filter(c => c.type === requestedType) : [];
        const blackCards = robot.cards.filter(c => c.type === CARD_TYPE.BLACK);
        const specialCards = robot.cards.filter(c => c.isSpecial && c.type !== CARD_TYPE.EVASION);

        // Can we win?
        let winningCard = null;

        // 1. Check follow suit cards
        if (followSuitCards.length > 0) {
            followSuitCards.sort((a, b) => b.value - a.value);
            if (!bestCardOnTable || followSuitCards[0].value > bestCardOnTable.value) {
                winningCard = followSuitCards[0];
            }
        }

        // 2. Check special cards (Skull King, Pirates, Mermaids)
        if (!winningCard && specialCards.length > 0) {
            specialCards.sort((a, b) => b.value - a.value);
            if (!bestCardOnTable || specialCards[0].value > bestCardOnTable.value) {
                winningCard = specialCards[0];
            }
        }

        // 3. Check black cards (Atout)
        if (!winningCard && blackCards.length > 0) {
            blackCards.sort((a, b) => b.value - a.value);
            if (!bestCardOnTable || bestCardOnTable.type !== CARD_TYPE.BLACK || blackCards[0].value > bestCardOnTable.value) {
                winningCard = blackCards[0];
            }
        }

        if (winningCard) {
            cardToPlay = winningCard;
        } else {
            // Can't win this turn or no suit requested
            if (!requestedType) {
                // We are the first player, play a strong card to win the fold
                robot.cards.sort((a, b) => b.value - a.value);
                cardToPlay = robot.cards[0];
            } else {
                // Play lowest card to lose and save strength
                const followSuit = robot.cards.filter(c => c.type === requestedType);
                if (followSuit.length > 0) {
                    followSuit.sort((a, b) => a.value - b.value);
                    cardToPlay = followSuit[0];
                } else {
                    robot.cards.sort((a, b) => a.value - b.value);
                    cardToPlay = robot.cards[0];
                }
            }
        }

        if (cardToPlay.type === CARD_TYPE.CHOICE) choiceType = CARD_TYPE.PIRATE;
    }

    return {
        cardId: cardToPlay.id,
        type: choiceType
    };
}

module.exports = {
    getRobotBet,
    getRobotCardToPlay
};
