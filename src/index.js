const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
// Apply stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

// Initialize readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Main function
async function main() {
  // Check if URL is provided
  if (process.argv.length < 3) {
    console.error('Please provide a Udemy course URL as a parameter');
    console.error('Example: npm start https://www.udemy.com/course/your-course-name');
    process.exit(1);
  }

  // Get course URL from command line argument
  let courseUrl = process.argv[2];

  // Make sure URL ends with a trailing slash
  if (!courseUrl.endsWith('/')) {
    courseUrl += '/';
  }

  const courseSlug = deriveCourseSlug(courseUrl);

  console.log(`Course URL: ${courseUrl}`);

  const downloadSrt = await new Promise((resolve) => {
    rl.question('Do you want to download transcripts as .srt files with timestamps as well? (yes/no) [no]: ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });

  const tabCount = await new Promise((resolve) => {
    rl.question(`How many tabs do you want to use for downloading transcripts? (default is 5) [5]: `, (answer) => {
      const normalized = answer.trim();
      resolve(normalized ? parseInt(normalized, 10) : 5);
    });
  });

  // Launch browser in visible mode to allow manual SSO login (Okta/Google, etc.)
  console.log('Launching browser...');
  const browser = await puppeteerExtra.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--window-size=1280,720',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox'
    ],
    protocolTimeout: 300000
  });

  try {
    const page = await browser.newPage();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Manual login flow for Udemy Business / SSO (Okta, Google Authenticator, etc.)
    console.log('Opening course page for manual login...');
    const courseOrigin = new URL(courseUrl).origin;
    const courseId = await waitForManualLogin(page, courseUrl, courseOrigin, courseSlug);

    // Extract course ID
    console.log(`Course ID: ${courseId}`);

    // Fetch course content (with pagination to avoid missing items)
    console.log('Fetching course content...');
    const courseResults = await fetchCourseCurriculum(page, courseOrigin, courseId);
    console.log(`Fetched ${courseResults.length} curriculum items.`);

    // Process course structure
    console.log('Processing course structure...');
    const courseStructure = processCourseStructure(courseResults);

    // Generate CONTENTS.txt
    console.log('Generating CONTENTS.txt...');
    generateContentsFile(courseStructure, outputDir);

    // Download transcripts
    console.log('Downloading transcripts...');
    await downloadTranscripts(browser, courseUrl, courseStructure, downloadSrt, tabCount);

    console.log('All transcripts have been downloaded successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close browser
    await browser.close();
    rl.close();
  }
}

// Fetch full curriculum with pagination (page_size=200)
async function fetchCourseCurriculum(page, courseOrigin, courseId) {
  const baseUrl = `${courseOrigin}/api-2.0/courses/${courseId}/subscriber-curriculum-items/?page_size=200&fields%5Blecture%5D=title,object_index,is_published,sort_order,created,asset,supplementary_assets,is_free&fields%5Bquiz%5D=title,object_index,is_published,sort_order,type&fields%5Bpractice%5D=title,object_index,is_published,sort_order&fields%5Bchapter%5D=title,object_index,is_published,sort_order&fields%5Basset%5D=title,filename,asset_type,status,time_estimation,is_external,transcript,captions&caching_intent=True`;
  let url = baseUrl;
  const results = [];
  const maxPages = 20; // safety guard

  for (let pageIndex = 1; pageIndex <= maxPages && url; pageIndex++) {
    console.log(`Fetching curriculum page ${pageIndex}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(res => setTimeout(res, 1500));

    const rawBody = await page.evaluate(() => document.body.innerText);
    if (rawBody.trim().startsWith('<!DOCTYPE html>')) {
      throw new Error('HTML response received instead of JSON while fetching curriculum');
    }

    let json = null;
    try {
      json = JSON.parse(rawBody);
    } catch (err) {
      throw new Error(`Failed to parse curriculum JSON on page ${pageIndex}: ${err.message}`);
    }

    if (!json || !Array.isArray(json.results)) {
      throw new Error(`Curriculum response missing results on page ${pageIndex}`);
    }

    results.push(...json.results);

    if (json.next) {
      url = json.next.startsWith('http') ? json.next : `${courseOrigin}${json.next}`;
    } else {
      url = null;
    }
  }

  return results;
}

// Wait for user-driven authentication on Udemy Business / SSO and return course ID
async function waitForManualLogin(page, courseUrl, courseOrigin, courseSlug) {
  console.log('\nManual login required (Okta / Google Authenticator / SSO).');
  console.log('1) Use the opened browser window to sign in.');
  console.log('2) After you reach the course page, come back here and press Enter.');

  // Navigate to the course URL (this may redirect to your IdP)
  await page.goto(courseUrl, { waitUntil: 'domcontentloaded' });

  await new Promise(resolve => rl.question('Press Enter once the course page is visible and you are logged in: ', resolve));

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Validating course access (attempt ${attempt}/${maxAttempts})...`);
    try {
      await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 120000 });
      await new Promise(res => setTimeout(res, 2000));

      const courseId = await extractCourseId(page, courseOrigin, courseSlug);
      if (courseId) {
        return courseId;
      }

      console.warn('Course ID not found yet. Confirm you are on the course page and logged in, then press Enter to retry.');
      await new Promise(resolve => rl.question('Press Enter to try again: ', resolve));
    } catch (err) {
      lastError = err;
      console.warn(`Navigation error: ${err.message}`);
      await new Promise(resolve => rl.question('After fixing the issue in the browser, press Enter to retry: ', resolve));
    }
  }

  const errorMessage = lastError ? lastError.message : 'Unknown issue loading the course page.';
  throw new Error(`Could not verify course access after manual login. ${errorMessage}`);
}

