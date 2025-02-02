const Dialog = {};

$(document).ready(() => {
    Dialog.$simpleDialog = $('#simple-dialog');

    Dialog.$simpleDialog.dialog({
        modal: true,
        autoOpen: false,
        buttons: {
            Ok: () => {
                Dialog.$simpleDialog.dialog('close');
            }
        }
    });

    Dialog.openSimpleDialog = ($dialog, title, text, width) => {
        $dialog.dialog('option', 'title', title);
        if (width) {
            $dialog.dialog('option', 'width', width);
        } else {
            // Reset default width
            $dialog.dialog('option', 'width', 300);
        }
        $dialog.find('#dialog-text').text('').append(text);
        $dialog.dialog('open');
    };
});