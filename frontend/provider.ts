import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';

export class SessionProvider {
  doc = new Y.Doc();
  awareness = new Awareness(this.doc);
  persistence: IndexeddbPersistence;
  socket?: WebSocket;
  role = 'viewer';
  metadata?: { kind: 'code' | 'write'; name: string; language: string };
  participants: { id: string; name: string; role: string }[] = [];
  synced = false;
  stopped = false;
  connected = false;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private retry?: ReturnType<typeof setTimeout>;
  private delay = 500;
  private resolve!: () => void;
  private offline = () => {
    this.socket?.close();
  };
  private online = () => {
    if (
      !this.stopped &&
      this.socket?.readyState !== WebSocket.OPEN &&
      this.socket?.readyState !== WebSocket.CONNECTING
    ) {
      clearTimeout(this.retry);
      void this.connect();
    }
  };
  ready = new Promise<void>((resolve) => (this.resolve = resolve));
  constructor(
    public server: string,
    public session: string,
    private token: string,
    private name: string,
  ) {
    this.persistence = new IndexeddbPersistence(
      `discribe-yjs-${new URL(server).host}-${session}-${token.slice(0, 12)}`,
      this.doc,
    );
    this.awareness.setLocalStateField('user', { name, color: '#7889c1' });
    window.addEventListener('offline', this.offline);
    window.addEventListener('online', this.online);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== this && this.role !== 'viewer') this.send(1, update);
    });
    this.awareness.on('update', ({ added, updated, removed }: any, origin: unknown) => {
      if (origin !== this)
        this.send(2, encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
    });
  }
  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }
  off(event: string, callback: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(callback);
  }
  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }
  async connect() {
    await this.persistence.whenSynced;
    if (
      this.stopped ||
      !navigator.onLine ||
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN
    )
      return;
    const endpoint = new URL(`/discribe/ws/${this.session}`, this.server);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = (this.socket = new WebSocket(endpoint));
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => socket.send(JSON.stringify({ token: this.token, name: this.name }));
    socket.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const message = JSON.parse(event.data);
          if (message.type === 'ready') {
            this.role = message.role;
            this.metadata = message;
          }
          if (message.type === 'presence') {
            this.participants = message.participants;
            this.emit('presence');
          }
          return;
        }
        const bytes = new Uint8Array(event.data);
        const update = bytes.subarray(1);
        if (bytes[0] === 0 || bytes[0] === 1) Y.applyUpdate(this.doc, update, this);
        if (bytes[0] === 2) applyAwarenessUpdate(this.awareness, update, this);
        if (bytes[0] === 0) {
          this.connected = true;
          this.synced = true;
          this.delay = 500;
          if (this.role !== 'viewer') this.send(1, Y.encodeStateAsUpdate(this.doc));
          this.send(2, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
          this.resolve();
          this.emit('status');
          this.emit('sync', true);
          this.emit('synced');
        }
      } catch {
        this.emit('error', 'The host sent an invalid collaboration message');
      }
    };
    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      this.connected = false;
      this.emit('status');
      if (event.code >= 4000) {
        this.stopped = true;
        this.emit('error', event.reason || 'Session unavailable');
        return;
      }
      if (!this.stopped) {
        this.retry = setTimeout(() => void this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, 15000);
      }
    };
  }
  private send(tag: number, update: Uint8Array) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
    if (update.length > 1024 * 1024 - 1) {
      this.emit('error', 'Shared update exceeds 1 MiB. Keep a local copy and share a smaller document.');
      return;
    }
    const message = new Uint8Array(update.length + 1);
    message[0] = tag;
    message.set(update, 1);
    this.socket.send(message);
  }
  async destroy() {
    this.stopped = true;
    clearTimeout(this.retry);
    window.removeEventListener('offline', this.offline);
    window.removeEventListener('online', this.online);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'disconnect');
    this.socket?.close();
    this.awareness.destroy();
    await this.persistence.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
