import { type Doc, type Settings, defaults } from './model';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Storage transaction failed'));
  });

export class Storage {
  db!: IDBDatabase;
  native = false;
  async open() {
    const r = indexedDB.open('discribe', 1);
    r.onupgradeneeded = () => {
      for (const name of ['documents', 'settings', 'recovery']) r.result.createObjectStore(name);
    };
    this.db = await request(r);
    this.db.onversionchange = () => this.db.close();
    // Sulfur can announce its bridge after the module has loaded.
    const desktop = !!document.querySelector('meta[name="discribe-desktop"]');
    if (!window.pywebview && desktop)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('The desktop bridge did not connect. Restart Discribe.')),
          10000,
        );
        window.addEventListener(
          'pywebviewready',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    this.native = !!window.pywebview?.api.list_documents;
    if (desktop && !this.native) throw Error('Native document storage is unavailable. Restart Discribe.');
  }
  async list(): Promise<Doc[]> {
    if (this.native) return window.pywebview!.api.list_documents();
    return request(this.db.transaction('documents').objectStore('documents').getAll());
  }
  async save(doc: Doc): Promise<Doc> {
    if (this.native) return window.pywebview!.api.save_document(doc);
    const snapshot = structuredClone(doc);
    const tx = this.db.transaction('documents', 'readwrite');
    const done = complete(tx);
    const store = tx.objectStore('documents');
    const existing = await request<Doc | undefined>(store.get(doc.id));
    if (existing && existing.revision !== snapshot.revision) {
      tx.abort();
      await done.catch(() => {});
      throw Error('Document changed in another tab. Duplicate it to preserve your version.');
    }
    snapshot.revision++;
    snapshot.modifiedAt = new Date().toISOString();
    store.put(snapshot, snapshot.id);
    await done;
    return snapshot;
  }
  async remove(doc: Doc) {
    if (this.native) await window.pywebview!.api.delete_document(doc.id, doc.revision);
    else {
      const tx = this.db.transaction('documents', 'readwrite');
      const done = complete(tx);
      const store = tx.objectStore('documents');
      const current = await request<Doc | undefined>(store.get(doc.id));
      if (current && current.revision !== doc.revision) {
        tx.abort();
        await done.catch(() => {});
        throw Error('Document changed in another tab');
      }
      store.delete(doc.id);
      await done;
    }
    await this.clearRecovery(doc.id);
  }
  async settings(value?: Settings): Promise<Settings> {
    if (this.native) return { ...defaults, ...(await window.pywebview!.api.settings(value)) };
    const tx = this.db.transaction('settings', value ? 'readwrite' : 'readonly');
    if (value) {
      const done = complete(tx);
      tx.objectStore('settings').put(value, 'app');
      await done;
      return value;
    }
    return { ...defaults, ...(await request(tx.objectStore('settings').get('app'))) };
  }
  async recover(doc: Doc) {
    const tx = this.db.transaction('recovery', 'readwrite');
    const done = complete(tx);
    tx.objectStore('recovery').put(structuredClone(doc), doc.id);
    await done;
  }
  async recovery(): Promise<Doc[]> {
    return request(this.db.transaction('recovery').objectStore('recovery').getAll());
  }
  async clearRecovery(id: string) {
    const tx = this.db.transaction('recovery', 'readwrite');
    const done = complete(tx);
    tx.objectStore('recovery').delete(id);
    await done;
  }
  async ui(value?: any) {
    const tx = this.db.transaction('settings', value ? 'readwrite' : 'readonly');
    if (value) {
      const done = complete(tx);
      tx.objectStore('settings').put(value, 'ui');
      await done;
      return value;
    }
    return request(tx.objectStore('settings').get('ui'));
  }
}
