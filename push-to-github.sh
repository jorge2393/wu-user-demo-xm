#!/bin/bash

cd /Users/jorgevn/westernUnionAgent/western-union-user-demo

# Initialize git repository (if not already initialized)
if [ ! -d .git ]; then
    git init
fi

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Western Union User Demo" || git commit -m "Update: Western Union User Demo"

# Add or update the remote repository
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/jorge2393/wu-user-demo.git

# Set the branch to main
git branch -M main

# Push to GitHub
git push -u origin main

echo "Done! Code pushed to https://github.com/jorge2393/wu-user-demo"

