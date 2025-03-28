const HIGHLIGHT_CLASS = 'intelliread-highlight';

// Listen for page load to check if the URL has been highlighted before
document.addEventListener('DOMContentLoaded', () => {
  // Check if the page should be automatically highlighted
  checkAndAutoHighlight();
});

// Check if the current URL has been highlighted before or if the domain has auto-highlight enabled
async function checkAndAutoHighlight() {
  try {
    // Wait for cache system to be ready
    if (!window.IntelliReadCache || 
        !window.IntelliReadCache.hasUrlBeenHighlighted || 
        !window.IntelliReadCache.isDomainAutoHighlightEnabled) {
      console.log('Waiting for cache system to be ready...');
      setTimeout(checkAndAutoHighlight, 500);
      return;
    }
    
    // Check if this exact URL has been highlighted before
    const wasUrlHighlighted = await window.IntelliReadCache.hasUrlBeenHighlighted();
    
    // Check if auto-highlight is enabled for this domain
    const isDomainAutoHighlightEnabled = await window.IntelliReadCache.isDomainAutoHighlightEnabled();
    
    // Apply highlights if the URL was highlighted before or if auto-highlight is enabled for this domain
    if (wasUrlHighlighted || isDomainAutoHighlightEnabled) {
      let reason = wasUrlHighlighted ? 'URL was previously highlighted' : 'Auto-highlight is enabled for this domain';
      console.log(`Applying highlights automatically. Reason: ${reason}`);
      
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
  } else if (request.action === 'clearDomainCache') {
    // Clear cache for current domain
    if (window.IntelliReadCache && window.IntelliReadCache.clearDomainCache) {
      window.IntelliReadCache.clearDomainCache()
        .then((result) => {
          clearHighlights(); // Also clear highlights on the page
          sendResponse({ success: result });
        })
        .catch(error => {
          console.error('Error clearing domain cache:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    } else {
      sendResponse({ success: false, error: 'Cache system not ready' });
      return true;
    }
  } else if (request.action === 'getDomainAutoHighlightStatus') {
    // Get auto-highlight status for the current domain
    if (window.IntelliReadCache && window.IntelliReadCache.isDomainAutoHighlightEnabled) {
      window.IntelliReadCache.isDomainAutoHighlightEnabled()
        .then(enabled => {
          sendResponse({ enabled: enabled });
        })
        .catch(error => {
          console.error('Error getting domain auto-highlight status:', error);
          sendResponse({ enabled: false, error: error.message });
        });
      return true;
    } else {
      sendResponse({ enabled: false, error: 'Cache system not ready' });
      return true;
    }
  } else if (request.action === 'setDomainAutoHighlight') {
    // Set auto-highlight status for the current domain
    if (window.IntelliReadCache && window.IntelliReadCache.setDomainAutoHighlight) {
      window.IntelliReadCache.setDomainAutoHighlight(request.enabled)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Error setting domain auto-highlight:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    } else {
      sendResponse({ success: false, error: 'Cache system not ready' });
      return true;
    }
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
      // use the helper function to handle the JSON return
      const content = data.choices[0].message.content;
      return parseModelResponse(content);
    } catch (error) {
      console.error('AI analysis failed:', error);
      return [];
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    return [];
  }
}

/**
 * parse the model response, handle various formats of JSON
 * @param {string} modelResponse the original response text from the model
 * @returns {Array<string>} the parsed key points array
 */
function parseModelResponse(modelResponse) {
  try {
    // try to remove markdown wrapper
    let cleanedResponse = modelResponse;
    const markdownJsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const markdownMatch = modelResponse.match(markdownJsonRegex);
    
    if (markdownMatch && markdownMatch[1]) {
      cleanedResponse = markdownMatch[1];
      console.log('removed markdown format:', { original: modelResponse, cleaned: cleanedResponse });
    }
    
    // try to parse the json string
    const keypoints = JSON.parse(cleanedResponse);
    
    if (Array.isArray(keypoints)) {
      return keypoints;
    } else {
      console.warn('parse result is not an array:', keypoints);
      return [];
    }
  } catch (e) {
    console.error('JSON parse failed, try alternative parse method:', e);
    
    // alternative parse method: split by line
    try {
      return modelResponse
        .replace(/```(?:json)?\s*|\s*```/g, '') // remove markdown markers
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']')); // 过滤数组括号行
    } catch (fallbackError) {
      console.error('alternative parse method failed:', fallbackError);
      return [];
    }
  }
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      resolve(response);
    });
  });
}

/**
 * test json parser
 * only for development debugging, not for production environment
 * @param {string} jsonString the json string to test
 * @returns {Object} the object contains the result and error info
 */
function testJsonParser(jsonString) {
  const result = {
    original: jsonString,
    cleaned: null,
    parsed: null,
    error: null,
    hasMarkdown: false
  };
  
  try {
    // check if the json string contains markdown
    const markdownJsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const markdownMatch = jsonString.match(markdownJsonRegex);
    
    if (markdownMatch && markdownMatch[1]) {
      result.hasMarkdown = true;
      result.cleaned = markdownMatch[1];
    } else {
      result.cleaned = jsonString;
    }
    
    // try to parse the json string
    result.parsed = JSON.parse(result.cleaned);
    
  } catch (e) {
    result.error = e.message;
    
    // try to use the alternative parse method
    try {
      result.cleaned = jsonString
        .replace(/```(?:json)?\s*|\s*```/g, '')
        .trim();
      result.parsed = result.cleaned.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (fallbackError) {
      result.fallbackError = fallbackError.message;
    }
  }
  
  return result;
}