document.addEventListener('DOMContentLoaded', () => {
  localizeUI();

  // default highlight settings
  const defaultHighlightSettings = {
    highlightColor: '#ADD8E6',
    highlightStyle: 'background'
  };

  // load saved settings
  chrome.storage.sync.get(
    { 
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      highlightColor: '#ADD8E6',
      highlightStyle: 'background'
    }, 
    (items) => {
      document.getElementById('api-url').value = items.apiUrl;
      document.getElementById('api-key').value = items.apiKey;
      document.getElementById('model-name').value = items.modelName;
      document.getElementById('highlight-color').value = items.highlightColor;
      document.getElementById('highlight-style').value = items.highlightStyle;
      
      // initial update color preview
      const colorPreview = document.getElementById('color-preview');
      const colorValue = document.getElementById('color-value');
      if (colorPreview) colorPreview.style.backgroundColor = items.highlightColor;
      if (colorValue) colorValue.textContent = items.highlightColor;
      
      updatePreview();
    }
  );

  // API preset button click event
  const presetButtons = document.querySelectorAll('.api-preset-btn');
  presetButtons.forEach(button => {
    button.addEventListener('click', () => {
      const apiUrl = button.getAttribute('data-url');
      const modelName = button.getAttribute('data-model');
      
      if (apiUrl) document.getElementById('api-url').value = apiUrl;
      if (modelName) document.getElementById('model-name').value = modelName;
      
      // highlight the selected preset button
      presetButtons.forEach(btn => {
        btn.style.backgroundColor = '';
        btn.style.color = '';
      });
      button.style.backgroundColor = '#3498db';
      button.style.color = 'white';
    });
  });

  // add preview update function
  function updatePreview() {
    const previewText = document.getElementById('preview-text');
    const style = document.getElementById('highlight-style').value;
    const color = document.getElementById('highlight-color').value;
    const colorPreview = document.getElementById('color-preview');
    const colorValue = document.getElementById('color-value');

    // update color preview and value
    if (colorPreview) colorPreview.style.backgroundColor = color;
    if (colorValue) colorValue.textContent = color;

    previewText.style = '';
    switch (style) {
      case 'background':
        previewText.style.backgroundColor = color;
        break;
      case 'underline':
        previewText.style.borderBottom = `2px solid ${color}`;
        break;
      case 'dashed':
        previewText.style.borderBottom = `2px dashed ${color}`;
        break;
    }
  }

  // add style and color change listener
  document.getElementById('highlight-style').addEventListener('change', updatePreview);
  document.getElementById('highlight-color').addEventListener('input', updatePreview);

  // reset button event handler
  document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('highlight-color').value = defaultHighlightSettings.highlightColor;
    document.getElementById('highlight-style').value = defaultHighlightSettings.highlightStyle;
    updatePreview();
    showStatus(chrome.i18n.getMessage('settings_reset'), true);
  });

  // save settings button click event
  document.getElementById('save-btn').addEventListener('click', () => {
    const apiUrl = document.getElementById('api-url').value;
    const apiKey = document.getElementById('api-key').value;
    const modelName = document.getElementById('model-name').value;
    const highlightColor = document.getElementById('highlight-color').value;
    const highlightStyle = document.getElementById('highlight-style').value;
    
    // validate input
    if (!apiUrl || !apiKey || !modelName) {
      showStatus(chrome.i18n.getMessage('fill_required'), false);
      return;
    }

    // save settings to Chrome storage
    chrome.storage.sync.set(
      {
        apiUrl,
        apiKey,
        modelName,
        highlightColor,
        highlightStyle
      },
      () => {
        showStatus(chrome.i18n.getMessage('settings_saved'), true);
      }
    );
  });

  // show status message
  function showStatus(message, success) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    
    if (success) {
      statusEl.className = 'status success';
    } else {
      statusEl.className = 'status error';
    }
    
    // hide message after 3 seconds
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }

  function localizeUI() {
    document.querySelectorAll('[id$="-text"]').forEach(el => {
      if (el.id !== 'preview-text' && el.id !== 'color-value') {
        const messageName = el.id.replace('-text', '');
        el.textContent = chrome.i18n.getMessage(messageName);
      }
    });

    document.title = chrome.i18n.getMessage("options_title");
    
    const elementsWithText = document.querySelectorAll('h1, h2, h3, label, button, option');
    elementsWithText.forEach(el => {
      if (el.textContent.includes('__MSG_')) {
        const messageName = el.textContent.match(/__MSG_([a-zA-Z0-9_]+)__/)[1];
        el.textContent = chrome.i18n.getMessage(messageName);
      }
    });
    
    const inputElements = document.querySelectorAll('input[placeholder]');
    inputElements.forEach(el => {
      if (el.placeholder.includes('__MSG_')) {
        const messageName = el.placeholder.match(/__MSG_([a-zA-Z0-9_]+)__/)[1];
        el.placeholder = chrome.i18n.getMessage(messageName);
      }
    });

    const previewNormalText = document.getElementById('preview-normal-text');
    if (previewNormalText) {
      const previewText = chrome.i18n.getMessage('preview_text');
      const parts = previewText.split('，');
      if (parts.length > 1) {
        previewNormalText.innerHTML = parts[0] + '，<span id="preview-text">' + parts[1] + '</span>';
      } else {
        previewNormalText.innerHTML = '<span id="preview-text">' + previewText + '</span>';
      }
    }
  }
});