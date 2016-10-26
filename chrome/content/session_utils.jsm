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

/* Note we ran into several issues in getting the tabs and tab groups for multiple browser windows instead of a single browser window.
- We must call TabView._initFrame for each window, or it will not have its tab group data available when we call getBrowserState.
- TabView._initFrame requires a callback. With multiple windows, we must wait for all of these callbacks to complete. To do this, we wrap TabView._initFrame in a Promise and have the callback call Promise.resolve. We then use Promise.all to wait for all of the callbacks to complete.
- We cannot return a value from the TabView._initFrame callback or Promise.all. Previously, we called TabView._initFrame and then got the session data in the callback. Now, because we must call TabView._initFrame for multiple windows, we get the session data in Promise.all.then.
- We thought we needed to call getWindowState for each window, but we can call getBrowserState as long as TabView._initFrame has completed for all windows.
- TabView._initFrame runs asynchronously. Be careful closing it over a value that might be changed before the TabView._initFrame callback runs, because the closure does not get its own copy of the value as we would expect. It is better to pass the value to another function, so that a value copy is made, and then call TabView._initFrame from that function.
*/

"use strict";

/* If the SessionExporter namespace is not defined, define it. */
if (typeof SessionExporter == "undefined") { var SessionExporter = {}; }

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
*/
var EXPORTED_SYMBOLS = ["SessionUtils"];

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

// TODO1 Note SS.* is no longer valid.
/* For some reason, "resource://" does not work. */
Components.utils.import ("resource:///modules/sessionstore/SessionStore.jsm");

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
/* Firefox services. */
//XPCOMUtils.defineLazyServiceGetter (this, "SS", "@mozilla.org/browser/sessionstore;1", Components.interfaces.nsISessionStore);
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "File", SessionExporter.Consts.content_folder + "file.jsm");

/* Functions: general helpers. */

function get_window () { return SessionExporter.Consts.get_window (); }
function get_windows () { return SessionExporter.Consts.get_windows (); }

/* Functions: init_tab_view_all_windows and helpers. */

/* If the user has not opened the tab view window, TabView._window is null. To initialize it, we must apply TabView._initFrame to the function we really want to call. So this function is the required starting point for any function that works with tab groups. */
/* Initialize the tab view for window (1). If we succeed, call function (2); if not, raise an exception. Return unit. */
function init_tab_view_helper (window, resolve) {
    try {
/* Get the tab view window. */
	    var tab_view = window.TabView;
/* If the tab view window is already initialized, call the resolve function. */
	    if (tab_view._window != null) { resolve (); }
/* Otherwise, initialize the tab view window, then call the resolve function. */
	    else { tab_view._initFrame (resolve); }
    }
    catch (error) {
        throw new Error (sprintf ("session_utils.jsm: init_tab_view_helper: Error initializing tab view. Error: %s.", error.message));
    }
}

/* See:
http://blogs.msdn.com/b/ie/archive/2011/09/11/asynchronous-programming-in-javascript-with-promises.aspx
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
*/
/* Initialize the tab view for window (1). Return a promise that waits for the tab view to be initialized. */
function init_tab_view (window) {
	return new Promise (
		function (resolve, reject) {
			init_tab_view_helper (window, resolve);
		}
	);
}

/* Return promises to initialize the tab views for all windows. */
function init_tab_view_all_windows_helper () {
/* Map all windows to promises. */
	return _.map (get_windows (), function (window) {
/* init_tab_view calls init_tab_view_helper, which calls window.TabView._initFrame, which runs asynchronously. It is important that we pass window to another function so a value copy is made of it. Previously, we called _initFrame here as follows.
		init_tab_view (window, (function () { window.alert (SS.getWindowState (window)); }));
The problem was that window was overwritten by the next call to windows.getNext () before the anonymous function was called. In other words, we expected that the anonymous function was closed over window and had a separate copy of it, but this was not so. */
/* Get a promise that waits for the tab view to be initialized for this window. */
		return init_tab_view (window);
	});
}

/* See:
http://blogs.msdn.com/b/ie/archive/2011/09/11/asynchronous-programming-in-javascript-with-promises.aspx
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
*/
/* Initialize the tab views for all windows, then call function (1). Return unit. */
function init_tab_view_all_windows (callback) {
/* Wait for the tab views to be initialized for all browser windows. */
	Promise.all (init_tab_view_all_windows_helper ()).then (callback).catch (
/* We cannot propagate an exception outside of a promise. We would use Promise.done, but it is not implemented. So we handle the exception here. Unfortunately this means execution continues outside this promise, which we might not want. */
        function (error) { SessionExporter.Consts.show_error (error); }
    );
}

