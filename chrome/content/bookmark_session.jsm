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

/* If the global namespace is not defined, define it. */
if (typeof SessionExporter == "undefined") { var SessionExporter = {}; }

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
*/
var EXPORTED_SYMBOLS = ["BookmarkSession"];

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
Components.utils.import ("chrome://sessionexporter/content/consts.jsm", SessionExporter);

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/mozIJSSubScriptLoader
*/
var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
	.getService(Components.interfaces.mozIJSSubScriptLoader);
/* Include Underscore. */
scriptLoader.loadSubScript (SessionExporter.Consts.content_folder + "underscore-min.js");

/* See:
https://developer.mozilla.org/en-US/Add-ons/Performance_best_practices_in_extensions
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm
We don't use these modules and services at startup, so we import them with XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter instead of Components.utils.import and Components.classes.
Note the name parameter must match an exported symbol from the module.
*/
/* Firefox modules. */

/* Firefox services. */
XPCOMUtils.defineLazyServiceGetter (this, "Bookmarks", "@mozilla.org/browser/nav-bookmarks-service;1", Components.interfaces.nsINavBookmarksService);
XPCOMUtils.defineLazyServiceGetter (this, "IO", "@mozilla.org/network/io-service;1", Components.interfaces.nsIIOService);

/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "SessionUtils", SessionExporter.Consts.content_folder + "session_utils.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "BookmarkUtils", SessionExporter.Consts.content_folder + "bookmark_utils.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "ExportSession", SessionExporter.Consts.content_folder + "export_session.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "ExportSessionUtils", SessionExporter.Consts.content_folder + "export_session_utils.jsm");

/* Enumerations. */

/* Whether to export a session to a file or save it to bookmarks. */
const FileOrBookmark = { File : 0, Bookmark : 1};

// TODO2 Look at all *bookmark* functions and see if they should be moved to bookmark_utils.

/* Functions: general helpers. */

function get_window () { return SessionExporter.Consts.get_window (); }
function get_windows () { return SessionExporter.Consts.get_windows (); }

/* See:
https://developer.mozilla.org/en-US/docs/Web/API/Window.openDialog
https://developer.mozilla.org/en-US/docs/Web/API/window.open
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Dialogs_and_Prompts
*/
/* Show the dialog in XUL file (1) with in parameters (2). Return unit. */
function show_dialog (filename, in_params) {
/* This is used to pass parameters to the dialog and receive return values. */
	var params = { inn : in_params, out : null };
/* Show the dialog. The second parameter is the window name, which we do not need. The third parameter is the feature list. The chrome feature is required for the centerscreen feature. */
	get_window ().openDialog (SessionExporter.Consts.content_folder + filename, "", "centerscreen, chrome, dialog, modal, resizable=yes", params).focus();
/* If the user clicked Ok, return the parameters. */
	if (params.out) { return params.out; }
	else { return null; }
}

/* See:
https://developer.mozilla.org/en-US/docs/Web/API/Window.openDialog
https://developer.mozilla.org/en-US/docs/Web/API/window.open
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Dialogs_and_Prompts
*/
/* Show the New Bookmark Folder Name dialog. If the user enters a name, return it; otherwise, return null. */
function get_new_bookmark_folder_name () {
/* This is used to pass parameters to the dialog and receive return values. */
	var params = { out : null };
/* Show the dialog. The second parameter is the window name, which we do not need. The third parameter is the feature list. The chrome feature is required for the centerscreen feature. */
	get_window ().openDialog (SessionExporter.Consts.content_folder + "bookmark.xul", "", "centerscreen, chrome, dialog, modal=yes", params).focus();
/* If the user entered a name, return it. Otherwise, return null. */
	if (params.out != null) { return params.out.new_bookmark_folder_name; }
	else { return null; }
}

/* Ask the user to select one or more bookmark folders from list (1). Return a list of the the indices of the bookmark folders the user selects. If the user cancels the dialog, return an empty list. */
function get_bookmark_folder_to_export (folders) {
    var results = show_dialog ("export_bookmark_folders.xul", { folders : folders });
/* If the user clicked Ok, and selected at least one folder, return the selected folders. */
    if (results) { return results.selected_indices; }
    else { return []; }
}

