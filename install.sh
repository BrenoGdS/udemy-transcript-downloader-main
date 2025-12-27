#!/bin/bash

# Udemy Transcript Downloader Installer

echo "Installing Udemy Transcript Downloader..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js (v14 or later) and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm and try again."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Make output directory if it doesn't exist
if [ ! -d "output" ]; then
    mkdir -p output
fi

# Make src directory if it doesn't exist
if [ ! -d "src" ]; then
    mkdir -p src
fi

echo "Installation complete!"
echo "To use the downloader, run: npm start \"https://www.udemy.com/course/your-course-url/\""
echo "The tool will open a browser window for you to log in."