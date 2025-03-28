/**
 * IntelliRead Cache System
 * Use IndexedDB to build a cache system for highlights, using the domain as the index, and hash the content to check if the cache has matching data.
 */

// create a global object for IntelliReadCache
window.IntelliReadCache = {};

// database name and version
const DB_NAME = 'intelliread-cache';
const DB_VERSION = 3; // Increased version for new schema
const STORE_NAME = 'highlights';
const URL_STORE_NAME = 'highlighted_urls'; // Store for highlighted URLs
const AUTO_DOMAIN_STORE = 'auto_highlight_domains'; // New store for domains with auto-highlight enabled

// cache expiration time (milliseconds), default 30 days
const CACHE_EXPIRATION = 30 * 24 * 60 * 60 * 1000;

// Listen for cache cleanup event
document.addEventListener('intelliread-cleanup-cache', () => {
  console.log('Received cleanup event, clearing expired cache entries');
  clearExpiredCache().catch(error => {
    console.error('Failed to clear expired cache from event:', error);
  });
});

/**
 * Initialize or open the IndexedDB database
 * @returns {Promise<IDBDatabase>} Returns the opened database connection
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Failed to open the database:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // if the storage object does not exist, create it
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // create a storage object with the domain and content hash as the composite key
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['domain', 'contentHash'] });
        
        // create an index for the domain, for quick lookup
        store.createIndex('domain', 'domain', { unique: false });
        
        // add a timestamp index, for clearing expired cache
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for highlighted URLs if it doesn't exist
      if (!db.objectStoreNames.contains(URL_STORE_NAME)) {
        const urlStore = db.createObjectStore(URL_STORE_NAME, { keyPath: 'url' });
        urlStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for domains with auto-highlight enabled
      if (!db.objectStoreNames.contains(AUTO_DOMAIN_STORE)) {
        db.createObjectStore(AUTO_DOMAIN_STORE, { keyPath: 'domain' });
      }
    };
  });
}

/**
 * Calculate the hash value of a string
 * @param {string} content The content to hash
 * @returns {Promise<string>} Returns the hash value
 */
