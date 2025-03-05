exports.randomRoomId = () => {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/[X]/g, () => {
        return (Math.random() * 16 | 0).toString(16).toUpperCase();
    });
};

exports.findIndexById = (array, id) => {
    return _findIndex(array, 'id', id);
};

exports.findElementById = (array, id) => {
    return array.find(e => e.id === id);
};

exports.shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

function _findIndex(array, attributeName, attributeValue) {
    return array.findIndex((element) => element[attributeName] === attributeValue);
}