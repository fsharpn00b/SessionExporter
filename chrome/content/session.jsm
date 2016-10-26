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
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
*/
var EXPORTED_SYMBOLS = ["Session"];

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import ("resource://gre/modules/AddonManager.jsm");
/* For some reason, if we import this with defineLazyModuleGetter, the Firefox open menu button does not work. */
Components.utils.import ("resource://gre/modules/Promise.jsm");
/* Session Exporter modules. */
Components.utils.import ("chrome://sessionexporter/content/consts.jsm", SessionExporter);

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/mozIJSSubScriptLoader
*/
var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
	.getService(Components.interfaces.mozIJSSubScriptLoader);
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
XPCOMUtils.defineLazyModuleGetter (this, "Services", "resource://gre/modules/Services.jsm");

var sessionManagerAddon = null;

/* Functions: general helper. */

// TODO1 Move to consts.jsm.
/* Return the value for the preference with type int and name (1). */
function get_int_pref (name) {
    return Services.prefs.getIntPref (sprintf ("%s.%s", SessionExporter.Consts.preference_prefix, name));
}

// TODO1 Move to consts.jsm.
/* Return the value for the preference with type bool and name (1). */
function get_bool_pref (name) {
    return Services.prefs.getBoolPref (sprintf ("%s.%s", SessionExporter.Consts.preference_prefix, name));
}

/* Functions: getSessionFolder helper. */

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Promise
https://developer.mozilla.org/en-US/Add-ons/Add-on_Manager/AddonManager
*/
/* Get the Session Manager add-on. getAddonByID is asynchronous, so use a promise to get the value. Return unit. */
function get_session_manager_addon () {
/* We must use Promise.defer here because we cannot return Promise.resolve from AddonManager.getAddonByID. */
    var result = Promise.defer ();
    AddonManager.getAddonByID (SessionExporter.Consts.sessionManagerID, function (addon) {
        result.resolve (addon);
    });
/* Resolve the promise. */
    result.promise.then (
        function (value) { sessionManagerAddon = value; }
    ).catch (
/* We cannot propagate an exception outside of a promise. We would use Promise.done, but it is not implemented. So we handle the exception here. Unfortunately this means execution continues outside this promise, which we might not want. */
	    function (error) { SessionExporter.Consts.show_error (error); }
    );
}

/* Return the path of the custom session folder in the Session Manager preferences. */
function getSessionManagerCustomFolderPath () {
	try {
		return Services.prefs.getComplexValue (SessionExporter.Consts.sessionManagerPreferencePrefix + ".sessions_dir", Components.interfaces.nsISupportsString).data;
	}
	catch (error) {
		throw new Error (sprintf ("session.jsm: getSessionManagerCustomFolderPath: Error getting Session Manager custom session folder: %s.", error.message));
	}
}

/* Get the Session Manager add-on when this module is loaded. */
get_session_manager_addon ();

