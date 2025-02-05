exports.randomRoomId = () => {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/[X]/g, () => {
        return (Math.random() * 16 | 0).toString(16).toUpperCase();
    });
};

function findIndex(array, attributeName, attributeValue) {
    let searchedIndex = -1;
    for (let i = 0; i < array.length; i++) {
        if (array[i][attributeName] === attributeValue) {
            searchedIndex = i;
            break;
        }
    }
    return searchedIndex;
}

exports.findIndexById = (array, id) => {
    return findIndex(array, 'id', id);
};

exports.shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};