/* Functions: Helpers for functions that get sessions from either session states or windows. */

/* Remove all duplicate items from (1). (2) A function that returns the key for each item. (3) A function that returns the value for each item. Return an object that contains (R1) the array with the duplicate items removed, and (R2) the duplicate items. */
function remove_duplicate_items (items, key_function, value_function) {
    var results = [];
    var duplicates = [];
    var seen = {};
/* Loop through the items. */
    _.each (items, function (item) {
/* Get the key for this item. */
        var key = key_function (item);
/* Get the value for this item. */
		var value = seen[key];
/* If we have seen this key... */
		if (value !== undefined && value != null) {
/* Add the value to the item. */
			item.duplicate_data = value;
/* Add the item to the duplicates. */
			duplicates.push (item);
		}
/* If we have not seen this key... */
		else {
/* Add the item to the results. */
			results.push (item);
/* Create the value for the item. */
			value = value_function (item);
/* Add the item to the items we have seen. */
			seen[key] = value;
        }
    });
    return { results : results, duplicates : duplicates };
}

/* TODO2 At some point in the future, if we want more options for removing duplicate tabs, we could take other parameters here. For example, we could compare tabs only by base URL (i.e. with no GET parameters), or by domain. */

/* Remove duplicate tabs from session (1). (2) True to remove duplicate tabs across tab groups. Return the revised session. */
function remove_duplicate_tabs_internal (session, skip_duplicate_tabs_across_tab_groups) {
/* Return the title of the tab group with ID (1). */
	var get_tab_group_title = function (tab_group_id) {
		var result = _.find (session.tab_groups, function (tab_group) {
			return (tab_group.id == tab_group_id);
		});
		if (result !== undefined) { return result.title; }
		else {
			throw new Error (sprintf ("session_utils.jsm: remove_duplicate_tabs_internal: tab group ID is not valid. Tab group ID: %d.", tab_group_id));
		}
	};
/* Remove the duplicate tabs from the session. */
    var combined_tabs = remove_duplicate_items (session.tabs, function (tab) {
		var key = "";
/* If the user wants to skip duplicate tabs across tab groups, ignore the tab group ID when we compare tabs. */
		if (skip_duplicate_tabs_across_tab_groups == true) { key = tab.url; }
/* Otherwise, include the tab group ID when we compare tabs. If a session does not have tab groups, its tabs will have a tab_group_id value of 0. */
		else { key = tab.url + tab.tab_group_id; }
		return key;
/* Return the tab group ID and title of the original tab for which tab (1) is a duplicate. */
	}, function (tab) {
		return {
			original_tab_group_id : tab.tab_group_id,
			original_tab_group_title : get_tab_group_title (tab.tab_group_id),
		};
	});
/* Overwrite the tabs field of the combined session. */
    session.tabs = combined_tabs.results;
/* If there are any duplicate tabs... */
    if (combined_tabs.duplicates.length > 0) {
/* Add a new field to the combined session for the duplicate tabs. */
        session.duplicate_tabs = combined_tabs.duplicates;
/* Get the unique tab group IDs of the duplicate tabs. */
        var duplicate_tab_group_ids = _.uniq (_.map (session.duplicate_tabs, function (duplicate_tab) {
            return duplicate_tab.tab_group_id;
        }));
/* Create a list of duplicate tab groups, copied by value. */
        var duplicate_tab_groups = session.tab_groups.slice (0);
/* Add a new field to the combined session for the duplicate tab groups. */
/* Filter out the duplicate tab groups that are not referenced by any duplicate tabs. */
        session.duplicate_tab_groups = _.filter (duplicate_tab_groups, function (duplicate_tab_group) {
            return _.contains (duplicate_tab_group_ids, duplicate_tab_group.id);
        });
    }
    return session;
}

