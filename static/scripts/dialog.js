const Dialog = {};

$(document).ready(() => {
    Dialog.$simpleDialog = $('#simple-dialog');

    Dialog.$simpleDialog.dialog({
        modal: true,
        autoOpen: false
    });

    Dialog.openSimpleDialog = ($dialog, title, text, width) => {
        $dialog.dialog('option', 'title', title);
        if (width) {
            $dialog.dialog('option', 'width', width);
        } else {
            // Reset default width
            $dialog.dialog('option', 'width', 300);
        }
        $dialog.dialog('option', 'buttons', [{
            text: 'Ok',
            click: () => {
                Dialog.$simpleDialog.dialog('close');
            }
        }]);
        $dialog.find('.dialog-text').text('').append(text);
        $dialog.dialog('open');
    };

    Dialog.openTwoChoicesDialog = ($dialog, title, text, okLabel, okCallback, cancelLabel, cancelCallback) => {
        $dialog.dialog('option', 'title', title);
        $dialog.dialog('option', 'width', 300);
        $dialog.dialog('option', 'buttons', [
            {
                text: okLabel,
                click: () => {
                    okCallback();
                    Dialog.$simpleDialog.dialog('close');
                }
            }, {
                text: cancelLabel,
                click: () => {
                    cancelCallback();
                    Dialog.$simpleDialog.dialog('close');
                }
            }, 
        ]);
        $dialog.find('.dialog-text').text('').append(text);
        $dialog.dialog('open');
    };
});