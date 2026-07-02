/**
 * Socket.IO Connection Configuration
 * 
 * Connects to the current Render server
 * Can be overridden by passing 'server' URL parameter: ?server=https://your-render-url.onrender.com
 */

const getServerUrl = () => {
  // Check for server parameter in URL
  const params = new URLSearchParams(window.location.search);
  const urlServer = params.get('server');
  
  if (urlServer) {
    console.log('[CONFIG] Using custom server:', urlServer);
    return urlServer;
  }
  
  // Use current origin (Render will provide the correct URL)
  console.log('[CONFIG] Using current server:', window.location.origin);
  return '';
};

const SOCKET_SERVER_URL = getServerUrl();

const socket = io(SOCKET_SERVER_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// Debug logging
socket.on('connect', () => {
  console.log('[SOCKET] Connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('[SOCKET] Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.warn('[SOCKET] Disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('[SOCKET] Error:', error);
});
