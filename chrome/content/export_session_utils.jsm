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
var EXPORTED_SYMBOLS = ["ExportSessionUtils"];

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
/* For some reason, if we import this with defineLazyModuleGetter, the Firefox open menu button does not work. */
Components.utils.import ("resource://gre/modules/Promise.jsm");
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

/* See:
https://developer.mozilla.org/en-US/Add-ons/Performance_best_practices_in_extensions
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm
We don't use these modules and services at startup, so we import them with XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter instead of Components.utils.import and Components.classes.
Note the name parameter must match an exported symbol from the module.
*/
/* Firefox modules. */
XPCOMUtils.defineLazyModuleGetter (this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
/* Firefox services. */
XPCOMUtils.defineLazyServiceGetter (this, "Bookmarks", "@mozilla.org/browser/nav-bookmarks-service;1", Components.interfaces.nsINavBookmarksService);

/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "File", SessionExporter.Consts.content_folder + "file.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "SessionUtils", SessionExporter.Consts.content_folder + "session_utils.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "BookmarkUtils", SessionExporter.Consts.content_folder + "bookmark_utils.jsm");
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "Session", SessionExporter.Consts.content_folder + "session.jsm");
/* Note ExportSession also imports ExportSessionUtils, so this creates a circular reference, but it does not seem to cause a problem. This is necessary because test_export_session_helper calls get_export_session_action_helper, which is in ExportSession, and which cannot be moved here. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "ExportSession", SessionExporter.Consts.content_folder + "export_session.jsm");
/* Similarly, this is necessary because test_bookmark_session_helper calls get_bookmark_session_action. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "BookmarkSession", SessionExporter.Consts.content_folder + "bookmark_session.jsm");

/* Enumerations. */

/* Whether to export a session to a file or save it to bookmarks. */
const FileOrBookmark = { File : 0, Bookmark : 1};

/* Functions: general helpers. */

function get_window () { return SessionExporter.Consts.get_window (); }
function get_windows () { return SessionExporter.Consts.get_windows (); }

/* Functions: method helpers. */

/* Log duplicate tabs (1) and tab groups (2). Return unit. */
function log_duplicate_tabs (tabs, tab_groups) {
    var header_format = "%d duplicate tabs.\n";
	var tab_group_format = "Tab group ID: %s. Tab group title: %s.\n";
	var tab_format = "%s\n";
/* Write the title for tab group (1). Return an object with two fields:
result: The output.
tab_group_id_data: An empty string. */
	var tab_group_action = function (tab_group) {
		var result = sprintf (tab_group_format, tab_group.id, tab_group.title);
		return { result : result, tab_group_id_data : "" };
	};
/* Write the url and title for tab (1). (2) The bookmark folder ID for the tab group for this tab, which is not used here. Return the output. */
	var tab_action = function (tab, _) {
        var result = sprintf (tab_format, tab.url);
		return result;
	};
/* Write the header. */
    var result = sprintf (header_format, tabs.length);
/* Write the tab groups and tabs for this session. */
	result += ExportSessionUtils.write_session (tabs, tab_groups, tab_action, tab_group_action);
    SessionExporter.Consts.log (result);
}

/* Functions: test helpers. */

/* Raise an exception if (2) is not true. (1) The name of the test. Return unit. */
function assert_true (test_name, value) {
    if (value == false) {
        throw new Error (sprintf ("export_session.jsm: assert_true: Test %s failed.", test_name));
    }
}

/* Default duplicate tabs preferences. */
function get_test_duplicate_tabs_prefs () {
    return {
        skip_duplicate_tabs : false,
		skip_duplicate_tabs_across_tab_groups : false,
        bool_log_duplicate_tabs : false,
        save_duplicate_tabs : false,
    };
}

/*
Format:
Tab groups
[
    ID
    Title
    Tabs
    [
        Title
        URL
    ]
]

Example:
[
    [0, "tab_group_title", [["tab_title", "url"]],
    ],
]
*/
/* Return a session based on the notation in (1). */
function get_test_session (session) {
    var tabs = [];
    var tab_groups =
        _.map (session, function (tab_group) {
            tabs = tabs.concat (_.map (tab_group [2], function (tab) {
                return { tab_group_id : tab_group [0], title : tab [0], url : tab [1], };
            }));
            return { id : tab_group [0], title : tab_group [1], };        
        });
    return {
        tabs : tabs,
        tab_groups : tab_groups,
    };
}

/* Return a list of sessions based on the notation in (1). */
function get_test_sessions (sessions) {
    return _.map (sessions, get_test_session);
}

/* Return a set of preferences for combining tabs based on the notation in (1). */
function get_test_combine_tabs_prefs (prefs) {
    return {
        session_file_order : prefs [0],
	    combine_tab_groups_same_id : prefs [1],
        combine_tab_groups_same_title : prefs [2],
        combine_tab_groups_same_id_and_title : prefs [3],
    };
}

/* Return an object that contains test sessions and expected output strings for these sessions. */
function get_export_bookmark_test_sessions () {
/* Return a copy by value of object (1). */
    var clone = function (obj) { return JSON.parse (JSON.stringify (obj)); };
/* Basic session information. */
    var basic_tab_group_title = "Tab Group ID 1";
    var basic_tab_group_id = 1;
    var basic_tab_title = "Current";
/* For some reason we cannot use "http://about:blank". */
    var basic_tab_url = "https://mozilla.org/";
/* Additional tab group information. */
	var second_tab_group_title = "Tab Group ID 2";
	var second_tab_group_id = 2;
/* History session information. */
    var history_entry_title = "Previous";
    var history_entry_url = "https://firefox.com";
/* The test sessions. */
    var sessions = {
/* The basic session with one tab group and one tab. No tab history or duplicate tabs. */
        basic : get_test_session ([
            [basic_tab_group_id, basic_tab_group_title, [[basic_tab_title, basic_tab_url]],
            ],
        ]),
/* The expected output string for the basic session. */
        basic_output : "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 1.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
"</body></html>\n",
/* The expected bookmarks for the basic session. */
        basic_bookmarks : {
            tab_groups : [{
                title : "basic"
            },
            {
                title : basic_tab_group_title
            }],
/* These fields must be in this order for when we compare sessions using JSON.stringify. */
            tabs : [{
                title : basic_tab_title,
                url : basic_tab_url,
            }],
        },
    };
/* Create the history session as a copy of the basic session. */
    sessions.history = clone (sessions.basic);
/* Add history entries. The current tab is included in the history, so we ignore a history that has only one entry. */
    sessions.history.tabs[0].history = [{
        url : basic_tab_url,
        title : basic_tab_title,
    },
    {
        url : history_entry_url,
        title : history_entry_title,
    }];
/* The expected output string for the history session. */
    sessions.history_output = "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 1.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
"<ul>\n" +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", basic_tab_url, basic_tab_title) +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", history_entry_url, history_entry_title) +
"</ul><br>\n" +
"</body></html>\n";
/* Create the duplicate tabs session as a copy of the basic session. */
    sessions.duplicate_tabs = clone (sessions.basic);
