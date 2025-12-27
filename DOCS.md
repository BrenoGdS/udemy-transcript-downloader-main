# Udemy Transcript Downloader Documentation

This document provides detailed information about the Udemy Transcript Downloader tool.

## Project Structure

```
udemy-transcript-downloader/
├── src/
│   └── index.js       # Main script with all functionality
├── output/            # Output directory for transcripts and course content
├── package.json       # Project metadata and dependencies
├── install.sh         # Installation script
└── README.md          # User documentation
```

## Main Script (index.js)

The main script contains all functionality in a single file:

- **main()**: The entry point function that orchestrates the entire process
  - Parses command-line arguments
  - Launches Puppeteer browser
  - Handles the login process
  - Coordinates the scraping and saving processes
  - Handles error cases

- **processCourseStructure()**: Processes the JSON response from Udemy's API
  - Organizes chapters and lectures into a structured format
  - Filters out non-video content

- **generateContentsFile()**: Creates the CONTENTS.txt file
  - Formats the course structure with proper numbering
  - Includes metadata like video duration and creation date

- **downloadTranscripts()**: Coordinates the transcript download process
  - Iterates through chapters and lectures
  - Calls processLecture for each video lecture

- **processLecture()**: Downloads transcript for a single lecture
  - Navigates to the lecture page
  - Toggles the transcript panel
  - Extracts and saves the transcript content

## Authentication Process

The tool uses an interactive login approach:
1. Opens the browser to Udemy's login page
2. Waits for the user to manually log in
3. Continues once the user presses Enter or types "continue" in the terminal

## Course Content Retrieval

The tool uses Udemy's API to retrieve the course structure:
1. Extracts the course ID from the course landing page
2. Calls the API endpoint with the course ID
3. Processes the JSON response to extract chapters and lectures

## Output Files

The tool generates these files in the `output` directory:

1. `CONTENTS.txt` - Contains the structure of the course with chapter and lecture titles, durations, and creation dates
2. Individual transcript files - Named after each lecture with chapter and lecture numbers

## Transcript Download Process

For each video lecture, the tool:
1. Navigates to the lecture page
2. Clicks on the transcript toggle button
3. Waits for the transcript panel to appear
4. Extracts the transcript text
5. Saves it to a file in the output directory

## Troubleshooting

Common issues:

1. **Login Issues**: If you can't log in, make sure you're entering the correct credentials in the Udemy login page.

2. **Navigation Timeouts**: If the script fails with timeout errors, check your internet connection or increase the timeout values.

3. **Missing Transcripts**: Not all Udemy lectures have transcripts available. The script will report if a transcript is not found.

4. **Element Not Found Errors**: Udemy might update their UI. If this happens, the selectors in the code may need to be updated:
   - Transcript toggle button: `button[data-purpose="transcript-toggle"]`
   - Transcript panel: `[data-purpose="transcript-panel"]`
   - Course ID attribute: `data-clp-course-id` on `body#udemy`

## License

MIT