var Session = {
/* See:
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Preferences
This is no longer relevant, but might be useful later.
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Services.jsm
*/
/* Return the path of the output folder from the preferences. */
	getOutputFolder : function () {
		return Services.prefs.getComplexValue (SessionExporter.Consts.preference_prefix + ".outputFolder", Components.interfaces.nsISupportsString).data;
	},

/* Return the path of the input folder from the preferences. */
	getInputFolder : function () {
		return Services.prefs.getComplexValue (SessionExporter.Consts.preference_prefix + ".inputFolder", Components.interfaces.nsISupportsString).data;
	},

/* Save the path of the output folder (1) in the preferences. Return unit. */
	setOutputFolder : function (folder) {
		var value = Components.classes["@mozilla.org/supports-string;1"]
			.createInstance(Components.interfaces.nsISupportsString);
		value.data = folder;
		Services.prefs.setComplexValue (SessionExporter.Consts.preference_prefix + ".outputFolder", Components.interfaces.nsISupportsString, value);
	},

/* Save the path of the input folder (1) in the preferences. Return unit. */
	setInputFolder : function (folder) {
		var value = Components.classes["@mozilla.org/supports-string;1"]
			.createInstance(Components.interfaces.nsISupportsString);
		value.data = folder;
		Services.prefs.setComplexValue (SessionExporter.Consts.preference_prefix + ".inputFolder", Components.interfaces.nsISupportsString, value);
	},

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/FileUtils.jsm
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFile
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/File_I_O
*/
/* Return the session folder. */
	getSessionFolder : function () {
/* See:
https://developer.mozilla.org/en-US/Add-ons/Add-on_Manager/Addon
"isActive. True if the add-on is currently functional. For some add-ons this will change immediately based on the appDisabled and userDisabled properties; for others it will only change after an application restart."
Session Manager can be disabled without a restart, but that might change in the future.
*/
		var sessionManagerInstalled =
            (sessionManagerAddon !== undefined &&
            sessionManagerAddon != null &&
			sessionManagerAddon.isActive == true &&
			sessionManagerAddon.appDisabled == false &&
			sessionManagerAddon.userDisabled == false);
		var folder = null;
		var sessionPathSet = false;
		if (sessionManagerInstalled) {
			var path = getSessionManagerCustomFolderPath ();
/* If Session Manager is installed and enabled and has a custom session folder path set, get that folder. */
			if (path.length > 0) {
				try {
/* Create a file object to represent the folder. */
					folder = new FileUtils.File (path);
/* If the folder does not exist, create it. nsIFile.create requires UNIX-style permissions, but using an octal literal raises an exception. */
					if (!folder.exists()) { folder.create (Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt ("0777", 8)); }
				}
				catch (error) {
					throw new Error (sprintf ("session.jsm: getSessionFolder: Error opening Session Manager custom session folder. Folder: %s. Error: %s.", path, error.message));
				}
				sessionPathSet = true;
			}
		}
/* If Session Manager is installed and enabled but no custom session folder path is set, or if Session Manager is not installed or not enabled, get the session folder from the user profile. */
		if (sessionPathSet == false) {
/* The first parameter tells getDir to get the user profile folder. The second parameter tells it to get the "sessions" subfolder. The third parameter tells it to create the folder if it does not exist.
*/
			try {
				folder = FileUtils.getDir ("ProfD", ["sessions"], true);
			}
			catch (error) {
				throw new Error (sprintf ("session.jsm: getSessionFolder: Error opening session folder: %s.", error.message));
			}
		}
		return folder;
	},

/* See the comments for SessionFileOrder in consts.jsm. */
	get_session_file_order : function () { return get_int_pref ("session_file_order"); },
/* See the comments for CombineTabGroupsSameID in consts.jsm. */
	get_combine_tab_groups_same_id : function () { return get_int_pref ("combine_tab_groups_same_id"); },
/* See the comments for CombineTabGroupsSameTitle in consts.jsm. */
    get_combine_tab_groups_same_title : function () { return get_int_pref ("combine_tab_groups_same_title"); },
/* See the comments for CombineTabGroupsSameIDAndTitle in consts.jsm. */
    get_combine_tab_groups_same_id_and_title : function () { return get_int_pref ("combine_tab_groups_same_id_and_title"); },
/* True to skip duplicate tabs when exporting a single session. */
	get_skip_duplicate_tabs_single_session : function () { return get_bool_pref ("skip_duplicate_tabs_single_session"); },
/* True to skip duplicate tabs when exporting multiple sessions. */
    get_skip_duplicate_tabs_multiple_sessions : function () { return get_bool_pref ("skip_duplicate_tabs_multiple_sessions"); },
/* True to skip duplicate tabs across tab groups. */
	get_skip_duplicate_tabs_across_tab_groups : function () { return get_bool_pref ("skip_duplicate_tabs_across_tab_groups"); },
/* True to log skipped duplicate tabs. */
    get_log_duplicate_tabs : function () { return get_bool_pref ("log_duplicate_tabs"); },
/* True to write skipped duplicate tabs to a file. */
    get_file_duplicate_tabs : function () { return get_bool_pref ("file_duplicate_tabs"); },
/* True to save skipped duplicate tabs to a bookmark folder. */
    get_bookmark_duplicate_tabs : function () { return get_bool_pref ("bookmark_duplicate_tabs"); },
};
