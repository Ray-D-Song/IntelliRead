/**
 * IntelliRead Cache System
 * Use IndexedDB to build a cache system for highlights, using the domain as the index, and hash the content to check if the cache has matching data.
 */

// create a global object for IntelliReadCache
window.IntelliReadCache = {};

// database name and version
const DB_NAME = 'intelliread-cache';
const DB_VERSION = 1;
const STORE_NAME = 'highlights';

// cache expiration time (milliseconds), default 30 days
const CACHE_EXPIRATION = 30 * 24 * 60 * 60 * 1000;

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
 * Clear expired cache
 * @returns {Promise<void>}
 */
async function clearExpiredCache() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    
    const expirationTime = Date.now() - CACHE_EXPIRATION;
    const range = IDBKeyRange.upperBound(expirationTime);
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      request.onerror = (event) => {
        console.error('Failed to clear expired cache:', event.target.error);
        reject(event.target.error);
      };
      
      transaction.oncomplete = () => {
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
    
    // clear expired cache periodically
    clearExpiredCache().catch(console.error);
  } catch (error) {
    console.error('Failed to cache the analysis result:', error);
  }
}

// mount the functions to the global object
window.IntelliReadCache.checkCache = checkCache;
window.IntelliReadCache.cacheAnalysisResult = cacheAnalysisResult;
