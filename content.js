const HIGHLIGHT_CLASS = 'intelliread-highlight';

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
    for (const el of elements) {
      // extract text from element
      const text = el.textContent;
      // ignore short text
      if (text.length < 30) continue;
      const keypoints = await analyzeWithAI(text, settings);
      if (keypoints.length === 0) continue;
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