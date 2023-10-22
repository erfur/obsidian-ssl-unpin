export function log(message: string): void {
    console.log(message);
}

export var DEBUG = true;

export function debug(message: string): void {
    if (DEBUG) {
        console.log(`[*] ${message}`);
    }
}