/* Functions: Get tabs and tab groups from session state. */

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
*/
/* Note this is called by session_state_to_session_data. See the comments there about whether it must be called through init_tab_view_all_windows. */
/* Return the tab group ID for tab (1). */
function get_tab_group_id (tab) {
/* Start with a default tab group ID for tabs that have no tab group. */
	var tab_group_id = 0;
/* We are able to create an alias for a property of an object even if the property is not defined or has a null value. */
	var extData = tab.extData;
	if (extData !== undefined && extData != null && extData != "null") {
		var raw_tabview_tab = extData["tabview-tab"];
		if (raw_tabview_tab !== undefined && raw_tabview_tab != null && raw_tabview_tab != "null") {
/* Note it seems single objects must be passed to JSON.parse, but lists of objects must not. For example, the session state and tabview-tab objects must be passed to JSON parse, whereas the lists of windows, tabs, and entries must not. However, you would then expect that an entry object (which has properties that include url and title) must be passed to JSON.parse, but that is not so. */
/* tab.extData["tabview-tab"] might have the value "null". However, that is a string and does not evaluate to null until we parse it with JSON.parse. */
/* That could cause more problems if any of these other properties, such as extData or groupID, might have the value "null". If so, we will not detect it because we do not pass them to JSON.parse. We handle this by comparing them to "null". */
			var parsed_tabview_tab = JSON.parse (raw_tabview_tab);
			if (parsed_tabview_tab != null) {
				var group_id = parsed_tabview_tab.groupID;
				if (group_id !== undefined && group_id != null && group_id != "null") {
					tab_group_id = group_id;
				}
			}
		}
	}
	return tab_group_id;
}

/* Note this is called by session_state_to_session_data. See the comments there about whether it must be called through init_tab_view_all_windows. */
/* Return the tabs in session state (1). (2) True to export the history of each tab. */
function get_tabs_from_session_state (session_state, include_tab_history) {
/* Loop through the windows in the session state. */
	var tabs = _.map (session_state.windows, function (window) {
/* Loop through the tabs in this window. */
		return _.map (window.tabs, function (tab) {
/* Get the tab group ID for this tab. */
			var tab_group_id = get_tab_group_id (tab);
/* tab.entries is not an array, but an object where each entry is a property. */
			var entries = _.toArray (tab.entries);
/* tab.index starts from 1. Since we converted tab.entries to an array, we adjust it to be zero-based. */
			var index = tab.index - 1;
			if (index < entries.length) {
				var entry = entries [index];
/* If the entry has no title, use the URL as the title. The more functional approach would be to create a copy of the entry with the updated title. */
				if (entry.title === undefined || entry.title == null || entry.title.length == 0) { entry.title = entry.url; }
				var result = { title : entry.title, url : entry.url, tab_group_id : tab_group_id };
/* If the user does not want to export the tab history, add an empty history to the result. */
				if (include_tab_history == false) { result.history = []; }
				else {
/* If the user does want to export the tab history, loop through the entries and add the title and URL for each entry to a new history field in the result. */
					result.history = _.map (entries, function (entry) { return { title : entry.title, url : entry.url }; });
				}
                return result;
			}
/* If a tab has not been loaded, tab.entries might be blank, but there might be a URL in tab.userTypedValue. */
            else if (tab.userTypedValue !== undefined && tab.userTypedValue != null && tab.userTypedValue.length > 0) {
/* In this case there is no title or history, but there should be a tab group ID. */
                return { title : "", url : tab.userTypedValue, tab_group_id : tab_group_id, history : [] };
            }
			else {
				throw new Error (sprintf ("session_utils.jsm: get_tabs: tab entry index is not valid. index: %d. tab.entries.length: %d. tab: %s.", index, entries.length, JSON.stringify (tab)));
			}
		});
	});
/* Combine the tabs for all windows. */
	return _.flatten (tabs);
}

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
*/
/* Note this is called by session_state_to_session_data. See the comments there about whether it must be called through init_tab_view_all_windows. */
/* Return the tab groups for window (1). */
function get_tab_groups_from_session_state_helper (window) {
	var tab_groups = [];
/* We are able to create an alias for a property of an object even if the property is not defined or has a null value. */
	var extData = window.extData;
	if (extData !== undefined && extData != null && extData != "null") {
		var raw_tabview_group = extData["tabview-group"];
		if (raw_tabview_group !== undefined && raw_tabview_group != null && raw_tabview_group != "null") {
/* Note again, it seems single objects must be passed to JSON.parse, but lists of objects must not. For example, the session state and the tabview-group objects must be passed to JSON parse, whereas the list of windows must not. Again, however, you would then expect that a tab group object (which has properties that include id and title) must be passed to JSON.parse, but that is not so. */
			var parsed_tabview_groups = JSON.parse (raw_tabview_group);
			if (parsed_tabview_groups != null) {
/* Loop through the tab groups in this window. Tabview-group is an object where each tab group is a property. */
				tab_groups = _.map (parsed_tabview_groups, function (group) {
/* For now we decided not to check whether the tabview-group.id property is missing or has a null value as we have for the other properties. That would add overhead and it seems like a remote possibility. */
/* If the tab group has no title, use the ID as the title. The more functional approach would be to create a copy of the tab group with the updated title. */
					if (group.title === undefined || group.title == null || group.title.length == 0) { group.title = "Tab Group ID " + group.id; }
					return { id : group.id, title : group.title };
				});
			}
		}
	}
	return tab_groups;
}

