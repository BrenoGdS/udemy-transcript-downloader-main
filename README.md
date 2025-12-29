# Udemy Transcript Downloader

A NodeJS-based tool for downloading transcripts from Udemy courses. This script uses Puppeteer to navigate through Udemy's UI and extract transcripts for each lecture in a course.

> Fork of TOA-Anakin/udemy-transcript-downloader with adaptations for Udemy Business/SSO.

## Features

- Downloads transcripts from any Udemy course you have access to
- Creates individual transcript files for each lecture
- Generates a combined transcript file with all lectures
- Optionally downloads `.srt` files with timestamps for each lecture
- Scrapes and saves course content structure
- Works with Udemy Business after manual login (Okta/Google Authenticator/SSO)
- Handles Cloudflare security challenges
- Uses a visible browser window so you can complete SSO, then automates the rest

## Prerequisites

- Node.js (v14 or newer)
- NPM
- A Udemy account with access to the course you want to download transcripts from

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/TOA-Anakin/udemy-transcript-downloader.git
   cd udemy-transcript-downloader
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Usage

Run the script with the URL of the Udemy course as an argument:

```
npm start "https://www.udemy.com/course/your-course-url/"
```

Or use the direct Node.js command:

```
node src/index.js "https://www.udemy.com/course/your-course-url/"
```

For Udemy Business, pass your organization domain, for example:

```
npm start "https://thoughtworks.udemy.com/course/aws-dynamodb-mastery-2025/"
```

The script will:

1. Ask if you want to download `.srt` files (with timestamps) for each lecture
2. Ask how many tabs to use for downloading transcripts (default is 5)
   - A higher number can speed things up, but requires a good PC (enough CPU and RAM)
3. Open a visible browser window so you can log in manually (Udemy Business / Okta / Google Authenticator / SSO)
4. After you complete login and reach the course page, press Enter in the terminal to continue
5. The script will scrape course content, enter the course player, and download transcripts
6. Individual transcript files are saved in the `output` directory

## Output Files

All output files are saved to the `output` directory:

- `CONTENTS.txt` - Course structure with sections and lectures
- `[Lecture Name].txt` - Individual transcript files for each lecture
- `[Lecture Name].srt` - Individual transcript files with timestamps in SubRip format (optional)

## Troubleshooting

- **Verification Code Issues**: Make sure to enter the verification code quickly after receiving it in your email
- **Browser Crashing**: If you experience issues with headless mode, you can modify the script to use `headless: false` for debugging
- **Missing Transcripts**: Not all lectures may have transcripts. The script will create empty files for lectures without transcripts.
- **SRT Errors**: If `.srt` generation fails for a lecture, try increasing timeouts or re-running the script with fewer browser tabs open.
- **Slow Transcript Downloads**: The script can download transcripts in parallel using multiple browser tabs. If your PC is slow or has limited memory, stick to a lower number of tabs (e.g. 1–3). If you have a powerful machine, you can safely use 5 or more tabs for faster processing.

## License

MIT

## Disclaimer

This tool is for personal use only. Please respect Udemy's terms of service.
