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
if (typeof SessionExporter == "undefined") { var SessionExporter = { }; }

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Using
*/
var EXPORTED_SYMBOLS = ["Backup"];

/* See:
https://developer.mozilla.org/en-US/docs/Components.utils.import
It seems the convention is that a .jsm module exports a variable with the same name as the module (for example, XPCOMUtils).
We use these modules and services at startup, so we import them with Components.utils.import and Components.classes instead of XPCOMUtils.defineLazyModuleGetter and defineLazyServiceGetter. */
/* Firefox modules. */
Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");
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
XPCOMUtils.defineLazyModuleGetter (this, "Services", "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter (this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter (this, "PlacesUtils", "resource://gre/modules/PlacesUtils.jsm");
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "File", SessionExporter.Consts.content_folder + "file.jsm");

/* Functions: general helper. */

// TODO1 Move to consts.jsm.
/* Return the value for the preference with type bool and name (1). */
function get_bool_pref(name)
{
    return Services.prefs.getBoolPref(sprintf("%s.%s", SessionExporter.Consts.preference_prefix, name));
}

// TODO1 Move to consts.jsm.
/* Return the current date as a formatted string. */
function getDateString () {
    /* Helper function. Format number (1) to have at least two digits and format it as a string. Return the string. */
    function format (n) {
        if (n > 9) { return "" + n; } else { return "0" + n; }
    }
    var d = new Date();
    /* Month is returned as 0-11. */
    return format(d.getFullYear()) + format(d.getMonth() + 1) + format(d.getDate()) + "_" + format(d.getHours()) + format(d.getMinutes()) + format(d.getSeconds());
}

var Backup = {
/* See:
saveBookmarksToJSONFile
https://dxr.mozilla.org/mozilla-central/source/toolkit/components/places/PlacesBackups.jsm
exportToFile
https://dxr.mozilla.org/mozilla-central/source/toolkit/components/places/BookmarkJSONUtils.jsm
getBookmarksTree
https://dxr.mozilla.org/mozilla-central/source/toolkit/components/places/PlacesBackups.jsm
promiseBookmarksTree
https://dxr.mozilla.org/mozilla-central/source/toolkit/components/places/PlacesUtils.jsm
*/
/* Back up the bookmarks to a JSON file. Return unit. */
    backup : function () {
        if (true == get_bool_pref("backup_bookmarks_json")) {
/* Get the output folder from the preferences. */
            var output_folder_path = SessionExporter.File.getWriteFolder().path;
/* Add a date/time stamp to the output file name. */
            var output_file_path = sprintf ("%s\\bookmarks_%s.json", output_folder_path, getDateString());
/* Create the file. */
            var output_file = new FileUtils.File(output_file_path);
/* Get the bookmarks. We do not set the includeItemIds flag, as it is deprecated. */
            var result = PlacesUtils.promiseBookmarksTree(PlacesUtils.bookmarks.rootGuid, { });
/* Resolve the promise. */
            result.then (function(value) {
/* Convert the bookmarks to JSON format. */
                var output = JSON.stringify(value);
/* Write the JSON data to the file. */
                SessionExporter.File.writeFile(output, output_file);
            });
/* We cannot propagate an exception outside of a promise. We would use Promise.done, but it is not implemented. We also cannot log or show the error message here, because this function is called during window unload, so WindowMediator.getMostRecentWindow returns None. */
        }
    },
};