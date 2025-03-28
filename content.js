const HIGHLIGHT_CLASS = 'intelliread-highlight';

// Listen for page load to check if the URL has been highlighted before
document.addEventListener('DOMContentLoaded', () => {
  // Check if the page should be automatically highlighted
  checkAndAutoHighlight();
});

// Check if the current URL has been highlighted before and apply highlighting if needed
async function checkAndAutoHighlight() {
  try {
    // Wait for cache system to be ready
    if (!window.IntelliReadCache || !window.IntelliReadCache.hasUrlBeenHighlighted) {
      console.log('Waiting for cache system to be ready...');
      setTimeout(checkAndAutoHighlight, 500);
      return;
    }
    
    // Check if this URL has been highlighted before
    const wasHighlighted = await window.IntelliReadCache.hasUrlBeenHighlighted();
    
    if (wasHighlighted) {
      console.log('This page was highlighted before. Applying highlights automatically.');
      // Automatically analyze the page content
      analyzePageContent().then(response => {
        if (response.success) {
          console.log('Auto-highlighting applied successfully.');
        } else {
          console.error('Failed to apply auto-highlighting:', response.message);
        }
      });
    }
  } catch (error) {
    console.error('Error checking for auto-highlight:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeContent') {
    analyzePageContent().then(response => {
      sendResponse(response);
    }).catch(error => {
      sendResponse({ success: false, message: error.message });
    });
    return true;
  } else if (request.action === 'clearHighlights') {
    clearHighlights();
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'cleanupCache') {
    // Handle cache cleanup request from background script
    if (window.IntelliReadCache) {
      // Access clearExpiredCache through a DOM event to avoid direct function call
      // This is a workaround since the function isn't exposed in the global object
      const cleanupEvent = new CustomEvent('intelliread-cleanup-cache');
      document.dispatchEvent(cleanupEvent);
      console.log('Cache cleanup event dispatched');
    }
    sendResponse({ success: true });
    return true;
  }
});

function clearHighlights() {
  const highlightedElements = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  highlightedElements.forEach(element => {
    element.classList.remove(HIGHLIGHT_CLASS);
    element.style.backgroundColor = '';
  });
}

async function analyzePageContent() {
  try {
    const settings = await getSettings();
    if (!settings.apiUrl || !settings.apiKey || !settings.modelName) {
      return { success: false, message: 'Please config API first' };
    }

    const elements = Array.from(document.querySelectorAll('p'))
    // temporarily ignore the filter
    // .filter(item => !isElementInIgnoredContainer(item) && !isElementVisible(item))

    if (elements.length === 0)
      return {
        success: false,
        message: 'No content to analyze'
      }
    
    // process each element with AI
    async function processElement(el) {
      const text = el.textContent;
      if (text.length < 30) return;
      
      // check if the content is in the cache
      let keypoints = null;
      
      // ensure IntelliReadCache is loaded
      if (window.IntelliReadCache && window.IntelliReadCache.checkCache) {
        keypoints = await window.IntelliReadCache.checkCache(text);
      }
      
      // if the cache is not hit, analyze with AI
      if (!keypoints) {
        keypoints = await analyzeWithAI(text, settings);
        
        // save the analysis result to the cache
        if (keypoints && keypoints.length > 0 && window.IntelliReadCache && window.IntelliReadCache.cacheAnalysisResult) {
          await window.IntelliReadCache.cacheAnalysisResult(text, keypoints);
        }
      } else {
        console.log('Cache hit, using cached data:', keypoints);
      }
      
      if (keypoints.length === 0) return;
      
      // filter none existing keypoints
      const filteredKeypoints = keypoints.filter(keypoint => keypoint.length > 0 && text.includes(keypoint));
      
      // extra filter: limit the number of keypoints
      const limitedKeypoints = filteredKeypoints
        .sort((a, b) => b.length - a.length) // prefer longer keypoints
        .slice(0, 5); // limit to 5 keypoints
      
      // highlight the keypoints
      for (const keypoint of limitedKeypoints) {
        // use word boundary to ensure only match whole words
        const escapedKeypoint = keypoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // for Chinese keypoints, don't use word boundary
        const regex = new RegExp(escapedKeypoint, 'gi');
        el.innerHTML = el.innerHTML.replace(regex, match => {
          const span = `<span class="${HIGHLIGHT_CLASS} style-${settings.highlightStyle}"`;
          const style = settings.highlightStyle === 'background'
            ? `style="background-color: ${settings.highlightColor}"`
            : `style="border-bottom-color: ${settings.highlightColor}"`;
          return `${span} ${style}>${match}</span>`;
        });
      }
    }

    // process elements with concurrency limit
    async function processWithConcurrencyLimit(items, processFunction, limit = 5) {
      const results = [];
      const executing = new Set();
      
      for (const item of items) {
        const p = processFunction(item);
        results.push(p);
        executing.add(p);
        
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        
        if (executing.size >= limit) {
          await Promise.race(executing);
        }
      }
      
      return Promise.all(results);
    }
    
    // process elements with concurrency limit
    await processWithConcurrencyLimit(elements, processElement, 5);

    return {
      success: true,
      message: `Done`
    };
  } catch (error) {
    console.error('IntelliRead analyze error:', error);
    return { success: false, message: `analyze error: ${error.message}` };
  }
}

// ignore the content under a specific parent element
function isElementInIgnoredContainer(element) {
  const ignoredSelectors = ['nav', 'footer', 'header', 'aside', '.sidebar', '.navigation', '.menu', '.footer', '.header'];

  let parent = element;
  while (parent !== null) {
    for (const selector of ignoredSelectors) {
      if (parent.matches && parent.matches(selector)) {
        return true;
      }
    }
    parent = parent.parentElement;
  }

  return false;
}

// ignore invisible elements
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0;
}

/**
 * @typedef {object} Settings
 * @property {string} apiUrl - API URL.
 * @property {string} apiKey - API Key.
 * @property {string} modelName - Model name.
 */

/**
 * analyzeWithAI and return key points
 * @param {string} content
 * @param {Settings} settings
 * @returns {Promise<string[]>}
 */
async function analyzeWithAI(content, settings) {
  try {
    const prompt = `
You are a professional text analysis tool. Your task is to extract the most essential key points from the following text:

"""
${content}
"""

Please strictly follow these requirements:
1. Extract only 3-5 most important and core key points from the text
2. Key points must exist verbatim in the original text, do not add your own interpretations or summaries
3. Prioritize keywords or phrases that represent the main idea of the article
4. Keep the key points concise, typically no more than 10 characters each
5. Return in a valid JSON string array format, like ["key point 1", "key point 2", "key point 3"]
6. Return only the array, without any additional explanations or markers

Please directly return the JSON array that meets these requirements, without any prefix or suffix.
    `

    const response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0]?.message?.content) {
      return [];
    }

    try {
      const content = data.choices[0].message.content;
      const keypoints = JSON.parse(content);
      return Array.isArray(keypoints) ? keypoints : [];
    } catch (e) {
      return data.choices[0].message.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    return [];
  }
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      resolve(response);
    });
  });
}