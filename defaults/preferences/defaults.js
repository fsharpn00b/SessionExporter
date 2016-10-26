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

/* See:
https://developer.mozilla.org/en-US/docs/Default_Preferences
The [preferences] file, despite having .js extension, is not a JavaScript file. You may not set variables inside of it, nor may [you] do any kind of program flow control (ifs, loops etc.) nor even calculated values (i.e. 3600 * 24 * 5). Doing so will cause Mozilla to stop processing your preferences file without any notification, warning, error, or exception. Think of it more as an .ini file. Comments are perfectly acceptable.
*/

/* Note if we need to uninstall and reinstall this extension, be sure to remove or reset the firstRun preference in the following file.
<user>\AppData\Roaming\Mozilla\Firefox\Profiles\<Profile>\prefs.js
*/

/* The default folder to import sessions from. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.inputFolder", "");
/* The default folder to export sessions to. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.outputFolder", "");
/* See the comments for SessionFileOrder in consts.jsm. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.session_file_order", 0);
/* See the comments for CombineTabGroupsSameID in consts.jsm. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.combine_tab_groups_same_id", 0);
/* See the comments for CombineTabGroupsSameTitle in consts.jsm. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.combine_tab_groups_same_title", 0);
/* See the comments for CombineTabGroupsSameIDAndTitle in consts.jsm. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.combine_tab_groups_same_id_and_title", 0);
/* True to skip duplicate tabs when exporting a single session. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.skip_duplicate_tabs_single_session", false);
/* True to skip duplicate tabs when exporting multiple sessions. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.skip_duplicate_tabs_multiple_sessions", false);
/* True to skip duplicate tabs across tab groups. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.skip_duplicate_tabs_across_tab_groups", false);
/* True to log skipped duplicate tabs. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.log_duplicate_tabs", false);
/* True to write skipped duplicate tabs to a file. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.file_duplicate_tabs", false);
/* True to save skipped duplicate tabs to a bookmark folder. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.bookmark_duplicate_tabs", false);
/* True if this is the first time the extension has been loaded. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.firstRun", true);
/* True to back up the bookmarks when Firefox shuts down. */
pref("extensions.{943b5589-7808-4a70-acdc-7b6ee21e7cce}.backup_bookmarks_json", false);