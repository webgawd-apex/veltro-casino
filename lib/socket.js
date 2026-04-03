'use client';

import { io } from 'socket.io-client';

// Initialize the socket connection to the server
// The URL is omitted so it defaults to the current host
export const socket = io(undefined, {
    autoConnect: false, // We'll manually connect in the component
    reconnection: true,
});