/* Ask the user to select one or more bookmark folders from list (1). Return a list of the bookmark folders the user selects. */
function select_bookmark_folders_to_export (folders) {
/* Ask the user which bookmark folder to export. */
    var folder_indices = get_bookmark_folder_to_export (folders);
/* Get the bookmark folders the user selected. */
    return _.map (folder_indices, function (folder_index) {
        return folders [folder_index];
    });
}

// TODO2 Limit length in case there are too many folders. This seems to be built into the file dialog.
/* Return an output file name created from input files (1). Preconditions: input_files.length > 0. */
function get_default_output_file_name_from_bookmark_folders (folder_names) {
/* Use the combined names of the session files as the default output file name. */
	var default_output_file_name = _.reduce (folder_names, function (acc, folder_name) {
        return acc + folder_name + "_";
    }, "");
    if (default_output_file_name.length > 0) {
/* Remove the last delimiter. */
        default_output_file_name = default_output_file_name.slice (0, -1);
/* Note if we do not add the .html extension, the file dialog does not ask user permission to overwrite existing files. This is probably because it does not add the extension specified in the dialog (.html) until after it compares the file names. That comparison is negative because the file on disk has the extension and the file name in the dialog does not. */
/* Add the correct extension. */
        default_output_file_name += ".html";
    }
    return default_output_file_name;
}

/* Functions: method helpers. */

/* Return the action to apply to each tab group in write_session. (1) The bookmark folder ID for the new bookmark folder that was named by the user. */
function get_bookmark_session_tab_group_action (new_bookmark_folder_id) {
/* Create a bookmark folder for tab group (1). Return an object with two fields:
result: An empty string.
tab_group_id_data: The bookmark folder ID. */
	return function (tab_group) {
/* Create the bookmark folder for this tab group. Add it to the new bookmark folder that was named by the user. Bookmarks.DEFAULT_INDEX means to append the new folder at the end of the list. */
		var tab_group_id_data = Bookmarks.createFolder (new_bookmark_folder_id, tab_group.title, Bookmarks.DEFAULT_INDEX);
		return { result : "", tab_group_id_data : tab_group_id_data };
	};
}

/* Return the action to apply to each tab in write_session. */
function get_bookmark_session_tab_action () {
/* Create a bookmark for tab (1). (2) The bookmark folder ID for the tab group for this tab. Return an empty string. */
	return function (tab, tab_group_folder_id) {
/* Create a URI for this tab. */
		var uri = IO.newURI (tab.url, null, null);
/* Add the bookmark for this tab to the folder for this tab group. Bookmarks.DEFAULT_INDEX means to append the new bookmark at the end of the list. */
		Bookmarks.insertBookmark (tab_group_folder_id, uri, Bookmarks.DEFAULT_INDEX, tab.title);
		return "";
	};
}

/* Note we can use the tab action from session_to_bookmarks_helper, but not the tab group action. */
/* Create bookmarks for duplicate tabs. (1) The session that contains the duplicate tabs. (2) The bookmark folder named by the user. */
function bookmark_duplicate_tabs (session, new_bookmark_folder_id) {
/* Create a bookmark folder for the duplicate tab groups and tabs. Add it to the new bookmark folder that was named by the user. Bookmarks.DEFAULT_INDEX means to append the new folder at the end of the list. */
    var duplicate_tab_group_folder_id = Bookmarks.createFolder (new_bookmark_folder_id, "Duplicate Tabs", Bookmarks.DEFAULT_INDEX);
/* Note this differs from the tab_group_action used by session_to_bookmarks_helper. This creates a bookmark folder for each tab group, then adds it to the bookmark folder for the duplicate tab groups and tabs.
/* Create a bookmark folder for tab group (1). Return an object with two fields:
result: An empty string.
tab_group_id_data: The bookmark folder ID. */
	var tab_group_action = function (tab_group) {
/* Create the bookmark folder for this tab group. Add it to the bookmark folder for the duplicate tab groups and tabs. Bookmarks.DEFAULT_INDEX means to append the new folder at the end of the list. */
		var tab_group_id_data = Bookmarks.createFolder (duplicate_tab_group_folder_id, tab_group.title, Bookmarks.DEFAULT_INDEX);
		return { result : "", tab_group_id_data : tab_group_id_data };
	};
    var tab_action = get_bookmark_session_tab_action ();
/* Create the bookmark folders and bookmarks for the duplicate tab groups and tabs. Ignore the return value. */
    SessionExporter.ExportSessionUtils.write_session (session.duplicate_tabs, session.duplicate_tab_groups, tab_action, tab_group_action);
}

