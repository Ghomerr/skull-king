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