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
var EXPORTED_SYMBOLS = ["File"];

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
XPCOMUtils.defineLazyModuleGetter (this, "NetUtil", "resource://gre/modules/NetUtil.jsm");
/* Session Exporter modules. We import these into the SessionExporter namespace, instead of the default this namespace. */
XPCOMUtils.defineLazyModuleGetter (SessionExporter, "Session", SessionExporter.Consts.content_folder + "session.jsm");

/* The file dialog interface. */
const nsIFilePicker = Components.interfaces.nsIFilePicker;

/* This is for writing files in UTF-8 format. */
var outputConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
	.createInstance (Components.interfaces.nsIScriptableUnicodeConverter);
outputConverter.charset = "UTF-8";

// TODO1 Update to match file.jsm in BookmarkSorter.

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFilePicker
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Open_and_Save_Dialogs
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsILocalFile
*/
var File = {
/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/FileUtils.jsm
*/
/* Return the folder from which to read the input file. */
	getReadFolder : function () {
/* Get the input folder path from the preferences. */
		var folder_path = SessionExporter.Session.getInputFolder ();
/* If the input folder path is not empty... */
		if (folder_path.length > 0) {
			try {
/* Create a file object to represent the folder. */
				var folder = new FileUtils.File (folder_path);
/* If the folder does not exist, create it. nsIFile.create requires UNIX-style permissions, but using an octal literal raises an exception. */
				if (!folder.exists ()) { folder.create (Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt ("0777", 8)); }
				return folder;
			}
			catch (error) {
				throw new Error (sprintf ("file.jsm: getReadFolder: Error opening input folder. Folder: %s. Error: %s.", folder_path, error.message));
			}
		}
/* If the input folder path is empty, return the session folder. getSessionFolder creates the folder if it does not exist. */
		else { return SessionExporter.Session.getSessionFolder (); }
	},

/* Show the Select Session File dialog. If the user selects one or more session files, return them; otherwise, return null. */
	getReadFiles : function () {
		var file_dialog =
			Components.classes["@mozilla.org/filepicker;1"]
			.createInstance (nsIFilePicker);
		file_dialog.init (SessionExporter.Consts.get_window (), "Select Session File", nsIFilePicker.modeOpen | nsIFilePicker.modeOpenMultiple);
/* Set the starting folder for the dialog. */
		file_dialog.displayDirectory = File.getReadFolder ();
/* Set the dialog to show only session files. */
		file_dialog.appendFilter ("Session Files","*.session");
/* If the user selects at least one file... */
		if (file_dialog.show () == nsIFilePicker.returnOK) {
/* Save the input folder path to the preferences. */
			SessionExporter.Session.setInputFolder (file_dialog.displayDirectory.path);
/* Return the selected files. */
			return file_dialog.files;
		}
/* Otherwise, return null. */
		else { return null; }
	},

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/FileUtils.jsm
*/
/* Return the folder in which to write the output file. */
	getWriteFolder : function () {
/* Get the output folder path from the preferences. */
		var folder_path = SessionExporter.Session.getOutputFolder ();
/* If the output folder path is not empty... */
		if (folder_path.length > 0) {
			try {
/* Create a file object to represent the folder. */
				var folder = new FileUtils.File (folder_path);
/* If the folder does not exist, create it. nsIFile.create requires UNIX-style permissions, but using an octal literal raises an exception. */
				if (!folder.exists ()) { folder.create (Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt ("0777", 8)); }
				return folder;
			}
			catch (error) {
				throw new Error (sprintf ("file.jsm: getWriteFolder: Error opening output folder. Folder: %s. Error: %s.", folder_path, error.message));
			}
		}
/* If the output folder path is empty, return the session folder. getSessionFolder creates the folder if it does not exist. */
		else { return SessionExporter.Session.getSessionFolder (); }
	},

/* Return true if string (1) ends with suffix (2); otherwise, return false. */
	endsWith : function (str, suffix) {
		var startIndex = str.length - suffix.length;
		if (startIndex < 0) { return false; }
		else { return str.indexOf (suffix, startIndex) != -1; }
	},

/* See:
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFilePicker
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Open_and_Save_Dialogs
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsILocalFile
*/
/* Show the Select Output File dialog. (1) The default file name, including extension, for the dialog. If the user selects an output file, return it; otherwise, return null. */
	getWriteFile : function (defaultFileName) {
		var file_dialog =
			Components.classes["@mozilla.org/filepicker;1"]
			.createInstance (nsIFilePicker);
		file_dialog.init (SessionExporter.Consts.get_window (), "Select Output File", nsIFilePicker.modeSave);
/* Set the starting folder for the dialog. */
		file_dialog.displayDirectory = File.getWriteFolder ();
/* Set the default file name for the dialog. */
		file_dialog.defaultString = defaultFileName;
/* Set the dialog to show only HTML files. Note this has a different signature than appendFilter. */
		file_dialog.appendFilters (nsIFilePicker.filterHTML );
/* If the user selects a file... */
		var result = file_dialog.show ();
		if (result == nsIFilePicker.returnOK || result == nsIFilePicker.returnReplace) {
/* Save the output folder path to the preferences. */
			SessionExporter.Session.setOutputFolder (file_dialog.displayDirectory.path);
/* TODO2 Validate file name. */
/* If the user is not replacing an existing file, and the file path does not end in ".html", add it. */
			var file = file_dialog.file;
/* Note File refers to the FileUtils namespace, not ours. */
			if (result == nsIFilePicker.returnOK && false == File.endsWith (file.path, ".html")) {
				file = new FileUtils.File (file.path + ".html");
			}
/* Return the file. */
			return file;
		}
/* Otherwise, return null. */
		else { return null; }
	},

/* See:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Promise
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/File_I_O
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIInputStream
*/
/* Read the file (1). Return a promise whose value contains an object. (R1) The text of the file. (R2) The last modified date of the file. */
    readFile : function (file) {
/* We must use Promise.defer here because we cannot return Promise.resolve from NetUtil.asyncFetch. */
		var deferred = Promise.defer ();
        try {
		    NetUtil.asyncFetch (file, function (inputStream, status) {
/* If we succeed in reading the file, resolve the promise. */
			    if (Components.isSuccessCode (status) == true) {
/* Include both the file contents and the last modified date of the file. If we read multiple files, we can sort them by date afterward. We cannot sort the files by date and then read them, because the order in which Promise.all resolves promises is not deterministic. */
				    deferred.resolve ({
/* It seems session files are stored in UTF-8 format. If we open them as ANSI, they appear mostly correct but there are a few strange characters inserted in various places. If we open them as Unicode, they are mangled. */
                        contents : NetUtil.readInputStreamToString (inputStream, inputStream.available (), { charset : "UTF-8" }),
                        date : file.lastModifiedDate,
                    });
			    }
/* If we fail to read the file, raise an exception. */
			    else {
/* This is caught by an outer exception handling block, so we provide the remaining information there. */
                    throw new Error (sprintf ("Failed to read file. Status: %s.", status));
                }
/* Documentation does not say whether NetUtil.asyncFetch or NetUtil.readInputStreamToString automatically closes the stream. However, per nsIInputStream documentation, we can call close more than once. */
			    inputStream.close ();
		    });
        }
        catch (error) {
            throw new Error (sprintf ("file.jsm: readFiles: Error reading session file. File: %s. Error: %s.", file.path, error.message));
        }
		return deferred.promise;
    },

/* Read the files (1). Return an array of promises whose values contain the text of the files. */
	readFiles : function (files) {
/* Map the files to promises. */
        return _.map (files, File.readFile);
	},

/* See:
https://developer.mozilla.org/en-US/Add-ons/Code_snippets/File_I_O
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/FileUtils.jsm
https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIOutputStream
https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/NetUtil.jsm
*/
/* Write the tab data (1) to file (2). Return unit. */
	writeFile : function (data, file) {
/* The default flags are:
FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE
*/
		var outputStream = FileUtils.openSafeFileOutputStream (file);
		var inputStream = outputConverter.convertToInputStream (data);
/* Per NetUtil.jsm documentation, both streams are automatically closed when the copy completes. Per nsIOutputStream documentation, closing the output stream flushes it. */
		NetUtil.asyncCopy (inputStream, outputStream, function (status) {
			if (!Components.isSuccessCode (status)) {
				throw new Error (sprintf ("file.jsm: writeFile: Error writing output file. File: %s. Status: %s.", file_path, status));
			}
		});	
	},
};