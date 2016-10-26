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

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");

/* See:
https://developer.mozilla.org/en-US/Add-ons/Performance_best_practices_in_extensions
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm
We don't use these modules and services at startup, so we import them with XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter instead of Components.utils.import and Components.classes.
Note the name parameter must match an exported symbol from the module.
*/
/* Firefox services. */
XPCOMUtils.defineLazyServiceGetter (this, "WM", "@mozilla.org/appshell/window-mediator;1", Components.interfaces.nsIWindowMediator);

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
*/
var EXPORTED_SYMBOLS = ["Consts"];

/* It seems an object field cannot refer to another, so we declare these here so we can refer to them in the Consts object. */
const addon_id = "{943b5589-7808-4a70-acdc-7b6ee21e7cce}";
const sessionManagerID = "{1280606b-2510-4fe0-97ef-9b5a22eafe30}";
/* True to run in debug mode; otherwise, false. */
const isDebug = false;

const addon_name = "Session Exporter";
const preference_prefix = "extensions." + addon_id;
const content_folder = "chrome://sessionexporter/content/";

var Consts = {
    addon_name : addon_name,
	addon_id : addon_id,
	preference_prefix : preference_prefix,
	content_folder : content_folder,

	sessionManagerID : sessionManagerID,
	sessionManagerPreferencePrefix : "extensions." + sessionManagerID,

/* The order in which to read multiple session files. When the user wants to skip duplicate tabs across tab groups, this affects which tabs we will skip. For example, if two sessions contain a tab with the same URL in tab groups with different names, the order in which we read the sessions determines from which tab group the tab is removed as a duplicate. */
    SessionFileOrder : { OldestFirst : 0, NewestFirst : 1, },
/* When we read multiple session files, this determines how we handle tab groups with the same ID. */
    CombineTabGroupsSameID : { Reassign : 0, Merge : 1, },
/* When we read multiple session files, this determines how we handle tab groups with the same title. */
    CombineTabGroupsSameTitle : { Ignore : 0, Merge : 1, },
/* When we read multiple session files, this determines how we handle tab groups with the same ID and title. */
    CombineTabGroupsSameIDAndTitle : { Merge : 0, Reassign : 1, },

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIWindowMediator
*/
/* Return the most recent browser window. */
	get_window : function () {
/* The documentation does not list any exceptions for WM.getMostRecentWindow. */
		var window = WM.getMostRecentWindow ("navigator:browser");
/* We do not intend this add on to run with no window open. So we raise an exception if that happens. */
		if (window != null) { return window; }
		else { throw new Error ("WindowMediator.getMostRecentWindow returned None."); }
	},

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIWindowMediator
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsISimpleEnumerator
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser
*/
/* Return all browser windows. */
	get_windows : function () {
		var windows = [];
/* The documentation does not list any exceptions for WM.getEnumerator, nsISimpleEnumerator.hasMoreElements, or nsISimpleEnumerator.getNext. */
/* Get all browser windows and loop through them. */
		var enumerator = WM.getEnumerator ("navigator:browser");
		while (enumerator.hasMoreElements () == true) { windows.push (enumerator.getNext ()); }
/* We do not intend this add on to run with no window open. So we raise an exception if that happens. */
		if (windows.length > 0) { return windows; }
		else { throw new Error ("WindowMediator.getEnumerator found no open windows."); }
	},

/* Log message (1). Return unit. */
	log : function (message) {
		Consts.get_window ().console.log (addon_name + ": " + message);
	},

/* Log object (1). Return unit. */
	log_obj : function (obj) {
		Consts.get_window ().console.log (addon_name + ": " + JSON.stringify (obj));
	},

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
*/
/* Return error (1), formatted. */
    format_error : function (error) {
        var message = addon_name + ": " + error.message;
        if (error.fileName !== undefined) { message += "\nFile: " + error.fileName; }
        if (error.lineNumber !== undefined) { message += "\nLine: " + error.lineNumber; }
        return message;
    },

/* Show error (1). Return unit. */
	show_error : function (error) {
		var window = Consts.get_window ();
        var message = Consts.format_error(error);
/* If we are in debug mode, log the error to the console. Otherwise, show it in an alert. */
		if (isDebug == true) { window.console.log (message); }
		else { window.alert (message); }
	},

/* This is used for debugging, so we do not call it in show_error. */
/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/Stack
*/
/* Return the call stack. */
	get_call_stack : function () {
		try { throw new Error (addon_name + ": this error was thrown to get the call stack."); }
		catch (e) { return e.stack; }
	},

/* Sleep for (1) milliseconds. Return unit. */
	sleep : function (ms) {
		var currentTime = new Date().getTime();
		while (currentTime + ms >= new Date().getTime()) {}
	},
};