/* Unlike duplicate_tabs_to_string, this does not take a tab group action or tab action because bookmark_duplicate_tabs creates its own. The tab group action and tab action do not contain any unique formatting (unlike the ones created by session_to_string) so there's no need to preserve them. Also, bookmark_duplicate_tabs needs to close the tab group action over a different bookmark folder id than the tab group action created by get_bookmark_session_tab_group_action. */
/* Bookmark duplicate tabs. (1) True if the user wants to save duplicate tabs. (2) The session that contains the tab groups and duplicate tabs. (3) The bookmark folder ID for the new bookmark folder that was named by the user. Return unit. */
function try_bookmark_duplicate_tabs (save_duplicate_tabs, session, new_bookmark_folder_id) {
/* If the user wants to save duplicate tabs... */
    if (save_duplicate_tabs == true) {
        var tab_groups = session.duplicate_tab_groups;
        var tabs = session.duplicate_tabs;
/* If there are duplicate tab groups and tabs... */
        if (tab_groups !== undefined && tab_groups != null && tab_groups.length > 0 &&
            tabs !== undefined && tabs != null && tabs.length > 0) {
/* Bookmark the duplicate tab groups and tabs. */
            bookmark_duplicate_tabs (session, new_bookmark_folder_id);
        }
    }
}

/*
See:
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Bookmarks
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Places/Manipulating_bookmarks_using_Places
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavBookmarksService
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIIOService
*/
/* Helper for session_to_bookmarks. (1) The session that contains the tab groups and tabs. (2) The new bookmark folder name. (3) True to bookmark duplicate tabs. Return the ID of the new bookmark folder. */
function session_to_bookmarks_helper (session, new_bookmark_folder_name, save_duplicate_tabs) {
/* Get the bookmarks root folder. */
	var bookmarks_root_folder_id = Bookmarks.bookmarksMenuFolder;
/* Create the new bookmark folder. Add it to the root bookmark folder. Bookmarks.DEFAULT_INDEX means to append the new folder at the end of the list. */
	var new_bookmark_folder_id = Bookmarks.createFolder (bookmarks_root_folder_id, new_bookmark_folder_name, Bookmarks.DEFAULT_INDEX);
    var tab_group_action = get_bookmark_session_tab_group_action (new_bookmark_folder_id);
    var tab_action = get_bookmark_session_tab_action ();
/* Create the bookmark folders and bookmarks for this session. Ignore the return value. */
	SessionExporter.ExportSessionUtils.write_session (session.tabs, session.tab_groups, tab_action, tab_group_action);
/* If the user wants to save duplicate tabs to bookmarks, do so. */
    try_bookmark_duplicate_tabs (save_duplicate_tabs, session, new_bookmark_folder_id);
    return new_bookmark_folder_id;
}