/* Add a duplicate tab. */
    sessions.duplicate_tabs.tabs.push ({
        url : basic_tab_url,
        title : basic_tab_title,
        tab_group_id : basic_tab_group_id,
    });
/* The expected output string for the duplicate tabs session if duplicate tabs are not skipped. If they are skipped, the expected output string is the same as the basic session. */
    sessions.duplicate_tabs_output = "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 2.<br>\n" +
"Tab group count: 1.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
"</body></html>\n";
/* The expected bookmarks for the duplicate tabs session if duplicate tabs are not skipped. */
    sessions.duplicate_tabs_bookmarks = {
        tab_groups : [{
            title : "duplicate_tabs"
        },
        {
            title : basic_tab_group_title
        }],
        tabs : [{
            title : basic_tab_title,
            url : basic_tab_url,
        },
        {
            title : basic_tab_title,
            url : basic_tab_url,
        }],
    };
/* The expected bookmarks for the duplicate tabs session if duplicate tabs are skipped and not saved. */
    sessions.duplicate_tabs_skip_bookmarks = {
        tab_groups : [{
            title : "duplicate_tabs_skip"
        },
        {
            title : basic_tab_group_title
        }],
        tabs : [{
            title : basic_tab_title,
            url : basic_tab_url,
        }],
    };
/* The expected output string for the duplicate tabs session if duplicate tabs are skipped and saved. */
    sessions.duplicate_tabs_saved_output = "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 1.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"<li><a href=\"#_duplicate_tabs\">Duplicate Tabs</a></li>\n" +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
"<br><a name=\"_duplicate_tabs\"></a><strong>Duplicate tab count: 1.</strong><br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%sd\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%sd\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a> (original tab in <a href=\"#%s\">%s</a>)<br>\n", basic_tab_url, basic_tab_title, basic_tab_group_id, basic_tab_group_title) +
"</body></html>\n";
/* See the read_bookmark_folders function. When we save the session to bookmarks, the duplicate tab group and tab are placed in a bookmark folder titled "Duplicate Tabs". */
/* When we export the bookmark folder to a session for the comparison in this test, the duplicate tab is not skipped. The duplicate tab would be skipped when the action returned by get_export_session_action was applied to it. */
/* The expected bookmarks for the duplicate tabs session if duplicate tabs are skipped and saved. */
    sessions.duplicate_tabs_save_bookmarks = {
        tab_groups : [{
            title : "duplicate_tabs_save"
        },
        {
            title : basic_tab_group_title
        },
        {
            title : "Duplicate Tabs"
        },
/* The basic tab group contains a duplicate tab, so it appears again under the "Duplicate Tabs" group. */
        {
            title : basic_tab_group_title
        }],
        tabs : [{
            title : basic_tab_title,
            url : basic_tab_url,
        },
        {
            title : basic_tab_title,
            url : basic_tab_url,
        }],
    };
/* Create the "duplicate tabs across tab groups" session as a copy of the basic session. */
    sessions.duplicate_tabs_across_tab_groups = clone (sessions.basic);
/* Add a tab group. */
	sessions.duplicate_tabs_across_tab_groups.tab_groups.push ({
		id : second_tab_group_id,
		title : second_tab_group_title,
	});
/* Add a duplicate tab in the new tab group. */
    sessions.duplicate_tabs_across_tab_groups.tabs.push ({
        url : basic_tab_url,
        title : basic_tab_title,
        tab_group_id : second_tab_group_id,
    });
/* The expected output for the "duplicate tabs across tab groups" session if duplicate tabs are skipped and not saved. The second tab group has no tabs after we remove duplicates, but we do not remove the tab group itself. */
    sessions.duplicate_tabs_across_tab_groups_output = "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 2.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", second_tab_group_id, second_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", second_tab_group_id, second_tab_group_title) +
"</body></html>\n";
/* The expected bookmarks for the "duplicate tabs across tab groups" session if duplicate tabs are skipped and not saved. */
	sessions.duplicate_tabs_across_tab_groups_bookmarks = {
        tab_groups : [{
			title : "duplicate_tabs_skip_across_tab_groups"
		},
        {
            title : basic_tab_group_title
        },
		{
            title : second_tab_group_title
        }],
        tabs : [{
            title : basic_tab_title,
            url : basic_tab_url,
        }],
	};
/* The expected output for the "duplicate tabs across tab groups" session if duplicate tabs are skipped and saved. */
	sessions.duplicate_tabs_across_tab_groups_save_output = "<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 2.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", second_tab_group_id, second_tab_group_title) +
"<li><a href=\"#_duplicate_tabs\">Duplicate Tabs</a></li>\n" +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", second_tab_group_id, second_tab_group_title) +
"<br><a name=\"_duplicate_tabs\"></a><strong>Duplicate tab count: 1.</strong><br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%sd\">%s</a></li>\n", second_tab_group_id, second_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%sd\"></a><strong>%s</strong><br>\n", second_tab_group_id, second_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a> (original tab in <a href=\"#%s\">%s</a>)<br>\n", basic_tab_url, basic_tab_title, basic_tab_group_id, basic_tab_group_title) +
"</body></html>\n";
/* The expected bookmarks for the "duplicate tabs across tab groups" session if duplicate tabs are skipped and saved. */
	sessions.duplicate_tabs_across_tab_groups_save_bookmarks = {
        tab_groups : [{
			title : "duplicate_tabs_across_tab_groups_save"
		},
        {
            title : basic_tab_group_title
        },
		{
            title : second_tab_group_title
        },
        {
            title : "Duplicate Tabs"
        },
/* The second tab group contains a duplicate tab, so it appears again under the "Duplicate Tabs" group. */
		{
            title : second_tab_group_title
        }],
        tabs : [{
            title : basic_tab_title,
            url : basic_tab_url,
        }, {
            title : basic_tab_title,
            url : basic_tab_url,
        }],
	};
