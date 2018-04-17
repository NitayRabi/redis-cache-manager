import * as redis from 'redis';
import { ClientOpts, RedisClient } from 'redis';
import { Parser } from '../services/parsing.service';

export interface RCMOptions extends ClientOpts {
    namespace?: string;
}

export class RedisCacheManager {

    private INDEX_KEY = 'indexes';
    private namespace: string;
    client: RedisClient;
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
        const data = await this.hmGetOne(key);
        const callbackKey = pattern.substring(0, pattern.lastIndexOf(':'));
        if (this.keyListeners[callbackKey]) {
            this.keyListeners[callbackKey](data);
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

    getAll<T>(key: string): Promise<T[]> {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        const pattern = `${redisKey}*`;
        const multi = this.client.multi();
        return new Promise((resolve, reject) => {
            this.client.keys(pattern, (error, keys: string[]) => {
                for (const singleKey of keys) {
                    multi.get(singleKey, (err, value) => {
                        if (!err) {
                            return value;
                        }
                    })
                }
                multi.exec((err, values) => {
                    if (err) {
                        return reject(err);
                    }
                    const parsed = [];
                    for (const value of values) {
                        try {
                            parsed.push(JSON.parse(value));
                        } catch (err) {}
                    }
                    resolve(parsed);
                })
            })
        })
    }

    getByIds<T>(key: string, ids: string[]): Promise<T[]> {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        const multi = this.client.multi();
        return new Promise((resolve, reject) => {
                for (const id of ids) {
                    multi.get(`${redisKey}:${id}`, (err, value) => {
                        if (err) {
                            return reject(err);
                        }
                        return value;
                    })
                }
                multi.exec((err, values) => {
                    if (err) {
                        return reject(err);
                    }
                    const parsed = [];
                    for (const value of values) {
                        try {
                            parsed.push(JSON.parse(value));
                        } catch (err) {}
                    }
                    resolve(parsed);
                })
        })
    }

    setAll<T>(key: string, data: T[], identifier: (item: T) => string | number): Promise<RedisClient> {
        return new Promise((resolve, reject) => {
            if (!Array.isArray(data)) {
                return reject('Data passed to setAll must be an array')
            }
            const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
            const multi = this.client.multi();
            const savedKeys = {};
            for (const item of data) {
                const itemKey = `${redisKey}:${identifier(item)}`;
                savedKeys[itemKey] = itemKey;
                const simplified = JSON.stringify(item);
                multi.set(itemKey, simplified);
            }
            multi.hmset(redisKey, savedKeys);
            multi.exec((err, saved) => {
                if (err) {
                    return reject(err.message);
                }
                resolve(this.client);
                this.client.publish(key, 'message');
            });
        });
    }

    keyChange<T>(key: string, listener: (data: T) => void): void {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        this.subscriber.subscribe(redisKey);
        this.keyListeners[redisKey] = listener;
    }

    keysChange<T>(key: string, listener: (data: T) => void): void {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        this.subscriber.psubscribe(`${redisKey}:*`);
        this.keyListeners[redisKey] = listener;
    }

    hmSetAll<T>(key: string, data: T[], identifier: (item: T) => string | number): Promise<RedisClient> {
        return new Promise((resolve, reject) => {
            if (!Array.isArray(data)) {
                return reject('Data passed to hmSetAll must be an array')
            }
            const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
            const multi = this.client.multi();
            const savedKeys = {};
            for (const item of data) {
                const itemKey = `${redisKey}:${identifier(item)}`;
                savedKeys[itemKey] = itemKey;
                const simplified = Parser.stringfyObjectProps(item);
                multi.hmset(itemKey, simplified);
            }
            multi.hmset(redisKey, savedKeys);
            multi.exec((err, saved) => {
                if (err) {
                    return reject(err.message);
                }
                resolve(this.client);
                this.client.publish(key, 'message');
            });
        });
    }

    hmSetOne<T>(key: string, identifier: (item: T) => string | number, obj: T): Promise<RedisClient> {
        return new Promise((resolve, reject) => {
            const redisKey = key.split(':')[0] === this.namespace ? `${key}:${identifier(obj)}` : this.keyGen(key, `${identifier(obj)}`);
            const simplified = Parser.stringfyObjectProps(obj);
            this.client.hmset(redisKey, simplified, (err, saved) => {
                if (err) {
                    reject(err.message);
                }
                resolve(this.client);
                this.client.publish(redisKey, 'message');
            });
        });
    }

    hmGetAll<T>(key: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
            const multi = this.client.multi();
            this.client.hmget(redisKey, (err, data) => {
                if (err) {
                    return reject(err.message);
                }
                for (const key of data) {
                    multi.hmget(key, (err, item) => {
                        if (err) {
                            return err;
                        }
                        return Parser.parseObjectProps(item);
                    });
                }
                multi.exec((err, data) => {
                    if (err) {
                        reject(err.message);
                    }
                    resolve(data);
                })
            });
        });
    }

    hmGetByIds<T>(key: string, ids: string[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
            const multi = this.client.multi();
            for (const id of ids) {
                multi.hmget(`${redisKey}:${id}`, (err, item) => {
                    if (err) {
                        return err;
                    }
                    return item;
                });
            }
            multi.exec((err, values) => {
                if (err) {
                    reject(err.message);
                }
                const parsed = [];
                for (const value of values) {
                    parsed.push(Parser.parseObjectProps(value));
                }
                resolve(parsed);
            })
        });
    }

    hmGetOne<T>(key: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
            this.client.hgetall(redisKey, async (err, item) => {
                if (err) {
                    reject(err.message);
                    return;
                }
                const simplified = await Parser.parseObjectProps(item);
                resolve(simplified);
            });
        });
    }

    getAllIndexes(indexKey?: string): Promise<{ [key: string]: string[]}> {
        return new Promise((resolve, reject) => {
            const multi = this.client.multi();
            const results = {};
            multi.keys(`${this.namespace}:${this.INDEX_KEY}${indexKey ? `:${indexKey}` : ''}*`, (err, indexKeys) => {
                if (err) {
                    reject(err);
                }
                for (const key of indexKeys) {
                    multi.smembers(key, (err, set) => {
                        // We dont want to reject here, only if keys or entire transaction breaks
                        if (!err) {
                            results[key] = set;
                        }
                    })
                }
            });
            multi.exec((err, values) => {
                if (err) {
                    reject(err.message);
                }
                resolve(results);
            })
        });
    }

    indexByFields<T>(indexKey: string, data: T[], fieldNames: string[], identifier: (item: T) => string | number): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (!indexKey) {
                return reject('You must supply an index namespace');
            }
            if (!data || !Array.isArray(data)) {
                return reject('You must supply an array of data to be stored as index');
            }
            if (!fieldNames || !Array.isArray(fieldNames)) {
                return reject('You must supply an array of field-names to be stored as index keys');
            }
            try {
                // Remove old relevant indexes
                await this.clear(`${this.INDEX_KEY}:${indexKey}`);
            } catch (err) {
                return reject(err.message);
            }
            const redisKey = `${this.namespace}:${this.INDEX_KEY}:${indexKey}`;
            let saveMap;
            const multi = this.client.multi();
            for (const field of fieldNames) {
                saveMap = data.reduce((result, value) => {
                    if (value) {
                        const key = `${redisKey}:${field}:${value[field]}`;
                        result[key] = result[key] && result[key].length ? [...result[key], identifier(value)] : [identifier(value)];
                    }
                    return result;
                }, {});
                for (const key in saveMap) {
                    if (saveMap.hasOwnProperty(key)) {
                        // Set the new members
                        multi.sadd(key, saveMap[key]);
                    }
                }
            }
            multi.exec((err, values) => {
                if (err) {
                    reject(err.message);
                }
                resolve();
            })
        });
    }

    getIndexByFields(indexKey: string, fieldNames: string[]): Promise<{ [key: string]: string[] }> {
        return new Promise( (resolve, reject) => {
            if (!fieldNames || !Array.isArray(fieldNames)) {
                return reject('You must supply an array of field-names to get index keys');
            }
            const results = {};
            this.client.keys(`${this.namespace}:${this.INDEX_KEY}:${indexKey}*`, async(err, indexKeys) => {
                if (err) {
                    reject(err);
                }
                const setNames = [];
                for (const field of fieldNames) {
                    for (const key of indexKeys) {
                        if (key.includes(field)) {
                            setNames.push(key);
                        }
                    }
                }
                await Promise.all(setNames.map(name => new Promise(resolve => {
                    this.client.smembers(name, (err, set) => {
                        // We dont want to reject here, only if keys or entire transaction breaks
                        if (!err) {
                            results[name] = set;
                        }
                        resolve();
                    })
                })));
                resolve(results);
            });
        });
    }

    expire(key: string, secondes: number) {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        return this.client.expire(redisKey, secondes);
    }

    clear(key: string): Promise<null> {
        const redisKey = key.split(':')[0] === this.namespace ? key : this.keyGen(key);
        const multi = this.client.multi();
        return new Promise((resolve, reject) => {
            this.client.keys(`${redisKey}:*`, (err, keys) => {
                if (err) {
                    return reject(err);
                }
                keys.push(redisKey);
                this.client.del(keys, (delErr, count) => {
                    if (delErr) {
                        return reject(delErr);
                    }
                    resolve();
                })
            });
        });
    }

    quit() {
        this.client.quit();
        this.subscriber.quit();
    }

    unref() {
        this.client.unref();
        this.subscriber.unref();
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
}