/* Before we used runInBatchMode, this function was slow. We considered moving it to a worker thread, but it needs the bookmarks and IO services and we didn't know how to access them in a worker thread. In any case, using runInBatchMode makes the function run much faster. */
/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavBookmarksService
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryBatchCallback
*/
/* Convert the tabs and tab groups in session (1) to bookmarks in a new bookmark folder named (2). (3) True to bookmark duplicate tabs. Return unit. */
function session_to_bookmarks (session, new_bookmark_folder_name, save_duplicate_tabs) {
/* runInBatchMode is supposed to pass its second parameter to runBatched. However, the following code does not work for some reason. session_to_bookmarks_helper fails because data.session is undefined. */
/*
	var callback = { runBatched : function (data) { session_to_bookmarks_helper (data); } };
	Bookmarks.runInBatchMode (callback, { session : session, new_bookmark_folder_name : new_bookmark_folder_name });
*/
/* Therefore, we pass null to runInBatchMode, ignore the runBatched parameter, and close runBatched over the parameters we want to pass to session_to_bookmarks_helper. */
	var callback = { runBatched : function (_) {
		var new_bookmark_folder_id = session_to_bookmarks_helper (session, new_bookmark_folder_name, save_duplicate_tabs);
	} };
// TODO2 Use a promise to get new_bookmark_folder_id and return it.
	Bookmarks.runInBatchMode (callback, null);
}

/* Return the action to apply to the session to save it to bookmarks. (1) The bookmark folder to export to. (2) The user's preferences regarding duplicate tabs. */
function get_bookmark_session_action (new_bookmark_folder_name, duplicate_tabs_prefs) {
/* The action to apply to the session (1) after we read it from the file. Return unit. */
    return function (session) {
/* If the user wants to skip duplicate tabs, do so. */
        if (duplicate_tabs_prefs.skip_duplicate_tabs == true) { session = SessionExporter.SessionUtils.remove_duplicate_tabs (session, duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups); }
/* Add the tabs and tab groups to bookmarks. */
		session_to_bookmarks (session, new_bookmark_folder_name, duplicate_tabs_prefs.save_duplicate_tabs);
/* If there are duplicate tabs, and the user wants to log them, do so. */
        SessionExporter.ExportSessionUtils.try_log_duplicate_tabs (duplicate_tabs_prefs.bool_log_duplicate_tabs, session);
/* Show the result. */
        SessionExporter.ExportSessionUtils.show_result (session);
    };
}

/* Ask the user to select an output file. Export bookmark folder (1) to the output file. Return unit. */
function export_bookmark_folder_internal (folder) {
/* Note if we do not add the .html extension, the file dialog does not ask user permission to overwrite existing files. This is probably because it does not add the extension specified in the dialog (.html) until after it compares the file names. That comparison is negative because the file on disk has the extension and the file name in the dialog does not. */
/* Use the bookmark folder name to create the default output file name. */
	var output_file_name = folder.title + ".html";
/* TODO2 Validate file name. */
/* Ask the user to select the output file. */
	var action = SessionExporter.ExportSession.get_export_session_action (output_file_name, 1, false);
/* If the user selected an output file... */
	if (action != null) {
/* Note we do not call SessionExporter.SessionUtils.combine_sessions to handle duplicate tab groups. There is only a single tab group (based on a bookmark folder), so there can be no tab groups with the same ID or title. */
/* Convert the bookmark folders and bookmarks in the bookmark folder to a session. */
		var sessions = SessionExporter.BookmarkUtils.read_bookmark_folders ([folder]);
        if (sessions.length > 0) {
/* Apply the action to the session. */
			action (sessions [0]);
        }
	}
}

/* Ask the user to select an output file. Convert bookmark folders (1) into sessions. Export the combined session to the output file. Return unit. */
function export_bookmark_folders_combined_internal (folders) {
/* Get the names of the bookmark folders. */
    var folder_names = _.map (folders, function (folder) { return folder.title; });
/* Note get_default_output_file_name_from_bookmark_folders adds the .html extension. */
/* Use the bookmark folder names to create the default output file name. */
    var output_file_name = get_default_output_file_name_from_bookmark_folders (folder_names);
/* TODO2 Validate file name. */
/* Ask the user to select the output file. */
    var action = SessionExporter.ExportSession.get_export_session_action (output_file_name, folders.length, false);
/* If the user selected an output file... */
    if (action != null) {
/* Convert the bookmark folders to sessions. */
    	var sessions = SessionExporter.BookmarkUtils.read_bookmark_folders (folders);
/* Combine the sessions. */
		var combined_session = SessionExporter.SessionUtils.combine_sessions (sessions, SessionExporter.ExportSessionUtils.get_combine_tab_groups_prefs ());
/* Apply the action to the session. */
		action (combined_session);
    }
}