/* Note this is called by session_state_to_session_data. See the comments there about whether it must be called through init_tab_view_all_windows. */
/* Return the tab groups in session state (1). */
function get_tab_groups_from_session_state (session_state) {
	var group_count = 0;
/* Loop through the windows in the session state. */
	var tab_groups = _.map (session_state.windows, function (window) {
/* Get the tab groups for this window. */
		return get_tab_groups_from_session_state_helper (window, tab_groups);
	});
/* Combine the tab groups for all windows. */
	tab_groups = _.flatten (tab_groups);
/* Windows have duplicate tab group data, so remove the duplicate tab groups. */
	return _.uniq (tab_groups, function (tab_group) { return tab_group.id; });
}

/* Note this must be called through init_tab_view_all_windows if it is called from get_tabs_and_tab_groups_from_session_state, but not if it is called from get_tabs_and_tab_groups_from_files. */
/* Return the data for the session state (1). (2) True to export the history of each tab. */
function session_state_to_session_data (session_state, include_tab_history) {
/* Get the tabs and tab groups from the session state. */
	var tabs = get_tabs_from_session_state (session_state, include_tab_history);
	var tab_groups = get_tab_groups_from_session_state (session_state);
/* If there are any tabs that do not have a tab group, create a default tab group for them. _.find returns undefined if no value passes the test. */
	if (_.find (tabs, function (tab) { return (tab.tab_group_id) == 0; }) !== undefined) {
		tab_groups.push ({ id : 0, title : "None" });
	}
/* Create and return the session. */
    return { tabs : tabs, tab_groups : tab_groups };
}

/* TODO1 DOC. This probably does not have to be called through init_tab_view_all_windows. */
function get_browser_state () {
    var state = SessionStore.getCurrentState (true);
    delete state.lastSessionState;
    delete state.deferredInitialState;
	return state;
//    return JSON.stringify (state);
}

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsISessionStore
*/
/* Note this must be called through init_tab_view_all_windows. */
/* Return the tabs and tab groups in the currently open session using the session state. (1) True to export the history of each tab. */
function get_tabs_and_tab_groups_from_session_state (include_tab_history) {
/* Get the session state that contains all tabs and tab groups in the session. */
//	var session_state = JSON.parse (SS.getBrowserState ());
	var session_state = get_browser_state ();

/* Convert the session state to session data and return the data. */
	return session_state_to_session_data (session_state, include_tab_history);
}

/* Return the sessions contained in files (1). (2) True to export the history for each tab. */
function read_sessions_from_files (session_files, include_tab_history) {
/* Map session files to sessions. */
    return _.map (session_files, function (session_file) {
/* The session state is stored in the session file as a serialized JSON object, so find where the object starts. */
    	var session_start_index = session_file.indexOf ("{");
/* Ignore the part of the session file that precedes the session state. */
	    session_file = session_file.substring (session_start_index);
/* Deserialize the session state. */
		var session_state = JSON.parse (session_file);
/* Convert the session state to session data. */
		return session_state_to_session_data (session_state, include_tab_history);
    });
}

/*
Note we process multiple sessions as follows.
1. Read sessions from session files.
2. Combine sessions.
3. Remove duplicate tabs as indicated by user preferences.
*/