/* Create the session with duplicate tabs and tab history as a copy of the duplicate tabs session. */
    sessions.duplicate_tabs_history = clone (sessions.duplicate_tabs);
/* Add history entries to the original and duplicate tabs. The current tab is included in the history, so we ignore a history that has only one entry. */
    _.each (sessions.duplicate_tabs_history.tabs, function (tab) {
		tab.history = [{
			url : basic_tab_url,
			title : basic_tab_title,
		},
		{
			url : history_entry_url,
			title : history_entry_title,
		}];
	});
/* The expected output string for the session with duplicate tabs and tab history, if duplicate tabs are skipped and saved and tab history is exported. */
	sessions.duplicate_tabs_saved_history_output =
"<html><head><meta charset=\"UTF-8\"></head><body>\n" +
"Tab count: 1.<br>\n" +
"Tab group count: 1.<br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%s\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"<li><a href=\"#_duplicate_tabs\">Duplicate Tabs</a></li>\n" +
"</ul>\n" +
sprintf ("<br><a name=\"%s\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a><br>\n", basic_tab_url, basic_tab_title) +
"<ul>\n" +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", basic_tab_url, basic_tab_title) +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", history_entry_url, history_entry_title) +
"</ul><br>\n" +
"<br><a name=\"_duplicate_tabs\"></a><strong>Duplicate tab count: 1.</strong><br>\n" +
"<strong>Table of Contents:</strong><br>\n<ul>\n" +
sprintf ("<li><a href=\"#%sd\">%s</a></li>\n", basic_tab_group_id, basic_tab_group_title) +
"</ul>\n" +
sprintf ("<br><a name=\"%sd\"></a><strong>%s</strong><br>\n", basic_tab_group_id, basic_tab_group_title) +
sprintf ("<a href=\"%s\">%s</a> (original tab in <a href=\"#%s\">%s</a>)<br>\n", basic_tab_url, basic_tab_title, basic_tab_group_id, basic_tab_group_title) +
"<ul>\n" +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", basic_tab_url, basic_tab_title) +
sprintf ("<li><a href=\"%s\">%s</a></li>\n", history_entry_url, history_entry_title) +
"</ul><br>\n" +
"</body></html>\n";
    return sessions;
}

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
*/
/* Run the export session test with name (1). (2) The session to export. (3) True to export the history of each tab. (4) The preferences for duplicate tabs. (5) The expected output string. Return unit. */
function test_export_session_helper (test_name, session, include_tab_history, duplicate_tabs_prefs, expected) {
/* Return the file name that corresponds to the test name (1). */
    var get_test_file_name = function (test_name) { return sprintf ("%s.txt", test_name); };
/* Return the file object that corresponds to the test name (1). */
    var get_test_file = function (test_name) {
/* Use the output folder path from the preferences. */
        var output_folder = SessionExporter.File.getWriteFolder ();
        var output_file_path = output_folder.path + "\\" + get_test_file_name (test_name);
        return new FileUtils.File (output_file_path);
    }
/* Compare the output string (1) to the expected output string (2). Return Promise.resolve if the test succeeds; otherwise, raise an exception. */
    var compare = function (output) {
        var result = (output == expected);
        SessionExporter.Consts.log (sprintf ("export_session.jsm: test_export_session_helper: Test %s: Session 1: %s. Session 2: %s. Result: %s.", test_name, output, expected, result));
// TODO3 Clean up test file afterward if we pass.
        if (result == true) { return Promise.resolve (); }
        else {
            throw new Error (sprintf ("export_session.jsm: test_export_session_helper: Test %s failed. Actual output does not match expected output.", test_name));
        }
    }
/* Get the output file object. */
    var output_file = get_test_file (test_name);
/* Get the action and run it. */
    var action = SessionExporter.ExportSession.test_get_export_session_action_helper (include_tab_history, duplicate_tabs_prefs, output_file, false);
    action (session);
/* Read the output file. */
    var results = SessionExporter.File.readFiles ([output_file]);
    var output = results [0];
/* If we read the output file successfully, compare the output string to the expected output string. */
	output.then (function (file) {
/* File.readFiles returns an object. Get the file contents from the object. */
        compare (file.contents);
    }).catch (
/* We cannot propagate an exception outside of a promise. We would use Promise.done, but it is not implemented. So we handle the exception here. Unfortunately this means execution continues outside this promise, which we might not want. */
        function (error) { SessionExporter.Consts.show_error (error); }
    );
}

// TODO2 If we modify BookmarkSession.get_bookmark_session_action and BookmarkSession.session_to_bookmarks to return the new bookmark folder ID, apply this function to that instead of the name.
/* Get the bookmark folder with name (1), if it exists, and convert it to a session. If the bookmark folder exists, return an object. (R1) The bookmark folder ID. (R2) The session. If the bookmark folder does not exist, return null. */
function test_get_bookmark_folder_by_name (folder_name) {
/* We thought about moving the following code to a function in bookmark_utils, but this is the only place we do this. */
/* Get all bookmark folders. */
    var folders = SessionExporter.BookmarkUtils.get_all_bookmark_folders ();
/* Find the folder with the specified ID. */
    var folder = _.find (folders, function (folder) { return (folder.title == folder_name); });
/* _.find returns undefined if the search fails. */
    if (folder !== undefined) {
/* Get all folders below the result folder. */
        folders = SessionExporter.BookmarkUtils.get_bookmark_folders_by_id (folder.id);
/* Convert the folders to sessions. */
        var sessions = SessionExporter.BookmarkUtils.read_bookmark_folders (folders);
// TODO1 Call new SessionExporter.BookmarkUtils.combine_bookmark_folders.
/* Combine the sessions. */
        var session = _.reduce (sessions, function (acc, session) {
/* Remove the tab group IDs from the tab groups and tabs. They are based on bookmark folder IDs, which we have no way to predict. In our tests, we use JSON.stringify to compare the actual and expected tab group and tab objects, so the tab group ID field causes these comparisons to fail. */
            var tab_groups = _.map (session.tab_groups, function (tab_group) { return { title : tab_group.title}; });
            var tabs = _.map (session.tabs, function (tab) { return { title : tab.title, url : tab.url }; });
            return {
                tab_groups : acc.tab_groups.concat (tab_groups),
                tabs : acc.tabs.concat (tabs),
            }
        }, { tab_groups : [], tabs : [] });
        return { id : folder.id, session : session };
    }
    else { return null; }
}

