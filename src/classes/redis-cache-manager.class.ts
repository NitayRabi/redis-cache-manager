import * as redis from 'redis';
import { ClientOpts, RedisClient } from 'redis';

export interface RCMOptions extends ClientOpts {
    namespace?: string;
}

export class RedisCacheManager {

    private namespace: string;
    private client: RedisClient;
    subscriber: RedisClient;
    private keyListeners: {[key: string]: Function} = {};

    constructor(options: RCMOptions) {
        this.namespace = options ? options.namespace || 'RedisCacheManager' : 'RedisCacheManager';
        this.client = redis.createClient(options);
        this.subscriber = redis.createClient(options);
        this.initSubscriptions();
    }

    private keyGen(...keys: string[]) {
        keys.unshift(this.namespace);
        return keys.join(':');
    }

    private initSubscriptions(): void {
        this.subscriber.on('message', this.handleMessageEvent.bind(this));
        this.subscriber.on('pmessage', this.handlePmessageEvent.bind(this));
    }

    private async handleMessageEvent(key: string, message: string): Promise<void> {
        const data = await this.get(key);
        if (this.keyListeners[key]) {
            this.keyListeners[key](data);
        }
    };

    private async handlePmessageEvent(pattern: string, key: string, message: string): Promise<void> {
        const data = await this.get(key);
        if (this.keyListeners[key]) {
            this.keyListeners[key](data);
        }
    };

    set<T>(key: string, obj: any, listener?: (data: T) => void): Promise<RedisClient> {
        // TODO - add list behavior
        const isArray = Array.isArray(obj);
        const redisKey = this.keyGen(key);
        const cachedItem = JSON.stringify(obj);
        return this.setItem(redisKey, cachedItem, listener)
            .then((client: RedisClient) => {
                this.client.publish(redisKey, 'message');
                return client;
            });
    }

    private setItem<T>(key: string, value: string, listener?: (data: T) => void) {
        return new Promise((resolve, reject) => {
            this.client.set(key, value, (err, saved) => {
                if (err) {
                    reject(err.message);
                    return;
                }
                if (listener) {
                    this.subscriber.subscribe(key);
                    this.keyListeners[key] = listener;
                }
                resolve(this.client);
            })
        });
    }

    get<T>(key: string): Promise<T> {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        return new Promise((resolve, reject) => {
            this.client.get(redisKey, (err: Error | null, value: any) => {
               if (err) {
                   reject(err.message);
                   return;
               }
               resolve(JSON.parse(value));
               return;
            });
        })
    }

    keyChange<T>(key: string, listener: (data: T) => void): void {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        this.subscriber.subscribe(redisKey);
        this.keyListeners[redisKey] = listener;
    }

    quit() {
        this.client.quit();
        this.subscriber.quit();
    }

    unref() {
        this.client.unref();
        this.subscriber.unref();
    }

}