/* Combine the tabs and tab groups in sessions (1). (2) The user preferences related to combining tab groups. Return the combined session. */
function combine_sessions_internal (sessions, combine_tab_groups_prefs) {
/* The iterator for the next available tab group ID. We do not worry about this value colliding with tab group IDs generated by Firefox in the future because we only use it when exporting sessions to HTML files or saving them to bookmarks (which discards the tab group IDs). The purpose of this value is to repair collisions in tab group IDs caused by combining sessions from different sources. */
/* Get the highest tab group ID and add 1 to it. */
	var next_tab_group_id = _.max (
		_.flatten (
			_.map (sessions, function (session) {
				return _.map (session.tab_groups, function (tab_group) {
					return parseInt (tab_group.id);
				});
			})
		)
	) + 1;
/* Return the next available tab group ID. */
    var get_new_tab_group_id = function () {
/* Convert the next tab group ID to text. */
		var new_tab_group_id = sprintf ("%d", next_tab_group_id);
/* Add 1 to the tab group ID iterator. */
		next_tab_group_id += 1;
        return new_tab_group_id;
    };
/* Reassign the tab group IDs of all tabs in session (1) that have tab group ID (2) to tab group ID (3). Return unit. */
	var reassign_tab_group_ids_in_tabs = function (session, old_tab_group_id, new_tab_group_id) {
		_.each (session.tabs, function (tab) {
			if (tab.tab_group_id == old_tab_group_id) {
				tab.tab_group_id = new_tab_group_id;
			}
		});
	};
/* Find the tab groups we have already seen (1) whose ID, title, or both match those of tab group (2). Return an object. (R1) The already seen tab group whose ID and title match those of tab group (2), or null. (R2) The already seen tab group whose ID matches that of tab group (2), or null. (R3) The already seen tab group whose title matches that of tab group (2), or null. */
    var get_matches = function (seen_tab_groups, tab_group) {
        var result = {
            match_id_and_title : null,
            match_id : null,
            match_title : null,
        };
/* Loop through the already seen tab groups. */
        _.each (seen_tab_groups, function (seen_tab_group) {
/* If the ID and title match those of tab group (2), add this already seen tab group to the result. */
            if (seen_tab_group.old_id == tab_group.id && seen_tab_group.original_title == tab_group.title) {
                result.match_id_and_title = seen_tab_group;
            }
/* If the ID matches that of tab group (2), add this already seen tab group to the result. */
            else if (seen_tab_group.old_id == tab_group.id) { result.match_id = seen_tab_group; }
/* If the title matches that of tab group (2), add this already seen tab group to the result. */
            else if (seen_tab_group.original_title == tab_group.title) { result.match_title = seen_tab_group; }
        });
        return result;
    };
/* Note each already seen tab group has an old ID and a new ID. Consider the following tab groups, when the user wants to merge tab groups that have the same title and different IDs.

Session 1
ID 2, Title A

Session 2
ID 1, Title A
ID 2, Title B

Session 2, ID 1 is merged with Session 1, ID 2. That means all its tabs are reassigned to tab group ID 2, which causes a conflict with Session 2, ID 2. To avoid this, we assign a new ID to each tab group before we add it to the already seen tab groups. The old ID is left behind so we can still detect whether other tab groups have the same ID. */
/* Note if the user wants to merge tab groups with the same title, and a single session contains multiple tab groups with the same title, those will be merged into a single tab group as well. */
/* Add tab group (1) to the list of already seen tab groups with its original ID as the old ID and the next available tab group ID as the new ID. Reassign the tab group IDs of all tabs in tab group (1), session (2) to the next available tab group ID. Return unit. */
    var reassign_tab_group_id = function (tab_group, session) {
        var new_tab_group_id = get_new_tab_group_id ();
        reassign_tab_group_ids_in_tabs (session, tab_group.id, new_tab_group_id);
        seen_tab_groups.push ({
            old_id : tab_group.id,
            new_id : new_tab_group_id,
            original_title : tab_group.title,
            display_title : tab_group.title,
        });
    };

/* If there is only one session, return it without merging the tab groups. */
    if (sessions.count == 1) { return sessions [0]; }
    else {
/* The tab groups we have already seen. */
        var seen_tab_groups = [];
/* Loop through the sessions. */
	    _.each (sessions, function (session) {
/* Loop through the tab groups for this session. */
    		_.each (session.tab_groups, function (tab_group) {
/* True if we are done with this tab group. */
                var done = false;
/* Get the already seen tab groups whose ID, title, or both match those of this tab group. */
                var matches = get_matches (seen_tab_groups, tab_group);
/* If we have an already seen tab group whose ID and title both match those of this tab group... */
                if (matches.match_id_and_title != null) {
/* If the user wants to reassign tab group IDs to avoid collisions... */
                    if (combine_tab_groups_prefs.combine_tab_groups_same_id_and_title == SessionExporter.Consts.CombineTabGroupsSameIDAndTitle.Reassign) {
/* Assign the next available tab group ID to the tab group and the tabs it contains. Add the tab group to the already seen tab groups. */
                        reassign_tab_group_id (tab_group, session);
                    }
/* The default setting is SessionExporter.Consts.CombineTabGroupsSameIDAndTitle.Merge. In that case, reassign all tabs in the tab group to the already seen tab group. */
                    else {
                        reassign_tab_group_ids_in_tabs (session, tab_group.id, matches.match_id_and_title.new_id);
                    }
/* We are done with this tab group. */
                    done = true;
                }
/* If we are not done with this tab group, and we have an already seen tab group whose title matches that of this tab group... */
                if (done == false && matches.match_title != null) {
/* If the user wants to merge tab groups that have the same title... */
                    if (combine_tab_groups_prefs.combine_tab_groups_same_title == SessionExporter.Consts.CombineTabGroupsSameTitle.Merge) {
/* Reassign all tabs in the tab group to the already seen tab group. */
                        reassign_tab_group_ids_in_tabs (session, tab_group.id, matches.match_title.new_id);
/* We are done with this tab group. */
                        done = true;
                    }
/* The default setting is SessionExporter.Consts.CombineTabGroupsSameTitle.Ignore. In that case, do nothing. We are not done with this tab group, because the tab group ID might still match that of a different already seen tab group. */
                }
/* If we are not done with this tab group, and we have an already seen tab group whose ID matches that of this tab group... */
                if (done == false && matches.match_id != null) {
/* If the user wants to merge tab groups that have the same ID... */
                    if (combine_tab_groups_prefs.combine_tab_groups_same_id == SessionExporter.Consts.CombineTabGroupsSameID.Merge) {
/* Append the title of the tab group to the display of the already seen tab group. This does not affect future title matches with the already seen tab group, since those are based on the original title. */
                        matches.match_id.display_title = sprintf ("%s_%s", matches.match_id.display_title, tab_group.title);
/* Reassign all tabs in the tab group to the already seen tab group. */
                        reassign_tab_group_ids_in_tabs (session, tab_group.id, matches.match_id.new_id);
                    }
/* The default setting is SessionExporter.Consts.CombineTabGroupsSameID.Reassign. In that case, assign the next available tab group ID to the tab group and the tabs it contains. Add the tab group to the already seen tab groups. */
                    else {
                        reassign_tab_group_id (tab_group, session);
                    }
/* We are done with this tab group. */
                    done = true;
                }
/* If we have not already seen a tab group whose ID, title, or both match those of this tab group... */
                if (done == false) {
/* Assign the next available tab group ID to the tab group and the tabs it contains. Add the tab group to the already seen tab groups. */
                    reassign_tab_group_id (tab_group, session);
                }
    		});
    	});
/* Combine the tabs for all sessions. */
	    var tabs = _.reduce (sessions, function (acc, session) {
		    return acc.concat (session.tabs);
	    }, []);
/* Loop through the already seen tab groups. Discard the old ID for each tab group. */
        var tab_groups = _.map (seen_tab_groups, function (tab_group) {
            return {
                id : tab_group.new_id,
/* Use the display title of the already seen tab group rather than the original title. */
                title : tab_group.display_title,
            };
        });
/* Return the combined session. */
        return {
            tabs : tabs,
            tab_groups : tab_groups,
        };
    }
}

