#!/bin/zsh
set -eu
cd -- "${0:A:h}"
python3 mac-startup.py remove
