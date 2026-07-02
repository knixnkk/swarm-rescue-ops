/**
 * Socket.IO Connection Configuration
 * 
 * Auto-detects localhost vs production (Render) environment
 * Can be overridden by passing 'server' URL parameter: ?server=https://your-render-url.onrender.com
 */

const getServerUrl = () => {
  // Check for server parameter in URL
  const params = new URLSearchParams(window.location.search);
  const urlServer = params.get('server');
  
  if (urlServer) {
    console.log('[CONFIG] Using server from URL parameter:', urlServer);
    return urlServer;
  }
  
  // Auto-detect based on current location
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[CONFIG] Localhost detected');
    return ''; // Use same origin (default behavior)
  }
  
  // Production: use current origin
  console.log('[CONFIG] Production detected, using current origin');
  return '';
};

const SOCKET_SERVER_URL = getServerUrl();

const socket = io(SOCKET_SERVER_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});
