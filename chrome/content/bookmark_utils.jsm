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
var EXPORTED_SYMBOLS = ["BookmarkUtils"];

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
/* SessionExporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
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

/* Firefox services. */
XPCOMUtils.defineLazyServiceGetter (this, "Bookmarks", "@mozilla.org/browser/nav-bookmarks-service;1", Components.interfaces.nsINavBookmarksService);
XPCOMUtils.defineLazyServiceGetter (this, "History", "@mozilla.org/browser/nav-history-service;1", Components.interfaces.nsINavHistoryService);

/* Functions: general helper. */

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavBookmarksService
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryResultNode
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryContainerResultNode
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Places/Places_Developer_Guide (Accessing Folder Contents)
*/

/* Return true if node (1) is a bookmark folder node. */
function is_bookmark_folder_node (node) {
    return (node.type !== undefined && node.type != null &&
        node.type == Components.interfaces.nsINavHistoryResultNode.RESULT_TYPE_FOLDER);
}

/* Return true if node (1) is a bookmark node. */
function is_bookmark_node (node) {
    return (node.type !== undefined && node.type != null &&
        node.type == Components.interfaces.nsINavHistoryResultNode.RESULT_TYPE_URI);
}

/* Convert bookmark folder node (1) to a bookmark folder. Return the bookmark folder. If the conversion fails, raise an exception. */
function bookmark_folder_node_to_bookmark_folder (node) {
    try {
/* Get the interface needed to access the containerOpen property. */
        node.QueryInterface (Components.interfaces.nsINavHistoryContainerResultNode);
        return node;
    }
    catch (error) {
        throw new Error (sprintf ("bookmark_utils.jsm: bookmark_folder_node_to_bookmark_folder: QueryInterface failed. Error: %s.", error.message));
    }
}

/* Convert bookmark folder node (1) to a bookmark folder and open it. Return the open folder. If the node is not a bookmark folder, raise an exception. */
function open_bookmark_folder_node (node) {
/* Verify the node is the correct type. If not, raise an exception. */
    if (is_bookmark_folder_node (node)) {
/* Convert the node to a folder. */
        var folder = bookmark_folder_node_to_bookmark_folder (node);
/* Open the folder. */
        folder.containerOpen = true;
        return folder;
    }
    else {
        throw new Error (sprintf ("bookmark_utils.jsm: open_bookmark_folder_node: Invalid node type. Expected type: 6 (RESULT_TYPE_FOLDER). Actual type: %d.", node.type));
    }
}

/* Functions: method helpers: bookmark folder nodes. */

/* Return all bookmark folders under bookmark folder node (1). */
function bookmark_folder_node_to_bookmark_folders (node) {
/* The results. */
    var folders = [];
/* Return the bookmark folders under bookmark folder (1). (2) The path of the bookmark folder that is the parent of (1). */
    var get_bookmark_folders_helper = function (node, path) {
/* Open the bookmark folder. */
        node = open_bookmark_folder_node (node);
/* Add the bookmark folder name to the path. */
        var new_path = "";
        if (path.length > 0) { new_path = path + "//" + node.title; }
        else { new_path = node.title; }
/* Add the bookmark folder to the results. */
        folders.push ({
            id : node.itemId,
            title : node.title,
            path : new_path,
        });
/* Loop through the bookmark folder's child nodes. */
        for (var loop = 0; loop < node.childCount; loop++) {
            var child_node = node.getChild (loop);
/* If the child node is a bookmark folder... */
            if (is_bookmark_folder_node (child_node)) {
/* Get the bookmark folders below this bookmark folder as well. */
                get_bookmark_folders_helper (child_node, new_path);
            }
        }
/* The documentation says to set containerOpen for the node to false when we are done reading its children. */
        node.containerOpen = false;
    };
/* Start the recursion. */
    get_bookmark_folders_helper (node, "");
    return folders;
}

/* Return the bookmarks for bookmark folder node (1). (2) The bookmark folder ID. */
function bookmark_folder_node_to_bookmarks (node, folder_id) {
/* The tabs for this folder. */
    var tabs = [];
/* Open the bookmark folder. */
    node = open_bookmark_folder_node (node);
/* Loop through the bookmark folder's child nodes. */
    for (var loop = 0; loop < node.childCount; loop++) {
        var child_node = node.getChild (loop);
/* If the child node is a bookmark... */
        if (is_bookmark_node (child_node)) {
/* Create a tab based on this bookmark. */
            var tab = {
/* Use the bookmark ID as the tab ID. */
                id : child_node.itemId,
                title : child_node.title,
                url : child_node.uri,
/* Use the bookmark folder ID as the tab group ID. */
                tab_group_id : folder_id,
            };
/* If the title is empty, use the URL as the title. */
    		if (tab.title.length == 0) { tab.title = tab.url; }
/* Add the tab to the tabs list. */
            tabs.push (tab);
        }
    }
/* The documentation says to set containerOpen for the node to false when we are done reading its children. */
    node.containerOpen = false;
/* Return the tabs. */
    return tabs;
}

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryQuery
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryQueryOptions
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Places/Querying (Bookmark Queries)
*/
/* Return the bookmark folder node with ID (1). If we do not find the bookmark folder node, return null. */
function get_bookmark_folder_node_by_id (id) {
    var query = History.getNewQuery ();
    query.setFolders ([id], 1);
    var options = History.getNewQueryOptions ();
    options.queryType = History.QUERY_TYPE_BOOKMARKS;
/* Run the query. */
    var result = History.executeQuery (query, options);
/* The root property contains the node that represents the bookmark folder. If the query returned no results, the root property has type 5 (RESULT_TYPE_QUERY). */
    if (is_bookmark_folder_node (result.root)) { return result.root; }
    else { return null; }
}

