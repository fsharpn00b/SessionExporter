/* Copyright 2014 FSharpN00b.
This file is part of Session Exporter.

Session Exporter is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Session Exporter is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Session Exporter.  If not, see <http://www.gnu.org/licenses/>. */

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/listbox
*/
/* Initialize the dialog. Return unit. */
function init () {
	var populate_list_box = function (list_box, items) {
		var items_length = items.length;
		if (items_length > 10) { list_box.rows = 10; }
		else { list_box.rows = items_length; }
// TODO2 Size width to content.
		for (var loop = 0; loop < items_length; loop++) {
            var item = items [loop];
			var list_box_item = list_box.appendItem (item.path, item.id);
            list_box_item.setAttribute ("tooltiptext", item.path);
		}
	};
    var list_box = document.getElementById ("export_bookmark_folders");
	populate_list_box (list_box, window.arguments[0].inn.folders);
}

/* Return a list of the selected indices in list box (1). */
function get_selected_indices (list) {
    var indices = [];
/* Loop through the list box items. */
    for (var loop = 0; loop < list.itemCount; loop++) {
/* Get the list box item. */
        var item = list.getItemAtIndex (loop);
/* If the list box item is selected, add the index to the results. */
        if (item.selected == true) {
            indices.push (loop);
        }
    }
    return indices;
}

/* Handle the user clicking Ok. If the user selected at least one item, return true; if not, return false. */
function accept () {
    var selected_indices = get_selected_indices (document.getElementById ("export_bookmark_folders"));
	if (selected_indices.length == 0) {
	    window.alert ("Please select at least one folder.");
        return false;
	}
	else {
/* If the user clicks Cancel, this function is never called, and window.arguments[0].out is null. */
		window.arguments[0].out = {
			selected_indices : selected_indices,
         };
		return true;
	}
}