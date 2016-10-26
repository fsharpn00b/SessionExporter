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
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
Components.utils.import ("chrome://sessionexporter/content/consts.jsm", SessionExporter);

/* See:
https://developer.mozilla.org/en-US/Add-ons/Performance_best_practices_in_extensions
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm
We don't use these modules and services at startup, so we import them with XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter instead of Components.utils.import and Components.classes.
Note the name parameter must match an exported symbol from the module.
*/
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "ExportSession", SessionExporter.Consts.content_folder + "export_session.jsm");
XPCOMUtils.defineLazyModuleGetter(SessionExporter, "BookmarkSession", SessionExporter.Consts.content_folder + "bookmark_session.jsm");
XPCOMUtils.defineLazyModuleGetter(SessionExporter, "Backup", SessionExporter.Consts.content_folder + "backup.jsm");

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIObserverService
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIObserver
*/
var observer_service = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

/* See:
https://developer.mozilla.org/en-US/docs/Observer_Notifications
*/
/* Note previously we handled quit-application-granted. However, when we install this add on in our main profile, the first two times we call the backup function, it writes a 20 KB JSON file that seems to contain only the bookmark folders and not the bookmarks. After that, it works normally. We presume calling the backup function on quit-application-granted simply does not give it enough time.
*/
const bookmark_backup_event = "quit-application-requested";

/* Event handler class. */
var observer = {
    observe : function (aSubject, aTopic, aData) {
        if (aTopic == bookmark_backup_event && aData == "lastwindow") {
            try { SessionExporter.Backup.backup(); }
/* The quit-application-granted event does not fire until all windows are closed, so we have no way to show or log the error message. */
            catch (error) { }
/* Previously, we removed the observer in the window unload event handler. However, if we open the browser console and then close the main browser window, the window unload event fires before the quit-application-granted event. As a result, when the close the main browser window, the quit-application-granted event no longer has a handler. */
            observer_service.removeObserver(observer, bookmark_backup_event);
        }
    },
};

/* See:
https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/Appendix_B:_Install_and_Uninstall_Scripts
*/
/* Handle the window load event. */
window.addEventListener("load", function () { SessionExporter.Main.init(); }, false);
/* Note for some reason, the close handler is not called when we run this add on in our main profile. Presumably, one of the other add ons we have installed is interfering. */
/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Events/close_event
"Note that the close event is only fired when the user presses the close button on the titlebar; (i.e. not File -> Quit). The unload event should be used to capture all attempts to unload the window."
*/
/* Handle the window unload event. */
/* This is currently not used. */
/*
window.addEventListener("unload", function () { SessionExporter.Main.unload(); }, false);
*/

/* Run the tests. */
function test_internal () {
    SessionExporter.ExportSession.test ();
    window.alert ("Tests done.");
}

SessionExporter.Main = {
/* See:
https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/Handling_Preferences
https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/Appendix_B:_Install_and_Uninstall_Scripts
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Toolbar
*/
/* Handle the window load event. Return unit. */
    init: function () {
/* Add event handlers. */
        observer_service.addObserver(observer, bookmark_backup_event, false);
/* Find out whether this is the first time the add on has been loaded. */
        var firstRunPref = SessionExporter.Consts.preference_prefix + ".firstRun";
/* The get*Pref methods in nsiPrefBranch automatically check the current preferences and then the default preferences. */
        var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService (Components.interfaces.nsIPrefBranch);
/* If this is the first time the add on has been loaded... */
        if (prefs.getBoolPref (firstRunPref)) {
/* Get the navigation toolbar. */
            var toolbar = document.getElementById ("nav-bar");
/* Append our toolbar button to the end of the toolbar. */
            toolbar.insertItem ("SessionExporter_button", null);
            toolbar.setAttribute ("currentset", toolbar.currentSet);
            document.persist (toolbar.id, "currentset");
/* Update the preference so this code does not run again. */
            prefs.setBoolPref (firstRunPref, false);
        }
    },

/* Handle the window unload event. Return unit. */
/* This is currently not used. */
/*
    unload : function () { },
*/

/* Ask the user to select a session file and an output file. Read the session file and export the session to the output file. (1) True to export the history of each tab. Return unit. */
    export_sessions: function (include_tab_history) {
        try { SessionExporter.ExportSession.export_sessions (include_tab_history); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Ask the user to select an output file. Export the current session to the output file. (1) True to export the history of each tab. Return unit. */
    export_current_session: function (include_tab_history) {
        try { SessionExporter.ExportSession.export_current_session (include_tab_history); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Ask the user to select a session file and a bookmark folder name. Read the session file and save the session in the specified bookmark folder. Return unit. */
    bookmark_sessions : function () {
        try { SessionExporter.BookmarkSession.bookmark_sessions (); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Ask the user to select a bookmark folder name. Save the current session in the specified bookmark folder. Return unit. */
    bookmark_current_session : function () {
        try { SessionExporter.BookmarkSession.bookmark_current_session (); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Ask the user to select one or more bookmark folders and output files. Convert the bookmark folders to sessions and export them to the output files. (1) True to export all bookmark folders. Return unit. */
    export_bookmark_folders : function (export_all_folders) {
        try { SessionExporter.BookmarkSession.export_bookmark_folders (export_all_folders); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Ask the user to select one or more bookmark folders and an output file. Convert the bookmark folders to sessions and export the combined session to the output file. (1) True to export all bookmark folders. Return unit. */
	export_bookmark_folders_combined : function (export_all_folders) {
        try { SessionExporter.BookmarkSession.export_bookmark_folders_combined (export_all_folders); }
        catch (error) { SessionExporter.Consts.show_error (error); }
	},

/* Ask the user to select a bookmark folder name. Convert the bookmark folders to sessions and combine the session. Save the combined session in the specified bookmark folder. (1) True to merge all bookmark folders. Return unit. */
	merge_bookmark_folders: function (export_all_folders) {
	    try { SessionExporter.BookmarkSession.merge_bookmark_folders (export_all_folders); }
	    catch (error) { SessionExporter.Consts.show_error (error); }
    },

/* Run unit tests. Return unit. */
    test : function () {
        try { test_internal (); }
        catch (error) { SessionExporter.Consts.show_error (error); }
    },
};