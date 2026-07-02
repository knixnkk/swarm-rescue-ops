/**
 * Socket.IO Connection Configuration with Diagnostics
 */

console.log('[CONFIG] Page loaded at:', window.location.href);

const getServerUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const urlServer = params.get('server');
  
  if (urlServer) {
    console.log('[CONFIG] Using custom server from URL:', urlServer);
    return urlServer;
  }
  
  const currentOrigin = window.location.origin;
  console.log('[CONFIG] Using current origin:', currentOrigin);
  return '';
};

const SOCKET_SERVER_URL = getServerUrl();

console.log('[SOCKET] Attempting to connect...');
console.log('[SOCKET] URL:', SOCKET_SERVER_URL || 'same origin');
console.log('[SOCKET] Current origin:', window.location.origin);

const socket = io(SOCKET_SERVER_URL, {
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  reconnectionAttempts: 10,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true,
  timeout: 20000,
});

// Enhanced debugging
socket.on('connect', () => {
  console.log('[SOCKET] ✓ Connected successfully, ID:', socket.id);
  console.log('[SOCKET] Transport:', socket.io.engine.transport.name);
});

socket.on('connect_error', (error) => {
  console.error('[SOCKET] Connection error:', error.message);
  console.error('[SOCKET] Error details:', error);
});

socket.on('disconnect', (reason) => {
  console.warn('[SOCKET] Disconnected - Reason:', reason);
  if (reason === 'io server disconnect') {
    console.warn('[SOCKET] Server closed connection');
  }
});

socket.on('error', (error) => {
  console.error('[SOCKET] Error event:', error);
});

socket.on('connect_timeout', () => {
  console.error('[SOCKET] Connection timeout');
});

socket.on('reconnect', (attemptNumber) => {
  console.log('[SOCKET] Reconnecting... Attempt:', attemptNumber);
});

socket.on('reconnect_error', (error) => {
  console.error('[SOCKET] Reconnection error:', error.message);
});

socket.on('reconnect_failed', () => {
  console.error('[SOCKET] ✗ Failed to reconnect after max attempts');
});