/* Run the bookmark session test with name (1). (2) The session to bookmark. (3) The preferences for duplicate tabs. (4) The expected bookmark folders and bookmarks. Raise an exception if the test fails. Return unit. */
function test_bookmark_session_helper (test_name, session, duplicate_tabs_prefs, expected) {
/* Return true if session (1) is the same as session (2). */
    var compare = function (session_1, session_2) {
        var result = (JSON.stringify (session_1) == JSON.stringify (session_2));
        SessionExporter.Consts.log ("test_bookmark_session_helper: compare: Session 1: " + JSON.stringify (session_1) + ". Session 2: " + JSON.stringify (session_2) + ". Result: " + result);
        return result;
    };
/* Delete bookmark folder with ID (1). Return unit. */
    var delete_folder = function (folder_id) {
        var transaction = Bookmarks.getRemoveFolderTransaction (folder_id);
        transaction.doTransaction ();
    }
/* Get the action and run it. */
    var action = SessionExporter.BookmarkSession.test_get_bookmark_session_action (test_name, duplicate_tabs_prefs);
    action (session);
/* Get the bookmark folder. */
    var folder = test_get_bookmark_folder_by_name (test_name);
/* Compare the bookmark folder to the expected bookmark folder. */
    var result = compare (folder.session, expected);
    try {
        assert_true (test_name, result);
/* This is currently not used. */
//    if (result == false) { SessionExporter.Consts.get_window ().alert (sprintf ("Test %s failed.", test_name)); }
    }
    finally {
/* Delete the bookmark folder. */
        delete_folder (folder.id);
    }
}

/* Functions: methods. */

