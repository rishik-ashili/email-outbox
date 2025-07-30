declare module 'imap' {
    interface Connection {
        idle(callback?: (err: Error | null) => void): void;
        idle(): void;
        openBox(name: string, readOnly: boolean, callback: (err: Error | null, box?: any) => void): void;
        search(criteria: any[], callback: (err: Error | null, results?: number[]) => void): void;
        fetch(source: any, options?: any): any;
        on(event: string, listener: (...args: any[]) => void): this;
        once(event: string, listener: (...args: any[]) => void): this;
        connect(callback?: (err: Error | null) => void): void;
        end(): void;
        destroy(): void;
        state: string;
    }
} 