async function calculateHash(content) {
  // use the modern Web API to calculate the hash value
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // convert the hash buffer to a hexadecimal string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Get the current page's domain
 * @returns {string} The current page's domain
 */
function getCurrentDomain() {
  return window.location.hostname;
}

/**
 * Get the current page's full URL
 * @returns {string} The current page's full URL
 */
function getCurrentUrl() {
  return window.location.href;
}

/**
 * Save data to the cache
 * @param {string} contentHash The content hash
 * @param {Array<string>} keypoints The highlights keypoints array
 * @returns {Promise<void>}
 */
async function saveToCache(contentHash, keypoints) {
  try {
    const domain = getCurrentDomain();
    const db = await openDatabase();
    
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const cacheData = {
      domain,
      contentHash,
      keypoints,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(cacheData);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('Failed to save to the cache:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to save to the cache:', error);
    throw error;
  }
}

/**
 * Get data from the cache
 * @param {string} contentHash The content hash
 * @returns {Promise<Array<string>|null>} If the cache hits, return the keypoints array; otherwise return null
 */
async function getFromCache(contentHash) {
  try {
    const domain = getCurrentDomain();
    const db = await openDatabase();
    
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get([domain, contentHash]);
      
      request.onsuccess = (event) => {
        const result = event.target.result;
        
        if (result && (Date.now() - result.timestamp < CACHE_EXPIRATION)) {
          // cache hits and not expired
          resolve(result.keypoints);
        } else {
          // cache not hit or expired
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error('Failed to get data from the cache:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to get data from the cache:', error);
    return null;
  }
}

/**
 * Save the current URL to the highlighted URLs store
 * @returns {Promise<void>}
 */
async function saveHighlightedUrl() {
  try {
    const url = getCurrentUrl();
    const db = await openDatabase();
    
    const transaction = db.transaction(URL_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(URL_STORE_NAME);
    
    const urlData = {
      url,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(urlData);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('Failed to save highlighted URL:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to save highlighted URL:', error);
    throw error;
  }
}

/**
 * Check if the current URL has been highlighted before
 * @returns {Promise<boolean>} Returns true if the URL has been highlighted before
 */
async function hasUrlBeenHighlighted() {
  try {
    const url = getCurrentUrl();
    const db = await openDatabase();
    
    const transaction = db.transaction(URL_STORE_NAME, 'readonly');
    const store = transaction.objectStore(URL_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(url);
      
      request.onsuccess = (event) => {
        const result = event.target.result;
        resolve(!!result); // Convert to boolean
      };
      
      request.onerror = (event) => {
        console.error('Failed to check highlighted URL:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to check highlighted URL:', error);
    return false;
  }
}

/**
 * Enable auto-highlight for the current domain
 * @param {boolean} enabled Whether to enable or disable auto-highlight
 * @returns {Promise<void>}
 */
async function setDomainAutoHighlight(enabled) {
  try {
    const domain = getCurrentDomain();
    const db = await openDatabase();
    
    const transaction = db.transaction(AUTO_DOMAIN_STORE, 'readwrite');
    const store = transaction.objectStore(AUTO_DOMAIN_STORE);
    
    return new Promise((resolve, reject) => {
      if (enabled) {
        // Add domain to auto-highlight list
        const domainData = {
          domain,
          timestamp: Date.now()
        };
        
        const request = store.put(domainData);
        
        request.onsuccess = () => {
          console.log(`Auto-highlight enabled for domain: ${domain}`);
          resolve();
        };
        
        request.onerror = (event) => {
          console.error('Failed to enable auto-highlight for domain:', event.target.error);
          reject(event.target.error);
        };
      } else {
        // Remove domain from auto-highlight list
        const request = store.delete(domain);
        
        request.onsuccess = () => {
          console.log(`Auto-highlight disabled for domain: ${domain}`);
          resolve();
        };
        
        request.onerror = (event) => {
          console.error('Failed to disable auto-highlight for domain:', event.target.error);
          reject(event.target.error);
        };
      }
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to set domain auto-highlight:', error);
    throw error;
  }
}

/**
 * Check if auto-highlight is enabled for the current domain
 * @returns {Promise<boolean>} Returns true if auto-highlight is enabled for the domain
 */
async function isDomainAutoHighlightEnabled() {
  try {
    const domain = getCurrentDomain();
    const db = await openDatabase();
    
    const transaction = db.transaction(AUTO_DOMAIN_STORE, 'readonly');
    const store = transaction.objectStore(AUTO_DOMAIN_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(domain);
      
      request.onsuccess = (event) => {
        const result = event.target.result;
        resolve(!!result); // Convert to boolean
      };
      
      request.onerror = (event) => {
        console.error('Failed to check domain auto-highlight:', event.target.error);
        reject(event.target.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Failed to check domain auto-highlight:', error);
    return false;
  }
}

/**
 * Clear expired cache entries from both stores
 * @returns {Promise<void>}
 */
async function clearExpiredCache() {
  try {
    const db = await openDatabase();
    const expirationTime = Date.now() - CACHE_EXPIRATION;
    
    // Clear expired highlight cache
    const highlightTransaction = db.transaction(STORE_NAME, 'readwrite');
    const highlightStore = highlightTransaction.objectStore(STORE_NAME);
    const highlightIndex = highlightStore.index('timestamp');
    const highlightRange = IDBKeyRange.upperBound(expirationTime);
    
    await new Promise((resolve, reject) => {
      const request = highlightIndex.openCursor(highlightRange);
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      request.onerror = (event) => {
        console.error('Failed to clear expired highlight cache:', event.target.error);
        reject(event.target.error);
      };
      
      highlightTransaction.oncomplete = () => {
        resolve();
      };
    });
    
    // Clear expired URL cache
    const urlTransaction = db.transaction(URL_STORE_NAME, 'readwrite');
    const urlStore = urlTransaction.objectStore(URL_STORE_NAME);
    const urlIndex = urlStore.index('timestamp');
    const urlRange = IDBKeyRange.upperBound(expirationTime);
    
    await new Promise((resolve, reject) => {
      const request = urlIndex.openCursor(urlRange);
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      request.onerror = (event) => {
        console.error('Failed to clear expired URL cache:', event.target.error);
        reject(event.target.error);
      };
      
      urlTransaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch (error) {
    console.error('Failed to clear expired cache:', error);
    throw error;
  }
}

/**
 * Check if the analysis content is in the cache, if it is, return the cached keypoints, otherwise return null
 * @param {string} content The content to analyze
 * @returns {Promise<Array<string>|null>} The cached keypoints array or null
 */
async function checkCache(content) {
  try {
    // calculate the content hash
    const contentHash = await calculateHash(content);
    
    // get data from the cache
    const cachedData = await getFromCache(contentHash);
    
    return cachedData;
  } catch (error) {
    console.error('Failed to check cache:', error);
    return null;
  }
}

/**
 * Save the analysis result to the cache
 * @param {string} content The original content
 * @param {Array<string>} keypoints The keypoints array analyzed
 * @returns {Promise<void>}
 */
async function cacheAnalysisResult(content, keypoints) {
  try {
    // calculate the content hash
    const contentHash = await calculateHash(content);
    
    // save to the cache
    await saveToCache(contentHash, keypoints);
    
    // Save the current URL as a highlighted URL
    await saveHighlightedUrl();
    
    // clear expired cache periodically
    clearExpiredCache().catch(console.error);
  } catch (error) {
    console.error('Failed to cache the analysis result:', error);
  }
}

// mount the functions to the global object
window.IntelliReadCache.checkCache = checkCache;
window.IntelliReadCache.cacheAnalysisResult = cacheAnalysisResult;
window.IntelliReadCache.hasUrlBeenHighlighted = hasUrlBeenHighlighted;
window.IntelliReadCache.setDomainAutoHighlight = setDomainAutoHighlight;
window.IntelliReadCache.isDomainAutoHighlightEnabled = isDomainAutoHighlightEnabled;