// Extract course ID from the currently loaded page
async function extractCourseId(page, courseOrigin, courseSlug) {
  // 1) Try DOM attribute
  const domCourseId = await page.evaluate(() => {
    const el = document.querySelector('body[data-clp-course-id]');
    return el ? el.getAttribute('data-clp-course-id') : null;
  });
  if (domCourseId) return domCourseId;

  // 2) Try Udemy bootstrap object
  const bootstrapId = await page.evaluate(() => {
    try {
      // eslint-disable-next-line no-underscore-dangle
      const boot = window.__udemy__ && window.__udemy__.bootstrap;
      if (boot && boot.data && boot.data.courseId) return String(boot.data.courseId);
    } catch (_err) {
      // ignore
    }
    return null;
  });
  if (bootstrapId) return bootstrapId;

  // 3) Fallback: query course API by slug on same origin using session cookies
  try {
    const apiUrl = `${courseOrigin}/api-2.0/courses/${courseSlug}/?fields[course]=id`;
    const result = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.id ? String(json.id) : null;
    }, apiUrl);
    if (result) return result;
  } catch (err) {
    console.warn(`Failed to fetch course ID via API: ${err.message}`);
  }

  return null;
}

// Derive slug from course URL (/course/<slug>/...)
function deriveCourseSlug(courseUrl) {
  try {
    const url = new URL(courseUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const courseIndex = parts.indexOf('course');
    if (courseIndex >= 0 && parts[courseIndex + 1]) {
      return parts[courseIndex + 1];
    }
  } catch (_err) {
    // ignore
  }
  return '';
}

// Process course structure
function processCourseStructure(results) {
  const courseStructure = {
    chapters: [],
    lectures: []
  };

  // Sort results by sort_order (highest first, as per Udemy's order)
  const sortedResults = [...results].sort((a, b) => b.sort_order - a.sort_order);

  let currentChapter = null;
  let chapterCounter = 1;
  let lectureCounter = 1;

  sortedResults.forEach(item => {
    if (item._class === 'chapter') {
      currentChapter = {
        id: item.id,
        title: item.title,
        index: chapterCounter++,
        lectures: []
      };
      courseStructure.chapters.push(currentChapter);
      lectureCounter = 1; // Reset lecture counter for the new chapter
    } else if (
      item._class === 'lecture' &&
      item.asset &&
      typeof item.asset.asset_type === 'string' &&
      item.asset.asset_type.toLowerCase().includes('video')
    ) {
      const lecture = {
        id: item.id,
        title: item.title,
        created: item.created,
        timeEstimation: item.asset.time_estimation,
        chapterIndex: currentChapter ? currentChapter.index : null,
        lectureIndex: lectureCounter++
      };

      if (item.asset.captions && Array.isArray(item.asset.captions)) {
        lecture.captions = item.asset.captions.filter(c => c.url);
      }

      if (currentChapter) {
        currentChapter.lectures.push(lecture);
      } else {
        courseStructure.lectures.push(lecture);
      }
    }
  });

  return courseStructure;
}

// Convert VTT timestamp to SRT format
function normalizeTimestamp(ts) {
  const [main, ms] = ts.split('.');
  const parts = main.split(':');

  while (parts.length < 3) {
    parts.unshift('00');
  }

  return `${parts.map(p => p.padStart(2, '0')).join(':')},${(ms || '000').padEnd(3, '0')}`;
}

// Convert VTT content to SRT format
function convertVttToSrt(vtt) {
  return vtt
    .replace(/^WEBVTT(\n|\r|\r\n)?/, '')
    .trim()
    .split(/\n{2,}/)
    .map((block, i) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return null;
      const [startEnd, ...textLines] = lines;
      const [start, end] = startEnd.split(' --> ').map(normalizeTimestamp);
      return `${i + 1}\n${start} --> ${end}\n${textLines.join('\n')}\n`;
    })
    .filter(Boolean)
    .join('\n');
}