/* Combine the sessions in files (1). (2) True to export the history of each tab. (3) The user preferences related to combining tab groups. Return the combined session. */
function combine_tabs_and_tab_groups_in_files_helper (session_files, include_tab_history, combine_tab_groups_prefs) {
/* Read the sessions from the files. */
    var sessions = read_sessions_from_files (session_files, include_tab_history, combine_tab_groups_prefs.session_file_order);
/* Combine the sessions. */
	return combine_sessions_internal (sessions, combine_tab_groups_prefs);
}

/* Combine the sessions in files (1) and apply action (2) to the combined session. (3) True to export the history of each tab. (4) The user preferences related to combining tab groups. Return unit. */
function combine_tabs_and_tab_groups_in_files (session_files, action, include_tab_history, combine_tab_groups_prefs) {
/* Get the combined session. */
    var combined_session = combine_tabs_and_tab_groups_in_files_helper (session_files, include_tab_history, combine_tab_groups_prefs);
/* Apply the action to the combined session. */
/* Note the action is already closed over include_tab_history in ExportSession.export_sessions. */
    action (combined_session);
}

/* Note this function will not currently work in Tagger because Tagger does not have the SessionExporter.File module. */
/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Promise
*/
/* We cannot return a value from promise.then, so instead we take an action to apply to the results of reading the session files. */
/* Note this does not have to be called through init_tab_view_all_windows because it gets the tab group data from files. */
/* Read the sessions in files (1), combine them, and apply action (2) to the combined session. (3) True to export the history of each tab. (4) The user preferences related to combining tab groups. Return unit. */
function get_tabs_and_tab_groups_from_files (files, action, include_tab_history, combine_tab_groups_prefs) {
/* Read the session files. */
	Promise.all (SessionExporter.File.readFiles (files)).then (
/* Combine the sessions in the files and apply the action to the combined session. */
		function (session_files) {
/* Sort the files by date. */
            session_files = _.sortBy (session_files, function (session_file) { return session_file.date; });
/* If the user wants to read the files from newest to oldest, reverse the files. */
            if (combine_tab_groups_prefs.session_file_order == SessionExporter.Consts.SessionFileOrder.NewestFirst) {
                session_files.reverse ();
            }
/* Get the contents from each session file and discard the date now that the files are sorted. */
            session_files = _.map (session_files, function (session_file) { return session_file.contents; });
            combine_tabs_and_tab_groups_in_files (session_files, action, include_tab_history, combine_tab_groups_prefs);
        }
	).catch (
/* We cannot propagate an exception outside of a promise. We would use Promise.done, but it is not implemented. So we handle the exception here. Unfortunately this means execution continues outside this promise, which we might not want. */
        function (error) { SessionExporter.Consts.show_error (error); }
    );
}

