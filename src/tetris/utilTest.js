import {ownPropEqual, shapeEqual, str} from "./util.js";
import {TestSuite}                     from "../kolibri/util/test.js";
import "../kolibri/util/array.js"

const utilSuite = TestSuite("tetris/util");

utilSuite.add( "ownPropsEqual", assert => {
    assert.isTrue(ownPropEqual( document, document)); // invariant: same obj is props equal, even complex ones.
    assert.isTrue(ownPropEqual({}, {}));
    assert.isTrue(ownPropEqual({x:0}, {x:0}));
}) ;

utilSuite.add( "shapeEqual", assert => {
    assert.isTrue(shapeEqual( [document], [document])); // invariant: same obj is props equal, even complex ones.
    assert.isTrue(shapeEqual([], []));
    assert.isTrue(shapeEqual(3..times(), 3..times()));
}) ;

utilSuite.add("str", assert => {
    // Test primitive values
    assert.is(str(null), 'null');
    assert.is(str(undefined), 'undefined');
    assert.is(str(42), '42');
    assert.is(str('hello'), 'hello');
    assert.is(str(true), 'true');

    // Test arrays
    assert.is(str([1, 2, 3]), '[1, 2, 3]');

    // Test simple objects
    const simpleObj = { a: 1, b: 'test' };
    const simpleObjStr = str(simpleObj);
    assert.isTrue(simpleObjStr.includes('a: 1'));
    assert.isTrue(simpleObjStr.includes('b: test'));

    // Test nested objects
    const nestedObj = { 
        name: 'test', 
        details: { 
            id: 123, 
            active: true 
        },
        items: [1, 2, { label: 'item3' }]
    };
    const nestedObjStr = str(nestedObj);
    assert.isTrue(nestedObjStr.includes('name: test'));
    assert.isTrue(nestedObjStr.includes('details:'));
    assert.isTrue(nestedObjStr.includes('id: 123'));
    assert.isTrue(nestedObjStr.includes('active: true'));
    assert.isTrue(nestedObjStr.includes('items:'));
    assert.isTrue(nestedObjStr.includes('label: item3'));
}) ;

utilSuite.run();
