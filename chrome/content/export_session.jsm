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
var EXPORTED_SYMBOLS = ["ExportSession"];

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
/* Include sprintf. */
scriptLoader.loadSubScript (SessionExporter.Consts.content_folder + "sprintf.min.js");

/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "File", SessionExporter.Consts.content_folder + "file.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "SessionUtils", SessionExporter.Consts.content_folder + "session_utils.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "ExportSessionUtils", SessionExporter.Consts.content_folder + "export_session_utils.jsm");

/* Enumerations. */

/* Whether to export a session to a file or save it to bookmarks. */
const FileOrBookmark = { File : 0, Bookmark : 1};

/* Helper classes. */

/* Formats used to write a session to a file. */
var session_formats = {
	header_format : "<html><head><meta charset=\"UTF-8\"></head><body>\n",
	tab_count_format : "Tab count: %d.<br>\n",
	tab_group_count_format : "Tab group count: %d.<br>\n",
    duplicate_tab_count_format : "<br><a name=\"_duplicate_tabs\"></a><strong>Duplicate tab count: %d.</strong><br>\n",
    toc_header_format : "<strong>Table of Contents:</strong><br>\n<ul>\n",
    tab_group_link_format : "<li><a href=\"#%s\">%s</a></li>\n",
	toc_duplicate_tabs_link_format : "<li><a href=\"#_duplicate_tabs\">Duplicate Tabs</a></li>\n",
    toc_footer_format : "</ul>\n",
	tab_group_format : "<br><a name=\"%s\"></a><strong>%s</strong><br>\n",
	tab_format : "<a href=\"%s\">%s</a><br>\n",
	duplicate_tab_format : "<a href=\"%s\">%s</a> (original tab in <a href=\"#%s\">%s</a>)<br>\n",
    history_header_format : "<ul>\n",
    history_entry_format : "<li><a href=\"%s\">%s</a></li>\n",
    history_footer_format : "</ul><br>\n",
	footer_format : "</body></html>\n",
};

/* Applies the formats in session_formats. */
var session_formatter = {
    format_tab_count : function (tab_count) { return sprintf (session_formats.tab_count_format, tab_count); },
    format_tab_group_count : function (tab_group_count) { return sprintf (session_formats.tab_group_count_format, tab_group_count); },
    format_duplicate_tab_count : function (tab_count) { return sprintf (session_formats.duplicate_tab_count_format, tab_count); },
    format_tab_group_link : function (tab_group_id, tab_group_name) { return sprintf (session_formats.tab_group_link_format, tab_group_id, tab_group_name); },
	format_tab_group : function (tab_group_id, tab_group_name) { return sprintf (session_formats.tab_group_format, tab_group_id, tab_group_name); },
	format_tab : function (url, title) { return sprintf (session_formats.tab_format, url, title); },
	format_duplicate_tab : function (url, title, original_tab_group_id, original_tab_group_name) { return sprintf (session_formats.duplicate_tab_format, url, title, original_tab_group_id, original_tab_group_name); },
    format_history_entry : function (url, title) { return sprintf (session_formats.history_entry_format, url, title); },
};

/* Functions: general helpers. */

function get_window () { return SessionExporter.Consts.get_window (); }
function get_windows () { return SessionExporter.Consts.get_windows (); }

// TODO1 Move to consts.jsm.
/* Return the current date as a formatted string. */
function getDateString () {
/* Helper function. Format number (1) to have at least two digits and format it as a string. Return the string. */
	function format (n) {
		if (n > 9) { return "" + n; } else { return "0" + n; }
	}
	var d = new Date ();
/* Month is returned as 0-11. */
	return format (d.getFullYear ()) + format (d.getMonth () + 1) + format (d.getDate ()) + "_" + format (d.getHours ()) + format (d.getMinutes ()) + format (d.getSeconds ());
}

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Method/addTab
*/
/* Open file (1) in a new tab. Return unit. */
function open_file_in_tab (file) {
	var window = get_window ();
	var path = "file:///" + file.path;
/* Add the tab. */
	window.gBrowser.addTab (path);
}

