document.addEventListener('DOMContentLoaded', () => {
  localizeUI();

  const analyzeButton = document.getElementById('analyze-btn');
  const settingsButton = document.getElementById('settings-btn');
  const clearButton = document.getElementById('clear-btn');
  const clearDomainCacheButton = document.getElementById('clear-domain-cache-btn');
  const statusDiv = document.getElementById('status');
  const autoHighlightCheckbox = document.getElementById('auto-highlight-checkbox');
  const currentDomainSpan = document.getElementById('current-domain');

  // Get current domain and update the domain text
  getCurrentTabDomain().then(domain => {
    currentDomainSpan.textContent = domain;
    // Check if auto-highlight is enabled for this domain
    checkDomainAutoHighlightStatus();
  });

  // check if API is configured
  chrome.storage.sync.get(['apiUrl', 'apiKey', 'modelName'], (items) => {
    if (!items.apiUrl || !items.apiKey || !items.modelName) {
      showStatus(chrome.i18n.getMessage('configure_api'), 'warning');
      analyzeButton.disabled = true;
    }
  });

  // Auto-highlight checkbox change event
  autoHighlightCheckbox.addEventListener('change', () => {
    setDomainAutoHighlight(autoHighlightCheckbox.checked);
  });

  // analyze current page button
  analyzeButton.addEventListener('click', () => {
    analyzeButton.disabled = true;
    showStatus(chrome.i18n.getMessage('analyzing'), 'info');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'analyzeContent' },
        (response) => {
          if (response && response.success) {
            showStatus(chrome.i18n.getMessage('analysis_complete'), 'info');
          } else {
            showStatus(response?.message || chrome.i18n.getMessage('analysis_failed'), 'warning');
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
            showStatus(chrome.i18n.getMessage('highlights_cleared'), 'info');
          } else {
            showStatus(chrome.i18n.getMessage('clear_failed'), 'warning');
          }
        }
      );
    });
  });

  // clear domain cache button
  clearDomainCacheButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'clearDomainCache' },
        (response) => {
          if (response && response.success) {
            showStatus(chrome.i18n.getMessage('domain_cache_cleared'), 'info');
          } else {
            showStatus(chrome.i18n.getMessage('domain_cache_clear_failed'), 'warning');
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

  // Get the current tab's domain
  async function getCurrentTabDomain() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = new URL(tabs[0].url);
        resolve(url.hostname);
      });
    });
  }

  // Check if auto-highlight is enabled for the current domain
  function checkDomainAutoHighlightStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'getDomainAutoHighlightStatus' },
        (response) => {
          if (response && typeof response.enabled === 'boolean') {
            autoHighlightCheckbox.checked = response.enabled;
          } else {
            console.error('Failed to get domain auto-highlight status', response?.error);
            autoHighlightCheckbox.checked = false;
          }
        }
      );
    });
  }

  // Set auto-highlight status for the current domain
  function setDomainAutoHighlight(enabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'setDomainAutoHighlight', enabled: enabled },
        (response) => {
          if (response && response.success) {
            const messageKey = enabled ? 'auto_highlight_enabled' : 'auto_highlight_disabled';
            const domain = currentDomainSpan.textContent;
            showStatus(`${chrome.i18n.getMessage(messageKey)} ${domain}`, 'info');
          } else {
            showStatus(chrome.i18n.getMessage('auto_highlight_error'), 'warning');
            console.error('Failed to set domain auto-highlight status', response?.error);
            // Revert checkbox state
            checkDomainAutoHighlightStatus();
          }
        }
      );
    });
  }

  function localizeUI() {
    document.getElementById('analyze-btn').textContent = chrome.i18n.getMessage('analyze_button');
    document.getElementById('settings-btn').textContent = chrome.i18n.getMessage('settings_button');
    document.getElementById('clear-btn').textContent = chrome.i18n.getMessage('clear_button');
    document.getElementById('clear-domain-cache-btn').textContent = chrome.i18n.getMessage('clear_domain_cache_button');
    document.querySelector('h1').textContent = chrome.i18n.getMessage('popup_title');
    
    document.title = chrome.i18n.getMessage("popup_title");
    
    // Set auto-highlight label from localization
    const autoHighlightLabel = chrome.i18n.getMessage('auto_highlight_label');
    if (autoHighlightLabel) {
      document.querySelector('label[for="auto-highlight-checkbox"]').textContent = autoHighlightLabel;
    }
    
    const elementsWithText = document.querySelectorAll('h1, h2, h3, label, button');
    elementsWithText.forEach(el => {
      if (el.textContent.includes('__MSG_')) {
        const messageName = el.textContent.match(/__MSG_([a-zA-Z0-9_]+)__/)[1];
        el.textContent = chrome.i18n.getMessage(messageName);
      }
    });
  }
}); 