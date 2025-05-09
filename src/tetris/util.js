
export { ownPropEqual, shapeEqual, str }

// todo: might go into Kolibri utils.
/**
 * Tell, whether two abjects have the same ownProperties.
 * @template _T_
 * @type {  <_T_> (objA:_T_, objB:_T_) => Boolean }
 */
const ownPropEqual = (objA, objB) =>
    Object.getOwnPropertyNames(objA).every( name => objA[name] === objB[name]);

/**
 * Tell, whether two shapes (arrays of same object type) have the same ownProperties for each contained object.
 * @template _T_
 * @type {  <_T_> (shapeA:Array<_T_>, shapeB:Array<_T_>) => Boolean }
 */
const shapeEqual= (shapeA, shapeB) =>
    shapeA.every( (positionA, idx) => ownPropEqual(positionA, shapeB[idx]) );

/**
 * Convert an object to a string representation that includes all key/value pairs.
 * Handles nested objects and arrays recursively.

 * @template _T_
 * @type { <_T_> (obj:_T_, indent?:Number) => String }
 */
const str = (obj, indent = 0) => {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';

    const type = typeof obj;
    if (type !== 'object') return String(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
        const items = obj.map(item => str(item, indent + 2)).join(', ');
        return `[${items}]`;
    }

    // Handle objects
    const indentStr = ' '.repeat(indent);
    const nextIndentStr = ' '.repeat(indent + 2);
    const entries = Object.entries(obj)
        .map(([key, value]) => `${nextIndentStr}${key}: ${str(value, indent + 2)}`)
        .join(',\n');

    return `{\n${entries}\n${indentStr}}`;
};