/* Ask the user to select a bookmark folder name. Convert bookmark folders (1) into sessions. Save the combined session in the specified bookmark folder. Return unit. */
function merge_bookmark_folders_combined_internal (folders) {
/* Ask the user to name the new bookmark folder. */
    var new_bookmark_folder_name = get_new_bookmark_folder_name ();
/* If the user entered a new bookmark folder name... */
	if (new_bookmark_folder_name != null && new_bookmark_folder_name.length > 0) {
/* Get the settings for logging and saving duplicate tabs. */
        var duplicate_tabs_prefs = SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs (1, FileOrBookmark.Bookmark, SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs_helper ());
/* Get the action to apply to the session. */
        var action = get_bookmark_session_action (new_bookmark_folder_name, duplicate_tabs_prefs);
/* Convert the bookmark folders to sessions. */
		var sessions = SessionExporter.BookmarkUtils.read_bookmark_folders (folders);
/* Combine the sessions. */
		var combined_session = SessionExporter.SessionUtils.combine_sessions (sessions, SessionExporter.ExportSessionUtils.get_combine_tab_groups_prefs ());
/* Apply the action to the session. */
		action (combined_session);
    }
}

/* Ask the user to select one or more bookmark folders. Apply action (2) to the bookmark folders. (1) True to apply the action to all bookmark folders. Return unit. */
function export_bookmark_folders_helper (export_all_folders, action) {
/* Get the bookmark folders. */
    var folders = SessionExporter.BookmarkUtils.get_all_bookmark_folders ();
/* Verify there is at least one bookmark folder. */
	if (folders.length == 0) { get_window ().alert ("There are no bookmark folders to export."); }
    else {
/* If the user does not want to apply the action to all bookmark folders, ask the user to select one or more bookmark folders. */
        if (export_all_folders == false) {
            folders = select_bookmark_folders_to_export (folders);
        }
/* If the user selected at least one bookmark folder, apply the action. */
        if (folders.length > 0) {
            action (folders);
        }
    }
}

/* Functions: methods. */