/* Functions: Get tabs and tab groups from windows. */

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsISHEntry
https://mxr.mozilla.org/mozilla-central/source/docshell/shistory/public/nsISHEntry.idl
Strangely, the first link does not mention the title and uri attributes, but the second does.
*/
/* Note this does not have to be called through init_tab_view_all_windows because it does not get any tab group data. */
/* Return the title and URL for tab (1). The tab must be of type browser. */
function get_tab_data_from_window_internal_helper (tab) {
	var history = tab.sessionHistory;
/* Get the current entry in the tab history. */
	var entry = history.getEntryAtIndex (history.index, false);
/* Convert the entry URI to a string. */
	return { title : entry.title, url : entry.URI.spec };
}

/* Note this must be called through init_tab_view_all_windows if get_tab_group_data is true. */
/* Get data for tab (2) in window (1). If (3) is true, return the tab, title, URL, and tab group ID. If not, return only the tab, title, and URL. */
function get_tab_data_from_window_internal (window, tab, get_tab_group_data) {
/* Get the title and URL for the tab. getBrowserForTab is so named because every tab is considered its own browser. It returns a tab of type browser, which contains additional information about a tab that is not found in the tab type we have already. */
	var tab_data = get_tab_data_from_window_internal_helper (window.gBrowser.getBrowserForTab (tab));
	if (get_tab_group_data == false) {
		return { tab : tab, title : tab_data.title, url : tab_data.url };
	}
	else {
/* Get the tab group ID for the tab. */
		var tab_group_id = 0;
/* Get the TabItem for this tab, which contains additional information about the tab. _tabViewTabItem was previously called TabItem and it now seems to be undocumented. */
		var tvi = tab._tabViewTabItem;
/* Get the ID of the TabItem's parent, which is the ID of the tab group to which this tab belongs. */
		if (tvi != null && tvi.parent != null) { tab_group_id = tvi.parent.id; }
/* Return the tab object, the tab title, the tab URL, and the tab group ID. */
		return { tab : tab, title : tab_data.title, url : tab_data.url, tab_group_id : tab_group_id };
	}
}

