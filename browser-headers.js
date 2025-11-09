/**
 * Browser Headers Generator - Generates realistic browser headers to avoid bot detection
 * 
 * Features:
 *   - User-Agent rotation (multiple browser types and versions)
 *   - Realistic header combinations
 *   - Referrer chain simulation
 *   - Cookie handling support
 *   - Header order variation
 */

/**
 * Pool of realistic User-Agents representing different browsers and OS combinations
 */
const USER_AGENTS = [
  // Chrome on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  
  // Firefox on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  
  // Chrome on Linux/Ubuntu
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  
  // Firefox on Linux/Ubuntu
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
];

/**
 * Get a random User-Agent from the pool
 * @returns {string} Random User-Agent string
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get headers appropriate for the User-Agent
 * @param {string} userAgent - User-Agent string
 * @returns {Object} Headers object
 */
function getHeadersForUserAgent(userAgent) {
  const isFirefox = userAgent.includes('Firefox');
  const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
  const isEdge = userAgent.includes('Edg');
  
  const baseHeaders = {
    'User-Agent': userAgent,
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
  
  if (isFirefox) {
    // Firefox-specific headers
    return {
      ...baseHeaders,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
  } else if (isSafari) {
    // Safari-specific headers
    return {
      ...baseHeaders,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  } else {
    // Chrome/Edge headers
    return {
      ...baseHeaders,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
  }
}

/**
 * Generate realistic browser headers with optional referrer
 * @param {Object} options - Header generation options
 * @param {string} options.referrer - Referrer URL (optional)
 * @param {string} options.userAgent - Specific User-Agent to use (optional, random if not provided)
 * @param {boolean} options.includeCacheControl - Whether to include cache control headers (default: true)
 * @returns {Object} Headers object
 */
function generateHeaders(options = {}) {
  const {
    referrer = null,
    userAgent = null,
    includeCacheControl = true
  } = options;
  
  const selectedUA = userAgent || getRandomUserAgent();
  const headers = getHeadersForUserAgent(selectedUA);
  
  // Add referrer if provided (realistic navigation flow)
  if (referrer) {
    headers['Referer'] = referrer;
    // Update Sec-Fetch-Site based on referrer
    if (headers['Sec-Fetch-Site']) {
      try {
        const referrerHost = new URL(referrer).hostname;
        const currentHost = referrer.includes('bscscan.com') ? 'bscscan.com' : null;
        if (currentHost && referrerHost === currentHost) {
          headers['Sec-Fetch-Site'] = 'same-origin';
        } else {
          headers['Sec-Fetch-Site'] = 'cross-site';
        }
      } catch (e) {
        // Invalid URL, keep default
      }
    }
  }
  
  // Add cache control headers if requested
  if (includeCacheControl) {
    // Sometimes browsers send cache headers, sometimes they don't
    if (Math.random() > 0.3) {
      headers['Cache-Control'] = 'max-age=0';
    }
    if (Math.random() > 0.5) {
      headers['Pragma'] = 'no-cache';
    }
  }
  
  return headers;
}

/**
 * Generate a random delay with jitter to avoid predictable timing patterns
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} jitterPercent - Percentage of jitter (0-100, default: 30)
 * @returns {number} Delay with jitter
 */
function getRandomDelay(baseDelay, jitterPercent = 30) {
  const jitter = (baseDelay * jitterPercent) / 100;
  const minDelay = baseDelay - jitter;
  const maxDelay = baseDelay + jitter;
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}

/**
 * Session state to maintain consistency across requests
 */
class BrowserSession {
  constructor() {
    this.userAgent = getRandomUserAgent();
    this.cookies = new Map();
    this.lastUrl = null;
  }
  
  /**
   * Get headers for a request, maintaining session consistency
   * @param {string} url - Current request URL
   * @param {Object} options - Additional options
   * @returns {Object} Headers object
   */
  getHeaders(url, options = {}) {
    const referrer = this.lastUrl || options.referrer || null;
    const headers = generateHeaders({
      userAgent: this.userAgent, // Use same UA for session
      referrer: referrer,
      includeCacheControl: options.includeCacheControl !== false
    });
    
    // Add cookies if we have them
    if (this.cookies.size > 0) {
      const cookieString = Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      headers['Cookie'] = cookieString;
    }
    
    // Update last URL for next request
    this.lastUrl = url;
    
    return headers;
  }
  
  /**
   * Update cookies from Set-Cookie header
   * @param {string} setCookieHeader - Set-Cookie header value
   */
  updateCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    
    // Simple cookie parsing (handle multiple cookies)
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookies.forEach(cookie => {
      const parts = cookie.split(';')[0].split('=');
      if (parts.length === 2) {
        this.cookies.set(parts[0].trim(), parts[1].trim());
      }
    });
  }
  
  /**
   * Reset session (new User-Agent, clear cookies)
   */
  reset() {
    this.userAgent = getRandomUserAgent();
    this.cookies.clear();
    this.lastUrl = null;
  }
}

module.exports = {
  generateHeaders,
  getRandomUserAgent,
  getRandomDelay,
  BrowserSession
};