/* TODO1 Try to find the allBookmarksFolderId mentioned here:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Places/Places_utilities_for_JavaScript
*/
/* Return the bookmarks root folder node. */
function get_root_bookmark_folder_node () {
    var node = get_bookmark_folder_node_by_id (Bookmarks.bookmarksMenuFolder);
    if (node != null) { return node; }
    else { throw new Error ("bookmark_utils.jsm: get_root_bookmark_folder_node: Failed to get bookmarks root folder node."); }
}

/* Functions: method helpers: bookmark folders. */

/* Note this function does not recurse into the folders below each folder. That is done by bookmark_folder_node_to_bookmark_folders. */
/* Convert the bookmark folders (1) into sessions. Return the sessions. */
function read_bookmark_folders_internal (folders) {
/* Loop through the bookmark folders. */
    return _.map (folders, function (folder) {
/* The tabs list for this folder. */
        var tabs = [];
/* Create a tab group based on this folder. */
        var tab_group = {
/* We use the bookmark folder ID as a tab group ID. */
            id : folder.id,
            title : folder.title,
            path : folder.path,
        };
/* Get the bookmark folder node based on the ID. */
        var node = get_bookmark_folder_node_by_id (folder.id);
/* If we found the bookmark folder node... */
        if (node != null) {
/* Get the bookmarks for this bookmark folder node. */
            tabs = bookmark_folder_node_to_bookmarks (node, folder.id);
        }
/* Create a session based on the tab groups and tabs, and add it to the results. */
        return {
            tab_groups : [tab_group],
            tabs : tabs,
        };
    });
}

/* Return all bookmark folders. */
function get_all_bookmark_folders_internal () {
    return bookmark_folder_node_to_bookmark_folders (get_root_bookmark_folder_node ());
}

/* Convert all bookmark folders and bookmarks into tab groups and tabs. Return the tab groups and tabs. */
function read_all_bookmark_folders_internal () {
    return read_bookmark_folders_internal (get_all_bookmark_folders_internal ());
}

/* Functions: method helper: move_bookmark. */

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavBookmarksService
*/
/* Move the bookmark with ID (1) to the bookmark folder with ID (2). Return unit. */
function move_bookmark_internal (bookmark_id, new_bookmark_folder_id) {
    Bookmarks.moveItem (bookmark_id, new_bookmark_folder_id, Bookmarks.DEFAULT_INDEX);
}

/* Functions: method helper: combine_bookmark_folders. */

/* Combine the tab groups and tabs in bookmark folders (1). Return the combined tab groups and tabs. */
function combine_bookmark_folders_internal (folders) {
/* Combine the folders. */
    return _.reduce (folders, function (acc, folder) {
        return {
            tab_groups : acc.tab_groups.concat (folder.tab_groups),
            tabs : acc.tabs.concat (folder.tabs),
        }
    }, { tab_groups : [], tabs : [] });
}

/* Functions: methods. */

/* TODO2 This API is not consistent.
get_bookmark_folders_* takes a node and returns folder data (id, title, path, node).
read_bookmark_folders_* takes folder data and returns session data (tab groups, tabs).
*/

var BookmarkUtils = {
/* Return all bookmark folders below the bookmark folder with ID (1). */
    get_bookmark_folders_by_id : function (folder_id) {
        var folders = [];
/* Get the bookmark folder node with the specified ID. */
        var node = get_bookmark_folder_node_by_id (folder_id);
/* If we found the bookmark folder node, get all bookmark folders below the bookmark folder node. */
        if (node != null) { folders = bookmark_folder_node_to_bookmark_folders (node); }
        return folders;
    },

/* Return all bookmark folders. */
    get_all_bookmark_folders : function () {
        return get_all_bookmark_folders_internal ();
    },

/* Convert the bookmark folders and bookmarks below bookmark folders (1) into tab groups and tabs. Return the tab groups and tabs. */
    read_bookmark_folders : function (folders) {
        return read_bookmark_folders_internal (folders);
    },

/* Convert all bookmark folders and bookmarks into tab groups and tabs. Return the tab groups and tabs. */
    read_all_bookmark_folders : function () {
        return read_all_bookmark_folders_internal ();
    },

/* Move the bookmark with ID (1) to the bookmark folder with ID (2). Return unit. */
    move_bookmark : function (bookmark_id, new_bookmark_folder_id) {
        move_bookmark_internal (bookmark_id, new_bookmark_folder_id);
    },

/* This is meant to be applied to the result of read_bookmark_folders or read_all_bookmark_folders. */
/* Combine the tab groups and tabs in bookmark folders (1). Return the combined tab groups and tabs. */
    combine_bookmark_folders : function (folders) {
        return combine_bookmark_folders_internal (folders);
    },
};