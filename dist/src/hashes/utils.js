const HEX = /^[0-9a-fA-F]*$/;
/**
 * Accepts a byte string as bytes or as hex, and returns it as bytes. Length is
 * not checked here — the binding is the single source of truth for that.
 */
export function toBytes(value) {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (typeof value !== 'string') {
        throw new TypeError('value must be a Uint8Array or a hex string');
    }
    if (value.length % 2 !== 0 || !HEX.test(value)) {
        throw new TypeError('value string must be valid hex');
    }
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(value.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
/**
 * Accepts a byte string as bytes or as hex, and returns it as a hex string.
 */
export function toHex(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (!(value instanceof Uint8Array)) {
        throw new TypeError('value must be a Uint8Array or a hex string');
    }
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
