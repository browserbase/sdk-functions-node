#!/bin/bash

if [ $# -ne 2 ]; then
  echo "Usage: $0 <dir1> <dir2>"
  exit 1
fi

dir1="$1"
dir2="$2"

# Check if directories exist
if [ ! -d "$dir1" ]; then
  echo "Error: Directory $dir1 does not exist"
  exit 1
fi

if [ ! -d "$dir2" ]; then
  echo "Error: Directory $dir2 does not exist"
  exit 1
fi

# Get list of JSON files from both directories
files1=$(cd "$dir1" && find . -name "*.json" -type f | sort)
files2=$(cd "$dir2" && find . -name "*.json" -type f | sort)

# Compare file lists
if [ "$files1" != "$files2" ]; then
  echo "Error: Different files in directories"
  echo "Dir1 files:"
  echo "$files1"
  echo "Dir2 files:"
  echo "$files2"
  exit 1
fi

# Compare contents of each file (JSON comparison ignoring whitespace)
failed=0
for file in $files1; do
  # Use jq to normalize JSON and compare
  if ! diff -q <(jq -S . "$dir1/$file") <(jq -S . "$dir2/$file") >/dev/null 2>&1; then
    echo "Files differ: $file"
    diff <(jq -S . "$dir1/$file") <(jq -S . "$dir2/$file")
    failed=1
  fi
done

if [ $failed -eq 0 ]; then
  echo "✅ All files match!"
fi

exit $failed

