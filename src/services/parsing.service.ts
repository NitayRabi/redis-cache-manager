export class Parser {

    static stringfyObjectProps(obj): any {
        for (const propName in obj) {
            if (obj.hasOwnProperty(propName)) {
                const prop = obj[propName];
                obj[propName] = JSON.stringify(prop);
            }
        }
        return obj;
    }

    static parseObjectProps(obj): any {
        for (const propName of obj) {
            if (obj.hasOwnProperty(propName)) {
                const prop = obj[propName];
                obj[propName] = JSON.parse(prop);
            }
        }
        return obj;
    }
}