var ExportSessionUtils = {

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFilePicker
*/
/* Return the session files selected by the user. */
get_session_files : function () {
/* Ask the user to select the session files. */
	var enumerator = SessionExporter.File.getReadFiles ();
    var input_files = [];
    if (enumerator != null) {
        while (enumerator.hasMoreElements () == true) {
            input_files.push (enumerator.getNext ().QueryInterface (Components.interfaces.nsILocalFile));
        }
    }
    return input_files;
},

/* Show the result of exporting session (1). Return unit. */
show_result : function (session) {
// TODO2 Need to get expected tab and tab group counts from session JSON object. That needs to be done in session_utils.jsm.
    var result = "Session export finished.\nTab count: " + session.tabs.length + ".\nTab group count: " + session.tab_groups.length + ".";
/* If we skipped any duplicate tabs, add the count to the output. */
    if (session.duplicate_tabs !== undefined && session.duplicate_tabs != null) {
        result += "\nDuplicate tabs removed: " + session.duplicate_tabs.length + ".";
    }
	get_window ().alert (result);
},

/* Return the user's preferences related to combining tab groups. */
get_combine_tab_groups_prefs : function () {
    return {
        session_file_order : SessionExporter.Session.get_session_file_order (),
	    combine_tab_groups_same_id : SessionExporter.Session.get_combine_tab_groups_same_id (),
        combine_tab_groups_same_title : SessionExporter.Session.get_combine_tab_groups_same_title (),
        combine_tab_groups_same_id_and_title : SessionExporter.Session.get_combine_tab_groups_same_id_and_title (),
    };
},

/* Return the user's preferences related to duplicate tabs. */
get_duplicate_tabs_prefs_helper : function () {
    return {
        skip_duplicate_tabs_single_session : SessionExporter.Session.get_skip_duplicate_tabs_single_session (),
        skip_duplicate_tabs_multiple_sessions : SessionExporter.Session.get_skip_duplicate_tabs_multiple_sessions (),
		skip_duplicate_tabs_across_tab_groups : SessionExporter.Session.get_skip_duplicate_tabs_across_tab_groups (),
        log_duplicate_tabs : SessionExporter.Session.get_log_duplicate_tabs (),
        file_duplicate_tabs : SessionExporter.Session.get_file_duplicate_tabs (),
        bookmark_duplicate_tabs : SessionExporter.Session.get_bookmark_duplicate_tabs (),
    };
},

/* Determine whether to skip duplicate tabs in the sessions we are exporting. (1) The number of sessions we are exporting. (2) Whether we are exporting sessions to a file or to bookmarks. (R1) True to skip duplicate tabs. (R2) True to log duplicate tabs. (R3) True to write duplicate tabs to file or save them to bookmarks. Precondition: session_count > 0. export_or_bookmark is a valid value in FileOrBookmark. */
get_duplicate_tabs_prefs : function (session_count, export_or_bookmark, prefs) {
    var result = {
        skip_duplicate_tabs : false,
		skip_duplicate_tabs_across_tab_groups : false,
        bool_log_duplicate_tabs : false,
        save_duplicate_tabs : false
    };
/* If we are exporting a single session and the user wants to skip duplicate tabs for a single session... */
    if ((session_count == 1 && prefs.skip_duplicate_tabs_single_session == true) ||
/* Or if we are exporting multiple sessions and the user wants to skip duplicate tabs for multiple sessions... */
        (session_count > 1 && prefs.skip_duplicate_tabs_multiple_sessions == true)) {
        result.skip_duplicate_tabs = true;
    }
/* If the user wants to skip duplicate tabs... */
    if (result.skip_duplicate_tabs == true) {
/* Find out whether the user wants to skip duplicate tabs across tab groups. */
		result.skip_duplicate_tabs_across_tab_groups = prefs.skip_duplicate_tabs_across_tab_groups;
/* Find out whether the user wants to log duplicate tabs. */
        result.bool_log_duplicate_tabs = prefs.log_duplicate_tabs;
/* If we are writing tabs to file, find out whether the user wants to write duplicate tabs to file. */
        if ((export_or_bookmark == FileOrBookmark.File && prefs.file_duplicate_tabs == true) ||
/* If we are saving tabs to bookmarks, find out whether the user wants to save duplicate tabs to bookmarks. */
            (export_or_bookmark == FileOrBookmark.Bookmark && prefs.bookmark_duplicate_tabs == true)) {
            result.save_duplicate_tabs = true;
        }
    }
    return result;
},

/* Write tabs (1) and tab groups (2). Apply action (3) to each tab. Apply action (4) to each tab group. Return the output.
(3) Write a tab (3a). (3b) The tab_group_id_data field returned by (4). Return the output.
(4) Write tab group (4a). Return an object with two fields:
result: The output.
tab_group_id_data: Additional data needed to write the tabs in this tab group. For example, when saving tabs and tab groups to bookmarks, this field contains the ID of the bookmark folder created for this tab group, which is then used to save tabs to that bookmark folder. The value of this field is passed to (3).
*/
write_session : function (tabs, tab_groups, tab_action, tab_group_action) {
/* Write a tab. (1) The tab_group_id_data field returned by the tab group action. (2) The output for the previous tabs. (3) The tab. Return the output. */
	var write_tab = function (tab_group_id_data, acc, tab) {
/* Call the tab action. Pass in the tab_group_id_data field returned by the tab group action. Combine the output for the previous tabs with the output for this tab. */
		return acc + tab_action (tab, tab_group_id_data);
	};
/* Write a tab group. (1) The tabs. (2) The output for the previous tab groups. (3) The tab group. Return the output. */
	var write_tab_group = function (acc, tab_group) {
/* Call the tab group action. */
		var tab_group_action_result = tab_group_action (tab_group);
/* Get the tabs for this tab group. */
        var tabs_ = _.filter (tabs, function (tab) { return (tab.tab_group_id == tab_group.id); });
/* Previously, we had write_tab access tab_group_id_data with a closure, but this lets us organize the code more cleanly. */
/* Combine the output for the previous tab groups, this tab group, and the tabs for this tab group. Partially apply write_tab to the tab_group_id_data field returned by the tab group action. */
		return acc + tab_group_action_result.result + _.reduce (tabs_, _.partial (write_tab, tab_group_action_result.tab_group_id_data), "");
	};
/* Combine the output for all tab groups. */
	return _.reduce (tab_groups, write_tab_group, "");
},

/* Log duplicate tabs. (1) True if the user wants to log duplicate tabs. (2) The session that contains the tab groups and duplicate tabs. Return unit. */
try_log_duplicate_tabs : function (bool_log_duplicate_tabs, session) {
/* If the user wants to log duplicate tabs... */
    if (bool_log_duplicate_tabs == true) {
        var tabs = session.duplicate_tabs;
/* If there are duplicate tabs... */
        if (tabs !== undefined && tabs != null && tabs.length > 0) {
/* Log the duplicate tabs. */
            log_duplicate_tabs (tabs, session.tab_groups);
        }
    }
},

/* Functions: test methods. */

/* export_sessions and export_current_session both call get_export_session_action. It does not matter whether we export the current session, a session read from a file, or multiple sessions read from files. session_utils.jsm handles those differences.

export_sessions tests:
x Export session.
N Export multiple sessions. (Sessions are combined in session_utils.jsm.)
x Do not export tab history. (Session includes tab histories.)
x Export tab history.
x Do not skip duplicate tabs. (Session includes duplicate tabs.)
x Skip duplicate tabs but do not log or save them.
x Skip duplicate tabs across tab groups but do not log or save them.
x Skip duplicate tabs and save them but do not log them.
x Skip duplicate tabs across tab groups and save them but do not log them.
N Skip duplicate tabs and log them but do not save them.
x Skip duplicate tabs and save them but do not log them. Export tab history.
*/

/* Test the export_sessions and export_current_session functions. Return unit. */
test_export_session : function () {
/* Get the test sessions. */
    var sessions = get_export_bookmark_test_sessions ();
/* Get the default duplicate tabs preferences. */
    var duplicate_tabs_prefs = get_test_duplicate_tabs_prefs ();
/* Export session. */
    test_export_session_helper ("basic", sessions.basic, false, duplicate_tabs_prefs, sessions.basic_output);
/* Do not export tab history. */
    test_export_session_helper ("history_no_write", sessions.history, false, duplicate_tabs_prefs, sessions.basic_output);
/* Export tab history. */
    test_export_session_helper ("history_write", sessions.history, true, duplicate_tabs_prefs, sessions.history_output);
/* Do not skip duplicate tabs. */
    test_export_session_helper ("duplicate_tabs_ignore", sessions.duplicate_tabs, false, duplicate_tabs_prefs, sessions.duplicate_tabs_output);
/* Skip duplicate tabs but do not log or save them. */
    duplicate_tabs_prefs.skip_duplicate_tabs = true;
    test_export_session_helper ("duplicate_tabs_skip", sessions.duplicate_tabs, false, duplicate_tabs_prefs, sessions.basic_output);
/* Skip duplicate tabs in different tab groups but do not log or save them. */
	duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups = true;
	test_export_session_helper ("duplicate_tabs_skip_across_tab_groups", sessions.duplicate_tabs_across_tab_groups, false, duplicate_tabs_prefs, sessions.duplicate_tabs_across_tab_groups_output);
/* Skip duplicate tabs and save them but do not log them. */
    duplicate_tabs_prefs.save_duplicate_tabs = true;
    test_export_session_helper ("duplicate_tabs_save", sessions.duplicate_tabs, false, duplicate_tabs_prefs, sessions.duplicate_tabs_saved_output);
/* Skip duplicate tabs across tab groups and save them but do not log them. */
	duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups = true;
	test_export_session_helper ("duplicate_tabs_save_across_tab_groups", sessions.duplicate_tabs_across_tab_groups, false, duplicate_tabs_prefs, sessions.duplicate_tabs_across_tab_groups_save_output);
/* Skip duplicate tabs and save them but do not log them. Export tab history. */
	test_export_session_helper ("duplicate_tabs_save_history", sessions.duplicate_tabs_history, true, duplicate_tabs_prefs, sessions.duplicate_tabs_saved_history_output);
},

/* bookmark_sessions and bookmark_current_session both call get_bookmark_session_action. It does not matter whether we export the current session, a session read from a file, or multiple sessions read from files. session_utils.jsm handles those differences.

bookmark_sessions tests:
x Export session.
N Export multiple sessions. (Sessions are combined in session_utils.jsm.)
x Do not skip duplicate tabs. (Session includes duplicate tabs.)
x Skip duplicate tabs but do not log or save them.
x Skip duplicate tabs across tab groups but do not log or save them.
x Skip duplicate tabs and save them but do not log them.
x Skip duplicate tabs across tab groups and save them but do not log them.
N Skip duplicate tabs and log them but do not save them.
*/

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavBookmarksService
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsITransaction
*/
/* Test the bookmark_sessions and bookmark_current_session functions. Return unit. */
test_bookmark_session : function () {
/* Get the test sessions. */
    var sessions = get_export_bookmark_test_sessions ();
/* Get the default duplicate tabs preferences. */
    var duplicate_tabs_prefs = get_test_duplicate_tabs_prefs ();
/* Export session. */
    test_bookmark_session_helper ("basic", sessions.basic, duplicate_tabs_prefs, sessions.basic_bookmarks);
/* Do not skip duplicate tabs. */
    test_bookmark_session_helper ("duplicate_tabs", sessions.duplicate_tabs, duplicate_tabs_prefs, sessions.duplicate_tabs_bookmarks);
/* Skip duplicate tabs but do not log or save them. */
    duplicate_tabs_prefs.skip_duplicate_tabs = true;
    test_bookmark_session_helper ("duplicate_tabs_skip", sessions.duplicate_tabs, duplicate_tabs_prefs, sessions.duplicate_tabs_skip_bookmarks);
/* Skip duplicate tabs in different tab groups but do not log or save them. */
	duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups = true;
	test_bookmark_session_helper ("duplicate_tabs_skip_across_tab_groups", sessions.duplicate_tabs_across_tab_groups, duplicate_tabs_prefs, sessions.duplicate_tabs_across_tab_groups_bookmarks);
/* Skip duplicate tabs and save them but do not log them. */
    duplicate_tabs_prefs.save_duplicate_tabs = true;
    test_bookmark_session_helper ("duplicate_tabs_save", sessions.duplicate_tabs, duplicate_tabs_prefs, sessions.duplicate_tabs_save_bookmarks);
/* Skip duplicate tabs across tab groups and save them but do not log them. */
	duplicate_tabs_prefs.skip_duplicate_tabs_across_tab_groups = true;
	test_bookmark_session_helper ("duplicate_tabs_across_tab_groups_save", sessions.duplicate_tabs_across_tab_groups, duplicate_tabs_prefs, sessions.duplicate_tabs_across_tab_groups_save_bookmarks);
},

/* Test the get_duplicate_tabs_prefs function. Return unit. */
test_get_duplicate_tabs_prefs : function () {
/* Return true if the preferences in (1) match the expected preferences in (2). */
    var check_prefs = function (prefs, expected) {
        return (prefs.skip_duplicate_tabs == expected[0] &&
        prefs.bool_log_duplicate_tabs == expected[1] &&
        prefs.save_duplicate_tabs == expected[2]);
    };
/* Return true if the results of applying get_duplicate_tabs_prefs to preferences (1) match the expected results in (2). */
    var test_permutations = function (prefs, expected) {
        return _.every ([
            check_prefs (ExportSessionUtils.get_duplicate_tabs_prefs (1, FileOrBookmark.File, prefs), expected[0]),
            check_prefs (ExportSessionUtils.get_duplicate_tabs_prefs (2, FileOrBookmark.File, prefs), expected[1]),
            check_prefs (ExportSessionUtils.get_duplicate_tabs_prefs (1, FileOrBookmark.Bookmark, prefs), expected[2]),
            check_prefs (ExportSessionUtils.get_duplicate_tabs_prefs (2, FileOrBookmark.Bookmark, prefs), expected[3])
            ]);
    };
/* The default preferences. */
    var prefs = {
        skip_duplicate_tabs_single_session : false,
        skip_duplicate_tabs_multiple_sessions : false,
		skip_duplicate_tabs_across_tab_groups : false,
        log_duplicate_tabs : false,
        file_duplicate_tabs : false,
        bookmark_duplicate_tabs : false
    };
/* Verify duplicate tabs are not skipped, logged, or saved by default. */
    assert_true ("duplicate_tabs_no_skip", test_permutations (prefs, [
        [false, false, false],
        [false, false, false],
        [false, false, false],
        [false, false, false]
        ]));
/* Skip duplicate tabs for single sessions. */
    prefs.skip_duplicate_tabs_single_session = true;
    assert_true ("duplicate_tabs_skip_single", test_permutations (prefs, [
        [true, false, false],
        [false, false, false],
        [true, false, false],
        [false, false, false]
        ]));
/* Log skipped duplicate tabs. */
    prefs.log_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_single_log", test_permutations (prefs, [
        [true, true, false],
        [false, false, false],
        [true, true, false],
        [false, false, false]
        ]));
    prefs.log_duplicate_tabs = false;
