# 004. WebSocket Streaming API

Date: 2024-01-XX

## Status

Accepted

## Context

The Personal Assistant needs real-time bidirectional communication with frontend clients to support:
- Streaming LLM responses as they are generated
- Tool execution progress updates
- Real-time user interaction feedback
- Session state synchronization
- Error reporting and recovery

Traditional REST APIs create poor user experience due to polling requirements and lack of real-time updates. HTTP/2 Server-Sent Events provide one-way streaming but not bidirectional communication. The system requires:

- Bidirectional communication for user queries and system responses
- Streaming responses to avoid blocking the UI
- Connection persistence across user interactions
- Proper session management and cleanup
- Error handling and reconnection support

## Decision

Implement a WebSocket-based streaming API as the primary communication protocol:

1. **WebSocket Transport**: Persistent full-duplex connections
2. **Message-Based Protocol**: Structured JSON messages with types
3. **Streaming Responses**: Chunked responses for real-time updates
4. **Session Management**: Connection lifecycle tied to user sessions
5. **Error Recovery**: Automatic reconnection and state recovery

Key message types:
- Handshake messages for connection establishment
- Query messages for user input
- Streaming response messages for LLM output
- Tool execution messages for tool status
- Settings messages for configuration updates

## Consequences

### Positive
- **Real-Time Communication**: Immediate UI updates without polling
- **Efficient Streaming**: Progressive response rendering
- **Connection Persistence**: Reduced overhead for multiple interactions
- **Bidirectional**: Support for both push and pull communication
- **Session Awareness**: Connection state tied to user context

### Negative
- **Connection Management**: Complex lifecycle and cleanup logic
- **Browser Support**: WebSocket support requirements
- **Firewall Issues**: WebSocket ports may be blocked
- **Debugging**: Harder to debug than HTTP requests
- **Scaling**: Connection limits and resource management

### Mitigation
- Comprehensive connection lifecycle management
- Automatic reconnection with exponential backoff
- Connection pooling and resource limits
- Detailed logging and monitoring
- Fallback to HTTP polling for unsupported clients

## Alternatives Considered

### HTTP REST with Polling
- **Rejected**: Poor user experience, high latency, server load

### HTTP/2 Server-Sent Events (SSE)
- **Rejected**: One-way only, no bidirectional communication

### WebRTC Data Channels
- **Rejected**: Overkill for text messaging, complex setup, browser support

### Long Polling
- **Rejected**: Inefficient resource usage, complex timeout handling

### GraphQL Subscriptions
- **Rejected**: Additional complexity, overkill for use case, ecosystem maturity

## Related ADRs

- ADR-001: Async-First Architecture (async WebSocket handling)
- ADR-005: Tool SDK Design (streaming tool results)
- ADR-006: Memory Vector Storage (real-time memory updates)