// Generate CONTENTS.txt file
function generateContentsFile(courseStructure, outputDir) {
  let content = '';

  for (const chapter of courseStructure.chapters) {
    content += `${chapter.index}. ${chapter.title}\n`;

    for (const lecture of chapter.lectures) {
      const timeInMinutes = Math.floor(lecture.timeEstimation / 60);
      const date = new Date(lecture.created).toLocaleDateString();
      content += `${chapter.index}.${lecture.lectureIndex} ${lecture.title} [${timeInMinutes} min, ${date}]\n`;
    }

    content += '\n';
  }

  // Add standalone lectures (if any)
  if (courseStructure.lectures.length > 0) {
    for (const lecture of courseStructure.lectures) {
      const timeInMinutes = Math.floor(lecture.timeEstimation / 60);
      const date = new Date(lecture.created).toLocaleDateString();
      content += `${lecture.lectureIndex}. ${lecture.title} [${timeInMinutes} min, ${date}]\n`;
    }
  }

  fs.writeFileSync(path.join(outputDir, 'CONTENTS.txt'), content, 'utf8');
  console.log('CONTENTS.txt has been created successfully!');
}

// Download transcripts
async function downloadTranscripts(browser, courseUrl, courseStructure, downloadSrt, tabCount = 5) {
  const allLectures = [];

  // Flatten all lectures into a single list
  for (const chapter of courseStructure.chapters) {
    for (const lecture of chapter.lectures) {
      allLectures.push({ lecture, chapter });
    }
  }
  for (const lecture of courseStructure.lectures) {
    allLectures.push({ lecture, chapter: null });
  }

  // Split into chunks
  function chunkArray(arr, chunkCount) {
    const chunks = Array.from({ length: chunkCount }, () => []);
    arr.forEach((item, index) => {
      chunks[index % chunkCount].push(item);
    });
    return chunks;
  }

  const chunks = chunkArray(allLectures, tabCount);

  // Launch tabs and process in parallel
  await Promise.all(chunks.map(async (chunk, tabIndex) => {
    const page = await browser.newPage();
    console.log(`Tab ${tabIndex + 1} processing ${chunk.length} lectures...`);

    for (let i = 0; i < chunk.length; i++) {
      const { lecture, chapter } = chunk[i];
      await processLecture(page, courseUrl, lecture, chapter, downloadSrt);
    }

    await page.close();
    console.log(`Tab ${tabIndex + 1} done.`);
  }));
}

