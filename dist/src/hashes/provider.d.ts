import { HashBindings } from './types.js';
declare class HashesProvider {
    private static instance?;
    private _hashes;
    private constructor();
    static getInstance(): HashesProvider;
    setHashes(hashes: HashBindings): void;
    get hashes(): HashBindings;
}
export declare const hashesProvider: HashesProvider;
export {};