var BookmarkSession = {

/* Note if the user selects only one bookmark folder, or if the user selects "all bookmark folders" but there is only one bookmark folder, then SessionUtils.combine_sessions_internal does not merge the tab groups. */
/* Ask the user to select a session file. Read the session file and convert the tabs and tab groups in the session to bookmarks in a new bookmark folder. Return unit. */
	bookmark_sessions : function () {
/* Ask the user to select the session files. */
        var input_files = SessionExporter.ExportSessionUtils.get_session_files ();
/* If the user selected at least one session file... */
		if (input_files.length > 0) {
/* Ask the user to name the new bookmark folder. */
			var new_bookmark_folder_name = get_new_bookmark_folder_name ();
/* If the user entered a new bookmark folder name... */
			if (new_bookmark_folder_name != null && new_bookmark_folder_name.length > 0) {
/* Get the settings for logging and saving duplicate tabs. */
                var duplicate_tabs_prefs = SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs (input_files.length, FileOrBookmark.Bookmark, SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs_helper ());
/* Get the action to apply to the sessions. */
				var action = get_bookmark_session_action (new_bookmark_folder_name, duplicate_tabs_prefs);
/* Read the input files and perform the action. */
				SessionExporter.SessionUtils.get_sessions_from_files (input_files, action, false, SessionExporter.ExportSessionUtils.get_combine_tab_groups_prefs ());
			}
		}
	},

/* Note SessionUtils.get_current_session_from_session_state does not call SessionUtils.combine_sessions_internal. There is only a single session, so there should be no tab groups with the same ID. There might be tab groups with the same title, but it seems unlikely that the user would want to merge them. */
/* Convert the tabs and tab groups in the current session to bookmarks in a new bookmark folder. Return unit. */
	bookmark_current_session : function () {
/* Ask the user to name the new bookmark folder. */
		var new_bookmark_folder_name = get_new_bookmark_folder_name ();
/* If the user entered a new bookmark folder name... */
		if (new_bookmark_folder_name != null && new_bookmark_folder_name.length > 0) {
/* Get the settings for logging and saving duplicate tabs. */
            var duplicate_tabs_prefs = SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs (1, FileOrBookmark.Bookmark, SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs_helper ());
/* Get the action to apply to the session. */
            var action = get_bookmark_session_action (new_bookmark_folder_name, duplicate_tabs_prefs);
/* Get the tabs and tab groups in the currently open session and apply the action. */
			SessionExporter.SessionUtils.get_current_session_from_session_state (action, false);
		}
	},

// TODO1 Have a setting to detect duplicate tabs using title, not just URL?
// TODO1 Add ability to export bookmark folder(s) to session.

// TODO1 Re-doc this test list
/* The following functions are tested as follows.
x BookmarkUtils.get_bookmark_folders. test_bookmark_session_helper > test_get_bookmark_folder_by_name.
x BookmarkUtils.get_all_bookmark_folders. test_bookmark_session_helper > test_get_bookmark_folder_by_name.
x BookmarkUtils.read_bookmark_folders. test_bookmark_session_helper > test_get_bookmark_folder_by_name.
N BookmarkUtils.read_all_bookmark_folders. Not used here. Used by BookmarkSorter.
N BookmarkUtils.move_bookmark. Not used here. Used by BookmarkSorter.
N get_bookmark_folder_to_export. UI function.
/ get_export_session_action. UI function, but calls get_export_session_action_helper, which is called by test_export_session_helper.
/ read_bookmark_folders. Called by test_bookmark_session_helper > test_get_bookmark_folder_by_name.
N get_default_output_file_name_from_bookmark_folders.
x SessionUtils.combine_sessions.
*/

/* Note export_bookmark_folder_internal does not call SessionUtils.combine_sessions_internal. There is only a single tab group (based on a bookmark folder), so there can be no tab groups with the same ID or title. */
/* Ask the user to select one or more bookmark folders and output files. Convert the bookmark folders to sessions and export them to the output files. (1) True to export all bookmark folders. Return unit. */
    export_bookmark_folders : function (export_all_folders) {
        export_bookmark_folders_helper (export_all_folders, function (folders) {
            _.each (folders, export_bookmark_folder_internal);
        });
    },

/* Note if the user selects only one bookmark folder, or if the user selects "all bookmark folders" but there is only one bookmark folder, then SessionUtils.combine_sessions_internal does not merge the tab groups. */
/* Ask the user to select one or more bookmark folders and an output file. Convert the bookmark folders to sessions and export the combined session to the output file. (1) True to export all bookmark folders. Return unit. */
    export_bookmark_folders_combined : function (export_all_folders) {
        export_bookmark_folders_helper (export_all_folders, function (folders) {
            export_bookmark_folders_combined_internal (folders);
        });
    },

/* Note if the user selects only one bookmark folder, or if the user selects "all bookmark folders" but there is only one bookmark folder, then SessionUtils.combine_sessions_internal does not merge the tab groups. */
/* Ask the user to select a bookmark folder name. Convert the bookmark folders to sessions and combine the session. Save the combined session in the specified bookmark folder. (1) True to merge all bookmark folders. Return unit. */
    merge_bookmark_folders : function (export_all_folders) {
        export_bookmark_folders_helper (export_all_folders, function (folders) {
            merge_bookmark_folders_combined_internal (folders);
        });
    },

/* This exposes get_bookmark_session_action for the test functions in ExportSessionUtils. */
    test_get_bookmark_session_action : function (new_bookmark_folder_name, duplicate_tabs_prefs) {
        return get_bookmark_session_action (new_bookmark_folder_name, duplicate_tabs_prefs);
    },
}