/* Return an output file name created from the current date. */
function get_default_output_file_name_from_current_date () {
/* Note if we do not add the .html extension, the file dialog does not ask user permission to overwrite existing files. This is probably because it does not add the extension specified in the dialog (.html) until after it compares the file names. That comparison is negative because the file on disk has the extension and the file name in the dialog does not. */
    return "Session_" + getDateString () + ".html";
}

/* Return an output file name created from input files (1). Preconditions: input_files.length > 0. */
function get_default_output_file_name_from_files (input_files) {
/* Use the combined names of the session files as the default output file name. */
	var default_output_file_name = _.reduce (input_files, function (acc, input_file) {
        return acc + input_file.leafName.replace (".session", "_");
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

/* Return the action to apply to each tab group in write_session. */
function get_session_to_string_tab_group_action () {
/* Write the ID and title for tab group (1). Return an object with two fields:
result: The output.
tab_group_id_data: An empty string. */
    return function (tab_group) {
		var result = session_formatter.format_tab_group (tab_group.id, tab_group.title);
		return { result : result, tab_group_id_data : "" };
	};
}

/* Write the history of a tab. (1) True to write the tab history. (2) The tab. Return the written history. */
function write_tab_history (include_tab_history, tab) {
    var result = "";
/* If the user wants to export the tab history, and the history exists and has more than one entry, write the history. */
    if (include_tab_history == true && tab.history !== undefined && tab.history != null && tab.history.length > 1) {
/* Combine the history entries. */
        result += _.reduce (tab.history, function (acc, entry) {
            return acc + session_formatter.format_history_entry (entry.url, entry.title);
        }, session_formats.history_header_format);
        result += session_formats.history_footer_format;
    }
    return result;
}

/* Return the action to apply to each tab in write_session. (1) True to export the history for each tab. */
function get_session_to_string_tab_action (include_tab_history) {
/* Write the string for tab (1). (2) The bookmark folder ID for the tab group for this tab, which is not used here. Return the output. */
	return function (tab, _) {
        var result = session_formatter.format_tab (tab.url, tab.title);
        result += write_tab_history (include_tab_history, tab);
		return result;
	};
}

/* Return the action to apply to each duplicate tab in write_session. (1) True to export the history for each tab. */
function get_session_to_string_duplicate_tab_action (include_tab_history) {
/* Write the string for tab (1). (2) The bookmark folder ID for the tab group for this tab, which is not used here. Return the output. */
	return function (tab, _) {
		var original_tab_group_id = tab.duplicate_data.original_tab_group_id;
		var original_tab_group_title = tab.duplicate_data.original_tab_group_title;
        var result = session_formatter.format_duplicate_tab (tab.url, tab.title, original_tab_group_id, original_tab_group_title);
        result += write_tab_history (include_tab_history, tab);
		return result;
	};
}

/* Convert duplicate tabs to text. (1) True if the user wants to save duplicate tabs. (2) The session that contains the tab groups and duplicate tabs. (3) The action to apply to each duplicate tab. (4) The action to apply to each tab group. Return the text. */
function duplicate_tabs_to_string (save_duplicate_tabs, session, tab_action, tab_group_action) {
/* If the user does not want to save duplicate tabs, return an empty string. */
    if (save_duplicate_tabs == false) { return ""; }
    else {
        var result = "";
/* We generate the HTML anchor name for each tab group from its ID. Change the duplicate tab group IDs so their anchor names do not conflict with those of the non-duplicate tab groups. Copy each duplicate tab group by value so we do not change the original duplicate tab group. */
        var tab_groups = _.map (session.duplicate_tab_groups, function (tab_group) {
            return { id : tab_group.id + "d", title : tab_group.title, };
        });
/* We would prefer to use _.map, but that requires us to copy multiple tab field values that do not change. In F# we would use the with keyword. */
/* Change the tab group IDs of the duplicate tabs to correspond to the changed IDs of the duplicate tab groups. */
		var tabs = session.duplicate_tabs;
        _.each (tabs, function (tab) {
            tab.tab_group_id = tab.tab_group_id + "d";
        });
/* If there are duplicate tab groups and tabs... */
        if (tab_groups !== undefined && tab_groups != null && tab_groups.length > 0 &&
            tabs !== undefined && tabs != null && tabs.length > 0) {
/* Write the duplicate tab count. */
            result += session_formatter.format_duplicate_tab_count (tabs.length);
/* Write the TOC header. */
            result += session_formats.toc_header_format;
/* Write the duplicate tab group links. */
            result += _.reduce (tab_groups, function (acc, tab_group) { return acc + session_formatter.format_tab_group_link (tab_group.id, tab_group.title); }, "");
/* Write the TOC footer. */
            result += session_formats.toc_footer_format;
/* Write the duplicate tab groups and tabs. */
            result += SessionExporter.ExportSessionUtils.write_session (tabs, tab_groups, tab_action, tab_group_action);
        }
        return result;
    }
}

/* Convert the tabs and tab groups in session (1) to text. (2) True to export the history of each tab. (3) True to convert duplicate tabs to text. Return the text. */
function session_to_string (session, include_tab_history, save_duplicate_tabs) {
/* Get the tab group, tab, and duplicate tab actions. */
    var tab_group_action = get_session_to_string_tab_group_action ();
    var tab_action = get_session_to_string_tab_action (include_tab_history);
	var duplicate_tab_action = get_session_to_string_duplicate_tab_action (include_tab_history);
/* Write the header. */
	var result = session_formats.header_format;
	result += session_formatter.format_tab_count (session.tabs.length);
	result += session_formatter.format_tab_group_count (session.tab_groups.length);
/* Write the TOC header. */
    result += session_formats.toc_header_format;
/* Write the tab group links. */
    result += _.reduce (session.tab_groups, function (acc, tab_group) { return acc + session_formatter.format_tab_group_link (tab_group.id, tab_group.title); }, "");
/* If the user wants to write duplicate tabs to the file, write the link to the duplicate tabs section. */
	if (save_duplicate_tabs == true) { result += session_formats.toc_duplicate_tabs_link_format; }
/* Write the TOC footer. */
    result += session_formats.toc_footer_format;
/* Write the tab groups and tabs for this session. */
	result += SessionExporter.ExportSessionUtils.write_session (session.tabs, session.tab_groups, tab_action, tab_group_action);
/* If there are duplicate tabs, and the user wants to write them to the file, do so. */
    result += duplicate_tabs_to_string (save_duplicate_tabs, session, duplicate_tab_action, tab_group_action);
/* Write the footer. */
	result += session_formats.footer_format;
	return result;
}

/* Return the action to apply to the session to write it to file. (1) True to export the history of each tab. (2) The user's preferences regarding duplicate tabs. (3) The output file to export to. (4) True to open the output file in a new tab. */
function get_export_session_action_helper (include_tab_history, duplicate_tabs_prefs, output_file, open_in_new_tab) {
/* Note we capture include_tab_history, duplicate_tabs_prefs, and output_file with a closure. */
/* The action to apply to the session (1) after we read it from the file. Return unit. */
    return function (session) {
/* If the user wants to skip duplicate tabs, do so. */
        if (duplicate_tabs_prefs.skip_duplicate_tabs == true) { session = SessionExporter.SessionUtils.remove_duplicate_tabs (session, duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups); }
/* Convert the tabs and tab groups to text. */
		var output = session_to_string (session, include_tab_history, duplicate_tabs_prefs.save_duplicate_tabs);
/* Write the text to the output file. */
		SessionExporter.File.writeFile (output, output_file);
/* If there are duplicate tabs, and the user wants to log them, do so. */
        SessionExporter.ExportSessionUtils.try_log_duplicate_tabs (duplicate_tabs_prefs.bool_log_duplicate_tabs, session);
/* Show the result. */
        SessionExporter.ExportSessionUtils.show_result (session);
/* Open the output file in a new tab if indicated. */
		if (open_in_new_tab == true) { open_file_in_tab (output_file); }
	};
}

/* Ask the user to select an output file. (1) The default output file name. (2) The number of input files. (3) True to export the history of each tab. Return the action to apply to the session to write it to file. */
function get_export_session_action (output_file_name, input_file_count, include_tab_history) {
/* Ask the user to select the output file. */
	var output_file = SessionExporter.File.getWriteFile (output_file_name);
/* If the user selected an output file... */
	if (output_file != null) {
/* Get the settings for logging and saving duplicate tabs. */
        var duplicate_tabs_prefs = SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs (input_file_count, FileOrBookmark.File, SessionExporter.ExportSessionUtils.get_duplicate_tabs_prefs_helper ());
/* Get the action to apply to the sessions. */
        var action = get_export_session_action_helper (include_tab_history, duplicate_tabs_prefs, output_file, true);
        return action;
    }
    else { return null; }
}

/* Functions: methods. */

var ExportSession = {

/* Note if the user selects only one session file, then SessionUtils.combine_sessions_internal does not merge the tab groups. */
/* Ask the user to select one or more sessions file and an output file. Read the session files and export the sessions to the output file. (1) True to export the history of each tab. Return unit. */
	export_sessions : function (include_tab_history) {
/* Ask the user to select the session files. */
        var input_files = SessionExporter.ExportSessionUtils.get_session_files ();
/* If the user selected at least one session file... */
		if (input_files.length > 0) {
/* Note get_default_output_file_name_from_files adds the .html extension. */
/* Use the input file names to create the default output file name. */
            var output_file_name = get_default_output_file_name_from_files (input_files);
/* Ask the user to select the output file. */
            var action = get_export_session_action (output_file_name, input_files.length, include_tab_history);
            if (action != null) {
/* Read the input files and apply the action. */
				SessionExporter.SessionUtils.get_sessions_from_files (input_files, action, include_tab_history, SessionExporter.ExportSessionUtils.get_combine_tab_groups_prefs ());
			}
		}
	},

/* Note SessionUtils.get_current_session_from_session_state does not call SessionUtils.combine_sessions_internal. There is only a single session, so there should be no tab groups with the same ID. There might be tab groups with the same title, but it seems unlikely that the user would want to merge them. */
/* Ask the user to select an output file. Export the currently open session to the output file. (1) True to export the history of each tab. Return unit. */
	export_current_session : function (include_tab_history) {
/* Note get_default_output_file_name_from_current_date adds the .html extension. */
/* Since there are no input files, we cannot use the input file names to create the default output file name. Instead, we use the current date and time. */
        var output_file_name = get_default_output_file_name_from_current_date ();
/* Ask the user to select the output file. */
        var action = get_export_session_action (output_file_name, 1, include_tab_history);
        if (action != null) {
/* Get the tabs and tab groups in the currently open session and apply the action. */
			SessionExporter.SessionUtils.get_current_session_from_session_state (action, include_tab_history);
		}
	},

/* This exposes get_export_session_action for BookmarkSession. */
    get_export_session_action : function (include_tab_history, duplicate_tabs_prefs, output_file, open_in_new_tab) {
        return get_export_session_action (include_tab_history, duplicate_tabs_prefs, output_file, open_in_new_tab);
    },

/* Methods: test. */

/* This exposes get_export_session_action_helper for the test functions in ExportSessionUtils. */
    test_get_export_session_action_helper : function (include_tab_history, duplicate_tabs_prefs, output_file, open_in_new_tab) {
        return get_export_session_action_helper (include_tab_history, duplicate_tabs_prefs, output_file, open_in_new_tab);
    },

    test : function () {
        SessionExporter.ExportSessionUtils.test_get_duplicate_tabs_prefs ();
        SessionExporter.ExportSessionUtils.test_export_session ();
        SessionExporter.ExportSessionUtils.test_bookmark_session ();
		SessionExporter.ExportSessionUtils.test_combine_sessions ();
    },
}