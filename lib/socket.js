'use client';

import { io } from 'socket.io-client';

// Initialize the socket connection to the server
// Use the environment variable for split deployment (Render URL)
const getSocketUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof window !== "undefined" && window.location.hostname === "localhost") return "http://localhost:10000";
    return "https://hate-casino.onrender.com";
};

const SOCKET_URL = getSocketUrl();

export const socket = io(SOCKET_URL, {
    autoConnect: false, // We'll manually connect in the component
    reconnection: true,
});
