class HashesProvider {
    static instance;
    _hashes = null;
    constructor() { }
    static getInstance() {
        if (HashesProvider.instance == null) {
            HashesProvider.instance = new HashesProvider();
        }
        return HashesProvider.instance;
    }
    setHashes(hashes) {
        this._hashes = hashes;
    }
    get hashes() {
        if (this._hashes == null) {
            throw new Error('Hash bindings have not been set. Call setHashes() before using the SDK.');
        }
        return this._hashes;
    }
}
export const hashesProvider = HashesProvider.getInstance();
