export class Parser {

    static stringfyObjectProps(obj): any {
        if (typeof obj !== 'object') {
            throw new Error(`parameter to stringify must be an object - got ${typeof obj} instead`);
        }
        const imute = {...obj};
        for (const propName in imute) {
            if (imute.hasOwnProperty(propName)) {
                const prop = imute[propName];
                try {
                    imute[propName] = JSON.stringify(prop);
                } catch (err) {}
            }
        }
        return imute;
    }

    static parseObjectProps(obj): any {
        if (typeof obj !== 'object') {
            throw new Error(`parameter to stringify must be an object - got ${typeof obj} instead`);
        }
        const imute = {...obj};
        for (const propName in imute) {
            if (imute.hasOwnProperty(propName)) {
                const prop = imute[propName];
                try {
                    imute[propName] = JSON.parse(prop);

                } catch (err) {}
            }
        }
        return imute;
    }
}