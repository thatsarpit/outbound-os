#!/bin/zsh
set -eu
cd -- "${0:A:h}"
printf '%s\n' 'Open chrome://version in your Arpit Chrome profile.' 'Look at Profile Path and enter its LAST folder (Default, Profile 1, etc.).' 'This will start that Chrome profile quietly at login and every 15 minutes while awake.'
read 'relay_profile?Profile folder: '
python3 mac-startup.py install --profile "$relay_profile"
printf '%s\n' 'You can close this window.'