/* Write skipped duplicate tabs to file. */
    prefs.file_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_single_file", test_permutations (prefs, [
        [true, false, true],
        [false, false, false],
        [true, false, false],
        [false, false, false]
        ]));
/* Save skipped duplicate tabs to bookmarks. */
    prefs.file_duplicate_tabs = false;
    prefs.bookmark_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_single_bookmark", test_permutations (prefs, [
        [true, false, false],
        [false, false, false],
        [true, false, true],
        [false, false, false]
        ]));
/* Skip duplicate tabs for multiple sessions. */
    prefs.bookmark_duplicate_tabs = false;
    prefs.skip_duplicate_tabs_single_session = false;
    prefs.skip_duplicate_tabs_multiple_sessions = true;
    assert_true ("duplicate_tabs_skip_multiple", test_permutations (prefs, [
        [false, false, false],
        [true, false, false],
        [false, false, false],
        [true, false, false]
        ]));
/* Log skipped duplicate tabs. */
    prefs.log_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_multiple_log", test_permutations (prefs, [
        [false, false, false],
        [true, true, false],
        [false, false, false],
        [true, true, false]
        ]));
/* Write skipped duplicate tabs to file. */
    prefs.log_duplicate_tabs = false;
    prefs.file_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_multiple_file", test_permutations (prefs, [
        [false, false, false],
        [true, false, true],
        [false, false, false],
        [true, false, false]
        ]));
/* Save skipped duplicate tabs to bookmarks. */
    prefs.file_duplicate_tabs = false;
    prefs.bookmark_duplicate_tabs = true;
    assert_true ("duplicate_tabs_skip_multiple_bookmark", test_permutations (prefs, [
        [false, false, false],
        [true, false, false],
        [false, false, false],
        [true, false, true]
        ]));
},

