export class Parser {

    static stringfyObjectProps(obj): any {
        for (let prop of obj) {
            prop = JSON.stringify(prop);
        }
        return obj;
    }

    static parseObjectProps(obj): any {
        for (let prop of obj) {
            prop = JSON.parse(prop);
        }
        return obj;
    }
}