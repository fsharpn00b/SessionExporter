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

"use strict";

/* If the SessionExporter namespace is not defined, define it. */
if (typeof SessionExporter == "undefined") { var SessionExporter = {}; }

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/FileUtils.jsm");
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
Components.utils.import ("chrome://sessionexporter/content/session.jsm", SessionExporter);

/* Handle when the user clicks the Browse button for the input or output folder. Return unit. */
function select_folder (dialog_title, preference_name) {
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var dialog = Components.classes["@mozilla.org/filepicker;1"].createInstance (nsIFilePicker);
/* Set the file dialog to select folder mode. */
    dialog.init (window, dialog_title, nsIFilePicker.modeGetFolder);
/* Get the preference value. */
    try {
/* See:
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/File_I_O
"You can still get a file object even if the specified file does not exist, and no exception will be thrown. An exception is thrown only when methods that require the file to exist are called, e.g. isDirectory(), moveTo(), and so on."
However, it seems this is not correct. If the file does not exist, we get the following error.
NS_ERROR_FAILURE: Component returned failure code: 0x80004005 (NS_ERROR_FAILURE) [nsILocalFile.initWithPath]
We cannot find a way to check that the file exists without creating the file object, which raises an exception if the file does not exist. So for now we simply catch the exception. */
        var folder = new FileUtils.File (document.getElementById (preference_name).value);
/* Verify the value is a valid folder. If it is, set the dialog starting folder to the value. */
        if (folder.exists () == true && folder.isDirectory () == true) { dialog.displayDirectory = folder; }
    }
    catch (error) {
/* If the value is not valid, use the session folder. getSessionFolder creates the folder if it does not exist. */
        dialog.displayDirectory = SessionExporter.Session.getSessionFolder();
    }
/* Let the dialog show all files to help the user recognize the folder. */
    dialog.appendFilters (nsIFilePicker.filterAll);
    if (dialog.show () == nsIFilePicker.returnOK) {
/* Update the preference value. */
        document.getElementById (preference_name).value = dialog.file.path;
    }
}

/* Handle the user checking or unchecking the options to skip duplicate tabs for single or multiple sessions. Return unit. */
function handle_skip_duplicate_tabs_changed () {
    var skip_duplicate_tabs_single_session = document.getElementById ("SessionExporter_skip_duplicate_tabs_single_session").checked;
    var skip_duplicate_tabs_multiple_sessions = document.getElementById("SessionExporter_skip_duplicate_tabs_multiple_sessions").checked;
	var skip_duplicate_tabs_across_tab_groups = document.getElementById("SessionExporter_skip_duplicate_tabs_across_tab_groups").checked;
    var log_duplicate_tabs = document.getElementById ("SessionExporter_log_duplicate_tabs");
    var file_duplicate_tabs = document.getElementById ("SessionExporter_file_duplicate_tabs");
    var bookmark_duplicate_tabs = document.getElementById ("SessionExporter_bookmark_duplicate_tabs");
    if (skip_duplicate_tabs_single_session == false && skip_duplicate_tabs_multiple_sessions == false) {
		skip_duplicate_tabs_across_tab_groups.disabled = true;
        log_duplicate_tabs.disabled = true;
        file_duplicate_tabs.disabled = true;
        bookmark_duplicate_tabs.disabled = true;
    }
    else {
		skip_duplicate_tabs_across_tab_groups.disabled = false;
        log_duplicate_tabs.disabled = false;
        file_duplicate_tabs.disabled = false;
        bookmark_duplicate_tabs.disabled = false;
    }
}