// TODO1 We also need to test prefs.session_file_order, but to do that we need to actually read the files. Make that a separate function.

/*
combine_sessions tests:

M = Merge
R = Reassign
I = Ignore

Both    ID  Title
M       R   I
            M
        M   I
            M
R       R   I
            M
        M   I
            M

x ID 0, Title A. ID 1, Title B. (different ID and title)
x ID 0, Title A. ID 0, Title A. (same ID and title)
x ID 0, Title A. ID 0, Title B. (same ID, different title)
x ID 0, Title A. ID 1, Title A. (same title, different ID)
x Session 1: ID 1, Title A. Session 2: ID 0, Title A. ID 1, Title B. (Merge titles. Ensure 0/A is not reassigned to 1/A, which would collide with 1/B.)
x Session 1: ID 0, Title A. ID 1, Title B. Session 2: ID 0, Title B. (If merge titles, merge 0/B and 1/B. If merge ID, merge 0/B and 0/A. If both, merge 0/B and 1/B.)
x Session 1: ID 0, Title A. Session 2: ID 0, Title B. ID 1, Title A. (Merge ID, which changes display title. Then merge title, to verify that change to display title does not affect title match.)
*/
 
/* Test SessionUtils.combine_sessions. Return unit. */
test_combine_sessions : function () {
/* Return true if object (1) is the same as object (2). */
    var compare = function (obj_1, obj_2) {
        var text_1 = JSON.stringify (obj_1);
        var text_2 = JSON.stringify (obj_2);
        var result = (text_1 == text_2);
        SessionExporter.Consts.log ("test_combine_sessions: compare: Session 1: " + text_1 + ". Session 2: " + text_2 + ". Result: " + result);
        return result;
    };
/* Run test group (1). Return unit. */
    var run_test_group = function (test_group) {
        _.each (test_group.tests, function (test) {
            var sessions = get_test_sessions (test_group.session_data);
            var expected = get_test_session (test.expected_data);
            var prefs = get_test_combine_tabs_prefs (test.prefs);
            var combined = SessionExporter.SessionUtils.combine_sessions (sessions, prefs);
/* We sort the tabs because get_test_session can change the tab order. See the note for expected_data_merge_ids_or_titles_1. */
            combined.tabs = _.sortBy (combined.tabs, function (tab) { return tab.title; });
            expected.tabs = _.sortBy (expected.tabs, function (tab) { return tab.title; });
            var result = compare (combined, expected);
	        assert_true ("SessionUtils.combine_sessions: " + test_group.name + ": " + JSON.stringify (prefs), result);
        });
    };
/* Different IDs and titles. */
    var session_data_different_ids_and_titles = [
        [["0", "A", [["a", ""]]]],
        [["1", "B", [["b", ""]]]],
    ];
/* Note we use session_data_* to make multiple sessions, whereas we use expected_data_* to make a single combined session. */
/* No tab groups should be combined, but the tab group IDs should be reassigned to the next available IDs. */
    var expected_data_different_ids_and_titles = [
        ["2", "A", [["a", ""]]],
        ["3", "B", [["b", ""]]],
    ];
    run_test_group ({
        name : "Different IDs and titles",
        session_data : session_data_different_ids_and_titles,
        tests : [
/* The expected results are the same for all preferences. */
            { prefs : [0, 0, 0, 0,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 0, 0, 1,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 0, 1, 1,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 1, 0, 0,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 1, 0, 1,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_different_ids_and_titles, },
            { prefs : [0, 1, 1, 1,], expected_data : expected_data_different_ids_and_titles, },
        ],
    });
/* Same ID and title. */
    var session_data_same_id_and_title = [
        [["0", "A", [["a", ""]]]],
        [["0", "A", [["b", ""]]]],
    ];
/* Note we use session_data_* to make multiple sessions, whereas we use expected_data_* to make a single combined session. */
/* SameIDAndTitle: Merge. */
    var expected_data_same_id_and_title_1 = [
        ["1", "A", [["a", ""], ["b", ""]]],
    ];
/* SameIDAndTitle: Reassign. */
    var expected_data_same_id_and_title_2 = [
        ["1", "A", [["a", ""]]],
        ["2", "A", [["b", ""]]],
    ];
    run_test_group ({
        name : "Same ID and title",
        session_data : session_data_same_id_and_title,
        tests : [
/* The expected results are affected only by the SameIDAndTitle preference. */
            { prefs : [0, 0, 0, 0,], expected_data : expected_data_same_id_and_title_1 },
            { prefs : [0, 0, 0, 1,], expected_data : expected_data_same_id_and_title_2 },
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_same_id_and_title_1 },
            { prefs : [0, 0, 1, 1,], expected_data : expected_data_same_id_and_title_2 },
            { prefs : [0, 1, 0, 0,], expected_data : expected_data_same_id_and_title_1 },
            { prefs : [0, 1, 0, 1,], expected_data : expected_data_same_id_and_title_2 },
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_same_id_and_title_1 },
            { prefs : [0, 1, 1, 1,], expected_data : expected_data_same_id_and_title_2 },
        ],
    });
/* Same ID, different titles. */
    var session_data_same_id_different_titles = [
        [["0", "A", [["a", ""]]]],
        [["0", "B", [["b", ""]]]],
    ];
/* Note we use session_data_* to make multiple sessions, whereas we use expected_data_* to make a single combined session. */
/* SameID: Reassign. */
    var expected_data_same_id_different_titles_1 = [
        ["1", "A", [["a", ""]]],
        ["2", "B", [["b", ""]]],
    ];
/* SameID: Merge. */
    var expected_data_same_id_different_titles_2 = [
        ["1", "A_B", [["a", ""], ["b", ""]]],
    ];
    run_test_group ({
        name : "Same ID, different titles",
        session_data : session_data_same_id_different_titles,
        tests : [
/* The expected results are affected only by the SameID preference. */
            { prefs : [0, 0, 0, 0,], expected_data : expected_data_same_id_different_titles_1 },
            { prefs : [0, 0, 0, 1,], expected_data : expected_data_same_id_different_titles_1 },
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_same_id_different_titles_1 },
            { prefs : [0, 0, 1, 1,], expected_data : expected_data_same_id_different_titles_1 },
            { prefs : [0, 1, 0, 0,], expected_data : expected_data_same_id_different_titles_2 },
            { prefs : [0, 1, 0, 1,], expected_data : expected_data_same_id_different_titles_2 },
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_same_id_different_titles_2 },
            { prefs : [0, 1, 1, 1,], expected_data : expected_data_same_id_different_titles_2 },
        ],
    });
