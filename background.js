// initialize when plugin is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  // create right click menu
  chrome.contextMenus.create({
    id: 'intelliread-analyze',
    title: 'Use IntelliRead to analyze page',
    contexts: ['page']
  });

  // set default config
  chrome.storage.sync.get(
    {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      highlightColor: '#ADD8E6',
      highlightStyle: 'background'
    },
    (items) => {
      if (!items.apiUrl || items.apiUrl === '') {
        chrome.storage.sync.set({
          apiUrl: 'https://api.openai.com/v1/chat/completions',
          modelName: 'gpt-4o-mini',
          highlightColor: '#ADD8E6',
          highlightStyle: 'background'
        });
      }
    }
  );

  // Schedule periodic cache cleanup
  schedulePeriodicCacheCleanup();
});

// Schedule cache cleanup to run periodically
function schedulePeriodicCacheCleanup() {
  // Clean cache every 24 hours (86400000 milliseconds)
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
  
  // Set up periodic cleanup using alarms API
  chrome.alarms.create('cacheCleanup', {
    periodInMinutes: CLEANUP_INTERVAL / 60 / 1000
  });
  
  // Listen for the alarm
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cacheCleanup') {
      cleanupCache();
    }
  });
  
  // Run cleanup immediately on startup
  cleanupCache();
}

// Execute cache cleanup - communicate with content scripts
function cleanupCache() {
  console.log('Running scheduled cache cleanup');
  // Send a message to all tabs to clean their caches
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'cleanupCache' });
      } catch (e) {
        // Ignore errors for tabs that don't have our content script
      }
    });
  });
}

// handle right click menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'intelliread-analyze') {
    chrome.tabs.sendMessage(tab.id, { action: 'analyzeContent' });
  }
});

// handle shortcut key
chrome.commands.onCommand.addListener((command) => {
  if (command === 'trigger-intelliread') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeContent' });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(
      ['apiUrl', 'apiKey', 'modelName', 'highlightColor', 'highlightStyle'],
      (items) => {
        sendResponse(items);
      }
    );
    return true;
  }
});