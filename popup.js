document.addEventListener('DOMContentLoaded', () => {
  const analyzeButton = document.getElementById('analyze-btn');
  const settingsButton = document.getElementById('settings-btn');
  const clearButton = document.getElementById('clear-btn');
  const statusDiv = document.getElementById('status');

  // check if API is configured
  chrome.storage.sync.get(['apiUrl', 'apiKey', 'modelName'], (items) => {
    if (!items.apiUrl || !items.apiKey || !items.modelName) {
      showStatus('Please configure API information in the settings page', 'warning');
      analyzeButton.disabled = true;
    }
  });

  // analyze current page button
  analyzeButton.addEventListener('click', () => {
    analyzeButton.disabled = true;
    showStatus('Analyzing page content...', 'info');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'analyzeContent' },
        (response) => {
          if (response && response.success) {
            showStatus('Analysis completed, page content highlighted', 'info');
          } else {
            showStatus(response?.message || 'Analysis failed, please try again', 'warning');
          }
          analyzeButton.disabled = false;
        }
      );
    });
  });

  // settings button
  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // clear highlights button
  clearButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'clearHighlights' },
        (response) => {
          if (response && response.success) {
            showStatus('All highlights cleared', 'info');
          } else {
            showStatus('Clear highlights failed', 'warning');
          }
        }
      );
    });
  });

  // show status information
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.className = `status ${type}`;
  }
}); 