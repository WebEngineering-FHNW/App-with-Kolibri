
export { ownPropEqual, shapeEqual }

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

