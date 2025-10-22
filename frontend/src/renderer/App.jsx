import React, { useState, useEffect } from 'react';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const removeStatusListener = window.ipc.on('ipc-status', ({ isConnected }) => {
      setIsConnected(isConnected);
    });

    const removeBackendListener = window.ipc.on('from-backend', (data) => {
      setLastMessage(data);
    });

    const removeLogListener = window.ipc.on('log', (logMessage) => {
      setLogs(prevLogs => [...prevLogs, logMessage]);
    });

    return () => {
      removeStatusListener();
      removeBackendListener();
      removeLogListener();
    };
  }, []);

  const sendPing = (). => {
    window.ipc.send('to-backend', {
      type: 'ping',
      payload: 'Hello from React!',
    });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Desktop Assistant</h1>
      <h2>IPC Communication Test</h2>
      <p>
        Backend Connection Status:{' '}
        <span style={{ color: isConnected ? 'green' : 'red' }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </p>
      <button onClick={sendPing} disabled={!isConnected}>
        Send Ping to Backend
      </button>
      {lastMessage && (
        <div>
          <h3>Last message from backend:</h3>
          <pre>{JSON.stringify(lastMessage, null, 2)}</pre>
        </div>
      )}
      <h3>IPC Logs:</h3>
      <div style={{ height: '200px', overflowY: 'scroll', border: '1px solid #ccc', padding: '10px', background: '#f0f0f0' }}>
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