/* Same title, different IDs. */
    var session_data_same_title_different_ids = [
        [["0", "A", [["a", ""]]]],
        [["1", "A", [["b", ""]]]],
    ];
/* Note we use session_data_* to make multiple sessions, whereas we use expected_data_* to make a single combined session. */
/* SameTitle: Ignore. */
    var expected_data_same_title_different_ids_1 = [
        ["2", "A", [["a", ""]]],
        ["3", "A", [["b", ""]]],
    ];
/* SameTitle: Merge. */
    var expected_data_same_title_different_ids_2 = [
        ["2", "A", [["a", ""], ["b", ""]]],
    ];
    run_test_group ({
        name : "Same title, different IDs",
        session_data : session_data_same_title_different_ids,
        tests : [
/* The expected results are affected only by the SameTitle preference. */
            { prefs : [0, 0, 0, 0,], expected_data : expected_data_same_title_different_ids_1 },
            { prefs : [0, 0, 0, 1,], expected_data : expected_data_same_title_different_ids_1 },
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_same_title_different_ids_2 },
            { prefs : [0, 0, 1, 1,], expected_data : expected_data_same_title_different_ids_2 },
            { prefs : [0, 1, 0, 0,], expected_data : expected_data_same_title_different_ids_1 },
            { prefs : [0, 1, 0, 1,], expected_data : expected_data_same_title_different_ids_1 },
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_same_title_different_ids_2 },
            { prefs : [0, 1, 1, 1,], expected_data : expected_data_same_title_different_ids_2 },
        ],
    });
/* Session 1: ID 1, Title A. Session 2: ID 0, Title A. ID 1, Title B. (Merge titles. Ensure 0/A is not reassigned to 1/A, which would collide with 1/B.) */
    var session_data_merge_titles_avoid_id_collision = [
        [["1", "A", [["a", ""]]]],
        [
            ["0", "A", [["b", ""]]],
            ["1", "B", [["c", ""]]]
        ],
    ];
    var expected_data_merge_titles_avoid_id_collision = [
        ["2", "A", [["a", ""], ["b", ""]]],
        ["3", "B", [["c", ""]]],
    ];
    run_test_group ({
        name : "Merge titles, avoid ID collision",
        session_data : session_data_merge_titles_avoid_id_collision,
        tests : [
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_merge_titles_avoid_id_collision },
        ],
    });
/* Session 1: ID 0, Title A. ID 1, Title B. Session 2: ID 0, Title B. (If merge titles, merge 0/B and 1/B. If merge ID, merge 0/B and 0/A. If both, merge 0/B and 1/B.) */
    var session_data_merge_ids_or_titles = [
        [
            ["0", "A", [["a", ""]]],
            ["1", "B", [["b", ""]]],
        ],
        [["0", "B", [["c", ""]]]],
    ];
/* Note applying get_test_session to this results in tabs ordered: a, c, b. However, when combine_sessions reads the session created from session_data_merge_ids_or_titles, the tabs are ordered: a, b, c. To fix this, we sort the tabs by title in run_test_group. */
/* SameID: Merge. */
    var expected_data_merge_ids_or_titles_1 = [
        ["2", "A_B", [["a", ""], ["c", ""]]],
        ["3", "B", [["b", ""]]],
    ];
/* SameTitle: Merge. (Regardless of SameID.) */
    var expected_data_merge_ids_or_titles_2 = [
        ["2", "A", [["a", ""]]],
        ["3", "B", [["b", ""], ["c", ""]]],
    ];
/* Same ID: Reassign. SameTitle: Ignore. */
    var expected_data_merge_ids_or_titles_3 = [
        ["2", "A", [["a", ""]]],
        ["3", "B", [["b", ""]]],
        ["4", "B", [["c", ""]]],
    ];
    run_test_group ({
        name : "Merge IDs or titles",
        session_data : session_data_merge_ids_or_titles,
        tests : [
/* The expected results are affected only by the SameTitle preference. */
            { prefs : [0, 0, 0, 0,], expected_data : expected_data_merge_ids_or_titles_3 },
            { prefs : [0, 0, 0, 1,], expected_data : expected_data_merge_ids_or_titles_3 },
            { prefs : [0, 0, 1, 0,], expected_data : expected_data_merge_ids_or_titles_2 },
            { prefs : [0, 0, 1, 1,], expected_data : expected_data_merge_ids_or_titles_2 },
            { prefs : [0, 1, 0, 0,], expected_data : expected_data_merge_ids_or_titles_1 },
            { prefs : [0, 1, 0, 1,], expected_data : expected_data_merge_ids_or_titles_1 },
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_merge_ids_or_titles_2 },
            { prefs : [0, 1, 1, 1,], expected_data : expected_data_merge_ids_or_titles_2 },
        ],
    });
/* Session 1: ID 0, Title A. Session 2: ID 0, Title B. ID 1, Title A. (Merge ID, which changes display title. Then merge title, to verify that change to display title does not affect title match.) */
    var session_data_merge_ids_then_titles = [
        [["0", "A", [["a", ""]]]],
        [
            ["0", "B", [["b", ""]]],
            ["1", "A", [["c", ""]]],
        ],
    ];
/* Note applying get_test_session to this results in tabs ordered: a, c, b. However, when combine_sessions reads the session created from session_data_merge_ids_or_titles, the tabs are ordered: a, b, c. To fix this, we sort the tabs by title in run_test_group. */
/* SameID: Merge. SameTitle: Merge. */
    var expected_data_merge_ids_then_titles = [
        ["2", "A_B", [["a", ""], ["b", ""], ["c", ""]]],
    ];
    run_test_group ({
        name : "Merge IDs, then titles",
        session_data : session_data_merge_ids_then_titles,
        tests : [
            { prefs : [0, 1, 1, 0,], expected_data : expected_data_merge_ids_then_titles },
        ],
    });
/* Reference for creating tests.
0: SameID: Reassign, SameTitle: Ignore, SameIDAndTitle: Merge
1: SameID: Merge, SameTitle: Merge, SameIDAndTitle: Reassign
*/
},

};