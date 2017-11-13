# Redis Cache Manager
Use Redis to easily cache items and subscribing to them using Redis built in pub/sub.

## Installation
run `npm install redis-cache-manager --save`

## API
### Init

```javascript
import { RedisCacheManager } from 'redis-cache-manager';

// Constructor expects same config as redis client type (with redis defaults) with namespace property added for scoping
const rcm = new RedisCacheManager({namespace: 'my-app-name'});
```

### Set

```javascript
// Currently set only uses JSON.stringify to create a key and a string of stored values.
rcm.set('my-key', {});
// Optionally you can pass a listener function to subscribe to changes in object (for every 'set' called on key)
// The data passed in the listener is the same type as the object passed.
rcm.set('my-key', {}, (myNewlySetData) => {
    // Do something with myNewlySetData
});
```

### Get

```javascript
// Currently set only uses JSON.parse to parse data from simple redis key and use in code.
const myData = rcm.get('my-key');
// Use myData
```

### HmSetAll

```javascript
// Currently uses JSON.stringify on every parameter of given object in the array.
// The method expects an array of objects, using the callback to create a unique identifier (lodash style).
// The method creates a list under my-namespace:my-key and hm objects with params stringified in each  my-namespace:my-key:uniqueId
rcm.hmSetAll('my-key', dataArray, (singleObject) => singleObject.uniqueId)
            .then(redisClient => {
                // You can do something with the redis client object
            })
            .catch(err => {
                // Handle error
            });
```

### HmSetOne

```javascript
// Currently uses JSON.stringify on every parameter of given object.
// The method expects an object, using the callback to create a unique identifier (lodash style).
// The method creates hm object with params stringified in  my-namespace:my-key:uniqueId
rcm.hmSetOne('my-key', (singleObject) => singleObject.uniqueId, singleObject)
            .then(redisClient => {
                // You can do something with the redis client object
            })
            .catch(err => {
                // Handle error
            });
```

### HmGetAll

```javascript
// Looks for a list of hm keys under 'my-namespace:my-key' and gets all objects.
rcm.hmGetAll('my-key')
            .then(data => {
                // You can do something with the data
            })
            .catch(err => {
                // Handle error
            });
```

### KeyChange

```javascript
// Add a listener for a key. 
rcm.keyChange('my-key', (myNewlySetData) => {
    // Do something with myNewlySetData
});
```

### KeysChange

```javascript
// Add a listener for a global pattern under a key. (this will look for any change under 'my-key:*')
rcm.keysChange('my-key', (myNewlySetData) => {
    // Do something with myNewlySetData
});
```

### Quit/Unref

```javascript
// You can use quit/unref to quit or unref client and sub subscriber
rcm.quit();
rcm.unref();
```
*Listeners on same key will override one another (listeners in set and keyChange)*

## Roadmap

- [ ] Support arrays and 'psubscribe' functionality
- [ ] Support advance data parsing (break down objects)
- [ ] Add express dedicated middleware for generic api cache
- [ ] Add ORM style module (relations etc...)