/* See:
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/tabbrowser
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/tab
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser
https://bugzilla.mozilla.org/show_bug.cgi?id=611715
*/
/* Note this must be called through init_tab_view_all_windows. */
/* The data structure that describes the return value is as follows.
Many window
Window 1 : 1 window object, many tabs
Tab 1 : 1 tab object, 1 tab data
*/
/* Return the windows and tabs in the currently open session. */
function get_tabs_from_windows () {
/* Loop through all windows. */
	return _.map (get_windows (), function (window) {
/* Loop through all tabs for this window. gBrowser is of type tabbrowser. It contains tabs of type tab. */
		var tabs = _.map (window.gBrowser.tabs, function (tab) { return get_tab_data_from_window_internal (window, tab, true); } );
/* Return the window object and the tabs for the window. */
		return { window : window, tabs : tabs };
	});
}

/* Note this must be called through init_tab_view_all_windows. */
/* Return the tab groups in the currently open session. */
function get_tab_groups_from_windows () {
/* Loop through all windows. */
	var results = _.map (get_windows (), function (window) {
/* Get the tab view window. */
		var tab_view = window.TabView;
/* Loop through the tab groups in the currently open session. */
		return _.map (tab_view._window.GroupItems.groupItems, function (tab_group) {
/* Return the tab group data. */
			return { id : tab_group.id, title : tab_group.getTitle () };
		});
	});
/* Combine the tab groups for all windows. */
	var results_ = _.flatten (results);
/* Add a default tab group for tabs that have no tab group. */
	results_.push ({ id : 0, title : "None" });
	return results_;
}

/* Note this must be called through init_tab_view_all_windows. */
/* Return the tabs and tab groups in the currently open session using the browser windows. */
function get_tabs_and_tab_groups_from_windows () {
	return { tabs : get_tabs_from_windows (), tab_groups : get_tab_groups_from_windows () };
}

/* Methods. */

var SessionUtils = {
/* Combine the tabs and tab groups in sessions (1). (2) The user preferences related to combining tab groups. Return the combined session. */
	combine_sessions : function (sessions, combine_tab_groups_prefs) { return combine_sessions_internal (sessions, combine_tab_groups_prefs); },

/* Apply function (1) to the tabs and tab groups in the current session using the session state. (2) True to export the history of each tab. Return unit. */
	get_current_session_from_session_state : function (action, include_tab_history) {
		init_tab_view_all_windows (function () {
			action (get_tabs_and_tab_groups_from_session_state (include_tab_history));
		});
	},

/* Apply function (1) to the tabs and tab groups in the current session using the browser windows. Return unit. */
	get_current_session_from_windows : function (action) {
		init_tab_view_all_windows (function () {
			action (get_tabs_and_tab_groups_from_windows ());
		});
	},

/* We do not have to call init_tab_view_all_windows to read session states from files. However, get_tabs_and_tab_groups_from_files uses a promise to open each file, so we apply it to the callback rather than have it return a result. */
/* Apply function (2) to the tabs and tab groups in the sessions in files (1). (3) True to export the history of each tab. (4) The user preferences related to combining tab groups. Return unit. */
	get_sessions_from_files : function (files, action, include_tab_history, combine_tab_groups_prefs) {
		get_tabs_and_tab_groups_from_files (files, action, include_tab_history, combine_tab_groups_prefs);
	},

/* Remove duplicate tabs from session (1). (2) True to remove duplicate tabs across tab groups. Return the revised session. */
    remove_duplicate_tabs : function (session, skip_duplicate_tabs_across_tab_groups) {
        return remove_duplicate_tabs_internal (session, skip_duplicate_tabs_across_tab_groups);
    },

/* Note get_tab_data_from_window_internal must be called through init_tab_view_all_windows if get_tab_group_data is true. Currently, this function is called by get_tab_url_and_title and find_url_in_project in commands.jsm. Those functions expect a return value from this function. If we change this function to call init_tab_view_all_windows, we must also change it to take a callback, and change those functions to pass a callback. Since they pass false for get_tab_group_data, we have left this function as is for now. We pass false to get_tab_data_from_window_internal regardless of the value of get_tab_group_data. */
/* Get data for tab (2) in window (1). If (3) is true, return the tab, title, URL, and tab group ID. If not, return only the tab, title, and URL. */
	get_tab_data_from_window : function (window, tab, get_tab_group_data) {
		return get_tab_data_from_window_internal (window, tab, false);
	},
};