// Process a single lecture
async function processLecture(page, courseUrl, lecture, chapter = null, downloadSrt = false) {
  const lectureUrl = `${courseUrl}learn/lecture/${lecture.id}`;
  const filename = chapter ?
    `${chapter.index}.${lecture.lectureIndex} ${lecture.title}` :
    `${lecture.lectureIndex}. ${lecture.title}`;

  // Sanitize filename by removing invalid characters
  const sanitizedFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
  const transcriptPath = path.join(__dirname, '../output', `${sanitizedFilename}.txt`);

  console.log(`Processing lecture: ${sanitizedFilename}`);

  try {
    // Resume support: skip if transcript already exists
    if (fs.existsSync(transcriptPath)) {
      console.log(`Skipping (already exists): ${sanitizedFilename}`);
      return;
    }

    // Navigate to lecture page with a longer timeout
    await page.goto(lectureUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000 // Increase timeout to 60 seconds
    });

    // Wait for video player to load completely (looking for the video container)
    await page.waitForSelector('video', {
      timeout: 30000,
      visible: true
    }).catch(() => {
      console.log(`Note: Video player not fully loaded for lecture: ${lecture.title}, but continuing anyway`);
    });

    // Additional delay to ensure page is fully loaded
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try multiple approaches to find the transcript toggle button
    const transcriptButtonSelectors = [
      'button[data-purpose="transcript-toggle"]',
      '[data-purpose="transcript-toggle"]',
      'button:has-text("Transcript")',
      '.transcript-toggle', // Additional potential class name
      '[aria-label*="transcript" i]', // Any element with transcript in aria-label
      'button[aria-label*="transcript" i]' // Button with transcript in aria-label
    ];

    let transcriptButtonFound = false;

    for (const selector of transcriptButtonSelectors) {
      try {
        // Check if button exists
        const buttonExists = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          return !!element;
        }, selector);

        if (buttonExists) {
          console.log(`Found transcript button using selector: ${selector}`);

          // Use the direct JavaScript click method
          await page.$eval(selector, element => element.click());
          console.log(`Clicked transcript button using JavaScript method`);

          // Wait a moment for the click to take effect
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Check if panel appeared
          const isPanelVisible = await page.evaluate(() => {
            const panel = document.querySelector('[data-purpose="transcript-panel"]');
            return panel && panel.offsetParent !== null;
          });

          if (isPanelVisible) {
            console.log('Transcript panel successfully opened');
            transcriptButtonFound = true;
            break;
          } else {
            console.log('Button clicked but panel did not appear, trying next selector');
          }
        }
      } catch (error) {
        console.log(`Error with selector ${selector}: ${error.message}`);
        continue;
      }
    }

    if (!transcriptButtonFound) {
      console.log(`No transcript button found/clicked successfully for lecture: ${lecture.title}. This lecture might not have a transcript.`);
      // Create a placeholder file
      fs.writeFileSync(path.join(__dirname, '../output', `${sanitizedFilename}.txt`),
        `# ${sanitizedFilename}\n\n[No transcript available or could not be accessed]`, 'utf8');
      console.log(`Created placeholder file for: ${sanitizedFilename}`);
      return;
    }

    // Additional delay to ensure transcript panel is fully loaded
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract transcript text with retry logic
    let transcriptText = '';
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      transcriptText = await page.evaluate(() => {
        const panel = document.querySelector('[data-purpose="transcript-panel"]');
        return panel ? panel.textContent : '';
      });

      if (transcriptText && transcriptText.trim() !== '') {
        break;
      }

      console.log(`Retry ${retries + 1}/${maxRetries} to get transcript...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }

    if (!transcriptText || transcriptText.trim() === '') {
      console.log(`No transcript content available for lecture: ${lecture.title}`);
      return;
    }

    // Create file content
    const fileContent = `# ${sanitizedFilename}\n\n${transcriptText}`;

    // Write to file
    fs.writeFileSync(transcriptPath, fileContent, 'utf8');
    console.log(`Transcript saved for: ${sanitizedFilename}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Optional: Download SRT files if captions are available
    if (downloadSrt && Array.isArray(lecture.captions) && lecture.captions.length > 0) {
      for (const caption of lecture.captions) {
        try {
          const vttContent = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return await res.text();
          }, caption.url);

          const srtContent = convertVttToSrt(vttContent);
          const langTag = caption.locale_id || 'unknown';
          const srtPath = path.join(__dirname, '../output', `${sanitizedFilename} [${langTag}].srt`);
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          console.log(`SRT saved: ${sanitizedFilename} [${langTag}]`);
        } catch (err) {
          console.log(`Error downloading caption [${caption.locale_id}] for ${sanitizedFilename}: ${err.message}`);
        }
      }
    } else if (downloadSrt) {
      console.log(`No captions found for ${sanitizedFilename}`);
    }

    // Wait briefly before moving to the next lecture to avoid overwhelming the browser
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`Error processing lecture ${lecture.title}:`, error.message);
  }
}

// Run the main function
main().catch(err => {
  console.error('Fatal error occurred:', err.message || err);
  process.exit(1);
});
